import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";
import { SCENARIOS } from "../data/scenarios.js";

export function SceneList() {
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="选择场景" subtitle="Select a Scenario" onBack={() => navigate("/oral")} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <PageWrap maxWidth={860}>
        <div style={{ padding: "40px 0" }}>
          <div className="menu-grid">
            {SCENARIOS.map(s => <MenuItem key={s.id} item={s} onClick={() => navigate("/oral/scenes/" + s.id)} hovered={hovered} onHover={setHovered} />)}
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
