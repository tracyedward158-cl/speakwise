// ── 讯飞 TTS 引擎（网页端）──
//
// 原来这里的位置是 window.speechSynthesis：音色跟着操作系统走，慢速靠 rate 改
// 播放速率。现在合成换成服务端讯飞（/api/tts → 讯飞 WebSocket），音色统一。
//
// ── 慢速：服务端合成，客户端不参与 ──
//
// 慢速**必须脱离平台** —— 浏览器的 playbackRate（preservesPitch）在小程序那边
// 没有等价物，两端会各是各的效果。所以慢速就是「向服务端要一份慢速合成」：
// speed=0 是讯飞最慢的一档（实测 ×1.34；99 那端是 ×0.68，全程约 2 倍的行程）。
// 客户端只播，不做任何变速，两端拿到的音频逐字节相同。
//
// ── 为什么是模块级单例 ──
//
// 同一时刻只能有一条音频在响。三个调用方（ChatView / ChatTranscript /
// PronunciationDrill）各自持有一份 hook，如果把播放器放进 hook 里，「谁在播」
// 这个事实就会有多个副本：A 在播时 B 开始播，A 的 speaking 停不下来。
// 播放器属于模块，hook 只订阅。与 mp/src/platform/tts.js 的选择一致。
//
// ── seq token ──
//
// 每段音频带一个自增 id。等网络合成期间用户可能又点了别的、或开了录音，
// 回来时 id 已经不是最新的，这一段的播放就作废 —— 绝不发出声音。
// 同理，onended/onerror 只认自己那一段，不会把新一段的 speaking 置 false。

import { synthesizeSpeech } from "./api.js";
import { cacheKey, cleanForTTS, splitText } from "./ttsText.js";

// 合成语速，两端同源（与 mp/src/config.js 的 TTS_SPEED_NORMAL / TTS_SPEED_SLOW 同值）。
// 0 = 讯飞最慢的一档，不是「没设置」—— 服务端特意用 Number.isFinite 兜住了它。
export const SPEED_NORMAL = 50;
export const SPEED_SLOW = 0;

// 服务端 synthesizeViaWebSocket 的超时是 20s，客户端必须更宽 ——
// 否则用户看到的是本地的「请求超时」，而不是服务端那条能自查的错误。
const TTS_TIMEOUT_MS = 30000;

// 内存缓存条数上限。缓存的意义有两个：同一句反复点不再烧讯飞额度；
// 以及第二次点击命中缓存后走同步路径，落在用户手势的激活窗口内（见下）。
const CACHE_MAX = 40;

// 40ms 静音 WAV，用于在用户手势里「解锁」音频元素。
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

let seq = 0;
let current = null; // { id, text, url, resolve?, reject? }
let el = null;
let elId = 0; // 元素上挂着的是哪一段（回调只认它）
let unlocked = false;
const cache = new Map(); // key -> { url, at }
const listeners = new Set();

function notify() {
  const snap = getSnapshot();
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      /* 订阅者自己的错不该影响播放 */
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// slow 也要暴露出去：界面上「播放」和「慢速」是两颗按钮，
// 各自只该在自己那一档在播时变成停止（否则点了慢速，却是播放键在管停止）。
export function getSnapshot() {
  return { speaking: current != null, text: current?.text ?? null, slow: !!current?.slow };
}

export function isSpeaking() {
  return current != null;
}

function ensureElement() {
  if (el) return el;
  el = new Audio();
  el.preload = "auto";
  // 回调里先比对 id：pause() 不会触发 ended，但 src 换掉、缓冲区出错的时序
  // 在小程序与浏览器上都不完全可控，认 id 最稳。
  el.addEventListener("ended", () => {
    if (current && current.id === elId) finish("ended");
  });
  el.addEventListener("error", () => {
    if (current && current.id === elId) finish("error");
  });
  return el;
}

function finish(reason) {
  const cur = current;
  current = null;
  notify();
  if (!cur) return;
  if (reason === "error") {
    const err = new Error("播放失败");
    cur.reject?.(err);
  } else {
    cur.resolve?.(reason);
  }
}

function stopInternal() {
  seq += 1;
  const cur = current;
  current = null;
  if (el) {
    try {
      el.pause();
    } catch {
      /* 还没挂上源 */
    }
  }
  notify();
  return cur;
}

/** base64 → 字节。不要用 String.fromCharCode(...bytes) 展开，大音频会爆栈。 */
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function sweepCache() {
  if (cache.size <= CACHE_MAX) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key, v] of entries) {
    if (cache.size <= CACHE_MAX) break;
    if (current?.url === v.url) continue; // 正在响的不动
    URL.revokeObjectURL(v.url);
    cache.delete(key);
  }
}

/**
 * 取（必要时合成）音频的 object URL。命中缓存时是纯同步返回。
 * 常速与慢速是两份不同的合成音频，缓存键必须区分（见 ttsText.cacheKey）。
 */
async function ensureUrl(text, slow) {
  const key = cacheKey(text, slow);
  const hit = cache.get(key);
  if (hit) {
    hit.at = Date.now();
    return hit.url;
  }

  const speed = slow ? SPEED_SLOW : SPEED_NORMAL;
  const blobs = [];
  for (const part of splitText(text)) {
    const res = await synthesizeSpeech(part, speed, TTS_TIMEOUT_MS);
    if (!res?.audio) throw new Error("语音合成返回为空");
    // ⚠️ 每段单独解成字节再交给 Blob 拼接。
    //    直接拼 base64 字符串是错的：每段字节数不是 3 的倍数时，段尾会带 '=' 填充，
    //    拼出来就是坏数据。（mp 那边的 pieces.join('') 就有这个问题，见文件头的提醒。）
    blobs.push(base64ToBytes(res.audio));
  }

  const url = URL.createObjectURL(new Blob(blobs, { type: "audio/mpeg" }));
  cache.set(key, { url, at: Date.now() });
  sweepCache();
  return url;
}

/**
 * 朗读一段文本。
 * 解析出 'ended' / 'stopped'（被下一段或 stopSpeaking 打断）；失败时 reject，
 * 调用方（useSpeech）负责把消息说出来。
 */
export async function speak(rawText, slow = false) {
  const text = cleanForTTS(rawText);
  if (!text.trim()) return null;

  const elm = ensureElement();

  // 同步掐掉正在响的：它的调用方拿到 'stopped'。
  // ⚠️ 必须**先停再取 id** —— stopInternal 自己会 seq++，
  //    反过来写的话本次的 id 立刻过期，后面那个 id !== seq 检查会把所有播放都作废。
  const prev = stopInternal();
  prev?.resolve?.("stopped");

  const id = ++seq;
  // 合成期间就算「正在播」—— 按钮立刻切成 Stop，用户再点一下就能停掉这次等待
  current = { id, text, slow, url: null };
  notify();

  let url;
  try {
    url = await ensureUrl(text, slow);
  } catch (e) {
    // 等网络这段时间里用户又点了别的 / 开了录音 —— 这次失败不是用户关心的
    if (id !== seq) return null;
    current = null;
    notify();
    throw e;
  }
  // 同上：本次已被取代，绝不发声
  if (id !== seq) return null;

  return new Promise((resolve, reject) => {
    current = { id, text, slow, url, resolve, reject };
    elId = id;
    notify();
    elm.src = url;
    // 从头播：元素是复用的，上一次「播到一半被停掉」的位置会留在 currentTime 上，
    // 不复位就会从句子中间接上（ends 之后 play() 按规范会回到开头，但中途暂停不会）。
    try {
      elm.currentTime = 0;
    } catch {
      /* 源还没可寻址（极短音频），按现状播 */
    }
    // 这里**不做任何变速**：慢速是服务端合成好的另一份音频（见文件头）。
    // 元素复用则要保证上一段的倍率不残留 —— 早期版本用过 playbackRate，留一行清干净。
    try {
      elm.playbackRate = 1;
    } catch {
      /* ignore */
    }
    const p = elm.play();
    if (p?.catch) {
      p.catch((e) => {
        if (current?.id !== id) return;
        current = null;
        notify();
        const err = new Error(
          e?.name === "NotAllowedError" ? "浏览器拦截了播放，请再点一次" : "播放失败"
        );
        err.name = e?.name;
        reject(err);
      });
    }
  });
}

/** 停止朗读。同步生效，正在等待合成的调用方也会在回来时看到 id 过期。 */
export function stopSpeaking() {
  const cur = stopInternal();
  cur?.resolve?.("stopped");
}

// ── autoplay 解锁 ──
//
// play() 发生在 await fetch 之后，早已脱离 click 的激活窗口。Chrome 靠文档级的
// sticky activation 通常放行；iOS Safari 更严，而且它的解锁是**逐元素**的 ——
// 必须在真实手势里让这个元素成功播放过一次。所以模块加载时挂一次 pointerdown
// （capture + once），用手势里的 40ms 静音把元素解锁。
//
// 解锁与真实播放可能只隔几十毫秒（用户点 Play 的那一刻），所以暂停前先看
// current 有没有被赋上：已在放真的了就别动它。
if (typeof document !== "undefined") {
  const prime = () => {
    if (unlocked) return;
    unlocked = true;
    const elm = ensureElement();
    if (current) return; // 已经在放真的了（比如 pointerdown 之后紧跟的这次点击），别动它
    elm.src = SILENT_WAV;
    const p = elm.play();
    const settle = () => {
      if (current) return; // 真实播放已经开始，交还控制权
      try {
        elm.pause();
        elm.currentTime = 0;
      } catch {
        /* ignore */
      }
    };
    if (p?.then) p.then(settle, settle);
    else setTimeout(settle, 60);
  };
  document.addEventListener("pointerdown", prime, { once: true, capture: true });
}
