import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import {
  getAllRecords, getClassOverview, getModulePerformance,
  getCommonProblems, getTeachingSuggestions, clearRecords,
} from "../utils/recordStore.js";

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0efe8", padding: "18px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#1a1a1a" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#999", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const MODULE_COLORS = {
  "生活情境": "#4A90D9", "发音测评": "#7B6CF6", "自由对话": "#2DAA6E",
  "文化文游": "#9B59B6", "造句练习": "#E8A838",
};

export function TeacherDashboard() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const records = useMemo(() => getAllRecords(), [refreshKey]);
  const overview = useMemo(() => getClassOverview(records), [records]);
  const modules = useMemo(() => getModulePerformance(records), [records]);
  const problems = useMemo(() => getCommonProblems(records), [records]);
  const suggestions = useMemo(() => getTeachingSuggestions(problems), [problems]);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC', sans-serif" }}>
      <TopBar title="教师支持端" subtitle="学情概览" onBack={() => navigate("/main")} />
      <PageWrap maxWidth={860}>
        <div style={{ padding: "32px 0 80px" }}>

          {/* ── 1. 班级概览 ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>班级概览</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <StatCard label="参与学生" value={overview.studentCount} sub="人" color="#4A90D9" />
              <StatCard label="练习总次数" value={overview.totalExercises} sub="次" color="#E8A838" />
              <StatCard label="平均得分" value={overview.averageScore} sub="/100" color="#2DAA6E" />
              <StatCard label="覆盖模块" value={overview.completedModules.length} sub="个" color="#9B59B6" />
            </div>
          </div>

          {/* ── 2. 模块表现 ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>模块表现</div>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", overflow: "hidden" }}>
              {modules.map((m, i) => {
                const color = MODULE_COLORS[m.module] || "#888";
                const pct = Math.min(m.avgScore, 100);
                return (
                  <div key={m.module} style={{
                    padding: "16px 20px", borderBottom: i < modules.length - 1 ? "1px solid #f5f4f0" : "none",
                    display: "flex", alignItems: "center", gap: 16,
                  }}>
                    <div style={{ width: 80, fontSize: 13, fontWeight: 600, color: "#555", flexShrink: 0 }}>{m.module}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 8, background: "#f0efe8", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
                      </div>
                    </div>
                    <div style={{ width: 44, textAlign: "right", fontSize: 16, fontWeight: 700, color, flexShrink: 0 }}>{m.avgScore}</div>
                    <div style={{ width: 100, fontSize: 11, color: "#aaa", flexShrink: 0 }}>{m.desc} ({m.count}次)</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. 高频问题诊断 + 4. 学生记录 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            {/* Problems */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>高频问题诊断</div>
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "16px 20px" }}>
                {problems.length === 0 && <div style={{ fontSize: 13, color: "#bbb", textAlign: "center", padding: 16 }}>暂无足够数据</div>}
                {problems.map((p, i) => (
                  <div key={p.name} style={{
                    padding: "10px 0", borderBottom: i < problems.length - 1 ? "1px solid #f7f6f1" : "none",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div style={{ fontSize: 14, color: "#555" }}>
                      <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: "#D4413A", color: "#fff", fontSize: 10, textAlign: "center", lineHeight: "20px", marginRight: 8 }}>{i + 1}</span>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#aaa", fontWeight: 600 }}>{p.count}次</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent records */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>最近练习记录</div>
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "12px 20px", maxHeight: 340, overflowY: "auto" }}>
                {records.slice(0, 10).map((r, i) => (
                  <div key={r.id} style={{
                    padding: "10px 0", borderBottom: i < Math.min(records.length, 10) - 1 ? "1px solid #f7f6f1" : "none",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ width: 30, fontSize: 11, fontWeight: 600, color: MODULE_COLORS[r.module] || "#888", flexShrink: 0 }}>{r.studentId}</div>
                    <div style={{ fontSize: 12, color: "#666", flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{r.scenario || r.module}</div>
                      <div style={{ fontSize: 10, color: "#bbb" }}>{r.module} · {new Date(r.createdAt).toLocaleDateString("zh-CN")}</div>
                    </div>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: r.score >= 80 ? "#EDFAF3" : r.score >= 60 ? "#FFF8ED" : "#FDF0EF",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                      color: r.score >= 80 ? "#2DAA6E" : r.score >= 60 ? "#E8A838" : "#D4413A",
                    }}>
                      {r.score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 5. AI 教学建议 ── */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>AI 教学建议</div>
            <div style={{ background: "#FDF0EF", borderRadius: 16, border: "1px solid #fbe3e1", padding: "20px 24px" }}>
              {suggestions.map((s, i) => (
                <div key={i} style={{
                  padding: "10px 0", borderBottom: i < suggestions.length - 1 ? "1px solid #fbe3e1" : "none",
                  fontSize: 14, color: "#444", lineHeight: 1.6, display: "flex", gap: 10,
                }}>
                  <span style={{ color: "#D4413A", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ textAlign: "center", marginTop: 40, fontSize: 12, color: "#ccc" }}>
            当前为学情支持原型 · 基于学生练习记录生成 · <span onClick={() => { clearRecords(); setRefreshKey(k => k + 1); }} style={{ cursor: "pointer", textDecoration: "underline" }}>重置记录</span>
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
