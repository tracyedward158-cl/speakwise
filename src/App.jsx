import { useState, useEffect } from "react";
import "./App.css";
import { WelcomeModal } from "./components/WelcomeModal.jsx";
import { HSKSelect } from "./pages/HSKSelect.jsx";
import { MainMenu } from "./pages/MainMenu.jsx";
import { OralMenu } from "./pages/OralMenu.jsx";
import { SceneList } from "./pages/SceneList.jsx";
import { WrittenMenu } from "./pages/WrittenMenu.jsx";
import { DrillView } from "./pages/DrillView.jsx";
import { ChatView } from "./pages/ChatView.jsx";
import { StudyManual } from "./pages/StudyManual.jsx";
import { buildFreeModule, buildWritingChat } from "./utils/moduleBuilders.js";

export default function App() {
  const [isMounted, setIsMounted] = useState(false);
  const [hsk, setHsk] = useState(null);
  const [viewMode, setViewMode] = useState("HPE");
  const [showWelcome, setShowWelcome] = useState(true);
  const [view, setView] = useState("hsk");

  useEffect(() => {
    const savedMode = localStorage.getItem("viewMode");
    if (savedMode) setViewMode(savedMode);
    setIsMounted(true);
  }, []);

  useEffect(() => { if (isMounted && hsk) localStorage.setItem("hsk", hsk); }, [hsk, isMounted]);
  useEffect(() => { if (isMounted) localStorage.setItem("viewMode", viewMode); }, [viewMode, isMounted]);

  const closeWelcome = () => setShowWelcome(false);
  const openWelcomeModal = () => setShowWelcome(true);

  const [chatMod, setChatMod] = useState(null);
  const [chatVoice, setChatVoice] = useState(true);
  const [chatParent, setChatParent] = useState("oral");
  const [drillType, setDrillType] = useState(null);
  const [drillParent, setDrillParent] = useState("oral");

  const openChat = (m, v, p) => { setChatMod(m); setChatVoice(v); setChatParent(p); setView("chat"); };
  const openDrill = (t, p) => { setDrillType(t); setDrillParent(p); setView("drill"); };

  const oralNav = (id) => {
    if (id === "scenes") setView("scenes");
    else if (id === "assess") openDrill("pronunciation", "oral");
    else if (id === "free") openChat(buildFreeModule(hsk), true, "oral");
  };

  const sceneSelect = (s) =>
    openChat({ ...s, system: `SCENARIO: ${s.role}\nStay in character, 2-3 sentences, correct gently. No markdown.`, greeting: s.greeting[hsk] || s.greeting["4-6"] }, true, "scenes");

  const writingSelect = (m) => {
    if (m.id === "sentence") openDrill("sentence", "written");
    else openChat(buildWritingChat(m.id, hsk), false, "written");
  };

  if (!isMounted) return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;

  return (
    <>
      {showWelcome && <WelcomeModal onClose={closeWelcome} />}
      {view === "hsk" && <HSKSelect onSelect={l => { setHsk(l); setView("main"); }} />}
      {view === "main" && <MainMenu hskLevel={hsk} onChangeHSK={setHsk} onNav={id => setView(id === "oral" ? "oral" : id === "written" ? "written" : "manual")} onOpenAbout={openWelcomeModal} />}
      {view === "oral" && <OralMenu hskLevel={hsk} onChangeHSK={setHsk} onBack={() => setView("main")} onNav={oralNav} />}
      {view === "scenes" && <SceneList hskLevel={hsk} onChangeHSK={setHsk} onBack={() => setView("oral")} onSelect={sceneSelect} mode={viewMode} onChangeMode={setViewMode} />}
      {view === "written" && <WrittenMenu hskLevel={hsk} onChangeHSK={setHsk} onBack={() => setView("main")} onSelect={writingSelect} />}
      {view === "manual" && <StudyManual hskLevel={hsk} onChangeHSK={setHsk} onBack={() => setView("main")} />}
      {view === "chat" && chatMod && <ChatView module={chatMod} hskLevel={hsk} onBack={() => setView(chatParent)} onChangeHSK={setHsk} showVoice={chatVoice} mode={viewMode} onChangeMode={setViewMode} />}
      {view === "drill" && <DrillView type={drillType} hskLevel={hsk} onBack={() => setView(drillParent)} onChangeHSK={setHsk} mode={viewMode} onChangeMode={setViewMode} />}
    </>
  );
}
