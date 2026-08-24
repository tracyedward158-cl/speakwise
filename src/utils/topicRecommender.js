// ── 对话话题推荐引擎 ──
// 个性化：按 HSK 等级过滤话题难度；排除用户历史练过场景的主题类别；
//         未练过的话题优先，不足时用已练类别补齐；随机取 count 个。
import { TOPICS, SCENARIO_CATEGORIES } from "../data/topics.js";

export function recommendTopics({ hsk, practicedScenarios = [], count = 3, excludeIds = [] }) {
  // 1. 场景标题 → 已练主题类别
  const practicedCats = new Set(
    (practicedScenarios || [])
      .map(s => SCENARIO_CATEGORIES[s])
      .filter(Boolean)
  );

  // 2. 按 HSK 过滤 + 排除已展示过的话题
  const pool = TOPICS.filter(t =>
    (!hsk || t.level === hsk) && !excludeIds.includes(t.id)
  );

  // 3. 未练过类别的优先，不足从剩余补齐
  const fresh = pool.filter(t => !practicedCats.has(t.category));
  const rest = pool.filter(t => practicedCats.has(t.category));
  const candidates = fresh.length >= count ? fresh : [...fresh, ...rest];

  // 4. Fisher-Yates 洗牌，取前 count 个
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
