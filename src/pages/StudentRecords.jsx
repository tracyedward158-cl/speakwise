import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { useApp } from "../context/AppContext.jsx";
import {
  getStudentProfile, setStudentNickname,
  getStudentStats, getStudentRecords,
  getWeakDimensions, getRecommendedExercises,
} from "../utils/recordStore.js";

const MODULE_COLORS = {
  "生活情境": "#4A90D9", "发音测评": "#7B6CF6", "自由对话": "#2DAA6E",
  "文化文游": "#9B59B6", "造句练习": "#E8A838",
};

const DIM_LABELS = { pronunciation: "发音", tone: "声调", fluency: "流利度", completeness: "完整度" };

export function StudentRecords() {
  const navigate = useNavigate();
  const { hsk } = useApp();
  const [profile, setProfile] = useState(() => getStudentProfile());
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const [filterModule, setFilterModule] = useState("全部");
  const [filterScore, setFilterScore] = useState("全部");

  const records = useMemo(() => {
    let rs = getStudentRecords(profile.id);
    if (filterModule !== "全部") rs = rs.filter(r => r.module === filterModule);
    if (filterScore === "≥80") rs = rs.filter(r => r.score >= 80);
    if (filterScore === "60-79") rs = rs.filter(r => r.score >= 60 && r.score < 80);
    if (filterScore === "<60") rs = rs.filter(r => r.score > 0 && r.score < 60);
    return rs;
  }, [profile.id, filterModule, filterScore]);

  const stats = useMemo(() => getStudentStats(profile.id), [profile.id]);
  const weakDims = useMemo(() => getWeakDimensions(profile.id), [profile.id]);
  const recommendations = useMemo(() => getRecommendedExercises(profile.id), [profile.id]);
  const weakOnly = weakDims.filter(w => w.isWeak);

  const handleSaveNickname = () => {
    const name = inputRef.current?.value.trim() || profile.id;
    setStudentNickname(name);
    setProfile(p => ({ ...p, nickname: name }));
    setEditing(false);
  };

  const displayName = profile.nickname || profile.id;
  const moduleList = useMemo(() => {
    const all = getStudentRecords(profile.id);
    return ["全部", ...new Set(all.map(r => r.module))];
  }, [profile.id]);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC', sans-serif" }}>
      <TopBar title="我的练习记录" subtitle="学习档案" onBack={() => navigate("/main")} />
      <PageWrap maxWidth={700}>
        <div style={{ padding: "28px 0 80px" }}>

          {/* ── 学生身份卡片 ── */}
          <div style={{
            background: "#fff", borderRadius: 18, border: "1px solid #f0efe8",
            padding: "20px 24px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "linear-gradient(135deg, #D4413A, #9B59B6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, color: "#fff", fontWeight: 700, flexShrink: 0,
            }}>
              {displayName[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editing ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input ref={inputRef} defaultValue={displayName}
                    onKeyDown={e => e.key === "Enter" && handleSaveNickname()}
                    style={{
                      flex: 1, padding: "6px 12px", borderRadius: 8, border: "1px solid #e0dcd0",
                      fontSize: 15, fontFamily: "inherit", outline: "none",
                    }}
                    autoFocus
                  />
                  <button onClick={handleSaveNickname}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#D4413A", color: "#fff", fontSize: 13, cursor: "pointer" }}>
                    确定
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{displayName}</span>
                  <button onClick={() => setEditing(true)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>
                    ✏️
                  </button>
                </div>
              )}
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>
                HSK {hsk || "未设置"} · 累计练习 {stats.daysSinceFirst || 0} 天
              </div>
            </div>
          </div>

          {/* ── 统计卡片 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { label: "总练习", value: stats.total, sub: "次", color: "#4A90D9" },
              { label: "平均分", value: stats.average, sub: "/100", color: "#2DAA6E" },
              { label: "最高分", value: stats.best, sub: "", color: "#E8A838" },
              { label: "近7天", value: stats.recentDays, sub: "天有练习", color: "#9B59B6" },
            ].map(d => (
              <div key={d.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0efe8", padding: "14px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: d.color }}>{d.value || "—"}</div>
                <div style={{ fontSize: 11, color: "#999" }}>{d.label}</div>
                {d.sub && <div style={{ fontSize: 10, color: "#bbb" }}>{d.sub}</div>}
              </div>
            ))}
          </div>

          {/* ── 弱项维度追踪 ── */}
          {weakDims.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 10 }}>
                能力维度追踪
                {weakOnly.length > 0 && <span style={{ fontSize: 12, color: "#D4413A", marginLeft: 6 }}>（{weakOnly.length} 项需关注）</span>}
              </div>
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0efe8", padding: "12px 20px" }}>
                {weakDims.map(d => {
                  const pct = Math.min(d.avg, 100);
                  return (
                    <div key={d.dim} style={{
                      padding: "10px 0", borderBottom: "1px solid #f7f6f1",
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <div style={{ width: 48, fontSize: 12, fontWeight: 600, color: "#555" }}>{d.label}</div>
                      <div style={{ flex: 1, height: 6, background: "#f0efe8", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: d.isWeak ? "#D4413A" : "#2DAA6E", borderRadius: 3 }} />
                      </div>
                      <div style={{ width: 36, textAlign: "right", fontSize: 14, fontWeight: 700, color: d.isWeak ? "#D4413A" : "#2DAA6E" }}>{d.avg}</div>
                      <div style={{ width: 52, textAlign: "right", fontSize: 11, color: "#aaa" }}>{d.trend}</div>
                      <div style={{ width: 24, textAlign: "right", fontSize: 10, color: "#bbb" }}>{d.occurrences}次</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 筛选栏 ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {moduleList.map(m => (
              <button key={m} onClick={() => setFilterModule(m)}
                style={{
                  padding: "6px 14px", borderRadius: 16, border: "1px solid #e0dcd0",
                  background: filterModule === m ? "#D4413A" : "#fff",
                  color: filterModule === m ? "#fff" : "#888", fontSize: 12, cursor: "pointer",
                  fontFamily: "inherit",
                }}>
                {m}
              </button>
            ))}
            <div style={{ width: 1, background: "#e0dcd0", alignSelf: "stretch", margin: "0 4px" }} />
            {["全部", "≥80", "60-79", "<60"].map(s => (
              <button key={s} onClick={() => setFilterScore(s)}
                style={{
                  padding: "6px 14px", borderRadius: 16, border: "1px solid #e0dcd0",
                  background: filterScore === s ? "#666" : "#fff",
                  color: filterScore === s ? "#fff" : "#aaa", fontSize: 12, cursor: "pointer",
                  fontFamily: "inherit",
                }}>
                {s}
              </button>
            ))}
          </div>

          {/* ── 练习记录列表 ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {records.length === 0 && (
              <div style={{ textAlign: "center", padding: 32, color: "#bbb", fontSize: 14 }}>
                暂无记录。完成一次练习后这里会出现数据。
              </div>
            )}
            {records.map(r => (
              <div key={r.id} style={{
                background: "#fff", borderRadius: 14, border: "1px solid #f0efe8",
                padding: "14px 18px", display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: r.score >= 80 ? "#EDFAF3" : r.score >= 60 ? "#FFF8ED" : "#FDF0EF",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700,
                  color: r.score >= 80 ? "#2DAA6E" : r.score >= 60 ? "#E8A838" : "#D4413A",
                }}>
                  {r.score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{r.scenario || r.module}</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                    <span style={{ color: MODULE_COLORS[r.module] || "#888", fontWeight: 500 }}>{r.module}</span>
                    {" · "}{new Date(r.createdAt).toLocaleDateString("zh-CN")}
                  </div>
                  {r.problems?.length > 0 && (
                    <div style={{ fontSize: 11, color: "#bbb", marginTop: 3 }}>
                      {r.problems.slice(0, 2).join(" · ")}
                    </div>
                  )}
                </div>
                {r.dimensions && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {Object.entries(DIM_LABELS).map(([dim, label]) => {
                      const val = r.dimensions[dim];
                      if (val == null) return null;
                      return (
                        <div key={dim} style={{
                          padding: "3px 6px", borderRadius: 6, fontSize: 10,
                          background: val >= 70 ? "#EDFAF3" : "#FDF0EF",
                          color: val >= 70 ? "#2DAA6E" : "#D4413A",
                        }}>
                          {label[0]}{val}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── 练习推荐 ── */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 10 }}>建议练习</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recommendations.map((rec, i) => (
                <div key={i} style={{
                  background: "#FDF0EF", borderRadius: 14, border: "1px solid #fbe3e1",
                  padding: "16px 20px", cursor: "pointer",
                }} onClick={() => {
                  if (rec.action.type === "navigate") navigate(rec.action.target);
                  else if (rec.action.type === "drill") navigate("/oral/drill/pronunciation");
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#D4413A" }}>{rec.label}</span>
                    {rec.weakDetail && <span style={{ fontSize: 11, color: "#999" }}>{rec.weakDetail}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>{rec.suggest}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </PageWrap>
    </div>
  );
}
