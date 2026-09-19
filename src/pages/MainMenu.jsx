import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi, taskApi } from "../utils/api.js";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { MenuItem } from "../components/MenuItem.jsx";

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
          {user && user.role === "student" && myTasks && myTasks.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                background: "linear-gradient(135deg, #7B4FA3, #9B59B6)", borderRadius: 16,
                padding: "16px 20px", color: "#fff", display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  🎯 我的任务
                  <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 400, marginLeft: 6 }}>老师发布的练习任务 · 完成自动更新</span>
                </div>
                {myTasks.slice(0, 3).map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                    <div style={{ width: 110, height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min((t.count / t.targetCount) * 100, 100)}%`, height: "100%", background: "#fff", borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <span style={{ minWidth: 46, textAlign: "right", fontWeight: 700 }}>{t.done ? "✅ " : ""}{t.count}/{t.targetCount}</span>
                  </div>
                ))}
              </div>
            </div>
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
