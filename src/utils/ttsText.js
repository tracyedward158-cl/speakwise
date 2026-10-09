// ── TTS 的纯文本规则：清洗与切分 ──
//
// 单独成文件而不是塞进 hooks/useSpeech.js 或 utils/tts.js，理由和 mp 那份一样：
// 纯函数可以被 Node 直接 import 断言（见 scripts/check-voice.mjs），不用打包器。
//
// ⚠️ 与 mp/src/core/utils/text.js 的 cleanForTTS 是**两份手写实现**（那边是从 .jsx
//    拆出来的、不参与 sync-core 白名单），改动要两边一起改 —— check-voice 用同一组
//    样例把两边钉在一起。切分结果进缓存键，所以实现不一致会导致两端缓存互不命中。

// 讯飞单次合成要求文本 base64 前 < 8000 字节（约 2000 汉字）。
// 三处必须同值：这里 = server.cjs 的 TTS_MAX_CHARS = mp/src/platform/tts.js 的 MAX_TTS_CHARS。
export const TTS_MAX_CHARS = 1200;

// 与 src/utils/helpers.jsx 的 clean() 同实现 —— 这里抄一份而不是 import：
// helpers.jsx 是 JSX 文件，一旦 import，这个模块就不能被 Node 直接加载了。
function clean(t) {
  return String(t ?? "")
    .replace(/\*\*/g, "").replace(/\*/g, "")
    .replace(/^#{1,6}\s/gm, "")
    .replace(/__/g, "").replace(/~~/g, "");
}

/**
 * 朗读前的清洗：去 markdown、去掉括号里的拼音/英文注音、去掉 emoji。
 * 气泡的原文形如「汉字: 你好 (Nǐ hǎo) 🙂」，直接念会把注音和表情一起念出来。
 */
export function cleanForTTS(t) {
  return clean(t)
    .replace(/\(.*?\)/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, "");
}

/**
 * 把长文本切成每段 ≤ max 的若干段（逐段合成，MP3 帧结构可以直接首尾相接）。
 *
 * 两条规则叠用：
 *   1. 在句末标点处切，且攒够一段才切 —— 否则短句会碎成一堆请求；
 *   2. **硬切兜底**：整段没有任何标点时按 max 切。少了这一步，一段无标点的
 *      长文会被原样发给服务端，换回一个 400「文本过长」。
 * 返回的段数恒 ≥ 1（空串除外）；未超长的文本原样返回单段。
 */
export function splitText(text, max = TTS_MAX_CHARS) {
  const s = String(text ?? "");
  if (!s) return [];
  if (s.length <= max) return [s];

  const parts = [];
  let buf = "";
  for (const ch of s) {
    buf += ch;
    if (buf.length >= max && /[。！？；\n]/.test(ch)) {
      parts.push(buf);
      buf = "";
    }
  }
  if (buf) parts.push(buf);

  const out = [];
  for (const p of parts) {
    if (p.length <= max) {
      out.push(p);
    } else {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    }
  }
  return out;
}

/**
 * 缓存键。文本进键之前必须已经过 cleanForTTS —— 否则同一句话换个写法就重新合成。
 *
 * 常速与慢速是**两份不同的合成音频**（服务端各合成一次），键里必须区分，
 * 否则慢速会命中常速的缓存、听起来「点了没反应」。
 */
export function cacheKey(text, slow) {
  return `${slow ? "s" : "n"}|${text ?? ""}`;
}
