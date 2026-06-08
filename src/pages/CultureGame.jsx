import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as CH1 from "../data/cultureGameCh1.js";
import * as CH2 from "../data/cultureGameCh2.js";
import * as CH3 from "../data/cultureGameCh3.js";
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

    // Branch node: tap to trigger choice
    if (node?.branch) {
      setBranchNode(node);
      if (phase === "intro") {
        setPhase("choice1");
        setShowChoices(true);
      } else if (phase === "palace") {
        if (hasChoice2) {
          setPhase("choice2");
          setShowChoices(true);
        } else {
          setPhase("victory");
          setDialogIdx(0);
          setAnimKey(k => k + 1);
        }
      }
      return;
    }

    if (phase === "victory") {
      if (dialogIdx < CH.VICTORY_SCRIPT.length - 1) {
        setDialogIdx(i => i + 1);
        setAnimKey(k => k + 1);
      }
      return;
    }
    if (dialogIdx < currentScript.length - 1) {
      setDialogIdx(i => i + 1);
      setAnimKey(k => k + 1);
    } else if (phase === "palace" && !hasChoice2) {
      // PALACE_SCRIPT ended, no second choice → straight to victory
      setPhase("victory");
      setDialogIdx(0);
      setAnimKey(k => k + 1);
    }
  };

  const bgImage = node?.bg || (phase === "bad" ? CH.IMG.badend : "");
  const displayNode = showChoices ? branchNode : node;

  return (
    <div className="culture-game-root">
      {/* Scene: background + tap area */}
      <div className="culture-scene-area">
        <div
          key={bgImage || "no-bg"}
          className="culture-scene-bg"
          style={{ backgroundImage: bgImage ? `url(${bgImage})` : "none" }}
        />

        {/* Tap area */}
        {!showChoices && phase !== "bad" && (
          <div onClick={handleTap} className="culture-tap-area" />
        )}
      </div>

      {/* Character: sibling of dialog, above it */}
      <div key={`char-${animKey}`} className="culture-char-wrap">
        <img src={displayNode?.img || ""} alt="" />
      </div>

      {/* Top bar */}
      <div className="culture-topbar">
        <button className="culture-back-btn" onClick={() => navigate("/culture")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f4d03f" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#f4d03f" }}>文化文游</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{CH.META.title} · {CH.META.subtitle}</div>
        </div>
      </div>

      {/* Dialog box: click advances story when no choices */}
      <div className="culture-dialog-box" onClick={!showChoices && phase !== "bad" ? handleTap : undefined}>
        {displayNode?.who && (
          <div key={`who-${animKey}`} className="culture-dialog-name">{displayNode.who}</div>
        )}
        {displayNode?.text && (
          <div key={`txt-${animKey}`} className="culture-dialog-text">{displayNode.text}</div>
        )}

        {/* Choices inside dialog box, below text */}
        {showChoices && (
          <div className="culture-choices">
            {(phase === "choice1" ? CH.CHOICE_1 : CH.CHOICE_2).map((c, i) => (
              <button key={i} onClick={() => handleChoice(c)}>{c.text}</button>
            ))}
          </div>
        )}

        {phase === "bad" && (
          <div className="culture-ending">
            <div className="culture-ending-msg">{badMsg}</div>
            <button className="culture-restart-btn" onClick={restart}>重新来过</button>
          </div>
        )}

        {phase === "victory" && dialogIdx >= CH.VICTORY_SCRIPT.length - 1 && (
          <div className="culture-ending">
            <div className="culture-ending-title">{CH.META.title} · Good End</div>
            <div className="culture-ending-actions">
              <button className="culture-end-outline" onClick={restart}>重新体验</button>
              <button className="culture-end-solid" onClick={() => navigate("/culture")}>返回章节列表</button>
            </div>
          </div>
        )}

        {!showChoices && phase !== "bad" && !isEnd && (
          <div className="culture-tap-hint">点击屏幕继续 ▸</div>
        )}
      </div>
    </div>
  );
}
