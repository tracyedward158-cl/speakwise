import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

export function MainMenu({ onOpenAbout }) {
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="SpeakWise 主菜单" hskLevel={hskLevel} onChangeHSK={onChangeHSK} onBack={null} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MenuItem item={{ id: "oral", title: "口语训练", titleEn: "Speaking", icon: "🗣️", color: "#4A90D9", bg: "#EEF4FB", desc: "场景模拟与发音评测" }} onClick={() => navigate("/oral")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "written", title: "写作辅导", titleEn: "Writing", icon: "✍️", color: "#E8A838", bg: "#FFF8ED", desc: "AI 批改段落与短文" }} onClick={() => navigate("/written")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "manual", title: "学习手册", titleEn: "Study Manual", icon: "📖", color: "#D4413A", bg: "#FDF0EF", desc: "核心语法与词汇系统复习" }} onClick={() => navigate("/manual")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "culture", title: "文化文游", titleEn: "Cultural Game", icon: "📜", color: "#9B59B6", bg: "#F5F0FA", desc: "历史文化互动小说" }} onClick={() => navigate("/culture")} hovered={hovered} onHover={setHovered} />
          </div>
          <div onClick={onOpenAbout} className="footer-link">关于 SpeakWise SRTP 项目</div>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#aaa" }}>受国家级/江苏省大学生创新训练计划支持</div>
          <div style={{ textAlign: "center", marginTop: 2, fontSize: 11, color: "#bbb", fontStyle: "italic" }}>National Undergraduate Training Programs for Innovation</div>
          <div onClick={() => navigate("/student/records")} style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#bbb", cursor: "pointer" }}>我的练习记录 · 学习档案</div>
          <div onClick={() => navigate("/teacher")} style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#bbb", cursor: "pointer" }}>教师支持端 · 学情概览</div>
        </div>
      </PageWrap>
    </div>
  );
}
