// ── 对话回看 ──
// 整段对话的消息列表 + 加载/错误/空三态。
// useSpeech 在本组件里只调用一次（整个对话共用一个 TTS 状态），
// 见 ChatBubble 顶部关于「不要逐气泡调 useSpeech」的说明。
import { useSpeech } from "../hooks/useSpeech.js";
import { ChatBubble } from "./ChatBubble.jsx";
import { moduleMeta } from "../data/moduleMeta.js";
import { formatTime } from "../utils/transcript.js";

// 回看固定用全显模式，不用 useApp().viewMode ——
// 教师若选了「纯汉模式」，历史记录里的拼音/英文会被静默裁掉，那是信息损失。
const VIEW_MODE = "HPE";

export function ChatTranscript({ messages, loading, error, onRetry, moduleName }) {
  const { speaking, speak, stopSpeaking } = useSpeech();
  const meta = moduleMeta(moduleName);

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#bbb", fontSize: 13 }}>
        正在加载对话…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13 }}>
        <div style={{ color: "#D4413A", marginBottom: 12 }}>{error}</div>
        {onRetry && (
          <button onClick={onRetry} style={{
            background: "none", border: "1px solid #e0dcd0", borderRadius: 14,
            padding: "6px 16px", fontSize: 12, color: "#888", cursor: "pointer", fontFamily: "inherit",
          }}>
            重试
          </button>
        )}
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#bbb", fontSize: 13 }}>
        这条记录没有对话内容
      </div>
    );
  }

  return (
    <div>
      {messages.map((m, i) => (
        <ChatBubble
          key={i}
          sender={m.sender}
          content={m.content}
          kind={m.kind}
          mode={VIEW_MODE}
          color={meta.color}
          bg={meta.bg}
          icon={meta.icon}
          showVoice={m.sender === "ai"}
          speaking={speaking}
          onSpeak={speak}
          onStopSpeak={stopSpeaking}
          time={formatTime(m.at)}
        />
      ))}
    </div>
  );
}
