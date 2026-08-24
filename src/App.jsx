import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Onboarding from "./components/Onboarding.jsx";
import { useApp } from "./context/AppContext.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { Login } from "./pages/Login.jsx";
import { UserCenter } from "./pages/UserCenter.jsx";
import { HSKSelect } from "./pages/HSKSelect.jsx";
import { MainMenu } from "./pages/MainMenu.jsx";
import { OralMenu } from "./pages/OralMenu.jsx";
import { SceneList } from "./pages/SceneList.jsx";
import { WrittenMenu } from "./pages/WrittenMenu.jsx";
import { StudyManual } from "./pages/StudyManual.jsx";
import { CultureMenu } from "./pages/CultureMenu.jsx";
import { CultureGame } from "./pages/CultureGame.jsx";
import { TeacherDashboard } from "./pages/TeacherDashboard.jsx";
import { StudentRecords } from "./pages/StudentRecords.jsx";
import { ChatView } from "./pages/ChatView.jsx";
import { DrillView } from "./pages/DrillView.jsx";

// 未登录（且非游客）时重定向到登录页
function RequireAuth({ children }) {
  const { user, guest, loading } = useAuth();
  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;
  }
  if (!user && !guest) return <Navigate to="/login" replace />;
  return children;
}

// 应用主体路由（进入前已通过登录守卫）
// 教师：专用分支，不需要 HSK；学生/游客：需要 HSK 门槛
function AppRoutes({ onOpenAbout }) {
  const { hsk } = useApp();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  return (
    <Routes>
      <Route
        path="/"
        element={
          isTeacher ? <Navigate to="/main" replace /> :
          hsk ? <Navigate to="/main" replace /> : <HSKSelect />
        }
      />
      {isTeacher ? (
        <>
          <Route path="/main" element={<MainMenu onOpenAbout={onOpenAbout} />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/user-center" element={<UserCenter />} />
          <Route path="*" element={<Navigate to="/main" replace />} />
        </>
      ) : hsk ? (
        <>
          <Route path="/main" element={<MainMenu onOpenAbout={onOpenAbout} />} />
          {/* Oral section */}
          <Route path="/oral" element={<OralMenu />} />
          <Route path="/oral/scenes" element={<SceneList />} />
          <Route path="/oral/scene/:sceneId" element={<ChatView />} />
          <Route path="/oral/free" element={<ChatView />} />
          <Route path="/oral/drill/:type" element={<DrillView />} />
          {/* Written section */}
          <Route path="/written" element={<WrittenMenu />} />
          <Route path="/written/drill/:type" element={<DrillView />} />
          <Route path="/written/chat/:mode" element={<ChatView />} />
          {/* Other sections */}
          <Route path="/manual" element={<StudyManual />} />
          <Route path="/culture" element={<CultureMenu />} />
          <Route path="/culture/:chapterId" element={<CultureGame />} />
          <Route path="/student/records" element={<StudentRecords />} />
          <Route path="/user-center" element={<UserCenter />} />
          {/* 学生不可达 /teacher：未注册该路由 → 落到 * 重定向 /main */}
          <Route path="*" element={<Navigate to="/main" replace />} />
        </>
      ) : (
        <Route path="*" element={<Navigate to="/" replace />} />
      )}
    </Routes>
  );
}

export default function App() {
  const { isMounted, hsk, setHsk } = useApp();
  const { user, guest, patchMe } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("speakwise_onboarded")
  );

  const closeOnboarding = () => setShowOnboarding(false);
  const reopenOnboarding = () => {
    localStorage.removeItem("speakwise_onboarded");
    setShowOnboarding(true);
  };

  // ── HSK 同步 ──
  // 用户切换时：hsk 以云端账号为准（无 hsk 的账号回到 HSK 选择页）
  const prevUserId = useRef(undefined);
  useEffect(() => {
    const id = user ? user.id : undefined;
    if (prevUserId.current === id) return;
    prevUserId.current = id;
    if (user) setHsk(user.hsk || null);
  }, [user, setHsk]);

  // 本地 hsk 变化（HSK 选择页/TopBar 切换）→ 同步到云端
  useEffect(() => {
    if (user && hsk && hsk !== user.hsk) {
      patchMe({ hsk }).catch(err => console.warn("[hsk sync] 同步失败:", err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsk]);

  if (!isMounted) {
    return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;
  }

  return (
    <>
      {/* 引导页：登录/注册后再展示，游客同样可见 */}
      {showOnboarding && (user || guest) && <Onboarding onComplete={closeOnboarding} />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <AppRoutes onOpenAbout={reopenOnboarding} />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  );
}
