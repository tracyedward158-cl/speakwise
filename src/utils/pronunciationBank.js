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
 * 讯飞评测类型：word=单词 / sent=句子 / para=段落。
 *
 * ⚠️ word 模式**只接受 1 个词**。讯飞超限时的报错原文：
 *      Exceed the maximum word limit: (1 for word; 400 for sentence; 1000 for paragraph)!
 *    汉字按字计数，所以「措施」这种两字词在 word 模式下就是 2 个词，直接超限失败。
 *    题库里 193 个「词」条目**没有一个是单字**（2 字 155 个、3 字 16 个、4 字 22 个），
 *    因此「词」粒度必须走 sent —— 否则 100% 必失败，而且失败在**服务端返回之后**，
 *    界面上的表现是「点了一直没有结果」。
 *
 *    代价：「词」现在也会拿到 fluency/integrity/rhythm/speed，对一个两字词谈流利度
 *    语义上偏弱。但 sent 是讯飞唯一收得下两字词的模式，两害相权取其轻。
 *    （当初把「词」也划给 word，本意是避开这几项失真的维度，但那样等于完全跑不通。）
 *
 * 只有单字走 word —— 那才是它真正适用的场景。
 */
export function coreFor(unit) {
  // 没有 unit 的题目（历史数据、异常输入）保持原来的 sent 行为
  return unit === "字" ? "word" : "sent";
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

// ── 自定义练习：AI 补全拼音 / 英文 / 粒度 ──
// 题库的 pinyin/english/unit 是人工标注的，自定义文本没有，只能现生成。
// 三个函数都保持零依赖（AI 调用由调用方注入），理由同文件头：
// 本机没有浏览器自动化，只有纯函数能在 harness 里直接断言。

/** 断句后的自定义题粒度只可能是这三种（题库里的「段」不会出现） */
export const CUSTOM_UNITS = ["字", "词", "句"];

/** 一批最多几句。deepseek-chat 单次输出上限 4096 token，
 *  一句的 JSON（原文+拼音+英文）约 60~100 token，20 句留足余量。 */
export const ENRICH_BATCH_SIZE = 20;

/** 给整批 20 句留的余量：拼音和英文都可能比原文长得多 */
const ENRICH_MAX_TOKENS = 4000;

const MAX_PINYIN = 300;
const MAX_ENGLISH = 300;

export const ENRICH_SYSTEM = `你是中文教材的注音与翻译编辑。用户给出一组已编号的句子，逐句输出四样东西：
text —— 原样抄回该句，一个字都不能改（这是唯一的对齐依据）
pinyin —— 带声调符号的汉语拼音（ā á ǎ à，ü 写作 ü），按词连写，轻声不标调
english —— 自然、地道的英文翻译
unit —— 该行的粒度，只能是 "字"、"词"、"句" 三者之一

unit 判定（输入已去掉句末标点，只看剩下多少内容）：
"字" —— 整行只有 1 个汉字。例：好、水、谢
"词" —— 整行只有 1 个词，拆开就不成话。例：苹果、对不起、努力
"句" —— 其余全部情况：短语、句子、含逗号等内部标点、或由多个词组成。例：我很好、今天天气不错、你叫什么名字

判定 unit 时宁可选 "句" 也不要选 "词"：选成词会让系统按单字模式评测，
丢掉流利度和完整度（对「我很好」谈流利度是有意义的，对「苹果」不是）。

硬性要求：
1. 输出条数必须与输入条数完全相等，一一对应，不许合并、拆分、省略、补全。
2. text 必须与输入逐字相同。
3. 拼音用带调符号，不要用数字标调（写 Nǐ hǎo，不要写 Ni3 hao3）。
4. 只输出 JSON，不要解释、不要 markdown 代码块、不要任何多余文字。

输出格式：
{"items":[{"i":1,"text":"你好吗","pinyin":"Nǐ hǎo ma","english":"How are you?","unit":"句"}]}`;

/** 从可能带 markdown 代码块或前后废话的回复里抠出 JSON 对象/数组 */
function parseLooseJson(reply) {
  const s = String(reply || "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : s).trim();

  // 先按对象解析（约定格式），失败再试裸数组（模型偶尔会省掉外层包装）
  const objStart = body.indexOf("{");
  const objEnd = body.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    try { return JSON.parse(body.slice(objStart, objEnd + 1)); } catch { /* 落到数组分支 */ }
  }
  const arrStart = body.indexOf("[");
  const arrEnd = body.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    try { return JSON.parse(body.slice(arrStart, arrEnd + 1)); } catch { /* 交给调用方 */ }
  }
  return null;
}

/** 比较原文是否逐字相同。空白差异不算差异——模型偶尔会在标点后补一个空格 */
const sameText = (a, b) => {
  const x = String(a ?? "").replace(/\s+/g, "");
  return x !== "" && x === String(b ?? "").replace(/\s+/g, "");
};

/** 模型有没有回填 text。没回填时只剩 i 可对齐，不该因此判整批失败 */
const hasText = (e) => typeof e?.text === "string" && e.text.trim() !== "";

const clipField = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * 解析 AI 返回的补全结果，按 text 逐条对齐。
 *
 * 对齐是这里唯一的难点：条数或顺序一旦错位，A 句的拼音就会挂到 B 句上。
 * 错位的拼音比缺失的拼音危害大得多——学生看不出来，还会照着念错。所以：
 *   1. 先按 i（1-based）对位；回填了 text 就要求逐字相同才算数，
 *      没回填 text 时只认 i（此时 i 是仅剩的对齐依据，总比整批作废强）；
 *   2. 顺序被打乱时退回按 text 全局唯一匹配；
 *   3. 仍然对不上的**留空**，绝不按位置硬塞。
 * 条数不等不算错误：能对上的照常回填、对不上的留空，比整批丢弃有用。
 * 返回的数组长度恒等于 items.length；一条都没对上时返回 null，交给调用方决定重试。
 */
export function parseEnrichReply(reply, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  const parsed = parseLooseJson(reply);
  const arr = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const out = list.map(() => null);
  const used = arr.map(() => false);

  arr.forEach((e, j) => {
    const k = Number(e?.i) - 1;
    if (Number.isInteger(k) && k >= 0 && k < list.length
      && !used[j] && out[k] === null && (!hasText(e) || sameText(e?.text, list[k].text))) {
      used[j] = true;
      out[k] = e;
    }
  });

  list.forEach((it, k) => {
    if (out[k]) return;
    const j = arr.findIndex((e, jj) => !used[jj] && sameText(e?.text, it.text));
    if (j >= 0) { used[j] = true; out[k] = arr[j]; }
  });

  // 一条都没对上：不是"部分缺失"，是模型没按格式回，让调用方重试而不是静默降级
  if (out.every(e => e === null)) return null;

  // 回填时只取这三个字段，**不展开模型返回的原始对象**：
  // 它里面的 text 是模型抄回来的，和原文可能有空白差异，展开会把它盖到原文上。
  return out.map((e, k) => {
    if (!e) return { ...list[k], pinyin: "", english: "", unit: list[k].unit || "句" };
    return {
      ...list[k],
      pinyin: clipField(e.pinyin, MAX_PINYIN),
      english: clipField(e.english, MAX_ENGLISH),
      // 越界或缺失一律退回「句」——coreFor 对「句」给 sent，和补全前的行为一致
      unit: CUSTOM_UNITS.includes(e.unit) ? e.unit : "句",
    };
  });
}

/**
 * 给自定义练习的断句结果补上 pinyin / english / unit。
 *
 * ai 由调用方注入（正常传 callAI），本文件因此保持零依赖、可被 harness 直接调用。
 * 分批串行而不是并发：DeepSeek 有并发限流，而且自定义文本上限 500 字，
 * 一批 20 句最多也就几个请求，省下的时间不值得换限流风险。
 * 单批失败不影响其他批——那一批的题目保留「句」且没有拼音英文，界面照常能练。
 */
export async function enrichCustomBank(items, ai, { batchSize = ENRICH_BATCH_SIZE, onProgress } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { bank: [], enriched: 0, total: 0 };

  const bank = list.map(it => ({ ...it }));
  let enriched = 0;

  for (let start = 0; start < bank.length; start += batchSize) {
    const slice = bank.slice(start, start + batchSize);
    // i 是批内下标，回填时再加 start 换算成全局位置
    const payload = JSON.stringify(slice.map((it, k) => ({ i: k + 1, text: it.text })));

    const reply = await ai(ENRICH_SYSTEM, [{ role: "user", content: payload }], ENRICH_MAX_TOKENS, 2, true);
    const parsed = parseEnrichReply(reply, slice);
    if (parsed) {
      // parseEnrichReply 返回的已经是完整的题目对象（原文 + 补全字段）
      parsed.forEach((p, k) => {
        if (p.pinyin || p.english) enriched += 1;
        bank[start + k] = p;
      });
    } else {
      console.warn('[enrich] 这一批没能对齐，保留原样：', start, '~', start + slice.length);
      // 降级形状要和 parseEnrichReply 一致：拼音英文补成空串而不是缺失。
      // 缺键的话出参里 pinyin 是 undefined，渲染上同样是假值、看不出差别，
      // 但"补全后的每道题都有这两个键"才是个能依赖的契约。
      for (let k = 0; k < slice.length; k++) {
        bank[start + k] = { pinyin: "", english: "", ...bank[start + k], unit: bank[start + k].unit || "句" };
      }
    }
    onProgress?.(Math.min(start + batchSize, bank.length), bank.length);
  }

  return { bank, enriched, total: bank.length };
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
