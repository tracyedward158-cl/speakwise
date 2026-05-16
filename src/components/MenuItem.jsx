export function MenuItem({ item, onClick, hovered, onHover, badge }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        background: "#fff", borderRadius: 18, padding: "26px 24px", cursor: "pointer",
        border: `1px solid ${hovered === item.id ? item.color + "60" : "#f0efe8"}`,
        transition: "all 0.3s",
        transform: hovered === item.id ? "translateY(-3px)" : "none",
        boxShadow: hovered === item.id ? `0 10px 28px ${item.color}15` : "0 1px 3px rgba(0,0,0,0.03)",
        display: "flex", flexDirection: "column", height: "100%"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: item.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, transition: "transform 0.2s", transform: hovered === item.id ? "scale(1.06)" : "none" }}>
          {item.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: "#1a1a1a" }}>{item.title}</span>
            {badge && <span style={{ fontSize: 11, background: item.color + "18", color: item.color, padding: "2px 10px", borderRadius: 10, fontWeight: 600 }}>{badge}</span>}
          </div>
          <div style={{ fontSize: 13, color: "#aaa", marginTop: 2 }}>{item.titleEn}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flex: 1 }}>
        <div style={{ fontSize: 14, color: "#666", lineHeight: 1.5, paddingRight: 10 }}>{item.desc}</div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={hovered === item.id ? item.color : "#ccc"} strokeWidth="2" style={{ flexShrink: 0, transition: "transform 0.25s", transform: hovered === item.id ? "translateX(4px)" : "none", marginBottom: 2 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}
