// ⚠️ 本文件由 mp/scripts/sync-core.mjs 从 Web 版 src/data/topics.js 复制生成，请勿直接修改。
//    要改就在 Web 版改，然后跑 `npm run sync:core`。
//    确有平台差异需要保留的，登记到 sync-core.mjs 的 PATCHES 里。
// ── 自由对话话题库 ──
// 按 HSK 分级 + 主题分类。category 用于推荐引擎排除用户练过的场景类别。
// level 对应 HSK_LEVELS 的 id（"1-3" | "4-6" | "7-9"）

export const TOPICS = [
  // ── HSK 1-3 基础 ──
  { id: "t103-01", level: "1-3", category: "饮食", emoji: "🍜", title: "聊聊你最喜欢吃的中国菜" },
  { id: "t103-02", level: "1-3", category: "学习", emoji: "📚", title: "说说你今天学了什么" },
  { id: "t103-03", level: "1-3", category: "社交", emoji: "☀️", title: "聊聊你的周末计划" },
  { id: "t103-04", level: "1-3", category: "居住", emoji: "🏠", title: "介绍一下你的宿舍" },
  { id: "t103-05", level: "1-3", category: "娱乐", emoji: "⚽", title: "聊聊你喜欢的运动" },
  { id: "t103-06", level: "1-3", category: "出行", emoji: "🚶", title: "介绍你的学校" },
  { id: "t103-07", level: "1-3", category: "消费", emoji: "🛍️", title: "你平时喜欢买什么" },
  { id: "t103-08", level: "1-3", category: "健康", emoji: "⏰", title: "说说你的一天是怎么过的" },
  { id: "t103-09", level: "1-3", category: "社交", emoji: "🐱", title: "你喜欢宠物吗" },
  { id: "t103-10", level: "1-3", category: "学习", emoji: "📝", title: "你觉得汉字难不难" },

  // ── HSK 4-6 中等 ──
  { id: "t406-01", level: "4-6", category: "饮食", emoji: "🍲", title: "聊聊你的家乡美食" },
  { id: "t406-02", level: "4-6", category: "居住", emoji: "🏠", title: "假如你要在中国租房" },
  { id: "t406-03", level: "4-6", category: "出行", emoji: "✈️", title: "聊聊你的旅行经历" },
  { id: "t406-04", level: "4-6", category: "社交", emoji: "👭", title: "聊聊你最好的朋友" },
  { id: "t406-05", level: "4-6", category: "工作", emoji: "💼", title: "聊聊你的理想工作" },
  { id: "t406-06", level: "4-6", category: "娱乐", emoji: "🎬", title: "聊聊你最近看过的一部电影" },
  { id: "t406-07", level: "4-6", category: "学习", emoji: "📖", title: "学中文最难的是什么" },
  { id: "t406-08", level: "4-6", category: "消费", emoji: "🛒", title: "网购和实体店你更喜欢哪个" },
  { id: "t406-09", level: "4-6", category: "健康", emoji: "🏃", title: "聊聊你的健身习惯" },
  { id: "t406-10", level: "4-6", category: "社交", emoji: "🎉", title: "你最近参加过什么聚会" },

  // ── HSK 7-9 高级 ──
  { id: "t709-01", level: "7-9", category: "文化", emoji: "🏮", title: "聊聊中国传统节日" },
  { id: "t709-02", level: "7-9", category: "工作", emoji: "⚖️", title: "工作和生活如何平衡" },
  { id: "t709-03", level: "7-9", category: "环境", emoji: "🌍", title: "聊聊环保和气候变化" },
  { id: "t709-04", level: "7-9", category: "社会", emoji: "🏙️", title: "大城市好还是小城市好" },
  { id: "t709-05", level: "7-9", category: "娱乐", emoji: "🎵", title: "聊聊你喜欢的音乐和歌手" },
  { id: "t709-06", level: "7-9", category: "学习", emoji: "📚", title: "语言学习有什么心得" },
  { id: "t709-07", level: "7-9", category: "文化", emoji: "🌏", title: "中外文化有哪些差异" },
  { id: "t709-08", level: "7-9", category: "社会", emoji: "🤖", title: "科技让生活更好还是更坏" },
  { id: "t709-09", level: "7-9", category: "消费", emoji: "📱", title: "聊聊移动支付对生活的影响" },
  { id: "t709-10", level: "7-9", category: "社交", emoji: "💬", title: "朋友之间应不应该AA制" },
];

// 练习场景标题 → 主题分类（推荐时排除已练过类别的场景）
export const SCENARIO_CATEGORIES = {
  "餐厅点餐": "饮食",
  "问路 / 打车": "出行",
  "看病 / 去药店": "健康",
  "购物 / 砍价": "消费",
  "校园社交": "社交",
  "租房沟通": "居住",
  "面试求职": "工作",
};
