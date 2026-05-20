import { useState, useRef, useEffect, useCallback } from "react";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { SENTENCE_BANK, PRONUNCIATION_BANK } from "../data/drills.js";
import { HSK_PROMPT } from "../data/constants.js";
import { useSpeech } from "../hooks/useSpeech.js";
import { clean, renderExampleText } from "../utils/helpers.jsx";
import { callAI, evaluatePronunciation } from "../utils/api.js";
import { createAudioRecorder } from "../utils/audioRecorder.js";
import { buildRecord, saveRecord } from "../utils/recordStore.js";

export function DrillView({ type, hskLevel, onBack, onChangeHSK, mode, onChangeMode }) {
  const bank = type === "sentence" ? SENTENCE_BANK[hskLevel] : PRONUNCIATION_BANK[hskLevel];
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState([]);
  const [done, setDone] = useState(false);
  const { listening, speaking, startListening, stopListening, speak, stopSpeaking } = useSpeech();
  const fbRef = useRef(null);
  const isSen = type === "sentence";
  const q = bank[idx];
  const total = bank.length;
  const color = isSen ? "#4A90D9" : "#7B6CF6";
  const bg = isSen ? "#EEF4FB" : "#F3F0FF";

  // Audio recorder for pronunciation mode (iFlytek API)
  const recorderRef = useRef(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => { if (feedback && fbRef.current) fbRef.current.scrollIntoView({ behavior: "smooth" }); }, [feedback]);

  // ── Sentence mode: submit text to AI (unchanged) ──
  const submitSentence = async (text) => {
    if (!text.trim() || loading) return;
    setInput(text.trim());
    setLoading(true);
    setFeedback(null);
    const sys = `Grade this Chinese sentence. Word: "${q.word}". Student wrote: "${text.trim()}". ${HSK_PROMPT[hskLevel]} Reply ONLY:\nSCORE: [0-100]\nFEEDBACK: [1 sentence]\nCORRECTION: [corrected version or "None"]`;
    try {
      const raw = await callAI(sys, [{ role: "user", content: text.trim() }], 300);
      const reply = clean(raw);
      const m = reply.match(/SCORE:\s*(\d+)/i);
      const score = m ? Math.min(parseInt(m[1]), 100) : 70;
      setFeedback({ text: reply.replace(/SCORE:\s*\d+\s*/i, "").trim(), score });
      setScores(p => [...p, score]);
      saveRecord(buildRecord({ module: "造句练习", scenario: q.word, score, hskLevel, problems: score < 70 ? ["语序错误", "词汇使用不当"] : score < 85 ? ["表达可更自然"] : [], suggestion: reply.replace(/SCORE:\s*\d+\s*/i, "").trim().slice(0, 80) }));
    } catch {
      setFeedback({ text: "网络稍有波动，请点击 'Next question' 尝试下一题哦~", score: 0 });
    }
    setLoading(false);
  };

  // ── Pronunciation mode: record audio → iFlytek API ──
  const startRecording = useCallback(async () => {
    try {
      const recorder = createAudioRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      setRecording(true);
    } catch (e) {
      console.error("Mic access failed:", e);
      alert("无法访问麦克风，请检查权限设置。");
    }
  }, []);

  const stopAndEvaluate = useCallback(async () => {
    if (!recorderRef.current) return;
    setRecording(false);
    setLoading(true);
    setFeedback(null);

    try {
      const recorder = recorderRef.current;
      recorder.stop();
      const wavBase64 = await recorder.getWavBase64();
      recorderRef.current = null;

      const result = await evaluatePronunciation(wavBase64, q.sentence, "sent");

      // Build feedback from iFlytek multi-dimension scores
      const overall = result.overall ?? 0;

      // Extract problems from per-word analysis
      const wordProblems = (result.words || [])
        .filter(w => w.readType > 0)
        .map(w => w.readType === 1 ? `"${w.word}"增读` : w.readType === 2 ? `"${w.word}"漏读` : `"${w.word}"发音偏差`);
      const dimProblems = [];
      if (result.tone < 70) dimProblems.push("声调不稳定");
      if (result.fluency < 70) dimProblems.push("流利度不足");
      if (result.integrity < 70) dimProblems.push("完整度不足");
      if (result.pronunciation < 70) dimProblems.push("发音不够清晰");
      if (result.warning?.some(w => w.code === 1004)) dimProblems.push("环境噪音");

      saveRecord(buildRecord({
        module: "发音测评", scenario: q.sentence, score: overall, hskLevel,
        dimensions: { pronunciation: result.pronunciation, tone: result.tone, fluency: result.fluency, completeness: result.integrity },
        problems: [...dimProblems, ...wordProblems].slice(0, 4),
        suggestion: overall >= 80 ? "发音较好，继续保持。" : overall >= 60 ? "建议重点练习发音和声调，多跟读模仿。" : "建议在安静环境下反复跟读，从简单句子开始练习。",
      }));

      setFeedback({
        type: "iflytek",
        overall,
        pronunciation: result.pronunciation,
        tone: result.tone,
        fluency: result.fluency,
        integrity: result.integrity,
        rhythm: result.rhythm,
        speed: result.speed,
        duration: result.duration,
        words: result.words || [],
        warning: result.warning,
        score: overall,
      });
      setScores(p => [...p, overall]);
    } catch (e) {
      console.error("Evaluation failed:", e);
      setFeedback({ type: "error", text: "评测服务暂时不可用，请稍后重试", score: 0 });
    }
    setLoading(false);
  }, [q.sentence]);

  const handleMic = () => {
    if (isSen) {
      if (listening) { stopListening(); return; }
      startListening(t => { setInput(t); submitSentence(t); });
    } else {
      if (recording) {
        stopAndEvaluate();
      } else {
        startRecording();
      }
    }
  };

  const next = () => { if (idx + 1 >= total) { setDone(true); return; } setIdx(idx + 1); setInput(""); setFeedback(null); };
  const restart = () => { setIdx(0); setInput(""); setFeedback(null); setScores([]); setDone(false); };

  // ── Score color helper ──
  const scoreColor = (s) => s >= 80 ? "#2DAA6E" : s >= 60 ? "#E8A838" : s > 0 ? "#D4413A" : "#ccc";
  const scoreBg = (s) => s >= 80 ? "#EDFAF3" : s >= 60 ? "#FFF8ED" : s > 0 ? "#FDF0EF" : "#f5f5f5";

  // ── Results page (shared) ──
  if (done) {
    const validScores = scores.filter(s => s > 0);
    const avg = validScores.length ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
    const emoji = avg >= 90 ? "🤩" : avg >= 80 ? "😎" : avg >= 70 ? "😊" : avg >= 60 ? "🤔" : "😅";
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
        <TopBar title={isSen ? "造句练习" : "语音测评"} subtitle="Results" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
        <PageWrap maxWidth={580}>
          <div style={{ padding: "32px 0", textAlign: "center", animation: "su 0.4s both" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>{emoji}</div>
            <div style={{ fontSize: 48, fontWeight: 700, color, marginBottom: 4 }}>{avg}<span style={{ fontSize: 20, color: "#999" }}>/100</span></div>
            <div style={{ fontSize: 15, color: "#888", marginBottom: 28 }}>Average across {validScores.length} questions</div>
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0efe8", overflow: "hidden", marginBottom: 24, textAlign: "left" }}>
              {scores.map((s, i) => (
                <div key={i} style={{ padding: "14px 18px", borderBottom: i < scores.length - 1 ? "1px solid #f7f6f1" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, color: "#666" }}>Q{i + 1}. {isSen ? bank[i].word : bank[i].sentence.slice(0, 15) + "…"}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: scoreColor(s) }}>{s > 0 ? s : "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={restart} style={{ flex: 1, padding: 16, borderRadius: 12, border: `1.5px solid ${color}`, background: "transparent", color, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try again</button>
              <button onClick={onBack} style={{ flex: 1, padding: 16, borderRadius: 12, border: "none", background: color, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
            </div>
          </div>
        </PageWrap>
      </div>
    );
  }

  // ── Active drill view ──
  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
      <TopBar title={isSen ? "造句练习" : "语音测评"} subtitle={isSen ? "Sentence building" : "Pronunciation"} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "20px 0 140px" }}>

          {/* ── Progress bar ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 6, background: "#ebe9e1", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${((idx + (feedback ? 1 : 0)) / total) * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 13, color: "#999", fontWeight: 600 }}>{idx + 1}/{total}</span>
          </div>

          {/* ── Question card ── */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "28px 24px", marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
              {isSen ? "Use this word to make a sentence" : "Read this sentence aloud"}
            </div>
            {isSen ? (
              <>
                <div style={{ fontSize: 30, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>{q.word}</div>
                {(mode === "HPE" || mode === "HP") && <div style={{ fontSize: 15, color, marginBottom: 4 }}>{q.pinyin}</div>}
                {(mode === "HPE" || mode === "HE") && <div style={{ fontSize: 14, color: "#999" }}>{q.meaning}</div>}
                <div style={{ fontSize: 13, color: "#bbb", fontStyle: "italic", marginTop: 8 }}>Hint: {q.hint}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a", marginBottom: 8, lineHeight: 1.5 }}>{q.sentence}</div>
                {(mode === "HPE" || mode === "HP") && <div style={{ fontSize: 15, color, marginBottom: 4 }}>{q.pinyin}</div>}
                {(mode === "HPE" || mode === "HE") && <div style={{ fontSize: 14, color: "#999" }}>{q.translation}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => speaking ? stopSpeaking() : speak(q.sentence)} style={{ marginTop: 14, background: bg, border: `1px solid ${color}30`, borderRadius: 20, padding: "8px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color, fontFamily: "inherit" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={color}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
                    {speaking ? "Stop" : "Listen"}
                  </button>
                  <button onClick={() => speak(q.sentence, true)} style={{ marginTop: 14, background: "#fff", border: `1px solid ${color}30`, borderRadius: 20, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color, fontFamily: "inherit" }}>慢速</button>
                </div>
              </>
            )}
          </div>

          {/* ── Sentence mode feedback (text-based AI grading) ── */}
          {isSen && feedback && (
            <div ref={fbRef}>
              <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${feedback.score >= 80 ? "#2DAA6E40" : feedback.score >= 60 ? "#E8A83840" : "#D4413A40"}`, padding: 22, marginBottom: 14, animation: "su 0.3s both" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#888" }}>AI feedback</span>
                  <div style={{ background: scoreBg(feedback.score), borderRadius: 20, padding: "5px 16px", fontSize: 17, fontWeight: 700, color: scoreColor(feedback.score) }}>{feedback.score > 0 ? feedback.score + "/100" : "Error"}</div>
                </div>
                {input && <div style={{ fontSize: 14, color: "#888", marginBottom: 10 }}>Your answer: <span style={{ color: "#1a1a1a" }}>{input}</span></div>}
                <div style={{ fontSize: 15, color: "#444", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{feedback.text}</div>
              </div>
              <div style={{ background: bg, borderRadius: 14, padding: "18px 20px", marginBottom: 20, borderLeft: `3px solid ${color}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Reference example</div>
                {renderExampleText(q.example || q.sentence, mode)}
              </div>
              <button onClick={next} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: color, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{idx + 1 >= total ? "See results →" : "Next question →"}</button>
            </div>
          )}

          {/* ── Pronunciation mode feedback (iFlytek multi-dimension) ── */}
          {!isSen && feedback && feedback.type === "iflytek" && (
            <div ref={fbRef} style={{ animation: "su 0.3s both" }}>
              {/* Overall score */}
              <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${scoreColor(feedback.overall)}40`, padding: 24, marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>综合评分</div>
                <div style={{ fontSize: 52, fontWeight: 700, color: scoreColor(feedback.overall), lineHeight: 1 }}>{feedback.overall}</div>
                <div style={{ fontSize: 14, color: "#bbb", marginTop: 4 }}>/ 100</div>
              </div>

              {/* Dimension scores */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "发音", value: feedback.pronunciation },
                  { label: "声调", value: feedback.tone },
                  { label: "流利度", value: feedback.fluency },
                  { label: "完整度", value: feedback.integrity },
                  { label: "韵律度", value: feedback.rhythm },
                  { label: "语速", value: feedback.speed ? `${feedback.speed}字/分` : null, raw: true },
                ].map(d => (
                  <div key={d.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0efe8", padding: "14px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#bbb", marginBottom: 4 }}>{d.label}</div>
                    {d.value != null ? (
                      d.raw ? <div style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>{d.value}</div>
                        : <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(d.value) }}>{d.value}</div>
                    ) : (
                      <div style={{ fontSize: 14, color: "#ccc" }}>—</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Per-character breakdown */}
              {feedback.words && feedback.words.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 14 }}>逐字评分</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {feedback.words.filter(w => w.charType !== 1).map((w, i) => {
                      const ws = w.scores?.overall ?? 0;
                      const readLabel = w.readType === 1 ? " (增读)" : w.readType === 2 ? " (漏读)" : w.readType === 4 ? " (错读)" : "";
                      return (
                        <div key={i} style={{ background: scoreBg(ws), borderRadius: 10, padding: "8px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: `1px solid ${scoreColor(ws)}20` }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{w.word}</div>
                          {(mode === "HPE" || mode === "HP") && <div style={{ fontSize: 11, color: "#999" }}>{w.pinyin}</div>}
                          <div style={{ fontSize: 15, fontWeight: 600, color: scoreColor(ws) }}>{ws}</div>
                          {readLabel && <div style={{ fontSize: 10, color: "#D4413A" }}>{readLabel}</div>}
                        </div>
                      );
                    })}
                  </div>
                  {/* readType legend */}
                  {feedback.words.some(w => w.readType > 0) && (
                    <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#aaa" }}>
                      <span>🟡 增读 = 多读了字</span>
                      <span>🔴 漏读 = 少读了字</span>
                      <span>🟠 错读 = 发音错误</span>
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {feedback.warning && feedback.warning.length > 0 && (
                <div style={{ background: "#FFF8ED", borderRadius: 12, padding: "12px 16px", marginBottom: 16, border: "1px solid #E8A83830", fontSize: 13, color: "#E8A838" }}>
                  {feedback.warning.map((w, i) => <div key={i}>{w.message === "Audio noisy!" ? "检测到环境噪音，建议在安静环境中录音" : w.message}</div>)}
                </div>
              )}

              {/* Reference */}
              <div style={{ background: bg, borderRadius: 14, padding: "18px 20px", marginBottom: 20, borderLeft: `3px solid ${color}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>参考发音</div>
                {renderExampleText(q.sentence, mode)}
              </div>

              <button onClick={next} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: color, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{idx + 1 >= total ? "See results →" : "Next question →"}</button>
            </div>
          )}

          {/* ── Error feedback ── */}
          {!isSen && feedback && feedback.type === "error" && (
            <div ref={fbRef}>
              <div style={{ background: "#FDF0EF", borderRadius: 16, border: "1.5px solid #D4413A40", padding: 22, marginBottom: 14, animation: "su 0.3s both", textAlign: "center" }}>
                <div style={{ fontSize: 15, color: "#D4413A", marginBottom: 12 }}>{feedback.text}</div>
              </div>
              <button onClick={next} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: color, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{idx + 1 >= total ? "See results →" : "Next question →"}</button>
            </div>
          )}

          {/* ── Loading state ── */}
          {loading && !feedback && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <div style={{ display: "inline-flex", gap: 5 }}>
                {[0, 1, 2].map(j => <div key={j} style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: `dp 1.2s ${j * 0.2}s infinite` }} />)}
              </div>
              <div style={{ fontSize: 13, color: "#999", marginTop: 8 }}>{isSen ? "AI grading..." : "评测中..."}</div>
            </div>
          )}
        </div>
      </PageWrap>

      {/* ── Bottom input bar ── */}
      {!feedback && !loading && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 20px", background: "#fff", borderTop: "1px solid #f0efe8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 580 }}>
            {isSen ? (
              <>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && submitSentence(input)} placeholder="Type your sentence..." style={{ flex: 1, padding: "14px 18px", borderRadius: 24, border: "1px solid #e8e6de", background: "#FAFAF7", fontSize: 15, outline: "none", color: "#1a1a1a", fontFamily: "inherit" }} />
                <button onClick={() => submitSentence(input)} disabled={!input.trim()} style={{ width: 48, height: 48, borderRadius: "50%", background: input.trim() ? color : "#e8e6de", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() ? "pointer" : "default", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                </button>
              </>
            ) : (
              <>
                <button onClick={handleMic} style={{
                  flex: 1, padding: "16px", borderRadius: 28, border: `2px solid ${color}`,
                  background: recording ? color : "transparent", color: recording ? "#fff" : color,
                  fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  animation: recording ? "pulse 1.5s infinite" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={recording ? "#fff" : color}>
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                  {recording ? "点击停止评测" : "点击开始录音"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
