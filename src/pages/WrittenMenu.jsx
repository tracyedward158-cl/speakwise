import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

export function WrittenMenu() {
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="写作辅导" subtitle="Writing Coach" onBack={() => navigate("/main")} hskLevel={hskLevel} onChangeHSK={onChangeHSK} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MenuItem item={{ id: "sentence", title: "造句练习", titleEn: "Sentence Building", icon: "✏️", color: "#4A90D9", bg: "#EEF4FB", desc: "使用指定词汇写句子，AI 批改" }} onClick={() => navigate("/written/drill/sentence")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "paragraph", title: "段落写作", titleEn: "Paragraphs", icon: "📝", color: "#E8A838", bg: "#FFF8ED", desc: "写几个连贯的句子" }} onClick={() => navigate("/written/chat/paragraph")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "essay", title: "短文写作", titleEn: "Essays", icon: "📄", color: "#7B6CF6", bg: "#F3F0FF", desc: "写一篇完整的短文，打分并反馈" }} onClick={() => navigate("/written/chat/essay")} hovered={hovered} onHover={setHovered} />
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
