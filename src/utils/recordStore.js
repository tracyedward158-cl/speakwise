// ── Practice record storage ──
// 登录用户：云端 TDSQL-C（经 /api/records），失败静默降级到本地
// 游客：localStorage（演示/离线兜底）
import { getToken, recordApi } from "./api.js";

const STORAGE_KEY = "speakwise_practice_records";
const STUDENT_KEY = "speakwise_student_id";
const OWNER_KEY = "speakwise_owner_id";
const NICKNAME_KEY = "speakwise_nickname";
const HSK_KEY = "speakwise_hsk";
const DRAFT_KEY = "speakwise_chat_drafts";   // 待提交对话队列（数组）

// ── Student identity (anonymous demo) ──
export function getStudentId() {
  let id = localStorage.getItem(STUDENT_KEY);
  if (!id) {
    // Pick a random demo student from P01-P05
    id = `P${String(Math.floor(Math.random() * 5) + 1).padStart(2, '0')}`;
    localStorage.setItem(STUDENT_KEY, id);
  }
  return id;
}

export function resetStudentId() {
  localStorage.removeItem(STUDENT_KEY);
}

// ── 记录归属（被试编号）──
// 登录用户 = 账号 id；游客 = 本地匿名编号（P01-P05）。
// 由 AuthContext 在登录/恢复会话/登出时驱动（与 speakwise_student_id 同一种模式）。
// 不这么做的话，登录用户的记录会带着一个随机演示编号，且云端口径（user.id）
// 与本地降级副本口径不一致。
export function getOwnerId() {
  const owned = localStorage.getItem(OWNER_KEY);
  return owned !== null ? owned : getStudentId();
}

export function setOwnerId(id) {
  if (id == null) localStorage.removeItem(OWNER_KEY);
  else localStorage.setItem(OWNER_KEY, String(id));
}

// ── Records CRUD ──
export function getRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveRecord(record) {
  if (getToken()) {
    // 登录用户：优先存云端；失败静默降级到本地，保证练习数据不丢
    return recordApi.save(record).catch(err => {
      console.warn("[recordStore] 云端保存失败，已降级到本地:", err.message);
      saveRecordLocal(record);
    });
  }
  saveRecordLocal(record);
  return Promise.resolve();
}

function saveRecordLocal(record) {
  const records = getRecords();
  // 同一会话重复提交（离开时提交 + 残留草稿补交的竞态）按 id 去重。
  // 云端那条路径由 (user_id, legacy_id) 唯一键兜住，本地没有，只能在这里挡。
  if (records.some(r => r.id === record.id)) return;
  records.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ── 登录时把本地遗留记录批量迁移到云端（服务端按 (user_id, legacy_id) 唯一键 INSERT IGNORE）──
// 刻意不用「只迁移一次」的开关：saveRecord 云端失败时会降级写本地，那种记录
// 如果只给一次迁移机会，就会永远留在 localStorage，登录用户在自己的云端列表里看不到。
// 重复上传是安全的（唯一键去重），没有待迁移记录时直接返回、不发请求。
export async function migrateLocalRecords() {
  if (!getToken()) return;
  const local = getRecords();
  if (!local.length) return;
  const { inserted } = await recordApi.migrate(local);
  console.log(`[recordStore] 迁移完成，云端新增 ${inserted} 条记录`);
  clearRecords();
}

export function clearRecords() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── 待提交对话队列 ──
// 每轮对话后同步写入，只有确认存成功了才移除。
//
// 为什么是队列而不是单槽 + 离开时清理：提交要先调 AI 评分，最长 60 秒。
// 若在提交开始前就把草稿清掉，用户在这段时间关掉标签页，整段对话就永久没了
// ——那个负责回写的失败分支根本来不及执行。
// 「只有落库成功才移除」这个不变量才是防丢失的关键。
//
// 队列里的条目是自描述的（自带 module/scenario/hskLevel/ownerKey/draftId），
// 补交时按它自己的口径提交，不会串到当前页面的场景上。
const MAX_DRAFTS = 8;

export function readDrafts() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeDrafts(list) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(list.slice(-MAX_DRAFTS)));
  } catch (e) {
    // 配额超限不该打断对话
    console.warn("[recordStore] 草稿写入失败:", e.message);
  }
}

/** 按 draftId 覆盖写入。同一会话每轮都调，队列里只保留它最新的一份。 */
export function putDraft(draft) {
  const list = readDrafts().filter(d => d.draftId !== draft.draftId);
  list.push(draft);
  writeDrafts(list);
}

/** 从队列移除。**只能在确认记录已写入之后调用。** */
export function dropDraft(draftId) {
  writeDrafts(readDrafts().filter(d => d.draftId !== draftId));
}

export function clearDrafts() {
  localStorage.removeItem(DRAFT_KEY);
}

// ── Build a record object ──
// messages: 仅对话类模块（场景对话/自由对话/写作辅导）有，其余为 null
// id:       可由调用方指定。对话类传草稿的 draftId，使「离开时提交」与
//           「下次进入补交」共享同一个 legacy_id，服务端唯一键去重
export function buildRecord({ module, scenario, score, dimensions, problems, suggestion, hskLevel, messages, id }) {
  return {
    id: id ?? Date.now(),
    studentId: getOwnerId(),
    hskLevel: hskLevel || "未知",
    module,
    scenario: scenario || "",
    score: score ?? 0,
    dimensions: dimensions || null,
    problems: problems || [],
    suggestion: suggestion || "",
    messages: messages || null,
    createdAt: new Date().toISOString(),
  };
}

// ── Mock demo data (pre-loaded when localStorage is empty) ──
export const MOCK_RECORDS = [
  {
    id: 1001, studentId: "P01", hskLevel: "1-3", module: "生活情境", scenario: "餐厅点餐", score: 82, dimensions: null, problems: ["量词搭配不稳定", "请求表达不够委婉"], suggestion: "重点练习常见量词搭配，如'一杯水''一碗饭'等。", createdAt: "2026-05-15T10:20:00Z",
    // 演示用的示例对话：内联在本地，点开不请求云端（这两个 id 不在库里）
    messages: [
      { sender: "ai", content: "汉字: 你好！你想吃什么？\n拼音: Nǐ hǎo! Nǐ xiǎng chī shénme?\n英文: Hello! What do you want to eat?", at: "2026-05-15T10:20:02Z" },
      { sender: "student", content: "我要一个米饭和一杯水。", at: "2026-05-15T10:20:15Z", channel: "voice" },
      { sender: "ai", content: "汉字: 好的，一份米饭，一杯水。还要别的吗？\n拼音: Hǎo de, yí fèn mǐfàn, yì bēi shuǐ. Hái yào bié de ma?\n英文: Okay, one rice and one water. Anything else?", at: "2026-05-15T10:20:24Z" },
      { sender: "student", content: "再要一个鱼。", at: "2026-05-15T10:20:40Z", channel: "voice" },
      { sender: "ai", content: "汉字: 好的，一条鱼。请稍等。\n拼音: Hǎo de, yì tiáo yú. Qǐng shāo děng.\n英文: Okay, one fish. Please wait a moment.", at: "2026-05-15T10:20:49Z" },
      { sender: "student", content: "谢谢，多少钱？", at: "2026-05-15T10:21:05Z" },
    ],
  },
  { id: 1002, studentId: "P02", hskLevel: "4-6", module: "生活情境", scenario: "问路", score: 88, dimensions: null, problems: ["方向表达偶尔混淆"], suggestion: "练习'往左拐''一直走'等方向表达。", createdAt: "2026-05-15T10:35:00Z" },
  { id: 1003, studentId: "P01", hskLevel: "1-3", module: "发音测评", scenario: "你好吗？", score: 47, dimensions: { pronunciation: 45, tone: 52, fluency: 48, integrity: 55 }, problems: ["环境噪音", "三声变调不稳定", "声母不够清晰"], suggestion: "建议在安静环境中发音，重点练习三声变调。", createdAt: "2026-05-15T11:00:00Z" },
  { id: 1004, studentId: "P03", hskLevel: "7-9", module: "发音测评", scenario: "不管遇到什么困难，都不应该轻易放弃。", score: 85, dimensions: { pronunciation: 88, tone: 82, fluency: 85, integrity: 90 }, problems: ["声调偶有偏差"], suggestion: "整体发音较好，注意长句中的声调连贯性。", createdAt: "2026-05-15T11:15:00Z" },
  {
    id: 1005, studentId: "P04", hskLevel: "4-6", module: "自由对话", scenario: "自由对话", score: 76, dimensions: null, problems: ["表达自然度不足", "连接词较少"], suggestion: "练习使用'虽然…但是…''因为…所以…'等连接词组织表达。", createdAt: "2026-05-15T14:00:00Z",
    messages: [
      { sender: "ai", content: "汉字: 嘿！你好呀！你今天过得怎么样？\n拼音: Hēi! Nǐ hǎo ya! Nǐ jīntiān guò de zěnmeyàng?\n英文: Hey! Hello! How's your day today?", at: "2026-05-15T14:00:02Z" },
      { sender: "student", content: "今天很忙，我有很多作业。", at: "2026-05-15T14:00:20Z", channel: "voice" },
      { sender: "ai", content: "汉字: 辛苦了！作业多的话，你会怎么安排时间呢？\n拼音: Xīnkǔ le! Zuòyè duō de huà, nǐ huì zěnme ānpái shíjiān ne?\n英文: That sounds tough! When you have a lot of homework, how do you manage your time?", at: "2026-05-15T14:00:31Z" },
      { sender: "student", content: "我先写容易的，然后写难的。但是有时候很晚。", at: "2026-05-15T14:00:52Z", channel: "voice" },
      { sender: "ai", content: "汉字: 这个办法不错。写得太晚要注意休息哦。\n拼音: Zhège bànfǎ búcuò. Xiě de tài wǎn yào zhùyì xiūxi o.\n英文: That's a good approach. Just remember to rest if you're up too late.", at: "2026-05-15T14:01:03Z" },
      { sender: "student", content: "对，我通常十一点睡觉。", at: "2026-05-15T14:01:18Z" },
    ],
  },
  { id: 1006, studentId: "P02", hskLevel: "4-6", module: "文化文游", scenario: "一鸣惊人", score: 92, dimensions: null, problems: [], suggestion: "文化理解较好，可进一步引导复述故事。", createdAt: "2026-05-16T09:00:00Z" },
  { id: 1007, studentId: "P05", hskLevel: "1-3", module: "造句练习", scenario: "喜欢", score: 65, dimensions: null, problems: ["语序偶尔错误", "词汇量有限"], suggestion: "练习基础 SVO 语序，扩展常用动词词汇。", createdAt: "2026-05-16T09:30:00Z" },
  { id: 1008, studentId: "P03", hskLevel: "7-9", module: "生活情境", scenario: "面试求职", score: 90, dimensions: null, problems: [], suggestion: "表达流畅自信，可进一步提升专业词汇使用。", createdAt: "2026-05-16T10:00:00Z" },
  { id: 1009, studentId: "P01", hskLevel: "1-3", module: "发音测评", scenario: "我想喝水。", score: 58, dimensions: { pronunciation: 55, tone: 60, fluency: 62, integrity: 70 }, problems: ["声母 zh/ch/sh 混淆", "轻声不准确"], suggestion: "重点练习翘舌音，注意'了'等轻声字的发音。", createdAt: "2026-05-16T10:20:00Z" },
  { id: 1010, studentId: "P04", hskLevel: "4-6", module: "文化文游", scenario: "完璧归赵", score: 85, dimensions: null, problems: ["复述逻辑略弱"], suggestion: "引导学生使用'因为…所以…'和'如果…就…'组织表达。", createdAt: "2026-05-16T11:00:00Z" },
  { id: 1011, studentId: "P05", hskLevel: "1-3", module: "生活情境", scenario: "购物砍价", score: 78, dimensions: null, problems: ["数量词表达不熟练"], suggestion: "练习'多少钱''便宜一点'等购物常用表达。", createdAt: "2026-05-16T14:00:00Z" },
  { id: 1012, studentId: "P02", hskLevel: "4-6", module: "发音测评", scenario: "我的手机快没电了，借我个充电宝吧。", score: 72, dimensions: { pronunciation: 75, tone: 68, fluency: 73, integrity: 80 }, problems: ["语调平淡", "句末声调下降过多"], suggestion: "练习自然语调，注意句末不要过度降调。", createdAt: "2026-05-16T14:30:00Z" },
  { id: 1013, studentId: "P01", hskLevel: "1-3", module: "自由对话", scenario: "自由对话", score: 70, dimensions: null, problems: ["回应较短", "缺少扩展说明"], suggestion: "鼓励用'我觉得……因为……'扩展回答。", createdAt: "2026-05-17T08:30:00Z" },
  { id: 1014, studentId: "P03", hskLevel: "7-9", module: "文化文游", scenario: "卧薪尝胆", score: 88, dimensions: null, problems: [], suggestion: "理解能力较强，可深入讨论越王复国的历史意义。", createdAt: "2026-05-17T09:00:00Z" },
  { id: 1015, studentId: "P04", hskLevel: "4-6", module: "造句练习", scenario: "因为…所以…", score: 74, dimensions: null, problems: ["因果关系表达不够自然"], suggestion: "多练习'因为……所以……'和'既然……就……'的区别。", createdAt: "2026-05-17T10:00:00Z" },
  { id: 1016, studentId: "P05", hskLevel: "1-3", module: "生活情境", scenario: "看病", score: 80, dimensions: null, problems: ["症状描述不够具体"], suggestion: "练习'头疼''肚子不舒服'等常见症状表达。", createdAt: "2026-05-17T10:30:00Z" },
  { id: 1017, studentId: "P02", hskLevel: "4-6", module: "自由对话", scenario: "自由对话", score: 83, dimensions: null, problems: [], suggestion: "对话自然流畅，可尝试更复杂的观点表达。", createdAt: "2026-05-17T14:00:00Z" },
  { id: 1018, studentId: "P01", hskLevel: "1-3", module: "发音测评", scenario: "我喜欢中国。", score: 63, dimensions: { pronunciation: 68, tone: 55, fluency: 65, integrity: 78 }, problems: ["二声和三声混淆", "翘舌音不准确"], suggestion: "重点区分二声(í)和三声(ǐ)，多听多模仿。", createdAt: "2026-05-18T09:00:00Z" },
];

// ── Get all records (real + mock), deduplicated ──
export function getAllRecords() {
  const real = getRecords();
  const seen = new Set(real.map(r => r.id));
  const merged = [...real, ...MOCK_RECORDS.filter(r => !seen.has(r.id))];
  return merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Aggregate helpers for teacher dashboard ──
export function getClassOverview(records) {
  const studentIds = new Set(records.map(r => r.studentId));
  const scores = records.map(r => r.score).filter(s => s > 0);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const modules = new Set(records.map(r => r.module));

  return {
    studentCount: studentIds.size,
    totalExercises: records.length,
    averageScore: avg,
    completedModules: [...modules],
  };
}

export function getModulePerformance(records) {
  const map = {};
  for (const r of records) {
    if (!map[r.module]) map[r.module] = { total: 0, count: 0 };
    if (r.score > 0) { map[r.module].total += r.score; map[r.module].count++; }
  }
  return Object.entries(map)
    // count 为 0 的模块（只有待评分的对话记录）没有任何成绩数据。
    // 不滤掉的话 avgScore 会是 NaN，渲染成「NaN 分」和宽度 NaN% 的空条；
    // 补成 0 又是另一种谎——没数据就不该出现在成绩列表里。
    .filter(([, d]) => d.count > 0)
    .map(([name, d]) => {
      const avgScore = Math.round(d.total / d.count);
      return { module: name, avgScore, count: d.count, desc: describeModule(name, avgScore) };
    });
}

function describeModule(name, score) {
  if (score >= 85) return name === "文化文游" ? "参与度较高" : "掌握较好";
  if (score >= 75) return name === "发音测评" ? "仍需训练" : "基本掌握";
  return "需要重点关注";
}

export function getCommonProblems(records) {
  const freq = {};
  for (const r of records) {
    for (const p of r.problems || []) {
      freq[p] = (freq[p] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
}

const SUGGESTION_TEMPLATES = [
  "建议重点讲解点餐场景中的量词搭配，如'一份、一杯、一碗'。",
  "补充请求表达训练，如'请问……可以吗？''能不能……？'",
  "针对三声变调和轻声安排短时跟读训练（5-10分钟）。",
  "文化文游任务后，引导学生使用'因为……所以……''如果……就……'复述故事。",
  "课堂活动建议：先进行 5 分钟同伴角色扮演，再进入 SpeakWise 完成个性化复练。",
  "建议每周安排 1-2 次发音专项训练，重点纠正高频声母韵母问题。",
];

export function getTeachingSuggestions(problems) {
  const suggestions = [...SUGGESTION_TEMPLATES];
  if (problems.some(p => p.name.includes("量词") || p.name.includes("数量"))) {
    if (!suggestions[0].includes("量词")) suggestions.unshift(SUGGESTION_TEMPLATES[0]);
  }
  return suggestions;
}

// ═══════════════════════════════════════
// 方案一：学生个人练习记录
// ═══════════════════════════════════════

export function getStudentRecords(studentId) {
  return getAllRecords().filter(r => r.studentId === studentId);
}

export function getStudentStats(records) {
  const scores = records.map(r => r.score).filter(s => s > 0);
  const total = records.length;
  if (total === 0) return { total, average: 0, best: 0, recentDays: 0, modules: [], firstDate: null };

  // scores 可能为空：对话类记录在评分失败时会以 score=0 落库（对话要保住，分数次要）。
  // 不判空的话 avg 是 NaN、best 是 -Infinity，会直接渲染到统计卡上。
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const best = scores.length ? Math.max(...scores) : 0;
  const modules = [...new Set(records.map(r => r.module))];
  const firstDate = records.reduce((e, r) => r.createdAt < e ? r.createdAt : e, records[0].createdAt);
  const daysSinceFirst = Math.max(1, Math.ceil((Date.now() - new Date(firstDate).getTime()) / 86400000));
  const recentCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentDays = new Set(
    records.filter(r => r.createdAt >= recentCutoff).map(r => r.createdAt.slice(0, 10))
  ).size;

  return { total, average: avg, best, recentDays, modules, daysSinceFirst };
}

// ═══════════════════════════════════════
// 方案二：弱项维度持续追踪
// ═══════════════════════════════════════

const DIM_LABELS = { pronunciation: "发音", tone: "声调", fluency: "流利度", completeness: "完整度" };

export function getWeakDimensions(records, threshold = 70, minOccurrences = 2) {
  records = records.filter(r => r.dimensions);
  const dimHistory = {};

  for (const r of records) {
    for (const [dim, label] of Object.entries(DIM_LABELS)) {
      const val = r.dimensions[dim];
      if (val == null) continue;
      if (!dimHistory[dim]) dimHistory[dim] = { label, scores: [], dates: [] };
      dimHistory[dim].scores.push(val);
      dimHistory[dim].dates.push(r.createdAt);
    }
  }

  return Object.entries(dimHistory)
    .filter(([, d]) => d.scores.length >= minOccurrences)
    .map(([dim, d]) => {
      const avg = Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length);
      const latest = d.scores[d.scores.length - 1];
      const worst = Math.min(...d.scores);
      // trend: compare first half vs second half
      const mid = Math.floor(d.scores.length / 2);
      const firstHalfAvg = d.scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondHalfAvg = d.scores.slice(mid).reduce((a, b) => a + b, 0) / (d.scores.length - mid);
      const trend = secondHalfAvg - firstHalfAvg > 3 ? "↑ 上升" : firstHalfAvg - secondHalfAvg > 3 ? "↓ 下降" : "→ 持平";
      const isWeak = avg < threshold;
      return { dim, label: d.label, avg, latest, worst, trend, occurrences: d.scores.length, isWeak };
    })
    .sort((a, b) => a.avg - b.avg);
}

// ═══════════════════════════════════════════
// 能力雷达图：五大维度聚合（每次练习后自动更新）
// ═══════════════════════════════════════════

export const RADAR_DIMENSIONS = [
  { key: "pronunciation", label: "发音" },
  { key: "grammar", label: "语法" },
  { key: "vocabulary", label: "词汇量" },
  { key: "fluency", label: "流利度" },
  { key: "logic", label: "写作逻辑" },
];

// 模块总分 → 雷达维度（发音测评的 dimensions 拆到发音/流利度，见下）
const MODULE_RADAR_MAP = {
  "造句练习": "grammar",
  "生活情境": "vocabulary",
  "自由对话": "fluency",
  "写作辅导": "logic",
};

// 单条记录拆成对各维度的贡献（一条记录可贡献多个维度）
function recordToRadarScores(r) {
  const out = [];
  const d = r.dimensions;
  if (d) {
    if (d.pronunciation != null || d.tone != null) {
      const p = d.pronunciation ?? d.tone;
      const t = d.tone ?? d.pronunciation;
      out.push({ dim: "pronunciation", value: Math.round(p * 0.6 + t * 0.4) });
    }
    if (d.fluency != null) out.push({ dim: "fluency", value: d.fluency });
  }
  if (r.score > 0) {
    const dim = MODULE_RADAR_MAP[r.module];
    if (dim) out.push({ dim, value: r.score });
  }
  return out;
}

// 返回 RADAR_DIMENSIONS 顺序的 [{key,label,value,count}]；value=null 表示该维度暂无数据
export function getRadarDimensions(records) {
  const acc = {};
  for (const r of records) {
    for (const { dim, value } of recordToRadarScores(r)) {
      if (!acc[dim]) acc[dim] = { total: 0, count: 0 };
      acc[dim].total += value;
      acc[dim].count++;
    }
  }
  return RADAR_DIMENSIONS.map(d => {
    const a = acc[d.key];
    return { ...d, value: a ? Math.round(a.total / a.count) : null, count: a ? a.count : 0 };
  });
}

// ═══════════════════════════════════════
// 方案四：学生身份可视化
// ═══════════════════════════════════════

export function getStudentProfile() {
  return {
    id: getStudentId(),
    nickname: localStorage.getItem(NICKNAME_KEY) || "",
    hsk: localStorage.getItem(HSK_KEY) || "未知",
  };
}

export function setStudentNickname(name) {
  localStorage.setItem(NICKNAME_KEY, name.trim().slice(0, 12));
}

export function setStudentHsk(level) {
  localStorage.setItem(HSK_KEY, level);
}

// ═══════════════════════════════════════
// 方案三：基于弱项的练习推荐
// ═══════════════════════════════════════

const RECOMMENDATION_RULES = [
  {
    dim: "tone",
    label: "声调练习",
    suggest: "你的声调得分偏低，建议多跟读包含第三声和轻声的句子。",
    action: { type: "drill", module: "pronunciation", keyword: "pronunciation" },
  },
  {
    dim: "fluency",
    label: "流利度训练",
    suggest: "流利度需要加强，建议选择较长句子进行跟读练习，减少停顿。",
    action: { type: "drill", module: "pronunciation", keyword: "pronunciation" },
  },
  {
    dim: "pronunciation",
    label: "发音精准度",
    suggest: "发音不够清晰，建议重点练习声母 zh/ch/sh 和韵母 ang/eng/ing。",
    action: { type: "drill", module: "pronunciation", keyword: "pronunciation" },
  },
  {
    dim: "completeness",
    label: "完整度训练",
    suggest: "完整度不足，可能存在漏读，建议先听标准发音再跟读，注意每个字都要读全。",
    action: { type: "drill", module: "pronunciation", keyword: "pronunciation" },
  },
];

export function getRecommendedExercises(records) {
  const weaks = getWeakDimensions(records, 70, 1).filter(w => w.isWeak);
  if (weaks.length === 0) {
    return [{
      label: "自由巩固",
      suggest: "你的各项指标表现良好！建议自由选择文化文游或场景对话巩固综合能力。",
      action: { type: "navigate", target: "/culture" },
    }];
  }
  return weaks.slice(0, 3).map(w => {
    const rule = RECOMMENDATION_RULES.find(r => r.dim === w.dim) || RECOMMENDATION_RULES[0];
    return { ...rule, weakDetail: `${w.label}: 平均 ${w.avg} 分 (${w.trend})` };
  });
}
