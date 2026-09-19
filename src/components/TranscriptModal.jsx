// ── 完整对话弹窗 ──
// 遮罩模式沿用 WelcomeModal。整段对话可能几千像素，放进列表行内会让页面高度失控，
// 所以列表里只做摘要预览，完整内容在这里独立滚动。
import { ChatTranscript } from "./ChatTranscript.jsx";
import { moduleMeta } from "../data/moduleMeta.js";
import { formatRecordDate } from "../utils/transcript.js";

export function TranscriptModal({ record, messages, loading, error, onRetry, onClose, onExport }) {
  if (!record) return null;
  const meta = moduleMeta(record.module);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: "su 0.2s both",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#FAFAF7", borderRadius: 20, width: "100%", maxWidth: 720,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          fontFamily: "'Noto Sans SC',sans-serif", overflow: "hidden",
        }}
      >
        {/* 标题栏 */}
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid #f0efe8", background: "#fff",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: meta.bg, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>
            {meta.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>
              {record.scenario || record.module}
              {record.nickname ? ` · ${record.nickname}` : ""}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
              <span style={{ color: meta.color, fontWeight: 500 }}>{record.module}</span>
              {" · "}{formatRecordDate(record)}
              {record.score > 0 ? ` · ${record.score} 分` : " · 待评分"}
            </div>
          </div>
          {onExport && (
            <button onClick={onExport} style={{
              background: "none", border: "1px solid #e0dcd0", borderRadius: 14,
              padding: "6px 14px", fontSize: 12, color: "#888", cursor: "pointer",
              fontFamily: "inherit", flexShrink: 0,
            }}>
              导出 JSON
            </button>
          )}
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 20,
            color: "#bbb", padding: "0 4px", lineHeight: 1, flexShrink: 0,
          }}>
            ×
          </button>
        </div>

        {/* 对话内容 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          <ChatTranscript
            messages={messages}
            loading={loading}
            error={error}
            onRetry={onRetry}
            moduleName={record.module}
          />

          {record.problems?.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #ecebe4" }}>
              <div style={{ fontSize: 11, color: "#bbb", marginBottom: 6 }}>本次问题</div>
              <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
                {record.problems.join(" · ")}
              </div>
            </div>
          )}
          {record.suggestion && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: "#bbb", marginBottom: 6 }}>教学建议</div>
              <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7 }}>{record.suggestion}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
