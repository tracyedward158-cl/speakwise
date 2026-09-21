import { useState, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "./TopBar.jsx";
import { PageWrap } from "./PageWrap.jsx";
import { useSpeech } from "../hooks/useSpeech.js";
import { evaluatePronunciation } from "../utils/api.js";
import { createAudioRecorder } from "../utils/audioRecorder.js";
import { buildRecord, saveRecord } from "../utils/recordStore.js";
import { coreFor, extractFeedback, dimensionCells, } from "../utils/pronunciationBank.js";

// records.scenario 在库里是 VARCHAR(128)，超长会触发 MySQL 严格模式的 ER_DATA_TOO_LONG。
// saveRecord 遇到写入失败只会静默降级到 localStorage（见 utils/recordStore.js），
// 结果是学生看到「已保存」、老师端却永远收不到这条记录。自定义练习的文本长度不可控，
// 所以必须在进库前截断。题库里的句子本来就不长，截断对它们无影响。
const MAX_SCENARIO = 128;
const cutScenario = (s) => String(s || "").slice(0, MAX_SCENARIO);

/**
 * 发音测评的评测界面：录音 → 讯飞评测 → 逐字/多维反馈 → 结果页。
 * 被「自定义练习」和题库驱动的日常/测试/单题练习共用。
 *
 *   bank           题目数组，每题 { text, pinyin?, english?, unit?, tags? }
 *   title/subtitle 页面标题
 *   onBack         返回目标
 *   isCustom       自定义练习（影响结果页的重来按钮文案）
 *   source         记录来源 train/testA/testB/custom，写进 records.source 供科研区分
 *   onRestart      结果页「重来」时的额外回调（自定义练习用它退回输入页）
 *   onNextRound    结果页「下一轮」回调；不传则不显示该按钮（自定义/单题/测试卷都没有下一轮）
 */
export function PronunciationDrill({ bank, title, subtitle, onBack, isCustom = false, source = "", onRestart, onNextRound }) {
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp();

  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState([]);
  const [done, setDone] = useState(false);
  const { speaking, speak, stopSpeaking } = useSpeech();
  const fbRef = useRef(null);

  const q = bank[idx];
  const total = bank.length;
  const color = "#7B6CF6";
  const bg = "#F3F0FF";

  // Audio recorder for pronunciation mode (iFlytek API)
  const recorderRef = useRef(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => { if (feedback && fbRef.current) fbRef.current.scrollIntoView({ behavior: "smooth" }); }, [feedback]);

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

      // 字/词用 word 评测，句用 sent（见 pronunciationBank.coreFor）。
      // 同一场测试里 core 会中途切换：标准卷前 20 题是字/词，后 5 题是句。
      const result = await evaluatePronunciation(wavBase64, q.text, coreFor(q.unit));
      const { feedback: fb, record } = extractFeedback(result, q);

      saveRecord(buildRecord({
        module: "发音测评", scenario: cutScenario(q.text), score: record.score, hskLevel,
        dimensions: record.dimensions,
        problems: record.problems,
        suggestion: record.suggestion,
        source,
      }));

      setFeedback(fb);
      setScores(p => [...p, fb.overall]);
    } catch (e) {
      console.error("Evaluation failed:", e);
      setFeedback({ type: "error", text: "评测服务暂时不可用，请稍后重试", score: 0 });
    }
    setLoading(false);
  }, [q?.text, source, hskLevel]);   // 依赖数组在渲染期求值：尚未开始时 q 还不存在

  const handleMic = () => {
    if (recording) stopAndEvaluate();
    else startRecording();
  };

  const next = () => { if (idx + 1 >= total) { setDone(true); return; } setIdx(idx + 1); setFeedback(null); };
  const restart = () => {
    setIdx(0); setFeedback(null); setScores([]); setDone(false);
    // 自定义练习：退回输入页（文本框保留上次内容，方便改一改再练）
    onRestart?.();
  };

  // 反复练习同一题：清掉反馈重录。回退 scores 最后一项，
  // 否则同一题会占两个成绩、把结果页的平均分算歪。
  // 记录仍然每次都写——题库浏览的「已练次数」就是按录音次数统计的。
  const retry = () => { setFeedback(null); setScores(p => p.slice(0, -1)); };

  // ── Score color helper ──
  const scoreColor = (s) => s >= 80 ? "#2DAA6E" : s >= 60 ? "#E8A838" : s > 0 ? "#D4413A" : "#ccc";
  const scoreBg = (s) => s >= 80 ? "#EDFAF3" : s >= 60 ? "#FFF8ED" : s > 0 ? "#FDF0EF" : "#f5f5f5";

  // ── Results page ──
  if (done) {
    const validScores = scores.filter(s => s > 0);
    const avg = validScores.length ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
        <TopBar title={title} subtitle="Results" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
        <PageWrap maxWidth={580}>
          <div style={{ padding: "32px 0", textAlign: "center", animation: "su 0.4s both" }}>
            <div style={{ fontSize: 48, fontWeight: 700, color, marginBottom: 4, marginTop: 12 }}>{avg}<span style={{ fontSize: 20, color: "#999" }}>/100</span></div>
            <div style={{ fontSize: 15, color: "#888", marginBottom: 28 }}>Average across {validScores.length} questions</div>
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0efe8", overflow: "hidden", marginBottom: 24, textAlign: "left" }}>
              {scores.map((s, i) => (
                <div key={i} style={{ padding: "14px 18px", borderBottom: i < scores.length - 1 ? "1px solid #f7f6f1" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, color: "#666" }}>Q{i + 1}. {(bank[i]?.text || "").slice(0, 15) + "…"}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: scoreColor(s) }}>{s > 0 ? s : "—"}</div>
                </div>
              ))}
            </div>
            {/* 下一轮：顺序/专项接着往下轮转、随机换一批。没有它的话顺序模式永远
                只练池子前 10 题，第 11 题往后学生根本碰不到 */}
            {onNextRound && (
              <button onClick={onNextRound} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: color, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
                下一轮 →
              </button>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={restart} style={{ flex: 1, padding: 16, borderRadius: 12, border: onNextRound ? "1px solid #e8e6de" : `1.5px solid ${color}`, background: "transparent", color: onNextRound ? "#888" : color, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{isCustom ? "修改文本" : "再练一遍"}</button>
              <button onClick={onBack} style={{ flex: 1, padding: 16, borderRadius: 12, border: "none", background: onNextRound ? "#F5F0FA" : color, color: onNextRound ? color : "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>返回</button>
            </div>
          </div>
        </PageWrap>
      </div>
    );
  }

  // ── Active drill view ──
  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
      <TopBar title={title} subtitle={subtitle} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: 1 }}>
                {q.unit === "字" ? "Read this character aloud" : q.unit === "词" ? "Read this word aloud" : "Read this sentence aloud"}
              </span>
              {q.unit && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: bg, color }}>{q.unit}</span>
              )}
            </div>
            <div style={{ fontSize: q.unit === "句" ? 26 : 40, fontWeight: 700, color: "#1a1a1a", marginBottom: 8, lineHeight: 1.5 }}>{q.text}</div>
            {(mode === "HPE" || mode === "HP") && q.pinyin && <div style={{ fontSize: 15, color, marginBottom: 4 }}>{q.pinyin}</div>}
            {(mode === "HPE" || mode === "HE") && q.english && <div style={{ fontSize: 14, color: "#999" }}>{q.english}</div>}
            {/* 难点标签：让「专项练习」的针对性可见 */}
            {q.tags && q.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {q.tags.map(t => (
                  <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#F5F5F0", color: "#999" }}>{t}</span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => speaking ? stopSpeaking() : speak(q.text)} style={{ marginTop: 14, background: bg, border: `1px solid ${color}30`, borderRadius: 20, padding: "8px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color, fontFamily: "inherit" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill={color}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
                {speaking ? "停止" : "播放"}
              </button>
              <button onClick={() => speak(q.text, true)} style={{ marginTop: 14, background: "#fff", border: `1px solid ${color}30`, borderRadius: 20, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color, fontFamily: "inherit" }}>慢速</button>
            </div>
          </div>

          {/* ── Pronunciation mode feedback (iFlytek multi-dimension) ── */}
          {feedback && feedback.type === "iflytek" && (
            <div ref={fbRef} style={{ animation: "su 0.3s both" }}>
              {/* Overall score */}
              <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${scoreColor(feedback.overall)}40`, padding: 24, marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>综合评分</div>
                <div style={{ fontSize: 52, fontWeight: 700, color: scoreColor(feedback.overall), lineHeight: 1 }}>{feedback.overall}</div>
                <div style={{ fontSize: 14, color: "#bbb", marginTop: 4 }}>/ 100</div>
              </div>

              {/* Dimension scores —— 只渲染有值的格：word 模式（字/词）没有
                  流利度/完整度/韵律度/语速，固定 6 格会变成 4 个连着的「—」 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {dimensionCells(feedback).map(d => (
                  <div key={d.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0efe8", padding: "14px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#bbb", marginBottom: 4 }}>{d.label}</div>
                    {d.raw
                      ? <div style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>{d.value}</div>
                      : <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(d.value) }}>{d.value}</div>}
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

              {/* Reference —— 直接渲染字段，不走 renderExampleText。
                  那个 helper 靠正则拆「汉字(拼音)英文」，而题库的拼音/英文是独立字段、
                  文本里没有括号，用它会静默丢掉拼音和英文、模式切换也失效。
                  自定义练习的题目没有 pinyin/english，这里自然只显示正文。 */}
              <div style={{ background: bg, borderRadius: 14, padding: "18px 20px", marginBottom: 20, borderLeft: `3px solid ${color}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>参考发音</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 16, color: "#1a1a1a", lineHeight: 1.7 }}>{q.text}</div>
                  {(mode === "HPE" || mode === "HP") && q.pinyin && <div style={{ fontSize: 14, color: "#888" }}>{q.pinyin}</div>}
                  {(mode === "HPE" || mode === "HE") && q.english && <div style={{ fontSize: 13, color: "#aaa" }}>{q.english}</div>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={retry} style={{ flex: 1, padding: 16, borderRadius: 12, border: `1.5px solid ${color}`, background: "transparent", color, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>再练一次</button>
                <button onClick={next} style={{ flex: 1, padding: 16, borderRadius: 12, border: "none", background: color, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{idx + 1 >= total ? "看结果 →" : "下一题 →"}</button>
              </div>
            </div>
          )}

          {/* ── Error feedback ── */}
          {feedback && feedback.type === "error" && (
            <div ref={fbRef}>
              <div style={{ background: "#FDF0EF", borderRadius: 16, border: "1.5px solid #D4413A40", padding: 22, marginBottom: 14, animation: "su 0.3s both", textAlign: "center" }}>
                <div style={{ fontSize: 15, color: "#D4413A", marginBottom: 12 }}>{feedback.text}</div>
              </div>
              <button onClick={next} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: color, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{idx + 1 >= total ? "看结果 →" : "下一题 →"}</button>
            </div>
          )}

          {/* ── Loading state ── */}
          {loading && !feedback && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <div style={{ display: "inline-flex", gap: 5 }}>
                {[0, 1, 2].map(j => <div key={j} style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: `dp 1.2s ${j * 0.2}s infinite` }} />)}
              </div>
              <div style={{ fontSize: 13, color: "#999", marginTop: 8 }}>评测中...</div>
            </div>
          )}
        </div>
      </PageWrap>

      {/* ── Bottom input bar ── */}
      {!feedback && !loading && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 20px", background: "#fff", borderTop: "1px solid #f0efe8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 580 }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
