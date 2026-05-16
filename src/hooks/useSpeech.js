import { useState, useRef, useCallback } from "react";
import { clean } from "../utils/helpers.jsx";

const SRC = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef(null);

  const startListening = useCallback(cb => {
    if (!SRC) { alert("Use Chrome for voice."); return; }
    const x = new SRC();
    x.lang = "zh-CN";
    x.interimResults = false;
    x.continuous = false;
    x.onresult = e => { cb(e.results[0][0].transcript); setListening(false); };
    x.onerror = () => setListening(false);
    x.onend = () => setListening(false);
    recRef.current = x;
    x.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback((t, slow = false) => {
    const c = clean(t).replace(/\(.*?\)/g, "").replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, "");
    const sy = window.speechSynthesis;
    sy.cancel();
    const u = new SpeechSynthesisUtterance(c);
    u.lang = "zh-CN"; u.rate = slow ? 0.45 : 0.85;
    u.onstart = () => setSpeaking(true); u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    sy.speak(u);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { listening, speaking, startListening, stopListening, speak, stopSpeaking };
}
