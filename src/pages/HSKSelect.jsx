import { useState } from "react";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";
import { HSK_LEVELS } from "../data/constants.js";

export function HSKSelect({ onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <PageWrap maxWidth={580}>
      <div style={{ padding: "60px 0", textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#D4413A", marginBottom: 8 }}>欢迎来到 SpeakWise 琢音</h1>
        <h2 style={{ marginBottom: 32 }}>请选择你的汉语水平</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
          {HSK_LEVELS.map(l => (
            <MenuItem
              key={l.id}
              item={{
                id: l.id,
                title: l.label,
                titleEn: l.sub,
                icon: l.emoji,
                color: l.color,
                bg: l.color + "15",
                desc: l.desc
              }}
              onClick={() => onSelect(l.id)}
              hovered={hovered}
              onHover={setHovered}
            />
          ))}
        </div>
      </div>
    </PageWrap>
  );
}
