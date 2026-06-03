// Tencent SCF function — pronunciation evaluation via iFlytek Suntone API
// Deploy: zip this file + node_modules/lamejs → upload to SCF console
// Trigger: API Gateway (HTTP), method: POST
// Env vars: IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET

'use strict';
const crypto = require('crypto');
const fs = require('fs');
const WebSocket = require('ws');

// ── Load lamejs (self-contained bundle, avoids CJS sub-module global issues) ──
const lamejs = (() => {
  const code = fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8');
  return new Function(code + '; return lamejs;')();
})();

// ── WAV → MP3 ──
function wavBase64ToMp3Base64(wavBase64) {
  const wavBuf = Buffer.from(wavBase64, 'base64');
  if (wavBuf.length < 44) throw new Error('Invalid WAV');
  const pcmBytes = wavBuf.subarray(44);
  const pcm = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
  if (pcm.length === 0) throw new Error('Empty WAV');

  const encoder = new lamejs.Mp3Encoder(1, 16000, 16);
  const mp3Chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const chunk = pcm.subarray(i, i + 1152);
    const enc = encoder.encodeBuffer(chunk);
    if (enc.length > 0) mp3Chunks.push(enc);
  }
  const end = encoder.flush();
  if (end.length > 0) mp3Chunks.push(end);

  const total = mp3Chunks.reduce((a, c) => a + c.length, 0);
  const mp3 = Buffer.alloc(total);
  let off = 0;
  for (const c of mp3Chunks) { mp3.set(c, off); off += c.length; }
  return mp3.toString('base64');
}

// ── iFlytek auth ──
const HOST = 'cn-east-1.ws-api.xf-yun.com';
const PATH = '/v1/private/s8e098720';

function generateAuth(apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const reqLine = `GET ${PATH} HTTP/1.1`;
  const sigOrigin = `host: ${HOST}\ndate: ${date}\n${reqLine}`;
  const sigSha = crypto.createHmac('sha256', apiSecret).update(sigOrigin).digest();
  const sig = sigSha.toString('base64');
  const authOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${sig}"`;
  return { date, auth: Buffer.from(authOrigin).toString('base64') };
}

// ── WebSocket evaluation ──
function evaluateViaWS(requestData) {
  return new Promise((resolve, reject) => {
    const key = process.env.IFLYTEK_API_KEY || '';
    const sec = process.env.IFLYTEK_API_SECRET || '';
    const { date, auth } = generateAuth(key, sec);
    const qs = `?host=${encodeURIComponent(HOST)}&date=${encodeURIComponent(date)}&authorization=${encodeURIComponent(auth)}`;
    const ws = new WebSocket(`wss://${HOST}${PATH}${qs}`);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch (e) {} reject(new Error('Timeout')); } }, 15000);

    ws.onopen = () => ws.send(JSON.stringify(requestData));
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.header?.code !== 0) { done = true; clearTimeout(t); ws.close(); return reject(new Error(d.header?.message || `Code ${d.header?.code}`)); }
        if (d.payload?.result?.text) {
          const obj = JSON.parse(Buffer.from(d.payload.result.text, 'base64').toString('utf8'));
          if (obj.eof === 1) {
            done = true; clearTimeout(t); ws.close();
            const r = obj.result || obj;
            resolve({
              refText: obj.refText,
              overall: r.overall ?? null, pronunciation: r.pronunciation ?? null,
              tone: r.tone ?? null, fluency: r.fluency ?? null,
              integrity: r.integrity ?? null, rhythm: r.rhythm ?? null,
              speed: r.speed ?? null, duration: r.duration ?? null,
              words: (r.words || []).map(w => ({
                word: w.word, pinyin: w.pinyin, tone: w.tone, readType: w.readType,
                scores: w.scores ? { overall: w.scores.overall, pronunciation: w.scores.pronunciation, tone: w.scores.tone, prominence: w.scores.prominence } : null,
              })),
              warning: r.warning || null,
            });
          }
        }
      } catch (ex) { if (!done) { done = true; clearTimeout(t); try { ws.close(); } catch (e) {} reject(ex); } }
    };
    ws.onerror = () => { if (!done) { done = true; clearTimeout(t); reject(new Error('WS error')); } };
    ws.onclose = () => { if (!done) { done = true; clearTimeout(t); reject(new Error('WS closed')); } };
  });
}

// ── SCF entry point ──
exports.main_handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: jsonHdr(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const APP_ID = process.env.IFLYTEK_APP_ID;
  const API_KEY = process.env.IFLYTEK_API_KEY;
  const API_SECRET = process.env.IFLYTEK_API_SECRET;

  if (!APP_ID || !API_KEY || !API_SECRET) {
    return { statusCode: 500, headers: jsonHdr(), body: JSON.stringify({ error: 'Credentials not configured' }) };
  }

  try {
    // SCF API Gateway may deliver body as string or base64
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const { audio, refText, core = 'sent' } = JSON.parse(rawBody);

    if (!audio || !refText) {
      return { statusCode: 400, headers: jsonHdr(), body: JSON.stringify({ error: 'Missing audio or refText' }) };
    }

    // WAV → MP3
    const mp3Audio = audio.startsWith('UklGR') ? wavBase64ToMp3Base64(audio) : audio;

    const requestData = {
      header: { app_id: APP_ID, status: 2 },
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

    const result = await evaluateViaWS(requestData);
    return { statusCode: 200, headers: jsonHdr(), body: JSON.stringify(result) };
  } catch (e) {
    console.error('SCF evaluate error:', e);
    return { statusCode: 500, headers: jsonHdr(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonHdr() {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
}
