import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { HSK_PROMPT } from "../data/constants.js";
import { SCENARIOS } from "../data/scenarios.js";
import { useSpeech } from "../hooks/useSpeech.js";
import { renderChatBubble } from "../utils/helpers.jsx";
import { callAI } from "../utils/api.js";
import { buildFreeModule, buildWritingChat } from "../utils/moduleBuilders.js";

export function ChatView() {
  const navigate = useNavigate();
  const params = useParams();
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp();

  // Reconstruct module from URL params
  const module = useMemo(() => {
    if (params.sceneId) {
      const scene = SCENARIOS.find(s => s.id === params.sceneId);
      if (!scene) return buildFreeModule(hskLevel);
      return {
        ...scene,
        system: `SCENARIO: ${scene.role}\nStay in character, 2-3 sentences, correct gently. No markdown.`,
        greeting: scene.greeting[hskLevel] || scene.greeting["4-6"]
      };
    }
    if (params.mode) {
      return buildWritingChat(params.mode, hskLevel);
    }
    return buildFreeModule(hskLevel);
  }, [params.sceneId, params.mode, hskLevel]);

  // Writing chats have no voice; free chat and scenes do
  const showVoice = !params.mode;

  // Determine back target based on route hierarchy
  const onBack = useMemo(() => {
    if (params.sceneId) return () => navigate("/oral/scenes");
    if (params.mode) return () => navigate("/written");
    return () => navigate("/oral");  // free chat
  }, [params.sceneId, params.mode, navigate]);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const { listening, speaking, startListening, stopListening, speak, stopSpeaking } = useSpeech();

  useEffect(() => {
    const g = typeof module.greeting === "object" ? module.greeting[hskLevel] || module.greeting["4-6"] : module.greeting;
    setMessages([{ role: "assistant", content: g }]);
  }, [module.id, hskLevel]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const sys = () => `You are a Chinese language coach.\n${HSK_PROMPT[hskLevel]}\nROLE: ${module.system || module.role || ""}\nRULES: Stay in character, 2-3 sentences max. You MUST format your reply strictly in these 3 lines using exactly these prefixes:\n汉字: [Chinese Characters]\n拼音: [Pinyin]\n英文: [English Translation]\nDo not use markdown.`;

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const u = { role: "user", content: text.trim() };
    const up = [...messages, u];
    setMessages(up);
    setInput("");
    setLoading(true);
    try {
      const raw = await callAI(sys(), up.map(m => ({ role: m.role, content: m.content })), 800);
      setMessages(p => [...p, { role: "assistant", content: raw }]);
    } catch {
      setMessages(p => [...p, { role: "assistant", content: "汉字: 网络连接有点慢哦，请重试。\n拼音: Wǎngluò liánjiē yǒudiǎn màn o, qǐng chóngshì.\n英文: The network connection is a bit slow, please try again." }]);
    }
    setLoading(false);
  };

  const handleMic = () => { if (listening) { stopListening(); return; } startListening(t => { setInput(t); send(t); }); };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
      <TopBar title={module.title} subtitle={module.titleEn} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 120px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 640 }}>
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const parsed = isUser ? { ttsText: msg.content, ui: msg.content } : renderChatBubble(msg.content, mode, module.color);
            return (
              <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 14, alignItems: "flex-end", gap: 8, animation: "su 0.3s both" }}>
                {!isUser && <div style={{ width: 32, height: 32, borderRadius: "50%", background: module.bg || "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{module.icon}</div>}
                <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ padding: "12px 16px", background: isUser ? (module.color || "#4A90D9") : "#fff", color: isUser ? "#fff" : "#1a1a1a", borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px", fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", boxShadow: isUser ? "none" : "0 1px 3px rgba(0,0,0,0.04)", border: isUser ? "none" : "1px solid #f0efe8" }}>
                    {parsed.ui}
                  </div>
                  {!isUser && showVoice && (
                    <div style={{ display: "flex", gap: 10, opacity: 0.6, alignSelf: "flex-start", marginLeft: 4 }}>
                      <button onClick={() => speaking ? stopSpeaking() : speak(parsed.ttsText)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={speaking ? (module.color || "#E8A838") : "#888"}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
                        <span style={{ fontSize: 12, color: "#666" }}>{speaking ? "Stop" : "Play"}</span>
                      </button>
                      <button onClick={() => speak(parsed.ttsText, true)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: 10, fontSize: 11, color: "#666", fontWeight: 600 }}>慢速</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 0", animation: "su 0.3s both" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: module.bg || "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{module.icon}</div>
              <div style={{ background: "#fff", borderRadius: 16, padding: "12px 18px", border: "1px solid #f0efe8", display: "flex", gap: 5 }}>
                {[0, 1, 2].map(j => <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "#ccc", animation: `dp 1.2s ${j * 0.2}s infinite` }} />)}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 20px", background: "#fff", borderTop: "1px solid #f0efe8", display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 640 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send(input)} placeholder={showVoice ? "Type or tap mic..." : "Type here..."} style={{ flex: 1, padding: "14px 18px", borderRadius: 24, border: "1px solid #e8e6de", background: "#FAFAF7", fontSize: 15, outline: "none", color: "#1a1a1a", fontFamily: "inherit" }} />
          {showVoice && <button onClick={handleMic} style={{ width: 48, height: 48, borderRadius: "50%", background: listening ? (module.color || "#4A90D9") : "transparent", border: `2px solid ${module.color || "#4A90D9"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: listening ? "pulse 1.5s infinite" : "none", flexShrink: 0 }}><svg width="18" height="18" viewBox="0 0 24 24" fill={listening ? "#fff" : (module.color || "#4A90D9")}><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg></button>}
          <button onClick={() => send(input)} disabled={!input.trim() || loading} style={{ width: 48, height: 48, borderRadius: "50%", background: input.trim() ? (module.color || "#4A90D9") : "#e8e6de", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() ? "pointer" : "default", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg></button>
        </div>
      </div>
    </div>
  );
}
