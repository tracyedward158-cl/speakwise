import { useState } from "react";
import { HSK_LEVELS, MODES } from "../data/constants.js";

export function TopBar({ title, subtitle, onBack, hskLevel, onChangeHSK, mode, onChangeMode }) {
  const [openHSK, setOpenHSK] = useState(false);
  const [openMode, setOpenMode] = useState(false);
  const lv = HSK_LEVELS.find(l => l.id === hskLevel);
  const curMode = MODES.find(m => m.id === mode);

  return (
    <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, background: "#fff", borderBottom: "1px solid #f0efe8", position: "sticky", top: 0, zIndex: 20 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", borderRadius: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "#999" }}>{subtitle}</div>}
      </div>
      {hskLevel && lv && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onChangeMode && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setOpenMode(!openMode)} style={{ background: "#f0efe8", border: "none", borderRadius: 20, padding: "6px 12px", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4, fontWeight: 600, color: "#666" }}>
                ⚙️ {curMode?.label.slice(0, 2)}
              </button>
              {openMode && (
                <>
                  <div onClick={() => setOpenMode(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", borderRadius: 12, border: "1px solid #f0efe8", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 31, overflow: "hidden", minWidth: 150 }}>
                    {MODES.map(m => (
                      <button key={m.id} onClick={() => { onChangeMode(m.id); setOpenMode(false); }} style={{ width: "100%", padding: "12px 14px", border: "none", background: m.id === mode ? "#f8f8f8" : "transparent", textAlign: "left", cursor: "pointer", display: "block" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: m.id === mode ? "#333" : "#555" }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ position: "relative" }}>
            <button onClick={() => setOpenHSK(!openHSK)} style={{ background: lv.color + "14", border: `1px solid ${lv.color}30`, borderRadius: 20, padding: "6px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: lv.color, fontFamily: "inherit" }}>
              {lv.emoji} {lv.label}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={lv.color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {openHSK && (
              <>
                <div onClick={() => setOpenHSK(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", borderRadius: 12, border: "1px solid #f0efe8", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 31, overflow: "hidden", minWidth: 180 }}>
                  {HSK_LEVELS.map(l => (
                    <button key={l.id} onClick={() => { onChangeHSK(l.id); setOpenHSK(false); }} style={{ width: "100%", padding: "12px 16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: l.id === hskLevel ? l.color + "10" : "transparent", fontFamily: "inherit", textAlign: "left" }}>
                      <span style={{ fontSize: 18 }}>{l.emoji}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: l.id === hskLevel ? l.color : "#1a1a1a" }}>{l.label}</div>
                        <div style={{ fontSize: 12, color: "#999" }}>{l.sub}</div>
                      </div>
                      {l.id === hskLevel && <svg width="16" height="16" viewBox="0 0 24 24" fill={l.color} style={{ marginLeft: "auto" }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
