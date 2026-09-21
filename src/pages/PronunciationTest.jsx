import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { buildTestSequence, TEST_PLAN } from "../utils/pronunciationBank.js";

const COLOR = "#E8A838";
const PLANS = [
  { id: "testA", label: "Test A", icon: "🅰️", desc: "标准卷 A" },
  { id: "testB", label: "Test B", icon: "🅱️", desc: "标准卷 B" },
];

export function PronunciationTest() {
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp();

  // 题量按题库实际内容算，不写死 25：某组不足时该卷题量就会少于 25，
  // 界面如实标注。前后测对比时必须知道两卷在各级别的真实题量。
  const counts = useMemo(() => ({
    testA: buildTestSequence({ set: "testA", level: hskLevel }).length,
    testB: buildTestSequence({ set: "testB", level: hskLevel }).length,
  }), [hskLevel]);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
      <TopBar title="测试模式" subtitle="Test Mode" onBack={() => navigate("/oral/pronunciation")} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "24px 0 40px" }}>

          <div style={{ fontSize: 13, color: "#bbb", marginBottom: 14 }}>选择试卷</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
            {PLANS.map(p => {
              const total = counts[p.id];
              const short = total < TEST_PLAN.reduce((a, x) => a + x.count, 0);
              return (
                <div key={p.id} onClick={() => navigate(`/oral/drill/practice?set=${p.id}&from=test`)}
                  style={{
                    background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "20px 22px",
                    cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.03)", transition: "all 0.25s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = COLOR + "80"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#f0efe8"; e.currentTarget.style.transform = "none"; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 26 }}>{p.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>{p.label}</div>
                      <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>{p.desc}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: COLOR }}>{total}</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>题</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {TEST_PLAN.map(x => (
                      <span key={x.unit} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 10, background: "#FFF8ED", color: "#C98A28", fontWeight: 600 }}>
                        {x.unit} {x.count}
                      </span>
                    ))}
                    <span style={{ fontSize: 11, color: "#ccc" }}>按此顺序一次做完</span>
                  </div>
                  {short && (
                    <div style={{ fontSize: 11, color: "#E8A838", marginTop: 8 }}>
                      本级题库题量不足，本卷实际 {total} 题
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ background: "#FDF8ED", borderRadius: 14, padding: "16px 18px", border: "1px solid #F0E4C8" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#C98A28", marginBottom: 6 }}>关于测试模式</div>
            <div style={{ fontSize: 12, color: "#A8843F", lineHeight: 1.8 }}>
              题目按当前 HSK 等级（{hskLevel || "未设置"}）从题库的 testA / testB 两卷中抽取，顺序固定不变，同一份卷对所有学生一致。<br />
              成绩以「发音测评」模块记入练习记录，并带来源标记，导出数据时可区分测试与日常练习。
            </div>
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
