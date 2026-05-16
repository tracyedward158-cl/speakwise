export const HSK_LEVELS = [
  { id: "1-3", label: "初等 HSK 1-3", sub: "Beginner", desc: "基础交流、拼音与简单句", color: "#2DAA6E", emoji: "🌱" },
  { id: "4-6", label: "中等 HSK 4-6", sub: "Intermediate", desc: "日常交际、表达观点与意图", color: "#E8A838", emoji: "🌿" },
  { id: "7-9", label: "高等 HSK 7-9", sub: "Advanced", desc: "复杂话题讨论、高级书面语体", color: "#7B6CF6", emoji: "🌳" },
];

export const HSK_PROMPT = {
  "1-3": "Student is HSK 1-3 beginner. Use basic vocab and short sentences.",
  "4-6": "Student is HSK 4-6 intermediate. Use common vocab and moderate complexity.",
  "7-9": "Student is HSK 7-9 advanced. Use rich vocab, idioms, and complex grammar.",
};

export const IDENTITY_FILTERS = [
  { id: "all", label: "全部" }, { id: "student", label: "留学生" },
  { id: "worker", label: "上班族" }, { id: "tourist", label: "游客" },
];

export const MODES = [
  { id: "HPE", label: "全显模式", desc: "汉字+拼音+英文" },
  { id: "HP", label: "辅导模式", desc: "汉字+拼音 (隐藏英文)" },
  { id: "HE", label: "沉浸模式", desc: "汉字+英文 (隐藏拼音)" },
  { id: "H", label: "纯汉模式", desc: "无拼音、无英文翻译" },
];
