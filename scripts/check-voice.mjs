#!/usr/bin/env node
// 网页端语音链路的自检（TTS / ASR 接讯飞之后加的）。
//
// 为什么需要它：这条链路的正确性有一半在浏览器之外 —— 文本清洗与切分是纯函数，
// 而「合成 → 识别」的往返完全可以在 Node 里跑通。小程序的 mp/scripts/check-core.mjs
// 已经证明了这个模式（跑真代码、不引测试框架），这里是对应的网页端版本。
//
//   node scripts/check-voice.mjs          离线段：文本规则，不需要起服务
//   node scripts/check-voice.mjs --live   在线段：起 node server.cjs 后跑，真调讯飞
//
// CHECK_VERBOSE=1 逐条回显；CHECK_API_BASE 可覆盖服务地址（默认 http://localhost:3000）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cacheKey, cleanForTTS, splitText, TTS_MAX_CHARS } from "../src/utils/ttsText.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
const fails = [];
const VERBOSE = !!process.env.CHECK_VERBOSE;

function ok(name, cond, detail) {
  if (VERBOSE) console.log((cond ? "  ✓ " : "  ✗ ") + name);
  if (cond) { pass++; return; }
  fails.push(name + (detail ? "  → " + detail : ""));
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(name, a === e, "实际 " + a + "，期望 " + e);
}

// ══════════════ 离线段：文本规则 ══════════════

// 清洗：气泡原文形如「汉字: 你好 (Nǐ hǎo) 🙂」，注音和表情都不该被念出来
eq("去 markdown 星号", cleanForTTS("**你好**"), "你好");
eq("去标题井号", cleanForTTS("## 标题\n正文"), "标题\n正文");
eq("去括号注音", cleanForTTS("你好 (Nǐ hǎo)"), "你好 ");
eq("去 emoji", cleanForTTS("你好🙂🌱"), "你好");
eq("普通句子原样", cleanForTTS("今天天气很好。"), "今天天气很好。");
eq("空输入不炸", cleanForTTS(undefined), "");

// 切分
eq("短文本单段", splitText("你好。").length, 1);
eq("空串零段", splitText("").length, 0);
{
  const long = "这是第一句。".repeat(400); // 2400 字，有标点
  const parts = splitText(long);
  ok("超长文本被切开", parts.length > 1, `段数 ${parts.length}`);
  ok("每段都不超上限", parts.every(p => p.length <= TTS_MAX_CHARS), `最长 ${Math.max(...parts.map(p => p.length))}`);
  eq("切开后内容无损", parts.join(""), long);
}
{
  // 硬切兜底：整段没有任何终止标点 —— 少了这层，服务端会回 400「文本过长」
  const noPunct = "好".repeat(TTS_MAX_CHARS * 2 + 37);
  const parts = splitText(noPunct);
  ok("无标点超长文本也能切开", parts.length === 3, `段数 ${parts.length}`);
  ok("无标点切分每段不超上限", parts.every(p => p.length <= TTS_MAX_CHARS));
  eq("无标点切分内容无损", parts.join(""), noPunct);
}

// 缓存键：常速与慢速是两份不同的合成音频（服务端各合成一次），键必须区分 ——
// 不区分的话慢速会命中常速的缓存，听起来「点了没反应」。
ok("常速与慢速是两个缓存键", cacheKey("你好", true) !== cacheKey("你好", false));
eq("同一句话同一个档位的键稳定", cacheKey("你好", true), cacheKey("你好", true));

// 与 mp 那份实现的等价性：同一组固定输入必须得到同一输出。
// 两边是手写两份（见 ttsText.js 文件头），这里用样例钉住。
{
  // 注意 #1 的两个空格：括号与其后的 emoji 各留下一个空格，这是 mp 那份实现的
  // 既有行为（不折叠空白）。这里**刻意跟着它** —— 清洗结果进缓存键，
  // 两端输出不一致会让同一句话在小程序与网页互不命中缓存。
  const samples = ["你好 (Nǐ hǎo) 🙂", "**重点**句子。", "A__B~~C~~"];
  const expected = ["你好  ", "重点句子。", "ABC"];
  samples.forEach((s, i) => eq(`与 mp 实现同输出 #${i + 1}`, cleanForTTS(s), expected[i]));
}

// ══════════════ 引擎段：用假 DOM 驱动真实的 utils/tts.js ══════════════
//
// utils/tts.js 里最容易写错的是 seq token（取代、停止、缓存命中时的时序），
// 而这几条路径在浏览器里点几下是测不全的。这里把真实源码打包进来、用假的
// Audio/document/fetch 驱动 —— 与 mp/scripts/check-core.mjs 跑真代码的思路一致。

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 最小的合法 mp3 字节（ID3 头），让 base64 → Blob 那段走通
const FAKE_MP3_B64 = Buffer.concat([
  Buffer.from("ID3", "latin1"),
  Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Buffer.alloc(2048, 0x21),
]).toString("base64");

async function engine() {
  console.log("\n── 引擎段（假 DOM 驱动 tts.js）──");
  const { build } = await import("esbuild");
  const out = path.join(ROOT, "node_modules", ".cache", "check-tts.mjs");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, "src", "utils", "tts.js")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile: out,
    // api.js 里用 import.meta.env.DEV 选 base，Node 直接跑会是 undefined.DEV
    define: { "import.meta.env": JSON.stringify({ DEV: true }) },
    logLevel: "warning",
  });

  // ── 假浏览器 ──
  const audio = {
    src: "",
    currentTime: 0,
    playbackRate: 1,
    preservesPitch: null,
    playCalls: 0,
    pauseCalls: 0,
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; },
    play() { this.playCalls++; return Promise.resolve(); },
    pause() { this.pauseCalls++; },
    emit(name) { this.handlers[name]?.(); },
  };
  const saved = {
    document: globalThis.document,
    Audio: globalThis.Audio,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
  };
  globalThis.document = { addEventListener() { /* prime 只在浏览器里挂 */ } };
  globalThis.Audio = function FakeAudio() { return audio; };
  globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };

  let fetchCalls = 0;
  const askedSpeeds = []; // 每次合成请求要的语速，用来断言「慢速 = 向服务端要 speed 0」
  globalThis.fetch = async (url, opts) => {
    fetchCalls++;
    const body = JSON.parse(opts.body);
    askedSpeeds.push(body.speed);
    if (String(body.text).includes("失败")) {
      return { ok: false, status: 502, json: async () => ({ error: "TTS 服务返回错误" }) };
    }
    if (String(body.text).includes("慢慢来")) await sleep(60); // 制造一个「合成还没回来」的窗口
    return { ok: true, status: 200, json: async () => ({ audio: FAKE_MP3_B64, format: "mp3" }) };
  };

  try {
    const tts = await import(pathToFileURL(out).href + "?t=" + Date.now());

    // 1) 正常播完
    const p1 = tts.speak("你好");
    eq("合成期间就算在播（按钮立刻切 Stop）", tts.getSnapshot().speaking, true);
    await sleep(0);
    eq("合成完成后调用 play", audio.playCalls, 1);
    ok("src 是 blob URL", String(audio.src).startsWith("blob:"));
    eq("常速播放的 playbackRate 是 1", audio.playbackRate, 1);
    audio.emit("ended");
    eq("播完 resolve 'ended'", await p1, "ended");
    eq("播完 speaking 复位", tts.getSnapshot().speaking, false);

    // 2) 慢速：**另外向服务端要一份**（speed 0），客户端一点变速都不做 ——
    //    慢速必须脱离平台，浏览器与小程序的播放层不能各是各的效果。
    const before = fetchCalls;
    const pSlow = tts.speak("你好", true);
    await sleep(0);
    eq("慢速单独发一次合成请求", fetchCalls, before + 1);
    eq("慢速请求的语速是 0（讯飞最慢档）", askedSpeeds[askedSpeeds.length - 1], 0);
    eq("播放时不做客户端变速", audio.playbackRate, 1);
    eq("慢速也算「在播」，并标出档位", tts.getSnapshot().slow, true);
    audio.emit("ended");
    eq("慢速播完 resolve 'ended'", await pSlow, "ended");
    eq("播完档位复位", tts.getSnapshot().slow, false);

    // 2b) 常速与慢速各自命中自己那份缓存（上面两次共 2 个请求，之后不再增加）
    const afterBoth = fetchCalls;
    const p2 = tts.speak("你好");
    await sleep(0);
    eq("常速再点命中缓存，不再请求", fetchCalls, afterBoth);
    audio.emit("ended");
    await p2;
    const pSlow2 = tts.speak("你好", true);
    await sleep(0);
    eq("慢速再点也命中缓存", fetchCalls, afterBoth);
    tts.stopSpeaking();
    await pSlow2;

    // 3) 取代：合成还没回来就点下一句 —— 前一段绝不发声
    const playsBefore = audio.playCalls;
    const pa = tts.speak("慢慢来一句话");
    await sleep(0);
    const pb = tts.speak("你好");
    await sleep(80); // 让 pa 的合成回来了
    eq("被取代的那段不发声", await pa, null);
    eq("只有最新一段播了", audio.playCalls, playsBefore + 1);
    tts.stopSpeaking();

    // 4) 合成失败：reject 且状态复位
    const pe = tts.speak("失败的话");
    ok("合成失败时 reject", await pe.then(() => false, () => true));
    eq("失败后 speaking 复位", tts.getSnapshot().speaking, false);

    // 5) 超长文本切段：多段请求 + 字节拼接
    const beforeLong = fetchCalls;
    const pl = tts.speak("这是一句话。".repeat(400)); // 2000 字
    await sleep(0);
    await sleep(0);
    ok("超长文本切成多段请求", fetchCalls - beforeLong > 1, `请求 ${fetchCalls - beforeLong} 次`);
    audio.emit("ended");
    await pl;

    // 6) 空文本：不发请求
    const beforeEmpty = fetchCalls;
    eq("空文本直接返回 null", await tts.speak("   "), null);
    eq("空文本不发请求", fetchCalls, beforeEmpty);
  } finally {
    globalThis.document = saved.document;
    globalThis.Audio = saved.Audio;
    globalThis.fetch = saved.fetch;
    globalThis.localStorage = saved.localStorage;
  }
}

await engine().catch((e) => {
  fails.push("引擎段异常终止: " + (e?.stack || e?.message || e));
});

// ══════════════ 在线段：真调讯飞 ══════════════

const LIVE = process.argv.includes("--live");
const BASE = process.env.CHECK_API_BASE || "http://localhost:3000";

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch { /* 非 JSON 响应下面按 status 判断 */ }
  return { status: r.status, json };
}

const norm = (s) => String(s || "").replace(/[\s，。！？；：、,.!?;:'"“”‘’]/g, "");

async function live() {
  console.log(`\n── 在线段（${BASE}，真调讯飞）──`);

  const text = "你好，今天天气很好。";

  // 1. 合成：返回的是不是一段像样的 mp3
  const t = await post("/api/tts", { text, speed: 50 });
  ok("TTS 返回 200", t.status === 200, `HTTP ${t.status} ${t.json?.error || ""}`);
  const bytes = Buffer.from(t.json?.audio || "", "base64");
  ok("TTS 音频非空", bytes.length > 2000, `${bytes.length} 字节`);
  const head = bytes.subarray(0, 3).toString("latin1");
  ok(
    "TTS 产物是 mp3（ID3 头或 MPEG 帧同步）",
    head === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
    `头部 ${bytes.subarray(0, 4).toString("hex")}`
  );

  // 2. 往返：把合成的 mp3 原样喂给 ASR，文本必须回来 ——
  //    绕开麦克风与外放，是这条链路最省事的一条端到端证据
  const a = await post("/api/asr", { audio: t.json?.audio });
  ok("ASR 返回 200", a.status === 200, `HTTP ${a.status} ${a.json?.error || ""}`);
  ok(
    "TTS→ASR 往返文本一致",
    norm(a.json?.text) === norm(text),
    `识别到 ${JSON.stringify(a.json?.text)}`
  );

  // 3. 慢速是真的慢：speed=0 必须比常速长，且不能是「被当成没传、回落成 50」。
  //    （踩过的坑：路由里写过 `Number(speed) || 50`，0 被悄悄换成 50，
  //     表现为「慢速调了没反应」。比特率固定，字节数可以当时长用。）
  const normalBytes = (t.json?.audio || "").length;
  const slow = await post("/api/tts", { text, speed: 0 });
  const slowBytes = (slow.json?.audio || "").length;
  ok("speed=0 返回 200", slow.status === 200, `HTTP ${slow.status} ${slow.json?.error || ""}`);
  ok(
    "speed=0 比常速明显更长（实测 ×1.34）",
    slowBytes > normalBytes * 1.15,
    `常速 ${normalBytes} B，慢速 ${slowBytes} B（×${(slowBytes / normalBytes).toFixed(3)}）`
  );
  const fast = await post("/api/tts", { text, speed: 99 });
  ok(
    "speed=99 比常速短（行程两端都通）",
    (fast.json?.audio || "").length < normalBytes * 0.9,
    `快档 ${(fast.json?.audio || "").length} B`
  );

  // 4. 超长文案必须被拒 —— 客户端 splitText 存在的理由
  const over = await post("/api/tts", { text: "好".repeat(TTS_MAX_CHARS + 1), speed: 50 });
  eq("超长文案返回 400", over.status, 400);

  // 5. WAV 通道：网页端录音器交上来的就是 16k 单声道 WAV。
  //    补 WAV→MP3 之前这里是 502（讯飞 10043 audioCoding decode fail）。
  //    用静音，因为只验证「转换 + 握手」这条路，不验证识别内容。
  {
    const rate = 16000, n = rate;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
    buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
    const w = await post("/api/asr", { audio: buf.toString("base64") });
    ok("WAV 上行返回 200（不再被当 mp3 送错）", w.status === 200, `HTTP ${w.status} ${w.json?.error || ""}`);
  }
}

// ══════════════ 输出 ══════════════

if (LIVE) {
  await live().catch((e) => {
    fails.push("在线段异常终止: " + (e?.message || e));
  });
}

if (fails.length) {
  console.error(`\n✗ 语音自检失败 ${fails.length} 项（通过 ${pass}）:\n`);
  for (const f of fails) console.error("   ✗ " + f);
  process.exit(1);
}
console.log(`✓ 语音自检通过（${pass} 项断言${LIVE ? "，含在线段" : "，离线"}）`);
