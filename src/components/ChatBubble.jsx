// ── 对话气泡 ──
// 从 ChatView 内联的 JSX 抽出，使实时对话页与回看页共用同一份外观实现。
//
// ⚠️ 不要在本组件内部调用 useSpeech()。`speaking` 是每个 hook 实例独立的 state，
//    而 window.speechSynthesis 是全局单例 —— 逐气泡各自持有会让所有气泡同时
//    显示 "Stop"。由父组件调用一次，把 speaking/onSpeak/onStopSpeak 传下来。
import { renderChatBubble } from "../utils/helpers.jsx";

export function ChatBubble({
  sender,
  content,
  kind,
  mode = "HPE",
  color,
  bg,
  icon,
  showVoice = false,
  speaking = false,
  onSpeak,
  onStopSpeak,
  time,
}) {
  // 截断留痕：不当作一条消息渲染，用分隔条表示
  if (kind === "truncated") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        margin: "4px 0 14px", color: "#bbb", fontSize: 11,
      }}>
        <div style={{ flex: 1, height: 1, background: "#ecebe4" }} />
        <span style={{ flexShrink: 0 }}>{content}</span>
        <div style={{ flex: 1, height: 1, background: "#ecebe4" }} />
      </div>
    );
  }

  const isUser = sender === "student";
  const parsed = isUser
    ? { ttsText: content, ui: content }
    : renderChatBubble(content, mode, color);

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 14, alignItems: "flex-end", gap: 8, animation: "su 0.3s both" }}>
      {!isUser && (
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg || "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ padding: "12px 16px", background: isUser ? (color || "#4A90D9") : "#fff", color: isUser ? "#fff" : "#1a1a1a", borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px", fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", boxShadow: isUser ? "none" : "0 1px 3px rgba(0,0,0,0.04)", border: isUser ? "none" : "1px solid #f0efe8" }}>
          {parsed.ui}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", alignSelf: isUser ? "flex-end" : "flex-start", marginLeft: isUser ? 0 : 4 }}>
          {time && <span style={{ fontSize: 11, color: "#c4c2ba" }}>{time}</span>}
          {!isUser && showVoice && (
            <>
              <button onClick={() => (speaking ? onStopSpeak?.() : onSpeak?.(parsed.ttsText))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, opacity: 0.6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={speaking ? (color || "#E8A838") : "#888"}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
                <span style={{ fontSize: 12, color: "#666" }}>{speaking ? "Stop" : "Play"}</span>
              </button>
              <button onClick={() => onSpeak?.(parsed.ttsText, true)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: 10, fontSize: 11, color: "#666", fontWeight: 600, opacity: 0.6 }}>慢速</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
