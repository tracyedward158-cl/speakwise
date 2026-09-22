// server.cjs — Unified API server (SpeakWise 琢音)
// ============================================================================
//  Local dev:  node server.cjs  →  http://localhost:3000
//  SCF deploy: Tencent Cloud SCF Web Function
//              scf_bootstrap →  node server.cjs
//              (SCF auto-detects Express app exported via module.exports)
//
//  Env vars required:
//    DEEPSEEK_API_KEY            — DeepSeek API key for AI chat
//    IFLYTEK_APP_ID              — iFlytek Suntone app ID
//    IFLYTEK_API_KEY             — iFlytek Suntone API key
//    IFLYTEK_API_SECRET          — iFlytek Suntone API secret
// ============================================================================

'use strict';
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const app = express();
app.use(express.json({ limit: '15mb' })); // large audio payloads

// ──────────────────────────────────────────────────────────────────────────
// CORS — 必须在所有路由之前注册，否则响应不带 CORS 头，浏览器拦截
// ──────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ──────────────────────────────────────────────────────────────────────────
// User system — auth, practice records, teacher tasks (TDSQL-C MySQL)
// ──────────────────────────────────────────────────────────────────────────
const { router: authRouter } = require('./server/auth.cjs');
const { router: recordsRouter } = require('./server/records.cjs');
const { router: tasksRouter } = require('./server/tasks.cjs');
app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);
app.use('/api/tasks', tasksRouter);

// ──────────────────────────────────────────────────────────────────────────
// Load .env.local (local dev only — SCF provides real env vars)
// ──────────────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// WAV → MP3 conversion (lamejs)
// Uses lame.all.js self-contained bundle to avoid CJS sub-module issues
// ──────────────────────────────────────────────────────────────────────────
const lamejs = (() => {
  const code = fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8');
  return new Function(code + '; return lamejs;')();
})();

function wavBase64ToMp3Base64(wavBase64) {
  const wavBuf = Buffer.from(wavBase64, 'base64');
  if (wavBuf.length < 44) throw new Error('Invalid WAV: too short');

  const pcmBytes = wavBuf.subarray(44);
  const pcm = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
  if (pcm.length === 0) throw new Error('Empty WAV');

  const encoder = new lamejs.Mp3Encoder(1, 16000, 16);
  const maxSamples = 1152;
  const mp3Chunks = [];

  for (let i = 0; i < pcm.length; i += maxSamples) {
    const chunk = pcm.subarray(i, i + maxSamples);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) mp3Chunks.push(encoded);
  }
  const end = encoder.flush();
  if (end.length > 0) mp3Chunks.push(end);

  const totalLen = mp3Chunks.reduce((a, c) => a + c.length, 0);
  const mp3 = Buffer.alloc(totalLen);
  let off = 0;
  for (const c of mp3Chunks) { mp3.set(c, off); off += c.length; }
  return mp3.toString('base64');
}

// ──────────────────────────────────────────────────────────────────────────
// 音频格式嗅探
//
// 原来的判据是 `audio.startsWith('UklGR')` —— 只区分「WAV」与「其它」，
// 而「其它」一律当 MP3 声明给讯飞。这条二分法的坏处是：客户端真给了 aac/m4a 时，
// 我们会对讯飞宣称它是 MP3，失败会表现成「识别结果为空」或一个莫名的讯飞码，
// 而不是一个格式错误。小程序端的录音格式恰好是待验证项，所以这里补上真嗅探，
// 把「静默的坏数据」变成「响的、可查的报错」。
// ──────────────────────────────────────────────────────────────────────────

function sniffAudio(base64Audio) {
  const head = Buffer.from(base64Audio.slice(0, 64), 'base64');
  if (head.length >= 4 && head.subarray(0, 4).toString('latin1') === 'RIFF') return 'wav';
  if (head.length >= 3 && head.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3'; // ID3v2
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mp3'; // MPEG 帧同步
  if (head.length >= 8 && head.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '#!AMR') return 'amr';
  return 'unknown';
}

/**
 * 剥掉 ID3v2 标签头。
 * 讯飞文档明确要求：走 mp3 通道时若带 ID3 头需先移除。8 行的事，
 * 能消掉一整类「返回空结果」的诡异问题。
 */
function stripId3(buf) {
  if (buf.length < 10 || buf.subarray(0, 3).toString('latin1') !== 'ID3') return buf;
  // 同步安全整数：每字节只用低 7 位
  const size =
    ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return buf.subarray(10 + size);
}

/**
 * 把上行的 base64 音频规整成「讯飞 mp3 通道能吃的字节」。
 * 返回 { buf, format }；format 不认识时抛错，由调用方转成 400。
 */
function decodeAudioForIflytek(base64Audio) {
  const format = sniffAudio(base64Audio);
  if (format === 'm4a' || format === 'amr' || format === 'unknown') {
    const e = new Error(
      `不支持的音频格式（识别为 ${format}）。小程序端应录制 mp3；` +
        `若该机型把 format:'mp3' 降级成了 aac，请在 mp/src/config.js 里切到 RECORD_FORMAT='pcm'。`
    );
    e.code = 'UNSUPPORTED_AUDIO';
    throw e;
  }
  const buf = Buffer.from(base64Audio, 'base64');
  return { buf: stripId3(buf), format };
}

// ──────────────────────────────────────────────────────────────────────────
// iFlytek Suntone — WebSocket evaluation
// ──────────────────────────────────────────────────────────────────────────
const IFLYTEK_HOST = 'cn-east-1.ws-api.xf-yun.com';
const IFLYTEK_PATH = '/v1/private/s8e098720'; // 中英文评测

// IAT（语音听写）与 TTS（在线语音合成）各自的服务地址。
//
// ⚠️ 这两个服务要在讯飞控制台**单独开通**，服务 ID 与 ISE 的 s8e098720 不通用。
// 私有域部署的话，把控制台上看到的那对 host/path 填进环境变量即可 ——
// 签名覆盖 host+path，两者必须成对替换，只改一个会 401。
// 默认值指向公有域，账号没开私有域时直接可用。
const IAT_HOST = process.env.IFLYTEK_IAT_HOST || 'iat-api.xfyun.cn';
const IAT_PATH = process.env.IFLYTEK_IAT_PATH || '/v2/iat';
const TTS_HOST = process.env.IFLYTEK_TTS_HOST || 'tts-api.xfyun.cn';
const TTS_PATH = process.env.IFLYTEK_TTS_PATH || '/v2/tts';
const TTS_VOICE = process.env.IFLYTEK_TTS_VCN || 'xiaoyan';

// host/path 必须作为参数传进来，不能像原来那样闭包捕获 ——
// 三个服务的地址不同，而签名原文里就带着它们。
function generateAuth(host, path, apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const requestLine = `GET ${path} HTTP/1.1`;
  const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;
  const sigSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest();
  const signature = sigSha.toString('base64');
  const authOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authOrigin).toString('base64');
  return { date, authorization };
}

/** 组装带鉴权参数的 wss:// 地址 */
function iflytekUrl(host, path, apiKey, apiSecret) {
  const { date, authorization } = generateAuth(host, path, apiKey, apiSecret);
  const qs = `?host=${encodeURIComponent(host)}&date=${encodeURIComponent(date)}&authorization=${encodeURIComponent(authorization)}`;
  return `wss://${host}${path}${qs}`;
}

function evaluateViaWebSocket(requestData) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.IFLYTEK_API_KEY || '';
    const apiSecret = process.env.IFLYTEK_API_SECRET || '';
    if (!apiKey || !apiSecret) {
      return reject(new Error('Missing IFLYTEK_API_KEY or IFLYTEK_API_SECRET'));
    }

    const url = iflytekUrl(IFLYTEK_HOST, IFLYTEK_PATH, apiKey, apiSecret);

    const ws = new WebSocket(url);
    let done = false;

    const timer = setTimeout(() => {
      if (!done) { done = true; try { ws.close(); } catch (e) { /* */ } reject(new Error('Timeout')); }
    }, 15000);

    ws.onopen = () => {
      const { audio, ...rest } = requestData.payload.data;
      console.log('[iFlytek] WS connected, sending:', JSON.stringify({
        ...requestData,
        payload: { data: { ...rest, audio: `[${audio?.length || 0} chars]` } },
      }, null, 2));
      ws.send(JSON.stringify(requestData));
    };

    ws.onmessage = (event) => {
      console.log('[iFlytek] raw message:', event.data?.slice(0, 500));
      try {
        const data = JSON.parse(event.data);
        if (data.header?.code !== 0) {
          console.error('[iFlytek] API error response:', JSON.stringify(data, null, 2));
          done = true; clearTimeout(timer); ws.close();
          return reject(new Error(data.header?.message || `Code ${data.header?.code}`));
        }
        if (data.payload?.result?.text) {
          const decoded = Buffer.from(data.payload.result.text, 'base64').toString('utf8');
          console.log('[iFlytek] decoded result:', decoded.slice(0, 300));
          const obj = JSON.parse(decoded);
          if (obj.eof === 1) {
            done = true; clearTimeout(timer); ws.close();
            const r = obj.result || obj;
            resolve({
              refText: obj.refText,
              overall: r.overall ?? null,
              pronunciation: r.pronunciation ?? null,
              tone: r.tone ?? null,
              fluency: r.fluency ?? null,
              integrity: r.integrity ?? null,
              rhythm: r.rhythm ?? null,
              speed: r.speed ?? null,
              duration: r.duration ?? null,
              words: (r.words || []).map(w => ({
                word: w.word,
                pinyin: w.pinyin,
                tone: w.tone,
                readType: w.readType,
                scores: w.scores ? {
                  overall: w.scores.overall,
                  pronunciation: w.scores.pronunciation,
                  tone: w.scores.tone,
                  prominence: w.scores.prominence,
                } : null,
              })),
              warning: r.warning || null,
            });
          }
        }
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); try { ws.close(); } catch (ex) { /* */ } console.error('[iFlytek] parse error:', e); reject(e); }
      }
    };

    ws.onerror = (e) => {
      if (!done) { done = true; clearTimeout(timer); console.error('[iFlytek] WS error:', e?.message || e); reject(new Error('WS error')); }
    };
    ws.onclose = (e) => {
      if (!done) { done = true; clearTimeout(timer); console.error('[iFlytek] WS closed unexpectedly, code:', e?.code, 'reason:', e?.reason); reject(new Error('WS closed')); }
    };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取讯飞三件套凭证，缺了就抛 */
function iflytekCreds() {
  const apiKey = process.env.IFLYTEK_API_KEY || '';
  const apiSecret = process.env.IFLYTEK_API_SECRET || '';
  const appId = process.env.IFLYTEK_APP_ID || '';
  if (!apiKey || !apiSecret || !appId) {
    throw new Error('Missing IFLYTEK_APP_ID / IFLYTEK_API_KEY / IFLYTEK_API_SECRET');
  }
  return { apiKey, apiSecret, appId };
}

// ──────────────────────────────────────────────────────────────────────────
// iFlytek IAT — 语音听写（STT）
//
// 与 ISE 的协议**不同**，不要试图复用 evaluateViaWebSocket：
//   · 请求体是 common / business / data，不是 header / parameter / payload
//   · 错误码在**顶层** code，不是 data.header.code
//   · 结果要跨帧累积（data.result.ws[].cw[].w），不是单帧 eof
// 复用的是签名（generateAuth）、超时与 onerror/onclose 的收尾方式。
// ──────────────────────────────────────────────────────────────────────────
const IAT_CHUNK_BYTES = 4096; // 1280B/40ms 是文档附近的数字；4096B 更省往返，仍在单帧上限内

function recognizeViaWebSocket(audioBuf, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let creds;
    try {
      creds = iflytekCreds();
    } catch (e) {
      return reject(e);
    }

    const ws = new WebSocket(iflytekUrl(IAT_HOST, IAT_PATH, creds.apiKey, creds.apiSecret));
    let settled = false;
    const segments = [];

    const timer = setTimeout(() => finish(() => reject(new Error('IAT 超时'))), timeoutMs);

    function finish(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch (e) {
        /* ignore */
      }
      fn();
    }

    const frame = (status, audioBase64) => ({
      data: {
        status,
        format: 'audio/L16;rate=16000', // 写的是采样率；即使 encoding 是 lame 也是这个值
        encoding: 'lame',
        audio: audioBase64
      }
    });

    ws.onopen = async () => {
      try {
        const chunks = [];
        for (let i = 0; i < audioBuf.length; i += IAT_CHUNK_BYTES) {
          chunks.push(audioBuf.subarray(i, i + IAT_CHUNK_BYTES));
        }
        if (chunks.length === 0) chunks.push(Buffer.alloc(0));

        // 首帧：status 0，且 common/business 只在这里出现（appid 只需第一帧带）
        ws.send(
          JSON.stringify({
            ...frame(0, chunks[0].toString('base64')),
            common: { app_id: creds.appId },
            business: { language: 'zh_cn', domain: 'iat', accent: 'mandarin', ptt: 1, vad_eos: 5000 }
          })
        );

        if (chunks.length === 1) {
          // 只有一帧的情况：首帧已被 status 0 占用，末帧必须**另外**发一个。
          // 漏掉它，服务端会一直等末帧，表现成「识别中断且无返回」。
          ws.send(JSON.stringify(frame(2, '')));
        } else {
          for (let i = 1; i < chunks.length; i++) {
            const isLast = i === chunks.length - 1;
            ws.send(JSON.stringify(frame(isLast ? 2 : 1, chunks[i].toString('base64'))));
            if (!isLast) await sleep(40);
          }
        }
      } catch (e) {
        finish(() => reject(e));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // ⚠️ IAT 的错误码在顶层；ISE 才在 data.header.code
        if (data.code !== 0) {
          console.error('[iFlytek/IAT] error:', data.code, data.message);
          return finish(() => reject(new Error(`${data.code} ${data.message || 'IAT 服务返回错误'}`)));
        }
        const inner = data.data;
        if (!inner) return;

        const result = inner.result;
        if (result && Array.isArray(result.ws)) {
          const text = result.ws.map((w) => (w.cw || []).map((c) => c.w).join('')).join('');
          if (text) segments.push(text);
        }

        if (inner.status === 2) {
          finish(() => resolve({ text: segments.join('') }));
        }
      } catch (e) {
        console.error('[iFlytek/IAT] parse error:', e);
        finish(() => reject(e));
      }
    };

    ws.onerror = (e) => {
      console.error('[iFlytek/IAT] WS error:', e?.message || e);
      finish(() => reject(new Error('IAT 连接失败')));
    };
    ws.onclose = (e) => {
      console.error('[iFlytek/IAT] WS closed, code:', e?.code, 'reason:', e?.reason);
      finish(() => reject(new Error('IAT 连接中断')));
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// iFlytek TTS — 在线语音合成
//
// 也是 WebSocket。一次会话只合成一段文本，data.status 固定为 2。
// speed ∈ [0,100]，50 为常速 —— 慢速跟读靠它实现（改的是语速不是采样率，
// 音高不变，才是一段合格的示范音）。
// ──────────────────────────────────────────────────────────────────────────

function synthesizeViaWebSocket(text, speed, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let creds;
    try {
      creds = iflytekCreds();
    } catch (e) {
      return reject(e);
    }

    const ws = new WebSocket(iflytekUrl(TTS_HOST, TTS_PATH, creds.apiKey, creds.apiSecret));
    let settled = false;
    const chunks = [];

    const timer = setTimeout(() => finish(() => reject(new Error('TTS 超时'))), timeoutMs);

    function finish(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch (e) {
        /* ignore */
      }
      fn();
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          common: { app_id: creds.appId },
          business: {
            aue: 'lame',
            // aue:'lame' 必须配 sfl:1，否则拿不到流式 mp3 —— 官方文档里有写，
            // 但很容易漏，漏了的表现是音频截断或格式不对。
            sfl: 1,
            auf: 'audio/L16;rate=16000',
            vcn: TTS_VOICE,
            speed: Math.max(0, Math.min(100, Math.round(speed))),
            volume: 50,
            pitch: 50,
            tte: 'UTF8'
          },
          data: { status: 2, text: Buffer.from(text, 'utf8').toString('base64') }
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.code !== 0) {
          console.error('[iFlytek/TTS] error:', data.code, data.message);
          return finish(() => reject(new Error(`${data.code} ${data.message || 'TTS 服务返回错误'}`)));
        }
        const d = data.data;
        // code=0 但 data=null 的帧是正常的，直接跳过
        if (!d) return;

        // ⚠️ 每帧的 audio 是**各自独立 padding 的 base64**，
        // 拼 base64 字符串会拼出坏数据，必须逐帧解码成 Buffer 再连。
        if (d.audio) chunks.push(Buffer.from(d.audio, 'base64'));

        if (d.status === 2) {
          const audio = Buffer.concat(chunks);
          if (audio.length === 0) return finish(() => reject(new Error('TTS 返回了空音频')));
          finish(() => resolve(audio));
        }
      } catch (e) {
        console.error('[iFlytek/TTS] parse error:', e);
        finish(() => reject(e));
      }
    };

    ws.onerror = (e) => {
      console.error('[iFlytek/TTS] WS error:', e?.message || e);
      finish(() => reject(new Error('TTS 连接失败')));
    };
    ws.onclose = (e) => {
      console.error('[iFlytek/TTS] WS closed, code:', e?.code, 'reason:', e?.reason);
      finish(() => reject(new Error('TTS 连接中断')));
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────────────────

// GET /api/health — monitoring / warm-up check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/chat — AI conversation proxy (DeepSeek)
app.post('/api/chat', async (req, res) => {
  try {
    // json=true 走 DeepSeek 的 JSON 输出模式：发音测评要用它一次拿回整批
    // 「拼音+英文+粒度」，纯文本模式偶尔会裹 markdown 代码块或加一句解释。
    // 注意该模式要求提示词里出现 "json" 字样，否则 DeepSeek 直接返回 400。
    const { system, messages, max_tokens = 600, json = false } = req.body;
    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

    if (!DEEPSEEK_KEY) {
      return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured' });
    }
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: '没有收到对话内容哦' });
    }

    const messagesForAI = [
      { role: 'system', content: system || '你现在是 SpeakWise 琢音平台的一名专业 AI 中文口语教练。请配合来华留学生的水平进行真实场景对话。回复必须自然、简短，并严格遵循 HSK 分级词汇标准。' },
      ...messages,
    ];

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForAI,
        max_tokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';
    return res.json({ reply });
  } catch (e) {
    console.error('/api/chat error:', e);
    return res.status(500).json({ error: '云端请求大模型失败，请稍后再试' });
  }
});

// POST /api/evaluate — pronunciation evaluation (iFlytek Suntone)
app.post('/api/evaluate', async (req, res) => {
  try {
    const { audio, refText, core = 'sent' } = req.body;
    const APP_ID = process.env.IFLYTEK_APP_ID;

    if (!APP_ID || !process.env.IFLYTEK_API_KEY || !process.env.IFLYTEK_API_SECRET) {
      return res.status(500).json({
        error: 'Iflytek credentials not configured',
        detail: 'Set IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET in environment variables',
      });
    }

    if (!audio || !refText) {
      return res.status(400).json({ error: 'Missing audio or refText' });
    }

    if (audio.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio too large (max 10MB base64)' });
    }

    console.log('[evaluate] WAV input:', audio.length, 'chars base64, isWAV:', audio.startsWith('UklGR'));
    const mp3Audio = audio.startsWith('UklGR') ? wavBase64ToMp3Base64(audio) : audio;
    console.log('[evaluate] MP3 output:', mp3Audio.length, 'chars base64');

    const requestData = {
      header: { app_id: APP_ID, status: 2 }, // 2 = end, all audio sent
      parameter: {
        st: {
          lang: 'cn', core, refText,
          phoneme_output: 1, scale: 100,
          result: { encoding: 'utf8', compress: 'raw', format: 'plain' },
        },
      },
      payload: {
        data: {
          encoding: 'lame', sample_rate: 16000, channels: 1,
          bit_depth: 16, status: 2, seq: 0, audio: mp3Audio, frame_size: 0,
        },
      },
    };

    const result = await evaluateViaWebSocket(requestData);
    return res.json(result);
  } catch (e) {
    console.error('/api/evaluate error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/tts — 语音合成（小程序端新增）
//
// 存在的理由：小程序的 TTS 选项都不满足需求 ——
//   · 微信同声传译插件：个人主体拿不到，且**语速不可调**
//   · InnerAudioContext + 客户端变速：音高会变，做跟读示范不合格
// 服务端讯飞合成能把语速写进合成本身，音高不变。
//
// 入参 { text, speed }，speed ∈ [0,100]（50 常速）。
// 返回 { audio: <base64 mp3>, format: 'mp3' }。
// ──────────────────────────────────────────────────────────────────────────
const TTS_MAX_CHARS = 1200; // 讯飞上限约 2000 汉字；留出安全余量

app.post('/api/tts', async (req, res) => {
  try {
    const { text, speed = 50 } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Missing text' });
    }
    const clean = String(text).trim();
    if (clean.length > TTS_MAX_CHARS) {
      // 而不是截断 —— 截断会静默吞掉半句话，朗读出来听着像 bug
      return res.status(400).json({ error: `文本过长（${clean.length} 字，上限 ${TTS_MAX_CHARS}）` });
    }

    const audio = await synthesizeViaWebSocket(clean, Number(speed) || 50);
    return res.json({ audio: audio.toString('base64'), format: 'mp3' });
  } catch (e) {
    console.error('/api/tts error:', e);
    const code = /Missing IFLYTEK/.test(e.message) ? 500 : 502;
    return res.status(code).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/asr — 语音听写（小程序端新增）
//
// 浏览器有 SpeechRecognition，小程序没有，所以 STT 只能走服务端转发讯飞 IAT。
// 入参 { audio: <base64> } —— 小程序录 mp3 直传，命中「非 WAV 透传」那条路。
// 返回 { text }。
// ──────────────────────────────────────────────────────────────────────────
app.post('/api/asr', async (req, res) => {
  try {
    const { audio } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'Missing audio' });
    }
    if (audio.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio too large (max 10MB base64)' });
    }

    let decoded;
    try {
      decoded = decodeAudioForIflytek(audio);
    } catch (e) {
      // 格式不认识时给出可操作的提示，而不是把它当 MP3 送去讯飞换一个看不懂的错误码
      console.error('[asr] 音频格式不受支持:', e.message);
      return res.status(400).json({ error: e.message });
    }

    const { text } = await recognizeViaWebSocket(decoded.buf);
    return res.json({ text: text || '' });
  } catch (e) {
    console.error('/api/asr error:', e);
    const code = /Missing IFLYTEK/.test(e.message) ? 500 : 502;
    return res.status(code).json({ error: e.message });
  }
});

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 错误处理（必须 4 个参数，且注册在最后）
// 没有它时 body-parser 超限会走 Express 默认处理器返回 HTML，前端只显示「请求失败 (413)」
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '提交的数据过大，请缩短对话后重试' });
  }
  console.error('[server] unhandled error:', err.message);
  return res.status(500).json({ error: '服务器内部错误，请稍后再试' });
});

// ──────────────────────────────────────────────────────────────────────────
// Entry: local dev vs SCF
// ──────────────────────────────────────────────────────────────────────────
//  本地开发: node server.cjs               → 监听 0.0.0.0:3000
//  SCF 部署: scf_bootstrap 调用 node server.cjs → 监听 0.0.0.0:9000
const isSCF = !!process.env.TENCENTCLOUD_RUNENV;
const PORT = isSCF ? 9000 : (process.env.PORT || 3000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SpeakWise API → 0.0.0.0:${PORT} [${isSCF ? 'SCF' : 'local'}]`);
  console.log(`  GET  /api/health   — health check`);
  console.log(`  POST /api/chat     — AI chat (DeepSeek)`);
  console.log(`  POST /api/evaluate — pronunciation eval (iFlytek ISE)`);
  console.log(`  POST /api/asr      — speech recognition (iFlytek IAT)`);
  console.log(`  POST /api/tts      — speech synthesis  (iFlytek TTS)`);
  console.log(`  POST /api/auth/register|login — user system`);
  console.log(`  GET  /api/records/mine|class   — practice records`);
});
