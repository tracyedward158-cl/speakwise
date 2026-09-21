import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { PronunciationDrill } from "../components/PronunciationDrill.jsx";
import { SENTENCE_BANK } from "../data/drills.js";
import { HSK_PROMPT } from "../data/constants.js";
import { clean, renderExampleText } from "../utils/helpers.jsx";
import { callAI } from "../utils/api.js";
import { buildRecord, saveRecord } from "../utils/recordStore.js";
import { buildCustomBank, buildPracticeSession, nextRoundParams } from "../utils/pronunciationBank.js";

// ── 自定义练习：学生自己输入的文本 ──
const MAX_CUSTOM_CHARS = 500;   // 输入上限：够读一小段课文，又不至于一次录几分钟音

export function DrillView() {
  const navigate = useNavigate();
  const params = useParams();
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp();
  const type = params.type; // "sentence" | "custom" | "practice"
  const isPractice = type === "practice";
  const isCustom = type === "custom";
  const isSen = !isPractice && !isCustom;   // 其余（含历史 type）一律走造句分支

  // 练习题目由 URL 查询参数决定，可刷新、可回退、可分享：
  //   /oral/drill/practice?set=train&unit=字&mode=random&tag=平翘舌&seed=123&item=42&from=daily
  // 依赖 searchParams.toString() 而不是对象本身：对象在每次渲染都可能是新引用，
  // 用它做依赖会让下面这个 useMemo 每帧重算（随机模式就会重新洗牌）。
  const [searchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const session = useMemo(
    () => (isPractice ? buildPracticeSession(Object.fromEntries(new URLSearchParams(searchKey)), hskLevel) : null),
    [isPractice, searchKey, hskLevel]
  );

  // 自定义练习：customText 是输入框原文（重来时保留，方便改一改再练），
  // customBank 是断句结果；customBank === null 表示还停在输入页。
  const [customText, setCustomText] = useState("");
  const [customBank, setCustomBank] = useState(null);

  const bank = isPractice
    ? (session?.items || [])
    : isCustom ? (customBank || [])
    : SENTENCE_BANK[hskLevel];
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState([]);
  const [done, setDone] = useState(false);
  const fbRef = useRef(null);
  const q = bank[idx];
  const total = bank.length;
  const color = isSen ? "#4A90D9" : "#7B6CF6";
  const bg = isSen ? "#EEF4FB" : "#F3F0FF";
  const pageTitle = isSen ? "造句练习" : isPractice ? (session?.title || "练习") : "自定义练习";
  const pageSubtitle = isSen ? "Sentence building" : isPractice ? (session?.subtitle || "") : "Custom practice";

  // Derive back target from parent path
  const location = useLocation();
  const onBack = useCallback(() => {
    if (location.pathname.startsWith("/written/")) return navigate("/written");
    // 自定义练习是从模式选择页进来的，退回模式选择而不是口语主页
    navigate(isCustom ? "/oral/pronunciation" : "/oral");
  }, [location.pathname, navigate, isCustom]);

  // 练习页要退回它进来的那一页（日常设置 / 题库浏览 / 测试选卷）
  const practiceBack = useCallback(() => {
    const from = searchParams.get("from");
    if (from === "bank") return navigate("/oral/pronunciation/bank");
    if (from === "test") return navigate("/oral/pronunciation/test");
    if (from === "daily") return navigate("/oral/pronunciation/daily");
    navigate("/oral/pronunciation");
  }, [searchParams, navigate]);

  // 下一轮：顺序/专项把 offset 往前推一轮（到底绕回开头），随机模式换新种子。
  // 测试卷与单题练习没有下一轮——前者前后测必须拿到同一份固定卷，后者只有一道题。
  const canNextRound = isPractice && !!session && session.mode !== "test" && session.mode !== "single";
  const handleNextRound = useCallback(() => {
    const next = nextRoundParams(Object.fromEntries(new URLSearchParams(searchKey)), session);
    navigate(`/oral/drill/practice?${new URLSearchParams(next).toString()}`);
  }, [session, searchKey, navigate]);

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

  const next = () => { if (idx + 1 >= total) { setDone(true); return; } setIdx(idx + 1); setInput(""); setFeedback(null); };
  const restart = () => { setIdx(0); setInput(""); setFeedback(null); setScores([]); setDone(false); };

  // ── Score color helper ──
  const scoreColor = (s) => s >= 80 ? "#2DAA6E" : s >= 60 ? "#E8A838" : s > 0 ? "#D4413A" : "#ccc";
  const scoreBg = (s) => s >= 80 ? "#EDFAF3" : s >= 60 ? "#FFF8ED" : s > 0 ? "#FDF0EF" : "#f5f5f5";

  // ── Custom mode: 输入文本（还没开始测评）──
  if (isCustom && !customBank) {
    const preview = buildCustomBank(customText);
    const overLimit = customText.length >= MAX_CUSTOM_CHARS;
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
        <TopBar title={pageTitle} subtitle={pageSubtitle} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
        <PageWrap maxWidth={580}>
          <div style={{ padding: "20px 0 40px", animation: "su 0.4s both" }}>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: 24, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                Enter your text
              </div>
              <textarea
                value={customText}
                autoFocus
                onChange={e => setCustomText(e.target.value.slice(0, MAX_CUSTOM_CHARS))}
                placeholder="输入或粘贴你想练习的文本，比如课文段落、演讲稿、常用句子…"
                rows={6}
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "14px 16px", borderRadius: 12, border: "1px solid #e8e6de", background: "#FAFAF7", fontSize: 17, lineHeight: 1.8, outline: "none", color: "#1a1a1a", fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "#bbb" }}>
                  {preview.length > 0 ? `按标点分成 ${preview.length} 句，逐句朗读评测` : "还没有内容"}
                </span>
                <span style={{ fontSize: 12, color: overLimit ? "#D4413A" : "#ccc" }}>{customText.length}/{MAX_CUSTOM_CHARS}</span>
              </div>
            </div>

            {/* 断句预览：让学生看到自己的文本会被切成哪几句，切错了能改 */}
            {preview.length > 0 && (
              <div style={{ background: bg, borderRadius: 14, padding: "16px 20px", marginBottom: 20, borderLeft: `3px solid ${color}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Preview</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {preview.slice(0, 8).map((item, i) => (
                    <div key={i} style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>{i + 1}. {item.text}</div>
                  ))}
                  {preview.length > 8 && <div style={{ fontSize: 12, color: "#aaa" }}>…共 {preview.length} 句</div>}
                </div>
              </div>
            )}

            <button
              onClick={() => { setCustomBank(preview); setIdx(0); setFeedback(null); setScores([]); setDone(false); }}
              disabled={preview.length === 0}
              style={{
                width: "100%", padding: 16, borderRadius: 12, border: "none", fontFamily: "inherit",
                background: preview.length ? color : "#e8e6de", color: preview.length ? "#fff" : "#aaa",
                fontSize: 16, fontWeight: 600, cursor: preview.length ? "pointer" : "default",
              }}>
              开始测评 →
            </button>
            <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", marginTop: 10, lineHeight: 1.7 }}>
              开始后逐句录音评测，全部读完给出总评
            </div>
          </div>
        </PageWrap>
      </div>
    );
  }

  // ── 练习模式选不出题（手改 URL 或题库变动导致）：给出明确出口，不要渲染空题崩溃 ──
  if (isPractice && bank.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
        <TopBar title={pageTitle} subtitle={pageSubtitle} onBack={practiceBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
        <PageWrap maxWidth={580}>
          <div style={{ padding: "60px 0", textAlign: "center", animation: "su 0.4s both" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
            <div style={{ fontSize: 16, color: "#666", marginBottom: 6 }}>这个组合下暂时没有题目</div>
            <div style={{ fontSize: 13, color: "#bbb", marginBottom: 24, lineHeight: 1.7 }}>
              换一个粒度或专项再试
            </div>
            <button onClick={practiceBack} style={{ padding: "14px 32px", borderRadius: 12, border: "none", background: "#7B6CF6", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>返回选择</button>
          </div>
        </PageWrap>
      </div>
    );
  }

  // ── 练习 / 自定义练习：评测界面交给共用组件 ──
  if (!isSen) {
    return (
      <PronunciationDrill
        // key 绑在查询参数上：点「下一轮」换了 offset/seed 就重新挂载，
        // 否则组件的 idx/done 等内部状态会留着，新题会从上一轮的结果页开始
        key={isPractice ? searchKey : "custom"}
        bank={bank}
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={isPractice ? practiceBack : onBack}
        isCustom={isCustom}
        source={isPractice ? (searchParams.get("set") || "train") : "custom"}
        onRestart={isCustom ? () => setCustomBank(null) : undefined}
        onNextRound={canNextRound ? handleNextRound : undefined}
      />
    );
  }

  // ── Results page ──
  if (done) {
    const validScores = scores.filter(s => s > 0);
    const avg = validScores.length ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
    const emoji = avg >= 90 ? "🤩" : avg >= 80 ? "😎" : avg >= 70 ? "😊" : avg >= 60 ? "🤔" : "😅";
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
        <TopBar title={pageTitle} subtitle="Results" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
        <PageWrap maxWidth={580}>
          <div style={{ padding: "32px 0", textAlign: "center", animation: "su 0.4s both" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>{emoji}</div>
            <div style={{ fontSize: 48, fontWeight: 700, color, marginBottom: 4 }}>{avg}<span style={{ fontSize: 20, color: "#999" }}>/100</span></div>
            <div style={{ fontSize: 15, color: "#888", marginBottom: 28 }}>Average across {validScores.length} questions</div>
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0efe8", overflow: "hidden", marginBottom: 24, textAlign: "left" }}>
              {scores.map((s, i) => (
                <div key={i} style={{ padding: "14px 18px", borderBottom: i < scores.length - 1 ? "1px solid #f7f6f1" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, color: "#666" }}>Q{i + 1}. {bank[i].word}</div>
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
      <TopBar title={pageTitle} subtitle={pageSubtitle} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
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
              Use this word to make a sentence
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>{q.word}</div>
            {(mode === "HPE" || mode === "HP") && <div style={{ fontSize: 15, color, marginBottom: 4 }}>{q.pinyin}</div>}
            {(mode === "HPE" || mode === "HE") && <div style={{ fontSize: 14, color: "#999" }}>{q.meaning}</div>}
            <div style={{ fontSize: 13, color: "#bbb", fontStyle: "italic", marginTop: 8 }}>Hint: {q.hint}</div>
          </div>

          {/* ── Sentence mode feedback (text-based AI grading) ── */}
          {feedback && (
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

          {/* ── Loading state ── */}
          {loading && !feedback && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <div style={{ display: "inline-flex", gap: 5 }}>
                {[0, 1, 2].map(j => <div key={j} style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: `dp 1.2s ${j * 0.2}s infinite` }} />)}
              </div>
              <div style={{ fontSize: 13, color: "#999", marginTop: 8 }}>AI grading...</div>
            </div>
          )}
        </div>
      </PageWrap>

      {/* ── Bottom input bar ── */}
      {!feedback && !loading && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 20px", background: "#fff", borderTop: "1px solid #f0efe8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 580 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && submitSentence(input)} placeholder="Type your sentence..." style={{ flex: 1, padding: "14px 18px", borderRadius: 24, border: "1px solid #e8e6de", background: "#FAFAF7", fontSize: 15, outline: "none", color: "#1a1a1a", fontFamily: "inherit" }} />
            <button onClick={() => submitSentence(input)} disabled={!input.trim()} style={{ width: 48, height: 48, borderRadius: "50%", background: input.trim() ? color : "#e8e6de", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() ? "pointer" : "default", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
