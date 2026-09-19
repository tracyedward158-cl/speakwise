// ── 对话记录形状转换 ──
// 内存 state 与存储/传输共用同一种消息形状：
//   { sender: "student"|"ai", content, at, channel?, kind? }
//
//   sender  发送方。用需求原词（student/AI），不用 role:user/assistant
//   content 消息原文，保留「汉字/拼音/英文」三行，不做裁剪
//   at      ISO 8601 UTC 字符串（toISOString），与 buildRecord 的 createdAt 同源
//   channel 仅 student 消息："text" | "voice"
//   kind    仅内存与渲染用，序列化时剔除：
//             greeting  开场白（前端硬编码常量，不是 AI 生成的一轮，不入库）
//             error     网络失败时的兜底文案（伪造的 AI 消息，不入库）
//             truncated 截断留痕标记（入库，回看页渲染成分隔条）
//
// ⚠️ 截断规则必须与后端 server/records.cjs 的 sanitizeMessages 保持一致。
//    前后端无法共享代码，这是必要重复；改这里请同步改那边。

export const MAX_MESSAGES = 120;                 // 约 60 轮
export const MAX_CONTENT = 2000;                 // 单条消息字符数
export const MAX_TRANSCRIPT_BYTES = 48 * 1024;

// content.length 是 UTF-16 码元数，不是字节数；中文在 UTF-8 下 3 字节/字，
// 直接当字节用会低估约 3 倍。这里按 3 倍估算，宁可早一点截断也不让记录膨胀。
const estBytes = (s) => s.length * 3;

export const nowIso = () => new Date().toISOString();

/**
 * 内存 messages → 存储形状。
 * 剔除 greeting/error，做三层截断（单条 → 条数 → 字节），保留尾部。
 * 保留尾部而非头部，是为了与评分口径（只看最近 12 条）一致。
 */
export function toTranscript(messages) {
  const kept = (messages || [])
    .filter(m => !m.kind || m.kind === 'truncated')
    .map(m => {
      const content = String(m.content || '').slice(0, MAX_CONTENT);
      const out = { sender: m.sender, content, at: m.at || null };
      if (m.channel) out.channel = m.channel;
      if (m.kind === 'truncated') out.kind = 'truncated';
      return out;
    })
    .filter(m => m.content.trim());

  const out = kept.slice(-MAX_MESSAGES);
  let bytes = out.reduce((n, m) => n + estBytes(m.content) + 64, 0);
  let dropped = kept.length - out.length;

  while (bytes > MAX_TRANSCRIPT_BYTES && out.length > 2) {
    bytes -= estBytes(out[0].content) + 64;
    out.shift();
    dropped++;
  }

  // 截断留痕：科研数据不能静默丢弃，回看页把它渲染成灰色分隔条
  if (dropped > 0) {
    out.unshift({
      sender: 'ai',
      content: `（较早的 ${dropped} 条对话已省略）`,
      at: null,
      kind: 'truncated',
    });
  }
  return out;
}

/** 存储形状 → AI 评分输入（沿用原 ChatView 的拼接口径：只看汉字行，取最近 12 条） */
export function transcriptToPrompt(msgs) {
  return (msgs || [])
    .filter(m => m.kind !== 'truncated')
    .map(m => `${m.sender === 'student' ? '学生' : 'AI'}: ${String(m.content).split('\n')[0]}`)
    .slice(-12)
    .join('\n');
}

/** 学生发言轮数 */
export const countStudentTurns = (msgs) =>
  (msgs || []).filter(m => m.sender === 'student').length;

/**
 * 一条记录里的消息条数。
 * 记录有两种形状：登录用户从列表接口拿到的是 messageCount（服务端投影，
 * 刻意不带 messages），游客的本地记录和单条详情接口则直接带 messages 数组。
 * 所有消费方都走这个函数，不要各自再判一次形状。
 */
export const messageCount = (r) => r?.messageCount ?? r?.messages?.length ?? 0;

/** 这条记录是否有对话内容。 */
export const hasTranscript = (r) => messageCount(r) > 0;

/**
 * 记录时间。优先取首条消息的 at —— 它是前端 toISOString() 直出的真 UTC，
 * 不经过 createdAt 那条会偏移的时区链路（写入按 UTC 挂钟字符串，MySQL 按
 * 会话时区解释，mysql2 再按进程本地时区解释一次；北京时间凌晨的记录会
 * 显示成前一天）。没有对话的记录回退到 createdAt。
 */
export function recordDate(r) {
  return r?.messages?.[0]?.at || r?.createdAt;
}

/** 消息时间 HH:mm。空值或非法时间返回空串。 */
export function formatTime(at) {
  if (!at) return '';
  const d = new Date(at);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 列表里显示的日期。同一天可能练多次，所以默认带时间到分钟。 */
export function formatRecordDate(r, withTime = true) {
  const d = new Date(recordDate(r));
  if (isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString('zh-CN');
  return withTime ? `${day} ${formatTime(recordDate(r))}` : day;
}
