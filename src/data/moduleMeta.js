// ── 模块视觉元数据 ──
// 合并原先散落在 StudentRecords.jsx 与 TeacherDashboard.jsx 的两份 MODULE_COLORS
// （内容完全相同），并补上回看页需要的 bg / icon。
// color 与该模块在场景列表/构建器里的主题色保持一致。

export const MODULE_META = {
  "生活情境": { color: "#4A90D9", bg: "#EEF4FB", icon: "🍜" },
  "发音测评": { color: "#7B6CF6", bg: "#F3F0FF", icon: "🎙️" },
  "自由对话": { color: "#2DAA6E", bg: "#EDFAF3", icon: "🗣️" },
  "文化文游": { color: "#9B59B6", bg: "#F5F0FA", icon: "🏮" },
  "造句练习": { color: "#E8A838", bg: "#FFF8ED", icon: "✍️" },
  "写作辅导": { color: "#7B6CF6", bg: "#F3F0FF", icon: "📝" },
};

const FALLBACK = { color: "#888", bg: "#F5F5F0", icon: "💬" };

export const moduleMeta = (name) => MODULE_META[name] || FALLBACK;

export const moduleColor = (name) => moduleMeta(name).color;
