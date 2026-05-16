import { useState } from "react";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";
import { SCENARIOS } from "../data/scenarios.js";

export function SceneList({ hskLevel, onChangeHSK, onBack, onSelect, mode, onChangeMode }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="选择场景" subtitle="Select a Scenario" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <PageWrap maxWidth={860}>
        <div style={{ padding: "40px 0" }}>
          <div className="menu-grid">
            {SCENARIOS.map(s => <MenuItem key={s.id} item={s} onClick={() => onSelect(s)} hovered={hovered} onHover={setHovered} />)}
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
