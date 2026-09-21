// ── 发音题库：纯逻辑，不依赖 React ──
// 选课、评测模式映射、讯飞响应解析全部放在这里，而不是埋在组件的事件回调里。
// 原因很实际：本机没有浏览器自动化，验证只能靠 SSR 渲染初始状态，点不到按钮。
// 抽成纯函数才能直接调用断言（见 .sw-check.jsx），否则这部分代码完全测不到。
import RAW from "../data/pronunciationBank.json";

// 归一化并写入 id = 全局下标。
// ⚠️ 题库里有重复文本（「努力」「石头」各出现两次），所以单题定位只能用下标，不能用文本。
export const PRON_BANK = RAW.map((it, id) => ({
  id,
  text: it.text,
  pinyin: it.pinyin,
  english: it.english,
  level: it.level,
  unit: it.unit,
  tags: it.tags || [],
  set: it.set,
}));

export const UNITS = ["字", "词", "句"];

// 日常练习一轮固定 10 题；题库单组不足 10 题时有多少做多少（专项练习的常态）
export const TRAIN_SIZE = 10;

// 标准卷结构：字 10 → 词 10 → 句 5
export const TEST_PLAN = [
  { unit: "字", count: 10 },
  { unit: "词", count: 10 },
  { unit: "句", count: 5 },
];

// 专项标签按题库出现次数降序自动汇总——换题库不用改代码
export const ALL_TAGS = (() => {
  const n = new Map();
  for (const it of PRON_BANK) for (const t of it.tags) n.set(t, (n.get(t) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
})();

/**
 * 讯飞评测类型：word=字 / sent=句子 / para=段落。
 * 单字、词用 sent 评测会拿到失真的完整度与流利度（对一个字谈流利度没有意义），
 * 且 word 模式不返回 fluency/integrity/rhythm/speed —— 见 extractFeedback。
 */
export function coreFor(unit) {
  // 只在明确是字/词时才切 word：没有 unit 的题目（历史数据、异常输入）保持原来的 sent 行为
  return (unit === "字" || unit === "词") ? "word" : "sent";
}

export function filterBank({ level, unit, tag, set = "train" } = {}) {
  return PRON_BANK.filter(it =>
    (!level || it.level === level) &&
    (!unit || it.unit === unit) &&
    (!tag || it.tags.includes(tag)) &&
    (!set || it.set === set)
  );
}

export function countAvailable(opts) {
  return filterBank(opts).length;
}

// 确定性伪随机（mulberry32）。随机模式必须可复现：
// 否则刷新页面或前进后退就会重排题目，学生做到一半题就变了。
function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 选题。**永远不跨标签补题**——专项练习凑不满 10 题就该显示「本组共 N 题」，
 * 拿别的标签填满会让「专项」名不副实，也会污染科研数据。
 * 返回 actual 供 UI 如实显示，调用方不要假装拿到了 count 道题。
 *
 * offset 用来「轮转」：顺序/专项模式下每轮取 10 条，下一轮从第 11 条接着取，
 * 走到末尾就从头开始新一轮。没有它的话池子里第 11 条往后永远练不到。
 * 池子不比一轮多时退化成整体返回。
 */
export function selectItems({ level, unit, tag, set = "train", mode = "seq", count = TRAIN_SIZE, seed, offset = 0 } = {}) {
  const pool = filterBank({ level, unit, tag, set });
  const ordered = mode === "random" ? shuffled(pool, makeRng(seed)) : pool;

  // 走到池子末尾就从头开始下一轮；**本轮内不绕回补齐**。
  // 绕回补齐的话（池子 45、每轮 10）第 5 轮会是 40-44 + 0-4，其中 5 题刚练过。
  // 宁可有 5 题的一轮短轮，也不要一轮里混着重复题——「轮转」的意义就是把新的练掉。
  const len = ordered.length;
  const start = len ? (Math.max(0, Number(offset) || 0) % len) : 0;
  const items = ordered.slice(start, start + count);
  return { items, requested: count, actual: items.length, poolSize: len, offset: start };
}

/**
 * 标准卷序列：字 10 → 词 10 → 句 5，**不打乱**。
 * 两个卷是给前后测用的平行卷，同一份卷必须在所有学生、所有场次上完全一致，
 * 顺序被打乱就没法当作标准化测验了。
 * 题量按题库实际内容出，不补题：某组不足时该卷题量就少于 25（如题库曾经 testB/4-6
 * 只有 9 个词，该卷就是 24 题）。2026-09-21 已给 testB/4-6 补上第 10 个词「理想」，
 * 现在六套卷都是 25 题；这条注释保留是为了说明「题量由数据决定」而不是写死的。
 */
export function buildTestSequence({ set, level } = {}) {
  const items = [];
  for (const { unit, count } of TEST_PLAN) {
    items.push(...filterBank({ level, unit, set }).slice(0, count));
  }
  return items;
}

/**
 * 按 URL 参数构建一轮练习。参数来自 /oral/drill/practice?...
 * 返回 { items, title, subtitle, actual, requested }
 */
export function buildPracticeSession(params = {}, level) {
  const set = params.set || "train";
  const mode = params.mode || "seq";
  const unit = params.unit || "";
  const tag = params.tag || "";
  const offset = Number(params.offset) || 0;

  if (mode === "single") {
    const it = PRON_BANK[Number(params.item)];
    return {
      items: it ? [it] : [],
      title: "单题练习",
      subtitle: it ? `${it.unit} · ${it.text}` : "题目不存在",
      actual: it ? 1 : 0,
      requested: 1,
      set, mode, offset: 0, poolSize: it ? 1 : 0,
    };
  }

  if (set === "testA" || set === "testB") {
    const items = buildTestSequence({ set, level });
    const label = set === "testA" ? "Test A" : "Test B";
    return {
      items,
      title: `测试模式 · ${label}`,
      subtitle: `${TEST_PLAN.map(p => `${p.unit}${p.count}`).join(" + ")}`,
      actual: items.length,
      requested: TEST_PLAN.reduce((a, p) => a + p.count, 0),
      // 标准卷是固定题序，不分轮——两卷前后测必须拿到同一份卷
      set, mode: "test", offset: 0, poolSize: items.length,
    };
  }

  const { items, actual, requested, poolSize } = selectItems({
    level, unit, tag, set, mode, seed: params.seed, offset,
  });
  const modeLabel = mode === "random" ? "随机" : mode === "focus" ? `专项 · ${tag}` : "顺序";
  return {
    items,
    title: "日常练习",
    subtitle: [unit || "全部", modeLabel].join(" · "),
    actual, requested, poolSize, set, mode, offset,
  };
}

/**
 * 下一轮的查询参数。
 *   顺序/专项：offset 往前推一轮，selectItems 自己处理到底绕回
 *   随机：换一个种子，重新洗牌
 * now 由调用方传入（而不是内部读 Date.now），这样轮转算术可以直接被测试断言。
 */
export function nextRoundParams(params = {}, session = {}, now = Date.now()) {
  const p = { ...params };
  if (session.mode === "random") {
    p.seed = String(now % 1000000);
  } else {
    p.offset = String((Number(params.offset) || 0) + (session.actual || 0));
  }
  return p;
}

/**
 * 讯飞响应 → 反馈对象 + 记录字段。原来是埋在录音回调里的约 40 行，
 * 是本次改动里最容易写错又最难验证的一段。
 *
 * ⚠️ core=word（字/词）只返回 overall/pronunciation/tone/duration/words，
 *    fluency/integrity/rhythm/speed 全是 undefined。这里统一成 null，
 *    下游（recordStore 的雷达图与弱项分析）已经对 null 做了判空，不要再"顺手修复"它们。
 */
export function extractFeedback(result, item = {}) {
  const r = result || {};
  const overall = r.overall ?? 0;

  const wordProblems = (r.words || [])
    .filter(w => w.readType > 0)
    .map(w => w.readType === 1 ? `"${w.word}"增读` : w.readType === 2 ? `"${w.word}"漏读` : `"${w.word}"发音偏差`);
  const dimProblems = [];
  if (r.tone < 70) dimProblems.push("声调不稳定");
  if (r.fluency < 70) dimProblems.push("流利度不足");
  if (r.integrity < 70) dimProblems.push("完整度不足");
  if (r.pronunciation < 70) dimProblems.push("发音不够清晰");
  if (r.warning?.some(w => w.code === 1004)) dimProblems.push("环境噪音");

  return {
    feedback: {
      type: "iflytek",
      overall,
      pronunciation: r.pronunciation ?? null,
      tone: r.tone ?? null,
      fluency: r.fluency ?? null,
      integrity: r.integrity ?? null,
      rhythm: r.rhythm ?? null,
      speed: r.speed ?? null,
      duration: r.duration ?? null,
      words: r.words || [],
      warning: r.warning || null,
      score: overall,
      unit: item.unit || "",
    },
    record: {
      score: overall,
      dimensions: {
        pronunciation: r.pronunciation ?? null,
        tone: r.tone ?? null,
        fluency: r.fluency ?? null,
        completeness: r.integrity ?? null,
      },
      problems: [...dimProblems, ...wordProblems].slice(0, 4),
      suggestion: overall >= 80 ? "发音较好，继续保持。"
        : overall >= 60 ? "建议重点练习发音和声调，多跟读模仿。"
        : "建议在安静环境下反复跟读，从简单句子开始练习。",
    },
  };
}

/**
 * 结果页的维度格子：**只渲染有值的格**。
 * word 模式没有流利度/完整度/韵律度/语速，固定 6 格会变成 4 个连着的「—」。
 */
export function dimensionCells(fb) {
  if (!fb) return [];
  return [
    { label: "发音", value: fb.pronunciation },
    { label: "声调", value: fb.tone },
    { label: "流利度", value: fb.fluency },
    { label: "完整度", value: fb.integrity },
    { label: "韵律度", value: fb.rhythm },
    { label: "语速", value: fb.speed ? `${fb.speed}字/分` : null, raw: true },
  ].filter(d => d.value != null);
}

// ── 自定义练习：学生自己输入的文本 ──
const MAX_SENTENCE_CHARS = 5000;   // 防御性上限，正常输入远达不到

/**
 * 把学生输入的文本按中英文标点切成题目，返回 { text } 对象数组。
 * ⚠️ 字段名必须和题库一致：评测界面整段逻辑都按 q.text 取值。
 * 文本里一个断句符号都没有时整段算一句 —— 学生想一口气读完一段也是合法的。
 * 导出是为了能在 SSR harness 里直接调用验证（本仓库没有测试框架）。
 */
export function buildCustomBank(text) {
  return String(text || "")
    .split(/[。！？!?；;…\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map(t => ({ text: t.slice(0, MAX_SENTENCE_CHARS), unit: "句" }));
}

/**
 * 按题目原文聚合本人的练习记录，供题库浏览显示「已练次数 / 最高分 / 历史」。
 * 记录里没有存题库 id，句子原文是唯一的关联键——题库中重复的两条会共享统计。
 */
export function statsByText(records) {
  const m = new Map();
  for (const r of records || []) {
    if (r.module !== "发音测评" || !r.scenario) continue;
    const e = m.get(r.scenario) || { count: 0, best: 0, history: [] };
    e.count += 1;
    if (r.score > e.best) e.best = r.score;
    e.history.push(r);
    m.set(r.scenario, e);
  }
  for (const e of m.values()) {
    e.history.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }
  return m;
}
