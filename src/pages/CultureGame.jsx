import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar.jsx";
import * as CH1 from "../data/cultureGameCh1.js";
import * as CH2 from "../data/cultureGameCh2.js";
import * as CH3 from "../data/cultureGame.js";
import { buildRecord, saveRecord } from "../utils/recordStore.js";

const CHAPTERS = { ch1: CH1, ch2: CH2, ch3: CH3 };

export function CultureGame() {
  const navigate = useNavigate();
  const { chapterId } = useParams();
  const CH = CHAPTERS[chapterId] || CH3;

  const [phase, setPhase] = useState("intro");
  const [dialogIdx, setDialogIdx] = useState(0);
  const [showChoices, setShowChoices] = useState(false);
  const [branchNode, setBranchNode] = useState(null);
  const [badMsg, setBadMsg] = useState("");
  const [animKey, setAnimKey] = useState(0);

  const currentScript = (() => {
    switch (phase) {
      case "intro": return CH.SCRIPT;
      case "palace": return CH.PALACE_SCRIPT;
      case "victory": return CH.VICTORY_SCRIPT;
      default: return [];
    }
  })();

  const node = currentScript[dialogIdx] || null;
  const isEnd = phase === "victory" && dialogIdx >= CH.VICTORY_SCRIPT.length - 1;
  const hasChoice2 = CH.CHOICE_2 && CH.CHOICE_2.length > 0;
  const savedRef = useRef(false);

  // Save practice record when player reaches the good ending
  useEffect(() => {
    if (isEnd && !savedRef.current) {
      savedRef.current = true;
      saveRecord(buildRecord({
        module: "文化文游",
        scenario: CH.META.title,
        score: 88, // fixed score for completing successfully
        hskLevel: null,
        problems: [],
        suggestion: `完成${CH.META.title}互动故事，可引导复述情节并讨论成语含义。`,
      }));
    }
  }, [isEnd, CH.META.title]);

  // Reset saved flag on restart
  useEffect(() => {
    savedRef.current = false;
  }, [phase]);

  // Auto-advance dialog
  useEffect(() => {
    if (!node) return;
    if (phase === "bad" || (phase === "victory" && dialogIdx >= CH.VICTORY_SCRIPT.length)) return;
    if (node.branch) {
      const timer = setTimeout(() => {
        setBranchNode(node);
        if (phase === "intro") {
          setPhase("choice1");
          setShowChoices(true);
        } else if (phase === "palace") {
          if (hasChoice2) {
            setPhase("choice2");
            setShowChoices(true);
          } else {
            // Chapter 2: no second choice, go straight to victory
            setPhase("victory");
            setDialogIdx(0);
            setAnimKey(k => k + 1);
          }
        }
      }, 600);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setDialogIdx(i => i + 1);
      setAnimKey(k => k + 1);
    }, phase === "victory" ? 2800 : 2200);
    return () => clearTimeout(timer);
  }, [node, phase, dialogIdx]);

  const handleChoice = useCallback((choice) => {
    setShowChoices(false);
    setBranchNode(null);
    if (choice.correct) {
      if (phase === "choice1") {
        setPhase("palace");
        setDialogIdx(0);
      } else if (phase === "choice2") {
        setPhase("victory");
        setDialogIdx(0);
      }
      setAnimKey(k => k + 1);
    } else {
      setBadMsg(choice.feedback + "　Bad End……");
      setPhase("bad");
    }
  }, [phase]);

  const restart = () => {
    setPhase("intro"); setDialogIdx(0);
    setShowChoices(false); setBranchNode(null);
    setBadMsg(""); setAnimKey(k => k + 1);
  };

  const handleTap = () => {
    if (showChoices || phase === "bad") return;
    if (node?.branch) return;
    if (phase === "victory") {
      if (dialogIdx < CH.VICTORY_SCRIPT.length - 1) {
        setDialogIdx(i => i + 1);
        setAnimKey(k => k + 1);
      }
      return;
    }
    if (dialogIdx < currentScript.length - 1 && !currentScript[dialogIdx]?.branch) {
      setDialogIdx(i => i + 1);
      setAnimKey(k => k + 1);
    }
  };

  const bgImage = node?.bg || (phase === "bad" ? CH.IMG.badend : "");
  const displayNode = showChoices ? branchNode : node;

  return (
    <div className="culture-game-root" style={{ display: "flex", flexDirection: "column", background: "#1a1a2e", fontFamily: "'Noto Sans SC', sans-serif", position: "relative", overflow: "hidden" }}>
      <TopBar title="文化文游" subtitle={`${CH.META.title} · ${CH.META.subtitle}`} onBack={() => navigate("/culture")} />

      {/* Scene area */}
      <div className="culture-scene-area">
        {bgImage ? (
          <div key={`bg-${animKey}`} className="culture-bg-img" style={{ backgroundImage: `url(${bgImage})` }} />
        ) : (
          <div className="culture-scene-fallback">
            <div>{CH.META.subtitle} · {CH.META.title}</div>
          </div>
        )}

        {displayNode?.img && (
          <div key={`char-${animKey}`} className="culture-char-wrap">
            <img src={displayNode.img} alt="" />
          </div>
        )}

        {/* Choice overlay */}
        {showChoices && (
          <div className="culture-choice-overlay">
            <div className="culture-choice-wrap">
              <div className="culture-choice-hint">做出你的选择</div>
              {(phase === "choice1" ? CH.CHOICE_1 : CH.CHOICE_2).map((c, i) => (
                <button
                  key={i}
                  onClick={() => handleChoice(c)}
                  className="culture-choice-btn"
                  style={{ fontFamily: "inherit" }}
                  onMouseEnter={e => { e.target.style.background = "rgba(244,208,63,0.24)"; e.target.style.borderColor = "rgba(244,208,63,0.6)"; }}
                  onMouseLeave={e => { e.target.style.background = "rgba(244,208,63,0.12)"; e.target.style.borderColor = "rgba(244,208,63,0.35)"; }}
                >{c.text}</button>
              ))}
            </div>
          </div>
        )}

        {!showChoices && phase !== "bad" && !node?.branch && (
          <div onClick={handleTap} style={{ position: "absolute", inset: 0, zIndex: 4, WebkitTapHighlightColor: "transparent" }} />
        )}
      </div>

      {/* Dialog box */}
      <div className="culture-dialog-box">
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {displayNode?.who && (
            <div key={`who-${animKey}`} className="culture-dialog-name">{displayNode.who}</div>
          )}
          {displayNode?.text && (
            <div key={`txt-${animKey}`} className="culture-dialog-text">{displayNode.text}</div>
          )}

          {phase === "bad" && (
            <div style={{ animation: "su 0.4s both", textAlign: "center", paddingTop: 10 }}>
              <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>{badMsg}</div>
              <button onClick={restart} style={{ padding: "12px 32px", borderRadius: 12, border: "none", background: "#f4d03f", color: "#1a1a2e", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent" }}>重新来过</button>
            </div>
          )}

          {phase === "victory" && dialogIdx >= CH.VICTORY_SCRIPT.length - 1 && (
            <div style={{ animation: "su 0.5s both", textAlign: "center", paddingTop: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f4d03f", marginBottom: 12 }}>{CH.META.title} · Good End</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={restart} style={{ padding: "12px 28px", borderRadius: 12, border: "1px solid rgba(244,208,63,0.4)", background: "transparent", color: "#f4d03f", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent" }}>重新体验</button>
                <button onClick={() => navigate("/culture")} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: "#f4d03f", color: "#1a1a2e", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent" }}>返回章节列表</button>
              </div>
            </div>
          )}

          {!showChoices && phase !== "bad" && !node?.branch && !isEnd && (
            <div className="culture-tap-hint">点击屏幕继续 ▸</div>
          )}
        </div>
      </div>
    </div>
  );
}
