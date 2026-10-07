import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi, taskApi } from "../utils/api.js";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

// ── 我的任务卡片用的小工具 ──

// 任务模块 → 对应练习入口，学生点「去练习」直接跳到那个模块
const TASK_MODULE_ROUTES = {
  "生活情境": "/oral/scenes",
  "自由对话": "/oral/free",
  "发音测评": "/oral/pronunciation",
  "造句练习": "/written/drill/sentence",
  "写作辅导": "/written",
  "文化文游": "/culture",
};

// 距截止天数 + 绝对日期。剩余不足 24 小时按「今天截止」显示 ——
// 学生端 /mine 只返回未过期任务，纯按 ceil 算天数的话这一档永远不会出现。
function taskDeadline(endAt) {
  const end = new Date(endAt);
  if (!endAt || Number.isNaN(end.getTime())) return null;
  const msLeft = end.getTime() - Date.now();
  const date = `${end.getMonth() + 1}月${end.getDate()}日`;
  if (msLeft <= 0) return { daysLeft: 0, label: `已截止（${date}）` };
  const daysLeft = Math.max(1, Math.ceil(msLeft / 86400000));
  return {
    daysLeft,
    label: msLeft < 86400000 ? `今天截止（${date}）` : `剩 ${daysLeft} 天 · ${date}截止`,
  };
}

// 学生主页的「我的任务」卡。纯展示：任务由父组件取好后传进来，
// 这样 SSR harness 能直接喂 props 渲染（useEffect 在 SSR 下不执行，父组件里跑不出数据）。
export function MyTasksCard({ tasks, onGo }) {
  const [showAll, setShowAll] = useState(false);
  if (!tasks || tasks.length === 0) return null;
  const visible = showAll ? tasks : tasks.slice(0, 3);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        background: "linear-gradient(135deg, #7B4FA3, #9B59B6)", borderRadius: 16,
        padding: "16px 20px", color: "#fff",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          🎯 我的任务（{tasks.length}）
          <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 400, marginLeft: 6 }}>老师发布的练习任务 · 完成自动更新</span>
        </div>
        {visible.map((t, i) => {
          const dl = taskDeadline(t.endAt);
          const route = TASK_MODULE_ROUTES[t.module];
          const pct = Math.min(100, Math.round((t.count / Math.max(t.targetCount, 1)) * 100));
          const urgent = !t.done && dl && dl.daysLeft <= 1;
          return (
            <div key={t.id} style={{
              paddingTop: i === 0 ? 0 : 12, marginTop: i === 0 ? 0 : 12,
              borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.22)",
            }}>
              {/* 标题 + 直达入口 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>{t.title}</span>
                {route && (
                  <button onClick={() => onGo(route)} style={{
                    flexShrink: 0, cursor: "pointer", fontFamily: "inherit",
                    border: "1px solid rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.14)",
                    color: "#fff", borderRadius: 12, padding: "4px 10px", fontSize: 11,
                  }}>
                    去练习 →
                  </button>
                )}
              </div>
              {/* 明细：模块/场景 · 目标次数 · 截止 */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 11 }}>
                <span style={{ background: "rgba(255,255,255,0.18)", borderRadius: 8, padding: "2px 8px" }}>
                  {t.module}{t.scenario ? ` · ${t.scenario}` : ""}
                </span>
                <span style={{ background: "rgba(255,255,255,0.18)", borderRadius: 8, padding: "2px 8px" }}>
                  目标 {t.targetCount} 次
                </span>
                {dl && (
                  <span style={{
                    borderRadius: 8, padding: "2px 8px", fontWeight: urgent ? 700 : 400,
                    background: urgent ? "rgba(255,214,102,0.3)" : "rgba(255,255,255,0.18)",
                  }}>
                    {dl.label}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#fff", borderRadius: 3, transition: "width 0.4s" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {t.done ? "✅ " : ""}{t.count}/{t.targetCount} 次
                </span>
              </div>
            </div>
          );
        })}
        {tasks.length > 3 && (
          <div onClick={() => setShowAll(v => !v)} style={{
            marginTop: 12, paddingTop: 10, textAlign: "center", fontSize: 11, cursor: "pointer",
            borderTop: "1px solid rgba(255,255,255,0.22)", opacity: 0.9,
          }}>
            {showAll ? "收起任务 ▲" : `展开全部 ${tasks.length} 个任务 ▼`}
          </div>
        )}
      </div>
    </div>
  );
}

function UserBar({ onLogout }) {
  const { user, guest } = useAuth();
  const navigate = useNavigate();
  const { hsk: hskLevel } = useApp();
  // 教师端首页已有大号班级码卡片，这里只给学生显示
  const cls = user?.role === "student" ? user.class : null;
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #f0efe8",
      padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: user ? "linear-gradient(135deg, #D4413A, #9B59B6)" : "#e8e6dd",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 17, color: "#fff", fontWeight: 700,
      }}>
        {user ? (user.nickname || user.username)[0] : "🙂"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>
            {user ? (user.nickname || user.username) : "游客模式"}
          </span>
          {user && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
              background: user.role === "teacher" ? "#F5F0FA" : "#EEF4FB",
              color: user.role === "teacher" ? "#9B59B6" : "#4A90D9",
            }}>
              {user.role === "teacher" ? "教师" : "学生"}
            </span>
          )}
          {cls?.code && (
            <span
              title="我的班级码 · 在用户中心可换班或退出"
              style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                background: "#F7F9FC", color: "#4A90D9", fontFamily: "monospace", letterSpacing: 1,
              }}>
              班级码 {cls.code}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>
          {user ? (user.role === "teacher" ? "班级管理 · 学情分析" : `HSK ${user.hsk || hskLevel || "未设置"}`) : "练习数据仅保存在本机"}
        </div>
      </div>
      {user ? (
        <>
          <button onClick={() => navigate("/user-center")}
            style={{
              background: "none", border: "1px solid #e0dcd0", borderRadius: 8, cursor: "pointer",
              padding: "6px 12px", fontSize: 12, color: "#888", fontFamily: "inherit",
            }}>
            👤 用户中心
          </button>
          <button onClick={onLogout}
            style={{
              background: "none", border: "1px solid #e0dcd0", borderRadius: 8, cursor: "pointer",
              padding: "6px 12px", fontSize: 12, color: "#888", fontFamily: "inherit",
            }}>
            退出登录
          </button>
        </>
      ) : (
        <button onClick={() => navigate("/login")}
          style={{
            background: "#D4413A", border: "none", borderRadius: 8, cursor: "pointer",
            padding: "6px 14px", fontSize: 12, color: "#fff", fontWeight: 600, fontFamily: "inherit",
          }}>
          登录 / 注册
        </button>
      )}
    </div>
  );
}

// ── 教师主页：班级码 + 学情概览，无学生练习模块 ──
function TeacherHome({ onOpenAbout }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [hovered, setHovered] = useState(null);
  const [classInfo, setClassInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authApi.me()
      .then(({ class: c }) => { if (!cancelled) setClassInfo(c); })
      .catch(err => console.warn("[TeacherHome] 班级信息获取失败:", err.message));
    return () => { cancelled = true; };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="SpeakWise 教师端" subtitle="班级管理" onBack={null} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <UserBar onLogout={handleLogout} />

          {/* ── 班级码卡片 ── */}
          <div style={{
            background: "linear-gradient(135deg, #7B4FA3, #9B59B6)", borderRadius: 18,
            padding: "24px 28px", marginBottom: 20, color: "#fff",
          }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>我的班级 · 班级码</div>
            <div style={{
              fontSize: 34, fontWeight: 800, letterSpacing: 8, fontFamily: "monospace",
              textAlign: "center", margin: "4px 0 12px",
            }}>
              {classInfo?.code || "———"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, textAlign: "center" }}>
              学生注册时输入此码即可加入班级 · 当前 {classInfo?.members?.length ?? 0} 名学生
            </div>
          </div>

          {/* ── 学情概览入口 ── */}
          <MenuItem
            item={{ id: "teacher", title: "学情概览", titleEn: "Class Dashboard", icon: "📊", color: "#9B59B6", bg: "#F5F0FA", desc: "班级练习数据、问题诊断与教学建议" }}
            onClick={() => navigate("/teacher")}
            hovered={hovered} onHover={setHovered}
          />

          <div onClick={onOpenAbout} className="footer-link" style={{ marginTop: 32 }}>关于 SpeakWise SRTP 项目</div>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#aaa" }}>受国家级/江苏省大学生创新训练计划支持</div>
        </div>
      </PageWrap>
    </div>
  );
}

// ── 学生/游客主页 ──
function StudentHome({ onOpenAbout }) {
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp();
  const { user, guest, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // ── 我的任务：教师发布的练习任务（仅登录学生）──
  const [myTasks, setMyTasks] = useState(null);
  useEffect(() => {
    if (!user || user.role !== "student") return;
    let cancelled = false;
    taskApi.mine()
      .then(({ tasks }) => { if (!cancelled) setMyTasks(tasks); })
      .catch(err => {
        console.warn("[MainMenu] 任务获取失败:", err.message);
        if (!cancelled) setMyTasks([]);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <TopBar title="SpeakWise 主菜单" hskLevel={hskLevel} onChangeHSK={onChangeHSK} onBack={null} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "40px 0" }}>
          <UserBar onLogout={handleLogout} />

          {/* ── 我的任务：任务进度卡 ── */}
          {user && user.role === "student" && myTasks && (
            <MyTasksCard tasks={myTasks} onGo={navigate} />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MenuItem item={{ id: "oral", title: "口语训练", titleEn: "Speaking", icon: "🗣️", color: "#4A90D9", bg: "#EEF4FB", desc: "场景模拟与发音评测" }} onClick={() => navigate("/oral")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "written", title: "写作辅导", titleEn: "Writing", icon: "✍️", color: "#E8A838", bg: "#FFF8ED", desc: "AI 批改段落与短文" }} onClick={() => navigate("/written")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "manual", title: "学习手册", titleEn: "Study Manual", icon: "📖", color: "#D4413A", bg: "#FDF0EF", desc: "核心语法与词汇系统复习" }} onClick={() => navigate("/manual")} hovered={hovered} onHover={setHovered} />
            <MenuItem item={{ id: "culture", title: "文化文游", titleEn: "Cultural Game", icon: "📜", color: "#9B59B6", bg: "#F5F0FA", desc: "历史文化互动小说" }} onClick={() => navigate("/culture")} hovered={hovered} onHover={setHovered} />
          </div>

          {/* ── 学习档案：明显入口 ── */}
          <div style={{ marginTop: 20 }}>
            <MenuItem
              item={{ id: "records", title: "我的练习记录", titleEn: "My Records", icon: "📒", color: "#2DAA6E", bg: "#EDFAF3", desc: "学习档案 · 练习统计、弱项追踪与个性化推荐" }}
              onClick={() => navigate("/student/records")}
              hovered={hovered} onHover={setHovered}
            />
          </div>

          <div onClick={onOpenAbout} className="footer-link">关于 SpeakWise SRTP 项目</div>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#aaa" }}>受国家级/江苏省大学生创新训练计划支持</div>
          <div style={{ textAlign: "center", marginTop: 2, fontSize: 11, color: "#bbb", fontStyle: "italic" }}>National Undergraduate Training Programs for Innovation</div>
          {/* 教师入口：仅游客可见（演示 mock 数据），学生登录不显示 */}
          {guest && (
            <div onClick={() => navigate("/teacher")} style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#bbb", cursor: "pointer" }}>教师支持端 · 学情概览</div>
          )}
        </div>
      </PageWrap>
    </div>
  );
}

export function MainMenu({ onOpenAbout }) {
  const { user } = useAuth();
  // 教师登录 → 教师专用主页；学生/游客 → 学习主页
  if (user?.role === "teacher") return <TeacherHome onOpenAbout={onOpenAbout} />;
  return <StudentHome onOpenAbout={onOpenAbout} />;
}
