export function WelcomeModal({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "su 0.3s both" }}>
      <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 400, padding: 32, position: "relative", textAlign: "center" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "#f0f0f0", border: "none", width: 30, height: 30, borderRadius: "50%", cursor: "pointer" }}>✕</button>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🐼</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "#1a1a1a" }}>SpeakWise 琢音</h2>
        <p style={{ fontSize: 14, color: "#666", margin: "0 0 20px" }}>AI 中文口语教练 (Web端)</p>
        <div style={{ background: "#FDF0EF", borderRadius: 16, padding: 16, textAlign: "left", marginBottom: 24, border: "1px solid #fbe3e1" }}>
          <p style={{ fontSize: 13, color: "#D4413A", margin: 0, lineHeight: 1.7 }}>
            本项目为 SRTP 科研课题<br />
            <b>《师-生-机深度交互式汉语口语教学模式创新研究》</b><br />
            落地应用平台，专为来华留学生打造。
          </p>
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: 14, background: "#D4413A", color: "#fff", border: "none", borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
          开始体验
        </button>
      </div>
    </div>
  );
}
