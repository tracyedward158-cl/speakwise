// Vercel Serverless Function — proxies pronunciation evaluation to iFlytek Suntone API

const crypto = require('crypto');
const fs = require('fs');

// lamejs's CJS entry point loads sub-modules that reference each other
// as bare globals (e.g. MPEGMode). Use the self-contained lame.all.js bundle.
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

const IFLYTEK_HOST = 'cn-east-1.ws-api.xf-yun.com';
const IFLYTEK_PATH = '/v1/private/s8e098720'; // 中英文评测

function generateAuth(apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const requestLine = `GET ${IFLYTEK_PATH} HTTP/1.1`;
  const signatureOrigin = `host: ${IFLYTEK_HOST}\ndate: ${date}\n${requestLine}`;
  const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest();
  const signature = signatureSha.toString('base64');
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  return { date, authorization };
}

function buildUrl(apiKey, apiSecret) {
  const { date, authorization } = generateAuth(apiKey, apiSecret);
  const params = `?host=${encodeURIComponent(IFLYTEK_HOST)}&date=${encodeURIComponent(date)}&authorization=${encodeURIComponent(authorization)}`;
  return `wss://${IFLYTEK_HOST}${IFLYTEK_PATH}${params}`;
}

function connectAndEvaluate(url, requestData) {
  return new Promise((resolve, reject) => {
    const WebSocket = globalThis.WebSocket;
    const ws = new WebSocket(url);
    let resultReceived = false;

    const timeout = setTimeout(() => {
      if (!resultReceived) {
        try { ws.close(); } catch (e) { /* ignore */ }
        reject(new Error('Evaluation timed out'));
      }
    }, 15000);

    ws.onopen = () => {
      const { audio, ...rest } = requestData.payload.data;
      console.log('[iFlytek] WS connected, sending:', JSON.stringify({ ...requestData, payload: { data: { ...rest, audio: `[${audio?.length || 0} chars]` } } }, null, 2));
      ws.send(JSON.stringify(requestData));
    };

    ws.onmessage = (event) => {
      console.log('[iFlytek] raw message:', event.data?.slice(0, 500));
      try {
        const data = JSON.parse(event.data);
        if (data.header?.code !== 0) {
          console.error('[iFlytek] API error response:', JSON.stringify(data, null, 2));
          resultReceived = true;
          clearTimeout(timeout);
          ws.close();
          reject(new Error(data.header?.message || `API error code ${data.header?.code}`));
          return;
        }
        if (data.payload?.result?.text) {
          const decodedText = Buffer.from(data.payload.result.text, 'base64').toString('utf8');
          console.log('[iFlytek] decoded result:', decodedText.slice(0, 300));
          const result = JSON.parse(decodedText);
          if (result.eof === 1) {
            resultReceived = true;
            clearTimeout(timeout);
            ws.close();

            // Extract the evaluation result
            const evalResult = result.result || result;
            resolve({
              refText: result.refText,
              overall: evalResult.overall ?? null,
              pronunciation: evalResult.pronunciation ?? null,
              tone: evalResult.tone ?? null,
              fluency: evalResult.fluency ?? null,
              integrity: evalResult.integrity ?? null,
              rhythm: evalResult.rhythm ?? null,
              speed: evalResult.speed ?? null,
              duration: evalResult.duration ?? null,
              words: evalResult.words?.map(w => ({
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
                phonemes: w.phonemes?.map(p => ({
                  phoneme: p.phoneme,
                  pronunciation: p.pronunciation,
                })),
              })) || [],
              warning: evalResult.warning || null,
            });
          }
        }
      } catch (e) {
        if (!resultReceived) {
          resultReceived = true;
          clearTimeout(timeout);
          try { ws.close(); } catch (ex) { /* ignore */ }
          console.error('[iFlytek] parse error:', e);
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      }
    };

    ws.onerror = (e) => {
      if (!resultReceived) {
        resultReceived = true;
        clearTimeout(timeout);
        console.error('[iFlytek] WS error:', e?.message || e);
        reject(new Error('WebSocket connection failed'));
      }
    };

    ws.onclose = (e) => {
      if (!resultReceived) {
        resultReceived = true;
        clearTimeout(timeout);
        console.error('[iFlytek] WS closed unexpectedly, code:', e?.code, 'reason:', e?.reason);
        reject(new Error('Connection closed unexpectedly'));
      }
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const APP_ID = process.env.IFLYTEK_APP_ID;
  const API_KEY = process.env.IFLYTEK_API_KEY;
  const API_SECRET = process.env.IFLYTEK_API_SECRET;

  if (!APP_ID || !API_KEY || !API_SECRET) {
    return res.status(500).json({
      error: 'Iflytek credentials not configured',
      detail: 'Set IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET in Vercel environment variables',
    });
  }

  try {
    const { audio, refText, core = 'sent' } = req.body;

    if (!audio || !refText) {
      return res.status(400).json({ error: 'Missing audio or refText' });
    }

    // Verify audio size (max 10MB base64 encoded)
    if (audio.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio too large (max 10MB base64)' });
    }

    // Convert WAV → MP3 (WAV starts with "UklGR" = "RIFF" in base64)
    const mp3Audio = audio.startsWith('UklGR') ? wavBase64ToMp3Base64(audio) : audio;

    const requestData = {
      header: { app_id: APP_ID, status: 2 },  // 2 = end, all audio sent
      parameter: {
        st: {
          lang: 'cn',
          core: core,
          refText: refText,
          phoneme_output: 1,
          scale: 100,
          result: { encoding: 'utf8', compress: 'raw', format: 'plain' },
        },
      },
      payload: {
        data: {
          encoding: 'lame',
          sample_rate: 16000,
          channels: 1,
          bit_depth: 16,
          status: 2,
          seq: 0,
          audio: mp3Audio,
          frame_size: 0,
        },
      },
    };

    const wsUrl = buildUrl(API_KEY, API_SECRET);
    const result = await connectAndEvaluate(wsUrl, requestData);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Evaluate API error:', error);
    return res.status(500).json({ error: error.message || 'Failed to evaluate pronunciation' });
  }
}
