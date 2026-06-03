import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

export function OralMenu() {
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="口语训练" subtitle="Speaking Training" onBack={() => navigate("/main")} hskLevel={hskLevel} onChangeHSK={onChangeHSK} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MenuItem item={{ id: "scenes", title: "场景模拟", titleEn: "Roleplay Scenes", icon: "🎭", color: "#9B59B6", bg: "#F5F0FA", desc: "在真实场景中扮演角色对话" }} onClick={() => navigate("/oral/scenes")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "assess", title: "发音测评", titleEn: "Pronunciation", icon: "🎙️", color: "#7B6CF6", bg: "#F3F0FF", desc: "跟读句子，AI 打分纠音" }} onClick={() => navigate("/oral/drill/pronunciation")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "free", title: "自由对话", titleEn: "Free Chat", icon: "💬", color: "#2DAA6E", bg: "#EDFAF3", desc: "和 AI 教练随便聊聊" }} onClick={() => navigate("/oral/chat/free")} hovered={hovered} onHover={setHovered} />
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
