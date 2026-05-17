// Browser audio recorder — captures mic at 16kHz mono PCM, packs into WAV.
// No external library needed — WAV = 44-byte header + raw PCM.
// Server-side (server.js / api/evaluate.js) converts WAV → MP3 for iFlytek.

function float32ToInt16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

function buildWav(pcmChunks, sampleRate) {
  // Concatenate all PCM chunks
  const totalSamples = pcmChunks.reduce((acc, c) => acc + c.length, 0);
  if (totalSamples === 0) throw new Error('No audio recorded');

  const pcm = new Int16Array(totalSamples);
  let offset = 0;
  for (const c of pcmChunks) { pcm.set(c, offset); offset += c.length; }

  const byteRate = sampleRate * 2; // 16-bit mono = 2 bytes per sample
  const dataSize = totalSamples * 2;
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
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function createAudioRecorder() {
  let audioContext = null;
  let stream = null;
  let sourceNode = null;
  let processorNode = null;
  let chunks = [];

  async function start() {
    chunks = [];
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    sourceNode = audioContext.createMediaStreamSource(stream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    return new Promise((resolve) => {
      processorNode.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunks.push(float32ToInt16(input));
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
    const wav = buildWav(chunks, 16000);
    return arrayBufferToBase64(wav.buffer);
  }

  return { start, stop, getWavBase64 };
}
