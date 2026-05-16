import { useState } from "react";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

export function MainMenu({ hskLevel, onChangeHSK, onNav, onOpenAbout }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="SpeakWise 主菜单" hskLevel={hskLevel} onChangeHSK={onChangeHSK} onBack={null} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MenuItem item={{ id: "oral", title: "口语训练", titleEn: "Speaking", icon: "🗣️", color: "#4A90D9", bg: "#EEF4FB", desc: "场景模拟与发音评测" }} onClick={() => onNav("oral")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "written", title: "写作辅导", titleEn: "Writing", icon: "✍️", color: "#E8A838", bg: "#FFF8ED", desc: "AI 批改段落与短文" }} onClick={() => onNav("written")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "manual", title: "学习手册", titleEn: "Study Manual", icon: "📖", color: "#D4413A", bg: "#FDF0EF", desc: "核心语法与词汇系统复习" }} onClick={() => onNav("manual")} hovered={hovered} onHover={setHovered} />
          </div>
          <div onClick={onOpenAbout} className="footer-link">关于 SpeakWise SRTP 项目</div>
        </div>
      </PageWrap>
    </div>
  );
}
