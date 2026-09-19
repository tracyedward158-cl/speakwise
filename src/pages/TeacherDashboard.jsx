import { useState, useMemo, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi, recordApi, taskApi } from "../utils/api.js";
import { SCENARIOS } from "../data/scenarios.js";
import { TranscriptModal } from "../components/TranscriptModal.jsx";
import { useTranscriptDetail } from "../hooks/useTranscriptDetail.js";
import { moduleColor } from "../data/moduleMeta.js";
import { hasTranscript, messageCount, formatRecordDate } from "../utils/transcript.js";
import { exportRecordsJson, hydrateRecords, EXPORT_LIMIT } from "../utils/exporters.js";
import {
  MOCK_RECORDS, getAllRecords, getClassOverview, getModulePerformance,
  getCommonProblems, getTeachingSuggestions, clearRecords, clearDrafts,
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

const TASK_MODULES = ["生活情境", "自由对话", "发音测评", "造句练习", "写作辅导", "文化文游"];

export function TeacherDashboard() {
  const navigate = useNavigate();
  const { user, guest } = useAuth();
  const isTeacher = user?.role === "teacher";

  // ⚠️ hook 必须在下面那个早返回之前调用，否则用户加载完成后
  //    hooks 数量变化会触发 React 的 "Rendered fewer hooks" 错误
  const { modal, open: openTranscript, close: closeTranscript, retry: retryTranscript, getCached } = useTranscriptDetail();

  // ── 一键导出（科研用）──
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);   // { done, total } | null
  const [exportResult, setExportResult] = useState(null);       // { count, transcriptCount } | null
  const [exportError, setExportError] = useState("");

  // 学生登录访问教师端 → 重定向主菜单（路由层已拦截，组件层兜底）
  if (user && !isTeacher) return <Navigate to="/main" replace />;

  const [refreshKey, setRefreshKey] = useState(0);

  // 教师：班级信息（班级码 + 成员）+ 本班记录；游客：本地 mock 演示
  const [classInfo, setClassInfo] = useState(null);
  const [cloudRecords, setCloudRecords] = useState(null); // null = 加载中

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    Promise.all([authApi.me(), recordApi.classRecords()])
      .then(([{ class: cls }, { records }]) => {
        if (cancelled) return;
        setClassInfo(cls);
        setCloudRecords(records);
      })
      .catch(err => {
        console.warn("[TeacherDashboard] 班级数据获取失败:", err.message);
        if (!cancelled) setCloudRecords([]);
      });
    return () => { cancelled = true; };
  }, [isTeacher, refreshKey]);

  // ── 任务发布 ──
  const [tasks, setTasks] = useState(null); // null = 加载中
  const [taskForm, setTaskForm] = useState({ title: "", module: "生活情境", scenario: "", targetCount: 3, days: 7 });
  const [creating, setCreating] = useState(false);
  const [taskError, setTaskError] = useState("");

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    taskApi.list()
      .then(({ tasks: list }) => { if (!cancelled) setTasks(list); })
      .catch(err => {
        console.warn("[TeacherDashboard] 任务列表获取失败:", err.message);
        if (!cancelled) setTasks([]);
      });
    return () => { cancelled = true; };
  }, [isTeacher, refreshKey]);

  const handleCreateTask = async () => {
    if (!taskForm.title.trim() || creating) return;
    setCreating(true);
    setTaskError("");
    try {
      await taskApi.create(taskForm);
      setTaskForm({ title: "", module: "生活情境", scenario: "", targetCount: 3, days: 7 });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setTaskError(err.message || "发布失败，请重试");
    }
    setCreating(false);
  };

  const handleDeleteTask = async (id) => {
    try {
      await taskApi.remove(id);
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.warn("[TeacherDashboard] 删除任务失败:", err.message);
    }
  };

  // 游客路径：本地真实记录 + mock（原有行为）
  const guestRecords = useMemo(() => getAllRecords(), [refreshKey]);
  const isDemo = !isTeacher || (cloudRecords !== null && cloudRecords.length === 0);
  const records = useMemo(() => {
    if (isTeacher) {
      // 加载中显示空数据；本班暂无记录时展示演示数据
      if (cloudRecords === null) return [];
      return cloudRecords.length > 0 ? cloudRecords : MOCK_RECORDS;
    }
    return guestRecords;
  }, [isTeacher, cloudRecords, guestRecords]);

  const overview = useMemo(() => getClassOverview(records), [records]);
  const modules = useMemo(() => getModulePerformance(records), [records]);
  const problems = useMemo(() => getCommonProblems(records), [records]);
  const suggestions = useMemo(() => getTeachingSuggestions(problems), [problems]);

  // 导出的是「真实数据源」，不是页面上展示的 records —— 本班暂无记录时页面会
  // 回退到 MOCK_RECORDS 演示，那批编造的数据绝不能进导出文件。
  const exportSource = isTeacher ? (cloudRecords || []) : guestRecords;
  const exportableCount = exportSource.length;

  const handleExport = async () => {
    if (exporting || !exportableCount) return;
    setExporting(true);
    setExportError("");
    setExportResult(null);
    setExportProgress({ done: 0, total: exportableCount });
    try {
      const full = await hydrateRecords(exportSource, {
        getCached,
        onProgress: (done, total) => setExportProgress({ done, total }),
      });
      const payload = exportRecordsJson(full, {
        scope: isTeacher ? "班级" : "本地",
        label: classInfo?.code || "",
        includeClient: !isTeacher,
        extra: isTeacher ? {
          class: classInfo
            ? { id: classInfo.id, code: classInfo.code, memberCount: classInfo.members?.length ?? 0 }
            : null,
          exportedBy: { id: user?.id, nickname: user?.nickname || user?.username, role: user?.role },
        } : null,
      });
      setExportResult({ count: payload.recordCount, transcriptCount: payload.transcriptCount });
    } catch (err) {
      setExportError(err.message || "导出失败，请重试");
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC', sans-serif" }}>
      <TopBar title="教师支持端" subtitle="学情概览" onBack={() => navigate("/main")} />
      <PageWrap maxWidth={860}>
        <div style={{ padding: "32px 0 80px" }}>

          {/* ── 班级信息条（教师）── */}
          {isTeacher && (
            <div style={{
              background: "#F5F0FA", borderRadius: 14, border: "1px solid #e8dcf2",
              padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{ fontSize: 22 }}>🏫</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#7B4FA3" }}>
                  我的班级 · 班级码 <span style={{ letterSpacing: 2, fontSize: 16 }}>{classInfo?.code || "———"}</span>
                </div>
                <div style={{ fontSize: 12, color: "#a888c4", marginTop: 2 }}>
                  学生凭此码注册即可加入班级 · 当前 {classInfo?.members?.length ?? 0} 名学生
                </div>
              </div>
            </div>
          )}

          {/* ── 1. 班级概览 ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>
              班级概览
              {isDemo && <span style={{ fontSize: 11, color: "#bbb", marginLeft: 8 }}>（演示数据）</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <StatCard label="参与学生" value={overview.studentCount} sub="人" color="#4A90D9" />
              <StatCard label="练习总次数" value={overview.totalExercises} sub="次" color="#E8A838" />
              <StatCard label="平均得分" value={overview.averageScore} sub="/100" color="#2DAA6E" />
              <StatCard label="覆盖模块" value={overview.completedModules.length} sub="个" color="#9B59B6" />
            </div>
          </div>

          {/* ── 数据导出（科研用）── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>
              数据导出
              <span style={{ fontSize: 11, color: "#bbb", marginLeft: 8, fontWeight: 400 }}>
                导出原始记录 JSON，供实验后分析
              </span>
            </div>
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #f0efe8",
              padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>
                  {isTeacher ? "本班练习记录" : "本机练习记录"} {exportableCount} 条
                </div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 4, lineHeight: 1.6 }}>
                  含完整对话、语音测评维度分（发音/声调/流利度/完整度）、问题与建议
                  {isTeacher && "；不含演示数据"}
                </div>
                {exportResult && (
                  <div style={{ fontSize: 11, color: "#2DAA6E", marginTop: 4 }}>
                    已导出 {exportResult.count} 条，其中含对话 {exportResult.transcriptCount} 条
                  </div>
                )}
                {exportError && <div style={{ fontSize: 11, color: "#D4413A", marginTop: 4 }}>{exportError}</div>}
                {/* 上限必须说出来：静默截断对科研数据不可接受 */}
                {exportableCount >= EXPORT_LIMIT && (
                  <div style={{ fontSize: 11, color: "#D4413A", marginTop: 4 }}>
                    已达服务端 {EXPORT_LIMIT} 条上限，可能仍有更早的记录未包含
                  </div>
                )}
              </div>
              <button onClick={handleExport} disabled={exporting || exportableCount === 0} style={{
                padding: "11px 22px", borderRadius: 12, border: "none", fontSize: 13, fontWeight: 600,
                fontFamily: "inherit", whiteSpace: "nowrap",
                background: exporting || exportableCount === 0 ? "#e8e6de" : "#7B4FA3",
                color: exporting || exportableCount === 0 ? "#aaa" : "#fff",
                cursor: exporting || exportableCount === 0 ? "default" : "pointer",
              }}>
                {exporting
                  ? (exportProgress ? `导出中 ${exportProgress.done}/${exportProgress.total}…` : "导出中…")
                  : "⬇ 导出 JSON"}
              </button>
            </div>
          </div>

          {/* ── 2. 任务发布 ── */}
          {isTeacher && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>
                任务发布
                <span style={{ fontSize: 11, color: "#bbb", marginLeft: 8, fontWeight: 400 }}>
                  发布口语任务，学生完成情况自动汇总
                </span>
              </div>

              {/* 发布表单 */}
              <div style={{ background: "#F5F0FA", borderRadius: 16, border: "1px solid #e8dcf2", padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder='任务标题，如"本周完成 3 次餐厅场景对话"'
                    style={{ flex: "1 1 240px", padding: "9px 14px", borderRadius: 10, border: "1px solid #e0dcd0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff" }} />
                  <select value={taskForm.module} onChange={e => setTaskForm(f => ({ ...f, module: e.target.value, scenario: "" }))}
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e0dcd0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#555" }}>
                    {TASK_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  {taskForm.module === "生活情境" && (
                    <select value={taskForm.scenario} onChange={e => setTaskForm(f => ({ ...f, scenario: e.target.value }))}
                      style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e0dcd0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#555" }}>
                      <option value="">不限场景</option>
                      {SCENARIOS.map(s => <option key={s.id} value={s.title}>{s.title}</option>)}
                    </select>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#a888c4" }}>目标</span>
                    <input type="number" min={1} max={30} value={taskForm.targetCount}
                      onChange={e => setTaskForm(f => ({ ...f, targetCount: Number(e.target.value) }))}
                      style={{ width: 50, padding: "8px", borderRadius: 10, border: "1px solid #e0dcd0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", textAlign: "center" }} />
                    <span style={{ fontSize: 12, color: "#a888c4" }}>次</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[{ d: 7, label: "一周" }, { d: 14, label: "两周" }, { d: 30, label: "一个月" }].map(o => (
                      <button key={o.d} onClick={() => setTaskForm(f => ({ ...f, days: o.d }))}
                        style={{
                          padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                          background: taskForm.days === o.d ? "#7B4FA3" : "#fff",
                          color: taskForm.days === o.d ? "#fff" : "#a888c4",
                          border: taskForm.days === o.d ? "none" : "1px solid #e8dcf2",
                        }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleCreateTask} disabled={creating || !taskForm.title.trim()}
                    style={{
                      padding: "9px 18px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600,
                      background: creating || !taskForm.title.trim() ? "#c9b8dd" : "#7B4FA3",
                      color: "#fff", cursor: creating ? "default" : "pointer",
                    }}>
                    {creating ? "发布中…" : "发布任务"}
                  </button>
                </div>
                {taskError && <div style={{ fontSize: 12, color: "#D4413A", marginTop: 8 }}>{taskError}</div>}
                <div style={{ fontSize: 11, color: "#a888c4", marginTop: 8 }}>
                  学生在对应模块每完成一次练习即计一次（周期内累计），达标自动汇总
                </div>
              </div>

              {/* 任务列表 + 完成汇总 */}
              {tasks === null && <div style={{ fontSize: 13, color: "#bbb", textAlign: "center", padding: 12 }}>任务加载中…</div>}
              {tasks !== null && tasks.length === 0 && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "20px", fontSize: 13, color: "#bbb", textAlign: "center" }}>
                  还没有发布过任务。发布第一个任务后，这里会显示每名学生的完成情况。
                </div>
              )}
              {tasks !== null && tasks.map(t => {
                const daysLeft = Math.max(0, Math.ceil((new Date(t.endAt).getTime() - Date.now()) / 86400000));
                const pct = t.totalStudents ? Math.round((t.doneCount / t.totalStudents) * 100) : 0;
                return (
                  <div key={t.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "16px 20px", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#333", flex: "1 1 200px", minWidth: 0 }}>{t.title}</span>
                      <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: "#F5F0FA", color: "#7B4FA3", fontWeight: 600 }}>
                        {t.module}{t.scenario ? ` · ${t.scenario}` : ""}
                      </span>
                      <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: "#EEF4FB", color: "#4A90D9", fontWeight: 600 }}>目标 {t.targetCount} 次</span>
                      <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: daysLeft <= 1 ? "#FDF0EF" : "#FFF8ED", color: daysLeft <= 1 ? "#D4413A" : "#E8A838", fontWeight: 600 }}>
                        {daysLeft === 0 ? "已到期" : `剩 ${daysLeft} 天`}
                      </span>
                      <button onClick={() => handleDeleteTask(t.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#ccc", padding: "2px 6px" }}>
                        🗑️
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1, height: 8, background: "#f0efe8", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#7B4FA3", borderRadius: 4, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#7B4FA3", whiteSpace: "nowrap" }}>{t.doneCount}/{t.totalStudents} 人完成</span>
                    </div>
                    {t.totalStudents === 0 && <div style={{ fontSize: 12, color: "#bbb" }}>班级暂无学生，学生加入后这里会显示完成明细。</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {t.progress.map(p => (
                        <div key={p.studentId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                          <span style={{ width: 100, color: "#666", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{p.nickname}</span>
                          <div style={{ flex: 1, height: 6, background: "#f0efe8", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min((p.count / p.targetCount) * 100, 100)}%`, height: "100%", background: p.done ? "#2DAA6E" : "#7B4FA3", borderRadius: 3, transition: "width 0.4s" }} />
                          </div>
                          <span style={{ width: 60, textAlign: "right", color: p.done ? "#2DAA6E" : "#888", fontWeight: p.done ? 700 : 400, whiteSpace: "nowrap" }}>
                            {p.count}/{p.targetCount} 次
                          </span>
                          <span style={{ width: 28, textAlign: "right" }}>{p.done ? "✅" : "⏳"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 3. 模块表现 ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 12 }}>模块表现</div>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", overflow: "hidden" }}>
              {modules.map((m, i) => {
                const color = moduleColor(m.module);
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
                {records.slice(0, 10).map((r, i) => {
                  const canOpen = hasTranscript(r);
                  const ungraded = canOpen && !(r.score > 0);
                  return (
                    <div key={r.id}
                      onClick={() => canOpen && openTranscript(r)}
                      onMouseEnter={e => { if (canOpen) e.currentTarget.style.background = "#FAFAF7"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      style={{
                        padding: "10px 0", borderBottom: i < Math.min(records.length, 10) - 1 ? "1px solid #f7f6f1" : "none",
                        display: "flex", alignItems: "center", gap: 10,
                        cursor: canOpen ? "pointer" : "default",
                      }}>
                      <div style={{ width: 34, fontSize: 11, fontWeight: 600, color: moduleColor(r.module), flexShrink: 0 }}>
                        {r.nickname || r.studentId}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>
                          {r.scenario || r.module}
                          {canOpen && (
                            <span style={{ fontSize: 10, color: "#bbb", fontWeight: 400, marginLeft: 6 }}>
                              💬 {messageCount(r)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#bbb" }}>{r.module} · {formatRecordDate(r)}</div>
                      </div>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: ungraded ? "#F5F5F0" : r.score >= 80 ? "#EDFAF3" : r.score >= 60 ? "#FFF8ED" : "#FDF0EF",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: ungraded ? 10 : 12, fontWeight: 700, flexShrink: 0,
                        color: ungraded ? "#aaa" : r.score >= 80 ? "#2DAA6E" : r.score >= 60 ? "#E8A838" : "#D4413A",
                      }}>
                        {ungraded ? "待评" : r.score}
                      </div>
                    </div>
                  );
                })}
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
            {isTeacher
              ? <>数据来自本班学生云端练习记录 · 学生加入班级后自动更新</>
              : <>当前为学情支持原型 · 基于学生练习记录生成 · <span onClick={() => { clearRecords(); clearDrafts(); setRefreshKey(k => k + 1); }} style={{ cursor: "pointer", textDecoration: "underline" }}>重置记录</span></>}
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
        onExport={() => exportRecordsJson([modal.record], {
          scope: "学生",
          label: modal.record.nickname || modal.record.studentId,
          includeClient: false,
        })}
      />
    </div>
  );
}
