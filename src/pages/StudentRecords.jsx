import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { AbilityRadar } from "../components/AbilityRadar.jsx";
import { useApp } from "../context/AppContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { recordApi } from "../utils/api.js";
import { TranscriptModal } from "../components/TranscriptModal.jsx";
import { useTranscriptDetail } from "../hooks/useTranscriptDetail.js";
import { moduleColor } from "../data/moduleMeta.js";
import { hasTranscript, messageCount, formatRecordDate } from "../utils/transcript.js";
import { exportRecordsJson, hydrateRecords, EXPORT_LIMIT } from "../utils/exporters.js";
import {
  getStudentProfile, setStudentNickname,
  getStudentStats, getStudentRecords,
  getWeakDimensions, getRecommendedExercises,
  getRadarDimensions,
} from "../utils/recordStore.js";

const DIM_LABELS = { pronunciation: "发音", tone: "声调", fluency: "流利度", completeness: "完整度" };

export function StudentRecords() {
  const navigate = useNavigate();
  const { hsk } = useApp();
  const { user, patchMe } = useAuth();
  const isGuest = !user;
  const { modal, open: openTranscript, close: closeTranscript, retry: retryTranscript, getCached } = useTranscriptDetail();

  // 登录用户：资料来自云端账号；游客：本地匿名资料
  const [profile, setProfile] = useState(() =>
    user
      ? { id: user.id, nickname: user.nickname || user.username, hsk: user.hsk }
      : getStudentProfile()
  );
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const [filterModule, setFilterModule] = useState("全部");
  const [filterScore, setFilterScore] = useState("全部");
  const [cloudRecords, setCloudRecords] = useState(null); // null = 加载中

  // 登录用户：云端资料变化时同步 profile（昵称编辑、HSK 切换）
  useEffect(() => {
    if (user) {
      setProfile({ id: user.id, nickname: user.nickname || user.username, hsk: user.hsk });
    }
  }, [user?.id, user?.nickname, user?.hsk]);

  // 登录用户：从云端拉取练习记录
  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    recordApi.mine()
      .then(({ records }) => { if (!cancelled) setCloudRecords(records); })
      .catch(err => {
        console.warn("[StudentRecords] 云端记录获取失败:", err.message);
        if (!cancelled) setCloudRecords([]);
      });
    return () => { cancelled = true; };
  }, [isGuest, user?.id]);

  const allRecords = useMemo(
    () => (isGuest ? getStudentRecords(profile.id) : (cloudRecords || [])),
    [isGuest, profile.id, cloudRecords]
  );

  const records = useMemo(() => {
    let rs = allRecords;
    if (filterModule !== "全部") rs = rs.filter(r => r.module === filterModule);
    if (filterScore === "≥80") rs = rs.filter(r => r.score >= 80);
    if (filterScore === "60-79") rs = rs.filter(r => r.score >= 60 && r.score < 80);
    if (filterScore === "<60") rs = rs.filter(r => r.score > 0 && r.score < 60);
    return rs;
  }, [allRecords, filterModule, filterScore]);

  const stats = useMemo(() => getStudentStats(allRecords), [allRecords]);
  const weakDims = useMemo(() => getWeakDimensions(allRecords), [allRecords]);
  const recommendations = useMemo(() => getRecommendedExercises(allRecords), [allRecords]);
  const radar = useMemo(() => getRadarDimensions(allRecords), [allRecords]);
  const weakOnly = weakDims.filter(w => w.isWeak);

  const handleSaveNickname = async () => {
    const name = inputRef.current?.value.trim() || profile.nickname || String(profile.id);
    if (isGuest) {
      setStudentNickname(name);
    } else {
      try {
        await patchMe({ nickname: name });
      } catch (err) {
        console.warn("[StudentRecords] 昵称保存失败:", err.message);
      }
    }
    setProfile(p => ({ ...p, nickname: name }));
    setEditing(false);
  };

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);   // { done, total } | null

  // 导出当前筛选出的记录。登录用户的列表只有 messageCount，对话由 hydrateRecords
  // 逐条按需拉取（拉不到的保留元信息）。上限见 exporters 的 EXPORT_LIMIT。
  const handleExportAll = async () => {
    setExporting(true);
    const picked = records.slice(0, EXPORT_LIMIT);
    setExportProgress({ done: 0, total: picked.length });
    try {
      const full = await hydrateRecords(picked, {
        getCached,
        onProgress: (done, total) => setExportProgress({ done, total }),
      });
      exportRecordsJson(full, { scope: "全部", label: displayName });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const exportableCount = records.length;
  const displayName = profile.nickname || profile.id;
  const moduleList = useMemo(() => {
    return ["全部", ...new Set(allRecords.map(r => r.module))];
  }, [allRecords]);

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
              {String(displayName)[0]}
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
                {isGuest ? "游客模式" : (user.role === "teacher" ? "教师" : "学生")}
                {" · "}HSK {profile.hsk || hsk || "未设置"} · 累计练习 {stats.daysSinceFirst || 0} 天
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

          {/* ── 能力雷达图：五维可视化成长 ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 10 }}>
              能力雷达图
              <span style={{ fontSize: 12, color: "#aaa", marginLeft: 6, fontWeight: 400 }}>
                发音 · 语法 · 词汇量 · 流利度 · 写作逻辑
              </span>
            </div>
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #f0efe8",
              padding: "24px 24px 18px", display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              <AbilityRadar data={radar} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 14 }}>
                {radar.map(d => (
                  <div key={d.key} style={{
                    padding: "5px 12px", borderRadius: 14, fontSize: 12,
                    background: "#FAFAF7", border: "1px solid #f0efe8", color: "#888",
                  }}>
                    {d.label}
                    <b style={{ color: d.value == null ? "#ccc" : "#D4413A", marginLeft: 4 }}>{d.value ?? "—"}</b>
                    {d.count > 0 && <span style={{ fontSize: 10, color: "#bbb", marginLeft: 3 }}>×{d.count}</span>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 10 }}>
                每次练习后自动更新 · 完成对应模块练习即可点亮维度
              </div>
            </div>
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

          {/* ── 导出 ── */}
          {records.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 10, gap: 4 }}>
              <button onClick={handleExportAll} disabled={exporting} style={{
                background: "none", border: "1px solid #e0dcd0", borderRadius: 14,
                padding: "6px 14px", fontSize: 12, color: exporting ? "#ccc" : "#888",
                cursor: exporting ? "default" : "pointer", fontFamily: "inherit",
              }}>
                {exporting
                  ? (exportProgress ? `导出中 ${exportProgress.done}/${exportProgress.total}…` : "导出中…")
                  : "⬇ 导出记录 JSON"}
              </button>
              {/* 上限必须说出来：静默截断对科研数据不可接受 */}
              {exportableCount > EXPORT_LIMIT && (
                <div style={{ fontSize: 11, color: "#D4413A" }}>
                  共 {exportableCount} 条，本次只导出最近 {EXPORT_LIMIT} 条
                </div>
              )}
            </div>
          )}

          {/* ── 练习记录列表 ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {cloudRecords === null && !isGuest && (
              <div style={{ textAlign: "center", padding: 32, color: "#bbb", fontSize: 14 }}>
                加载中…
              </div>
            )}
            {records.length === 0 && cloudRecords !== null && (
              <div style={{ textAlign: "center", padding: 32, color: "#bbb", fontSize: 14 }}>
                暂无记录。完成一次练习后这里会出现数据。
              </div>
            )}
            {records.map(r => {
              const canOpen = hasTranscript(r);
              const color = moduleColor(r.module);
              // 补交的记录可能没评上分（评分请求失败但对话保住了），显示「待评」而非红色 0
              const ungraded = canOpen && !(r.score > 0);
              return (
                <div key={r.id}
                  onClick={() => canOpen && openTranscript(r)}
                  onMouseEnter={e => { if (canOpen) e.currentTarget.style.borderColor = color + "80"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#f0efe8"; }}
                  style={{
                    background: "#fff", borderRadius: 14, border: "1px solid #f0efe8",
                    padding: "14px 18px", display: "flex", alignItems: "center", gap: 14,
                    cursor: canOpen ? "pointer" : "default", transition: "border-color 0.2s",
                  }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: ungraded ? "#F5F5F0" : r.score >= 80 ? "#EDFAF3" : r.score >= 60 ? "#FFF8ED" : "#FDF0EF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: ungraded ? 10 : 14, fontWeight: 700,
                    color: ungraded ? "#aaa" : r.score >= 80 ? "#2DAA6E" : r.score >= 60 ? "#E8A838" : "#D4413A",
                  }}>
                    {ungraded ? "待评" : r.score}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
                      {r.scenario || r.module}
                      {canOpen && (
                        <span style={{ fontSize: 10, color: "#bbb", fontWeight: 400, marginLeft: 6 }}>
                          💬 {messageCount(r)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                      <span style={{ color, fontWeight: 500 }}>{r.module}</span>
                      {" · "}{formatRecordDate(r)}
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
              );
            })}
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
                  else if (rec.action.type === "drill") navigate("/oral/pronunciation/daily");
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

      {/* ── 完整对话回看 ── */}
      <TranscriptModal
        record={modal?.record}
        messages={modal?.messages}
        loading={modal?.loading}
        error={modal?.error}
        onRetry={retryTranscript}
        onClose={closeTranscript}
        onExport={() => exportRecordsJson([modal.record], { scope: "单条", label: displayName })}
      />
    </div>
  );
}
