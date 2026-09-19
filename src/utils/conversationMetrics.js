// ── 对话过程指标（认知深度的过程化操作）──
// 从 records.messages 上算出四个过程量，供导出与回看视图使用：
//   ① 轮次  turns            学生发言条数（一问一答算一轮）
//   ② 字数  avgChars         学生每条发言的字数
//   ③ 间隔  avgGapSec        AI 回复出现 → 学生发送下一条的秒数
//   ④ 通道  voiceRatio       语音输入 vs 文字输入
//
// 为什么是「读时计算」而不是「写时落库」：
//   messages 里的 at/channel 是原始事实，指标是随研究口径变化的派生量。
//   落库意味着每改一次口径都要迁移历史数据，而读时计算对已经存下的记录同样
//   适用 —— 包括上线这个功能之前的全部数据。
//
// ⚠️ 口径依赖 src/utils/transcript.js 的三个隐含不变量（它与后端
//    server/records.cjs 的 sanitizeMessages 是同规则的两份刻意重复的实现）：
//      · kind 为 greeting/error 的消息在序列化时被剔除
//      · 截断留痕恒为 { at: null, kind: 'truncated' } 且插在数组头部
//      · 截断丢的是头部（较旧的），保留尾部
//    任何一条被改动，本模块不会报错，只会静默偏移。
import { messageCount } from "./transcript.js";

// 口径自带版本号。真正的风险不是导出文件的结构变化，而是半年后有人改了阈值，
// 新旧文件都写着 EXPORT_VERSION 1 却不可比 —— 所以指标块自己声明口径版本 + 阈值。
export const METRICS_VERSION = 1;

const SESSION_START_MIN_MS = 1e12;         // Date.now() 量级下限（约 2001-09），排除 1001 这类演示 id
const MAX_FIRST_GAP_SEC = 2 * 60 * 60;     // 首轮间隔上限：超过就认为 legacyId 不是这次会话的起点
export const LONG_GAP_SEC = 300;           // 「长间隔」计数阈值（只用于计数，不做裁切）

export const metricsParams = () => ({
  sessionStartMinMs: SESSION_START_MIN_MS,
  maxFirstGapSec: MAX_FIRST_GAP_SEC,
  longGapSec: LONG_GAP_SEC,
});

const round1 = (n) => Math.round(n * 10) / 10;
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const atMs = (at) => {
  if (!at) return null;
  const t = new Date(at).getTime();
  return isNaN(t) ? null : t;
};
const median = (sorted) => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * 会话起始时刻（= 开场白出现的时刻）。
 *
 * 开场白（kind: 'greeting'）不入库，所以真实记录里 messages[0] 通常是第一条
 * 学生发言，首轮间隔没有起点可减 —— 而首轮恰恰是学生读开场白、思考最久的一轮，
 * 丢掉它会让平均间隔系统性偏小，短对话尤其严重。
 *
 * 但起点是可恢复的：ChatView 在生成开场白的同一个 effect 里执行
 * draftIdRef.current = Date.now()，两者相差毫秒级；而 draftId 作为记录的 id
 * 存成 DB 的 legacy_id，服务端投影成 legacyId 返回。游客的本地记录 id 就是
 * draftId；云端记录的 id 是自增主键，必须用 legacyId。
 *
 * 这是一个未被断言的巧合（语义靠 ChatView 传 id: snap.draftId 维持），所以守卫
 * 写厚一点：量级不对、晚于对话、或间隔离谱，一律当作「没有起点」，而不是拿一个
 * 可疑的值去算。挡不住的是「早于真实开场白但数量级正确」那类错误。
 */
function sessionStartMs(record, firstStudentMs) {
  const t = Number(record?.legacyId ?? record?.id);
  if (!Number.isFinite(t) || t < SESSION_START_MIN_MS) return null;
  if (firstStudentMs == null || t > firstStudentMs) return null;
  if ((firstStudentMs - t) / 1000 > MAX_FIRST_GAP_SEC) return null;
  return t;
}

/**
 * 单条记录的过程指标。
 *
 * available:false 时只带 reason，三种原因必须分开：
 *   no-transcript     这条记录本来就没有对话（发音测评/造句练习/文化文游）
 *   not-hydrated      有对话但还没拉下来（列表接口刻意不返回 messages）
 *   no-student-turns  有对话但没有学生发言（只有开场白）
 * 混成一种会让覆盖率看起来很差，从而诱导人忽略覆盖率这个信号本身。
 */
export function computeRecordMetrics(record) {
  if (!record) return { available: false, reason: "no-transcript" };

  const msgs = Array.isArray(record.messages) ? record.messages : null;
  if (!msgs) {
    return { available: false, reason: messageCount(record) > 0 ? "not-hydrated" : "no-transcript" };
  }

  // 剔除截断留痕（at 恒为 null，不是真实发言）与任何带 kind 的内存态消息
  // （greeting/error）。这个条件与 toTranscript 的 `!m.kind || m.kind === 'truncated'`
  // 是互补的另一半，改截断规则时两处要一起看。
  const truncated = msgs.some(m => m.kind === "truncated");
  const real = msgs.filter(m => !m.kind);

  const students = real.filter(m => m.sender === "student");
  if (!students.length) return { available: false, reason: "no-student-turns", truncated };

  // ── ③ 回复间隔 ──
  // 逐条向前找「最近一条 at 有效的 AI 回复」，而不是取 messages[i-1]：
  // 网络失败的兜底文案（kind:'error'）会被剔除，跳过后可能出现连续两条学生发言。
  const gapsSec = [];
  let lastAiMs = null;
  let firstGapSec = null;
  let rewind = 0;
  let sessionStartUsed = false;
  let studentIdx = 0;
  const startedAt = sessionStartMs(record, atMs(students[0].at));

  for (const m of real) {
    const t = atMs(m.at);
    if (m.sender === "ai") {
      if (t != null) lastAiMs = t;
      continue;
    }
    const isFirst = studentIdx === 0;
    studentIdx++;
    if (t == null) continue;                     // 学生消息没有时间戳，无从计算

    let from = lastAiMs;
    if (from == null && !sessionStartUsed && startedAt != null) {
      from = startedAt;                          // 首轮：起点是会话开始（开场白出现的时刻）
      sessionStartUsed = true;
    }
    if (from == null) continue;

    const gap = (t - from) / 1000;
    // 时钟回拨产生的负间隔是测量错误，不是「学生回得很快」—— 丢弃并计数，
    // 不取绝对值（那会把一个错误变成一个看起来很合理的正数）。
    if (gap < 0) { rewind++; continue; }

    gapsSec.push(gap);
    if (isFirst) firstGapSec = gap;
  }

  // ── ④ 语音 / 文字 ──
  // channel 缺失记成「未知」而不是 text：语音输入是后加的功能，缺失与老记录
  // 高度相关，当 text 会系统性压低语音使用率，当 voice 会反过来高估。
  // 三个计数全交出去，两种口径都能事后复算。
  let voiceTurns = 0, textTurns = 0, unknownChannelTurns = 0;
  let charsTotal = 0;
  for (const m of students) {
    charsTotal += String(m.content || "").trim().length;
    if (m.channel === "voice") voiceTurns++;
    else if (m.channel === "text") textTurns++;
    else unknownChannelTurns++;
  }

  const sortedGaps = [...gapsSec].sort((a, b) => a - b);
  const knownChannels = voiceTurns + textTurns;

  return {
    available: true,

    // ① 轮次
    turns: students.length,
    aiTurns: real.length - students.length,
    messageTotal: real.length,

    // ② 字数
    charsTotal,
    avgChars: round1(charsTotal / students.length),

    // ③ 间隔。gapsSec 存原始浮点秒、刻意不取整：先四舍五入再平均与「总间隔/总间隔数」
    //    的池化口径不等，500 条 × 60 个间隔能累积到 0.1 秒量级，而本指标的可报告精度
    //    就是 0.1 秒。展示字段才 round1。研究者可在导出文件上自行施加裁切规则。
    gapsSec,
    gapCount: gapsSec.length,
    avgGapSec: gapsSec.length ? round1(sum(gapsSec) / gapsSec.length) : null,
    medianGapSec: gapsSec.length ? round1(median(sortedGaps)) : null,
    maxGapSec: gapsSec.length ? round1(sortedGaps[sortedGaps.length - 1]) : null,
    longGapCount: gapsSec.filter(g => g > LONG_GAP_SEC).length,
    // 首轮间隔的起点是会话开始，含义比后续轮次宽（含「读开场白 + 进入状态 + 可能走开」），
    // 不是一个测量，所以单独交出，不与 avgGapSec 混为一谈。
    firstGapSec: firstGapSec == null ? null : round1(firstGapSec),
    sessionStartUsed,
    gapRewindCount: rewind,

    // ④ 通道。voiceRatio 分母不含未知，全未知时是 null 而不是 0 ——
    //    「一个通道都没测到」和「语音使用率是 0」是两回事。
    voiceTurns,
    textTurns,
    unknownChannelTurns,
    voiceRatio: knownChannels > 0 ? voiceTurns / knownChannels : null,

    // ⚠️ 只表示「检测到截断留痕」。服务端截断（records.cjs 只 shift 不 unshift）
    //    不留痕，所以 false 不等于「没被截断」，别把它当布尔用。
    truncated,
  };
}

/**
 * 跨记录的汇总。
 *
 * ⚠️ 缺失记录绝不能当成 0 轮 0 字平均进去 —— 那不会报错、不会产生空值、
 *    界面完全正常，只是数字整体偏小，是最难在事后发现的一类 bug。
 *    所以过滤在这里做（唯一的入口），coverage 作为一等公民一起返回，
 *    调用方没有机会「忘记」把它显示出来。
 *
 * 池化口径：字数与间隔按总量相除，不是对每条记录的均值再平均。
 * 「每次对话的平均轮次」是唯一的例外 —— 它的分母就是对话数，mean-of-means 才对。
 */
export function summarizeMetrics(metricsList) {
  const all = metricsList || [];
  const items = all.filter(m => m?.available);

  const coverage = {
    conversations: all.length,
    withMessages: items.length,
    noTranscript: all.filter(m => m?.reason === "no-transcript").length,
    notHydrated: all.filter(m => m?.reason === "not-hydrated").length,
    noStudentTurns: all.filter(m => m?.reason === "no-student-turns").length,
  };

  if (!items.length) {
    return {
      conversationCount: 0,
      turnsTotal: 0, avgTurnsPerConversation: null,
      charsTotal: 0, avgCharsPerTurn: null,
      gapCount: 0, avgGapSec: null, medianGapSec: null, maxGapSec: null, longGapCount: 0,
      voiceTurns: 0, textTurns: 0, unknownChannelTurns: 0, voiceRatio: null,
      truncatedConversations: 0, firstGapAvailable: 0,
      coverage,
    };
  }

  const turnsTotal = sum(items.map(m => m.turns));
  const charsTotal = sum(items.map(m => m.charsTotal));
  const gaps = items.flatMap(m => m.gapsSec);
  const sorted = [...gaps].sort((a, b) => a - b);
  const voiceTurns = sum(items.map(m => m.voiceTurns));
  const textTurns = sum(items.map(m => m.textTurns));
  const unknownChannelTurns = sum(items.map(m => m.unknownChannelTurns));
  const knownChannels = voiceTurns + textTurns;

  return {
    conversationCount: items.length,
    turnsTotal,
    avgTurnsPerConversation: round1(turnsTotal / items.length),
    charsTotal,
    avgCharsPerTurn: turnsTotal ? round1(charsTotal / turnsTotal) : null,
    gapCount: gaps.length,
    avgGapSec: gaps.length ? round1(sum(gaps) / gaps.length) : null,
    medianGapSec: gaps.length ? round1(median(sorted)) : null,
    maxGapSec: gaps.length ? round1(sorted[sorted.length - 1]) : null,
    longGapCount: gaps.filter(g => g > LONG_GAP_SEC).length,
    voiceTurns,
    textTurns,
    unknownChannelTurns,
    voiceRatio: knownChannels > 0 ? voiceTurns / knownChannels : null,
    truncatedConversations: items.filter(m => m.truncated).length,
    // 首轮间隔可用的对话数。少于 conversationCount 是常态（演示数据没有时间戳起点、
    // 对话被截断），报告里要能解释这个差额。
    firstGapAvailable: items.filter(m => m.firstGapSec != null).length,
    coverage,
  };
}
