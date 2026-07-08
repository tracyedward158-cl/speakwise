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
// CORS
// ──────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
// iFlytek Suntone — WebSocket evaluation
// ──────────────────────────────────────────────────────────────────────────
const IFLYTEK_HOST = 'cn-east-1.ws-api.xf-yun.com';
const IFLYTEK_PATH = '/v1/private/s8e098720'; // 中英文评测

function generateAuth(apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const requestLine = `GET ${IFLYTEK_PATH} HTTP/1.1`;
  const signatureOrigin = `host: ${IFLYTEK_HOST}\ndate: ${date}\n${requestLine}`;
  const sigSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest();
  const signature = sigSha.toString('base64');
  const authOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authOrigin).toString('base64');
  return { date, authorization };
}

function evaluateViaWebSocket(requestData) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.IFLYTEK_API_KEY || '';
    const apiSecret = process.env.IFLYTEK_API_SECRET || '';
    if (!apiKey || !apiSecret) {
      return reject(new Error('Missing IFLYTEK_API_KEY or IFLYTEK_API_SECRET'));
    }

    const { date, authorization } = generateAuth(apiKey, apiSecret);
    const qs = `?host=${encodeURIComponent(IFLYTEK_HOST)}&date=${encodeURIComponent(date)}&authorization=${encodeURIComponent(authorization)}`;
    const url = `wss://${IFLYTEK_HOST}${IFLYTEK_PATH}${qs}`;

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
    const { system, messages, max_tokens = 600 } = req.body;
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
      body: JSON.stringify({ model: 'deepseek-chat', messages: messagesForAI, max_tokens }),
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

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
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
  console.log(`  POST /api/evaluate — pronunciation eval (iFlytek)`);
});
