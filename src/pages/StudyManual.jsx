import { useState } from "react";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MANUAL_DATA } from "../data/studyManual.js";
import { HSK_LEVELS } from "../data/constants.js";

export function StudyManual({ hskLevel, onChangeHSK, onBack }) {
  const [tab, setTab] = useState("vocab");
  const [openCard, setOpenCard] = useState(null);
  const tabs = [
    { id: "vocab", label: "重点词汇", icon: "📚" },
    { id: "grammar", label: "核心语法", icon: "⚙️" },
    { id: "pinyin", label: "语音声调", icon: "🗣️" }
  ];
  const data = MANUAL_DATA[hskLevel]?.[tab] || [];
  const lv = HSK_LEVELS.find(l => l.id === hskLevel);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
      <TopBar title="学习手册" subtitle="Study Manual" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} />
      <PageWrap maxWidth={800}>
        <div style={{ padding: "32px 0 80px" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "24px 28px", marginBottom: 32, border: "1px solid #f0efe8", display: "flex", gap: 20, alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: 48 }}>{lv?.emoji}</div>
            <div>
              <h2 style={{ margin: "0 0 8px 0", fontSize: 20, color: "#1a1a1a" }}>{lv?.label} 知识图谱</h2>
              <p style={{ margin: 0, fontSize: 14, color: "#666", lineHeight: 1.6 }}>系统化梳理该阶段的{lv?.desc}。建议按照"词汇 → 语法 → 发音"的模块顺序进行复习，构建完整的汉语框架。</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 28, background: "#fff", padding: 6, borderRadius: 16, border: "1px solid #f0efe8", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setOpenCard(null); }}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                  background: tab === t.id ? "#D4413A" : "transparent",
                  color: tab === t.id ? "#fff" : "#888",
                  fontWeight: 600, fontSize: 15, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.3s"
                }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.map((item, i) => {
              const isOpen = openCard === i;
              const idxStr = (i + 1).toString().padStart(2, '0');
              return (
                <div key={i} style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${isOpen ? "#D4413A40" : "#f0efe8"}`, overflow: "hidden", boxShadow: isOpen ? "0 6px 16px rgba(212,65,58,0.08)" : "0 1px 3px rgba(0,0,0,0.02)", transition: "all 0.3s" }}>
                  <button onClick={() => setOpenCard(isOpen ? null : i)} style={{ width: "100%", padding: "20px 24px", border: "none", background: "transparent", display: "flex", alignItems: "center", cursor: "pointer" }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: isOpen ? "#D4413A" : "#eee", marginRight: 16, transition: "0.3s", fontStyle: "italic" }}>{idxStr}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: isOpen ? "#D4413A" : "#1a1a1a", textAlign: "left", flex: 1 }}>{item.title}</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isOpen ? "#D4413A" : "#ccc"} strokeWidth="2.5" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "0.3s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 24px 24px", animation: "su 0.3s both", marginLeft: 40 }}>
                      <div style={{ fontSize: 14, color: "#555", lineHeight: 1.7, marginBottom: 16 }}>{item.desc}</div>
                      <div style={{ background: "#FDF0EF", padding: "14px 18px", borderRadius: 12, color: "#D4413A", fontWeight: 500, borderLeft: "4px solid #D4413A" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", opacity: 0.8, marginBottom: 6 }}>Example / 示例</div>
                        <div style={{ lineHeight: 1.5 }}>{item.example}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
