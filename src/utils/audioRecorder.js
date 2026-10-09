// Browser audio recorder — captures mic at 16kHz mono PCM, packs into WAV.
// No external library needed — WAV = 44-byte header + raw PCM.
// Server-side (server.cjs) converts WAV → MP3 for iFlytek.
//
// 两处「诚实性」的加固，都是接讯飞 ASR 时暴露出来的：
//   1. `new AudioContext({ sampleRate: 16000 })` 这个选项老 Safari 会**静默忽略**。
//      如果只按「请求的 16000」写 WAV 头，实际 48k 的数据会被讯飞当 16k 播，
//      等于三倍速怪声 —— 表现为「识别结果为空」，完全指不到根因。
//      所以实际采样率以 audioContext.sampleRate 为准，不是 16k 就先重采样。
//   2. 采样上限：后台标签页被冻结时定时器不可靠（setTimeout 会被节流），
//      只有「攒够样本就不再 push」是硬保险，防止 WAV 无限长大撞上网关体积上限。

function float32ToInt16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

/** 线性插值重采样到 16k。60 秒 48k→16k 约 288 万次乘加，可忽略。 */
function resampleTo16k(pcm, fromRate) {
  if (fromRate === 16000) return pcm;
  const ratio = fromRate / 16000;
  const outLen = Math.max(1, Math.round(pcm.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = pos - i0;
    out[i] = Math.round(pcm[i0] * (1 - frac) + pcm[i1] * frac);
  }
  return out;
}

function buildWav(pcm, sampleRate) {
  if (pcm.length === 0) throw new Error('No audio recorded');

  const byteRate = sampleRate * 2; // 16-bit mono = 2 bytes per sample
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);        // chunk size
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);          // block align
  view.setUint16(34, 16, true);         // bits per sample
  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  const pcmView = new Int16Array(buf, 44);
  pcmView.set(pcm);

  return new Uint8Array(buf);
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000; // 分块：一次性 concat 大数组会爆栈
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * @param {{ maxMs?: number }} [opts] 采样上限（默认 60s，对齐讯飞 IAT 的单次时长）
 */
export function createAudioRecorder({ maxMs = 60000 } = {}) {
  let audioContext = null;
  let stream = null;
  let sourceNode = null;
  let processorNode = null;
  let chunks = [];
  let actualRate = 16000; // 以 AudioContext 实际采样率为准，见文件头
  let sampleCount = 0;

  async function start() {
    chunks = [];
    sampleCount = 0;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    actualRate = audioContext.sampleRate || 16000;
    sourceNode = audioContext.createMediaStreamSource(stream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    const maxSamples = Math.round((maxMs / 1000) * actualRate);

    return new Promise((resolve) => {
      processorNode.onaudioprocess = (e) => {
        const room = maxSamples - sampleCount;
        if (room <= 0) return;
        const input = e.inputBuffer.getChannelData(0);
        const data = input.length > room ? input.subarray(0, room) : input;
        chunks.push(float32ToInt16(data));
        sampleCount += data.length;
      };
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      resolve();
    });
  }

  function stop() {
    try {
      if (processorNode) { processorNode.disconnect(); processorNode = null; }
      if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
    } catch (e) { /* ignore */ }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function getWavBase64() {
    if (chunks.length === 0) throw new Error('No audio recorded');
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const pcm = new Int16Array(total);
    let offset = 0;
    for (const c of chunks) { pcm.set(c, offset); offset += c.length; }
    const wav = buildWav(resampleTo16k(pcm, actualRate), 16000);
    return arrayBufferToBase64(wav.buffer);
  }

  return { start, stop, getWavBase64 };
}
