import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Onboarding from "./components/Onboarding.jsx";
import { useApp } from "./context/AppContext.jsx";
import { HSKSelect } from "./pages/HSKSelect.jsx";
import { MainMenu } from "./pages/MainMenu.jsx";
import { OralMenu } from "./pages/OralMenu.jsx";
import { SceneList } from "./pages/SceneList.jsx";
import { WrittenMenu } from "./pages/WrittenMenu.jsx";
import { StudyManual } from "./pages/StudyManual.jsx";
import { CultureMenu } from "./pages/CultureMenu.jsx";
import { CultureGame } from "./pages/CultureGame.jsx";
import { TeacherDashboard } from "./pages/TeacherDashboard.jsx";
import { ChatView } from "./pages/ChatView.jsx";
import { DrillView } from "./pages/DrillView.jsx";

export default function App() {
  const { isMounted, hsk } = useApp();
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("speakwise_onboarded")
  );

  const closeOnboarding = () => setShowOnboarding(false);
  const reopenOnboarding = () => {
    localStorage.removeItem("speakwise_onboarded");
    setShowOnboarding(true);
  };

  if (!isMounted) {
    return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;
  }

  return (
    <>
      {showOnboarding && <Onboarding onComplete={closeOnboarding} />}
      <Routes>
        <Route
          path="/"
          element={hsk ? <Navigate to="/main" replace /> : <HSKSelect />}
        />
        {hsk ? (
          <>
            <Route path="/main" element={<MainMenu onOpenAbout={reopenOnboarding} />} />
            {/* Oral section */}
            <Route path="/oral" element={<OralMenu />} />
            <Route path="/oral/scenes" element={<SceneList />} />
            <Route path="/oral/scenes/:sceneId" element={<ChatView />} />
            <Route path="/oral/chat/free" element={<ChatView />} />
            <Route path="/oral/drill/:type" element={<DrillView />} />
            {/* Written section */}
            <Route path="/written" element={<WrittenMenu />} />
            <Route path="/written/drill/:type" element={<DrillView />} />
            <Route path="/written/chat/paragraph" element={<ChatView />} />
            <Route path="/written/chat/essay" element={<ChatView />} />
            {/* Other sections */}
            <Route path="/manual" element={<StudyManual />} />
            <Route path="/culture" element={<CultureMenu />} />
            <Route path="/culture/:chapterId" element={<CultureGame />} />
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="*" element={<Navigate to="/main" replace />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/" replace />} />
        )}
      </Routes>
    </>
  );
}
