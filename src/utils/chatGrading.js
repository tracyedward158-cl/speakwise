// ── 对话评分 ──
// 从 ChatView 内联的评分逻辑抽出，因为「离开会话时评分」与「补交残留草稿时评分」
// 两条路径需要完全相同的口径。
import { callAI } from "./api.js";
import { transcriptToPrompt } from "./transcript.js";

const GRADING_SYS =
  "你是一名中文教学助手。请评估这段中文对话中「学生」的表现（只看学生发言，AI 是陪练）。" +
  "回复严格用这三行格式，不要其他内容：\nSCORE: [0-100 整数]\n" +
  "PROBLEMS: [最多 3 个中文问题，用、分隔，没有问题填无]\nSUGGESTION: [一句简短中文建议]";

/**
 * 给一段对话评分。失败时抛出，由调用方决定降级策略
 * （落库但 score=0，而不是丢弃对话）。
 */
export async function gradeConversation(messages) {
  const convo = transcriptToPrompt(messages);
  const reply = await callAI(GRADING_SYS, [{ role: "user", content: convo }], 300);

  const m = reply.match(/SCORE:\s*(\d+)/i);
  const score = m ? Math.min(parseInt(m[1], 10), 100) : 70;
  const pm = reply.match(/PROBLEMS:\s*(.+)/i);
  const sm = reply.match(/SUGGESTION:\s*(.+)/i);

  return {
    score,
    problems:
      pm && pm[1].trim() !== "无"
        ? pm[1].split(/[、,]/).map(s => s.trim()).filter(Boolean).slice(0, 4)
        : [],
    suggestion: sm ? sm[1].trim().slice(0, 80) : "",
  };
}
