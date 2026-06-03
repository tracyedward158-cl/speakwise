import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

const CHAPTERS = [
  { id: "ch1", title: "一鸣惊人", titleEn: "第一章", icon: "🐦", color: "#4A90D9", bg: "#EEF4FB", desc: "随伍举以隐语劝谏楚庄王，成就千古成语。" },
  { id: "ch2", title: "卧薪尝胆", titleEn: "第二章", icon: "⚔️", color: "#E67E22", bg: "#FEF5EC", desc: "随越王勾践卧薪尝胆，十年生聚终雪前耻。" },
  { id: "ch3", title: "完璧归赵", titleEn: "第三章", icon: "📜", color: "#9B59B6", bg: "#F5F0FA", desc: "随蔺相如携和氏璧入秦，智斗秦王，护璧归赵。" },
];

export function CultureMenu() {
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC', sans-serif" }}>
      <TopBar title="文化文游" subtitle="Cultural Stories" onBack={() => navigate("/main")} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏮</div>
            <div style={{ fontSize: 15, color: "#888", lineHeight: 1.7 }}>
              走入中国历史经典场景，在互动故事中<br />学习成语典故，体验中华文化。
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {CHAPTERS.map(ch => (
              <MenuItem key={ch.id} item={ch} onClick={() => navigate("/culture/" + ch.id)} hovered={hovered} onHover={setHovered} />
            ))}
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
