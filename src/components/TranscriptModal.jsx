// ── 完整对话弹窗 ──
// 遮罩模式沿用 WelcomeModal。整段对话可能几千像素，放进列表行内会让页面高度失控，
// 所以列表里只做摘要预览，完整内容在这里独立滚动。
import { ChatTranscript } from "./ChatTranscript.jsx";
import { moduleMeta } from "../data/moduleMeta.js";
import { formatRecordDate } from "../utils/transcript.js";
import { computeRecordMetrics, LONG_GAP_SEC } from "../utils/conversationMetrics.js";

// ── 过程指标条（认知深度操作化）──
// 四个 chip，不引图表库 —— 项目里唯一的图是手写 SVG 的 AbilityRadar。
function Chip({ label, value, unit, sub, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "8px 14px", minWidth: 86 }}>
      <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.15 }}>
        {value}
        {unit && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MetricsStrip({ m }) {
  // 空值渲染成「—」而不是 0：avgGapSec 为 null（一个间隔都测不到）与为 0
  // （学生秒回）是两回事，在单条对话的视图里必须看得出来。
  const dash = "—";
  const pct = m.voiceRatio != null ? Math.round(m.voiceRatio * 100) : null;

  // 只在有异常时出现。常驻一行「0 条截断 · 0 次时钟回拨」会训练读者忽略这一行，
  // 而它恰恰是数据可用性的信号。
  // （首轮间隔的起点不同源这件事记在导出的 sessionStartUsed 字段里，不在这里显示：
  //   它在真实对话上几乎总为真，放进来就成了上面那种常驻噪音。）
  const notes = [];
  if (m.truncated) notes.push("对话已截断，轮次可能偏低");
  if (m.unknownChannelTurns) notes.push(`${m.unknownChannelTurns} 轮通道未知（未计入语音比例）`);
  if (m.longGapCount) notes.push(`${m.longGapCount} 次长间隔（>${Math.round(LONG_GAP_SEC / 60)} 分钟）`);
  if (m.gapRewindCount) notes.push(`${m.gapRewindCount} 次时钟回拨已丢弃`);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Chip label="对话轮次" value={m.turns} unit="轮" color="#7B4FA3" bg="#F5F0FA"
          sub={`共 ${m.messageTotal} 条消息`} />
        <Chip label="学生平均字数" value={m.avgChars} unit="字" color="#4A90D9" bg="#EEF4FB"
          sub={`共 ${m.charsTotal} 字`} />
        <Chip label="平均回复间隔" value={m.avgGapSec ?? dash} unit={m.avgGapSec != null ? "秒" : ""}
          color="#2DAA6E" bg="#EDFAF3"
          sub={m.medianGapSec != null ? `中位 ${m.medianGapSec} 秒 · ${m.gapCount} 次` : "无可用间隔"} />
        <Chip label="语音输入占比" value={pct ?? dash} unit={pct != null ? "%" : ""}
          color="#E8A838" bg="#FFF8ED"
          sub={pct != null ? `${m.voiceTurns}/${m.voiceTurns + m.textTurns} 轮` : "通道全未知"} />
      </div>
      {notes.length > 0 && (
        <div style={{ fontSize: 10, color: "#bbb", marginTop: 8, lineHeight: 1.6 }}>
          {notes.join(" · ")}
        </div>
      )}
    </div>
  );
}

export function TranscriptModal({ record, messages, loading, error, onRetry, onClose, onExport }) {
  if (!record) return null;
  const meta = moduleMeta(record.module);

  // ⚠️ 刻意不用 useMemo：本函数第一行就是 `if (!record) return null`，在任何 hook
  //    之前，加 hook 得先把它挪到早返回上面才合法（而这个组件目前一个 hook 都没有，
  //    为一次微秒级的纯计算破坏那条规则不划算）。messages 来自详情接口或缓存，
  //    其余字段来自列表行，所以按 messages 覆盖合并。
  const metrics = !loading && !error && messages
    ? computeRecordMetrics({ ...record, messages })
    : null;

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
          {/* 放在滚动区内而不是钉在标题栏：标题栏已有场景/模块/时间/分数三行，
              720px 宽的弹窗再塞一行会把对话本身挤掉。指标只是「这段对话有多长」
              的摘要，回看时不需要一直盯着。 */}
          {metrics?.available && <MetricsStrip m={metrics} />}

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
