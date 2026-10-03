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

  // 取消 = 这次说的不要了。和 stopListening 的关键区别是**绝不能触发结果回调**：
  // stop() 会把已经识别到的内容 finalize 并触发 onresult，而 ChatView 的 onresult
  // 回调里就是「写进输入框 + 立刻发送」—— 用 stop() 当取消等于还是把话说出去了。
  // abort() 不产生 result，但 Chrome 仍可能补发 error/end，所以先把回调摘干净。
  const cancelListening = useCallback(() => {
    const x = recRef.current;
    if (x) {
      x.onresult = null;
      x.onerror = null;
      x.onend = null;
      try { x.abort(); } catch { /* 还没真正 start 成功时 abort 会抛，忽略 */ }
    }
    recRef.current = null;
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

  return { listening, speaking, startListening, stopListening, cancelListening, speak, stopSpeaking };
}
