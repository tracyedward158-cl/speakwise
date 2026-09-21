import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

// 发音测评的四个入口。
// 题库来自 src/data/pronunciationBank.json（552 条：字/词/句 × train/testA/testB），
// 具体选课逻辑在 utils/pronunciationBank.js，四个入口最终都进 /oral/drill/… 共用同一套评测界面。
const MODES = [
  {
    id: "daily", title: "日常练习", titleEn: "Daily Practice", icon: "🎙️",
    color: "#7B6CF6", bg: "#F3F0FF",
    desc: "系统出题练习 · 选粒度与模式，每轮 10 题",
    to: "/oral/pronunciation/daily",
  },
  {
    id: "bank", title: "题库浏览", titleEn: "Question Bank", icon: "🔍",
    color: "#4A90D9", bg: "#EEF4FB",
    desc: "搜索 · 浏览 · 历史，随时单练某一道",
    to: "/oral/pronunciation/bank",
  },
  {
    id: "test", title: "测试模式", titleEn: "Test Mode", icon: "⏱️",
    color: "#E8A838", bg: "#FFF8ED",
    desc: "标准化评测 · 字 10 → 词 10 → 句 5，可选 A/B 卷",
    to: "/oral/pronunciation/test",
  },
  {
    id: "custom", title: "自定义练习", titleEn: "Custom Practice", icon: "✏️",
    color: "#2DAA6E", bg: "#EDFAF3",
    desc: "自由输入内容，逐句朗读并评测",
    to: "/oral/drill/custom",
  },
];

export function PronunciationMenu() {
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="发音测评" subtitle="Pronunciation" onBack={() => navigate("/oral")} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <div style={{ fontSize: 13, color: "#bbb", marginBottom: 16 }}>选择练习模式</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {MODES.map(m => (
              <MenuItem key={m.id} item={m} onClick={() => navigate(m.to)} hovered={hovered} onHover={setHovered} />
            ))}
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
