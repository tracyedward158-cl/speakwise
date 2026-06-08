// ── Practice record storage — localStorage-based, no backend needed ──

const STORAGE_KEY = "speakwise_practice_records";
const STUDENT_KEY = "speakwise_student_id";
const NICKNAME_KEY = "speakwise_nickname";
const HSK_KEY = "speakwise_hsk";

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

// ── Records CRUD ──
export function getRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveRecord(record) {
  const records = getRecords();
  records.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function clearRecords() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Build a record object ──
export function buildRecord({ module, scenario, score, dimensions, problems, suggestion, hskLevel }) {
  return {
    id: Date.now(),
    studentId: getStudentId(),
    hskLevel: hskLevel || "未知",
    module,
    scenario: scenario || "",
    score: score ?? 0,
    dimensions: dimensions || null,
    problems: problems || [],
    suggestion: suggestion || "",
    createdAt: new Date().toISOString(),
  };
}

// ── Mock demo data (pre-loaded when localStorage is empty) ──
export const MOCK_RECORDS = [
  { id: 1001, studentId: "P01", hskLevel: "1-3", module: "生活情境", scenario: "餐厅点餐", score: 82, dimensions: null, problems: ["量词搭配不稳定", "请求表达不够委婉"], suggestion: "重点练习常见量词搭配，如'一杯水''一碗饭'等。", createdAt: "2026-05-15T10:20:00Z" },
  { id: 1002, studentId: "P02", hskLevel: "4-6", module: "生活情境", scenario: "问路", score: 88, dimensions: null, problems: ["方向表达偶尔混淆"], suggestion: "练习'往左拐''一直走'等方向表达。", createdAt: "2026-05-15T10:35:00Z" },
  { id: 1003, studentId: "P01", hskLevel: "1-3", module: "发音测评", scenario: "你好吗？", score: 47, dimensions: { pronunciation: 45, tone: 52, fluency: 48, integrity: 55 }, problems: ["环境噪音", "三声变调不稳定", "声母不够清晰"], suggestion: "建议在安静环境中发音，重点练习三声变调。", createdAt: "2026-05-15T11:00:00Z" },
  { id: 1004, studentId: "P03", hskLevel: "7-9", module: "发音测评", scenario: "不管遇到什么困难，都不应该轻易放弃。", score: 85, dimensions: { pronunciation: 88, tone: 82, fluency: 85, integrity: 90 }, problems: ["声调偶有偏差"], suggestion: "整体发音较好，注意长句中的声调连贯性。", createdAt: "2026-05-15T11:15:00Z" },
  { id: 1005, studentId: "P04", hskLevel: "4-6", module: "自由对话", scenario: "自由对话", score: 76, dimensions: null, problems: ["表达自然度不足", "连接词较少"], suggestion: "练习使用'虽然…但是…''因为…所以…'等连接词组织表达。", createdAt: "2026-05-15T14:00:00Z" },
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
  return Object.entries(map).map(([name, d]) => ({
    module: name,
    avgScore: Math.round(d.total / d.count),
    count: d.count,
    desc: describeModule(name, Math.round(d.total / d.count)),
  }));
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

export function getStudentStats(studentId) {
  const records = getStudentRecords(studentId);
  const scores = records.map(r => r.score).filter(s => s > 0);
  const total = records.length;
  if (total === 0) return { total, average: 0, best: 0, recentDays: 0, modules: [], firstDate: null };

  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const best = Math.max(...scores);
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

export function getWeakDimensions(studentId, threshold = 70, minOccurrences = 2) {
  const records = getStudentRecords(studentId).filter(r => r.dimensions);
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

export function getRecommendedExercises(studentId) {
  const weaks = getWeakDimensions(studentId, 70, 1).filter(w => w.isWeak);
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
