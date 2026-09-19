import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { HSK_PROMPT } from "../data/constants.js";
import { SCENARIOS } from "../data/scenarios.js";
import { useSpeech } from "../hooks/useSpeech.js";
import { ChatBubble } from "../components/ChatBubble.jsx";
import { callAI, getToken, recordApi } from "../utils/api.js";
import { getAllRecords, buildRecord, saveRecord, getOwnerId, readDrafts, putDraft, dropDraft } from "../utils/recordStore.js";
import { recommendTopics } from "../utils/topicRecommender.js";
import { buildFreeModule, buildWritingChat } from "../utils/moduleBuilders.js";
import { toTranscript, countStudentTurns, nowIso } from "../utils/transcript.js";
import { gradeConversation } from "../utils/chatGrading.js";

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

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const { listening, speaking, startListening, stopListening, speak, stopSpeaking } = useSpeech();

  // ── 话题推荐引擎（仅自由对话模式）──
  const isFreeChat = !params.sceneId && !params.mode;
  const [topicRecs, setTopicRecs] = useState([]);
  const topicExcluded = useRef([]);       // 已展示过的话题（换一批不重复）
  const practicedRef = useRef([]);        // 历史练过的场景标题

  useEffect(() => {
    if (!isFreeChat) return;
    let cancelled = false;
    const load = async () => {
      let practiced = [];
      if (getToken()) {
        try {
          // 只取场景名字符串。原先调 /mine 会把全部记录的每一列都拉回来。
          practiced = (await recordApi.scenarios()).scenarios;
        } catch (e) {
          console.warn("[topics] 云端记录获取失败，按无历史推荐:", e.message);
        }
      } else {
        practiced = getAllRecords().map(r => r.scenario).filter(Boolean);
      }
      if (cancelled) return;
      practicedRef.current = practiced;
      setTopicRecs(recommendTopics({ hsk: hskLevel, practicedScenarios: practiced }));
    };
    load();
    return () => { cancelled = true; };
  }, [isFreeChat, hskLevel]);

  const refreshTopics = () => {
    const recs = recommendTopics({
      hsk: hskLevel,
      practicedScenarios: practicedRef.current,
      excludeIds: topicExcluded.current,
    });
    topicExcluded.current = [...topicExcluded.current, ...recs.map(t => t.id)];
    setTopicRecs(recs);
  };

  // ── 会话快照 / 草稿 / 提交 ──────────────────────────────────────
  // draftId 在每次新会话开始时重新生成，作为记录的 legacy_id：
  // 「离开时提交」与「下次进入补交」共享它，服务端唯一键去重。
  const draftIdRef = useRef(Date.now());

  // messages 的 ref 副本。提交要读最新值：点返回时可能还有一条 AI 回复在飞，
  // 那条回复落地时组件可能已经卸载，state 更新会被丢弃，只能靠 ref 拿到。
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const inflightRef = useRef(null);   // send() 进行中的 Promise

  // 当前内存 messages → 可提交的快照（剔除 greeting/error 并截断）。
  // hsk 必须显式传入：flushing 旧会话时 hskLevel 已经被切到新值了，
  // 直接读 state 会把 1-3 水平的对话标成 4-6（被试数据结构被污染）。
  const snapshot = (hsk = hskLevel) => ({
    draftId: draftIdRef.current,
    module: params.sceneId ? "生活情境" : params.mode ? "写作辅导" : "自由对话",
    scenario: params.mode ? module.title : params.sceneId ? module.title : "自由对话",
    hskLevel: hsk,
    messages: toTranscript(messagesRef.current),
  });

  // 提交一段会话。**只有落库成功才把它从待提交队列移除** ——
  // 中途关页面、断网、评分超时都会让它留在队列里，下次进入自动补交。
  const submit = (snap) =>
    flushSession(snap)
      .then(() => dropDraft(snap.draftId))
      .catch(e => console.warn("[grade] 会话提交失败，仍留在待提交队列:", e.message));

  // 评分 + 落库。评分失败也照常保存对话（score=0），不因一个 AI 请求丢掉整段记录。
  const flushSession = async (snap) => {
    const msgs = snap.messages || [];
    if (countStudentTurns(msgs) < 2) return;   // 没有实质对话，不评分不落库

    let grade = { score: 0, problems: [], suggestion: "" };
    try {
      grade = await gradeConversation(msgs);
    } catch (e) {
      console.warn("[grade] 会话评分失败，仅保存对话:", e.message);
    }

    await saveRecord(buildRecord({
      id: snap.draftId,
      module: snap.module,
      scenario: snap.scenario,
      hskLevel: snap.hskLevel,
      messages: msgs,
      ...grade,
    }));
  };

  // ⚠️ 这个 effect 必须声明在下面的 greeting 重置 effect 之前。
  //    切 HSK 或换场景都会重置 messages，先把上一段对话交出去再重置，
  //    否则那段对话会被静默丢弃。
  //    sessionRef 存的是「这段对话属于哪个会话」——提交时要用它自己的
  //    hskLevel/module，而不是当前渲染的值（切 HSK 时两者已经不同了）。
  const sessionRef = useRef(null);
  useEffect(() => {
    const key = `${module.id}|${hskLevel}`;
    const prev = sessionRef.current;
    sessionRef.current = { key, hskLevel };
    if (!prev || prev.key === key) return;   // 首次挂载 / 会话未变
    submit(snapshot(prev.hskLevel));
  }, [module.id, hskLevel]);

  useEffect(() => {
    draftIdRef.current = Date.now();
    const g = typeof module.greeting === "object" ? module.greeting[hskLevel] || module.greeting["4-6"] : module.greeting;
    setMessages([{ sender: "ai", content: g, at: nowIso(), kind: "greeting" }]);
  }, [module.id, hskLevel]);

  // 每轮对话后同步写队列 —— 刷新/关标签页/崩溃都能恢复。
  // 用 effect 而不是写在 send() 里，catch 分支、话题按钮、语音输入都不会漏。
  useEffect(() => {
    if (messages.length < 2) return;   // 只有开场白，别用空会话覆盖有效草稿
    const snap = snapshot();
    if (countStudentTurns(snap.messages) === 0) return;
    putDraft({ v: 1, ownerKey: getOwnerId(), updatedAt: nowIso(), ...snap });
  }, [messages]);

  // 挂载时补交队列里残留的会话（刷新/关页面/断网/评分超时留下的）。
  useEffect(() => {
    const owner = getOwnerId();
    for (const pending of readDrafts()) {
      // ownerKey 不匹配就先留着：认证恢复瞬时失败会让登录用户暂时看起来像游客，
      // 那种情况丢弃草稿会永久丢数据
      if (pending.ownerKey !== owner) continue;
      if (countStudentTurns(pending.messages) < 2) { dropDraft(pending.draftId); continue; }
      submit(pending);
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // 内存用 sender，仅此一处映射回 OpenAI 兼容的 role
  const toLLM = (msgs) => msgs.map(m => ({
    role: m.sender === "student" ? "user" : "assistant",
    content: m.content,
  }));

  const sys = () => `You are a Chinese language coach.\n${HSK_PROMPT[hskLevel]}\nROLE: ${module.system || module.role || ""}\nRULES: Stay in character, 2-3 sentences max. You MUST format your reply strictly in these 3 lines using exactly these prefixes:\n汉字: [Chinese Characters]\n拼音: [Pinyin]\n英文: [English Translation]\nDo not use markdown.`;

  const sendInner = async (text, channel) => {
    if (!text.trim() || loading) return;
    const myDraftId = draftIdRef.current;   // 这次请求属于哪一段会话
    const u = { sender: "student", content: text.trim(), at: nowIso(), channel };
    const up = [...messages, u];
    setMessages(up);
    setInput("");
    setLoading(true);
    try {
      const raw = await callAI(sys(), toLLM(up), 800);
      if (draftIdRef.current !== myDraftId) return discard();
      const withReply = [...up, { sender: "ai", content: raw, at: nowIso() }];
      setMessages(withReply);
      // 同时写 ref：点返回时这条回复可能刚落地、组件已卸载，state 更新会被丢弃
      messagesRef.current = withReply;
    } catch {
      if (draftIdRef.current !== myDraftId) return discard();
      // 网络失败时的兜底文案 —— 标记 kind:"error"，不入库，否则会污染回看视图
      const withErr = [...up, {
        sender: "ai",
        kind: "error",
        at: nowIso(),
        content: "汉字: 网络连接有点慢哦，请重试。\n拼音: Wǎngluò liánjiē yǒudiǎn màn o, qǐng chóngshì.\n英文: The network connection is a bit slow, please try again.",
      }];
      setMessages(withErr);
      messagesRef.current = withErr;
    } finally {
      setLoading(false);
    }
  };

  // 回复到达时会话已经重置（切 HSK / 换场景）——up 是上一段对话的数组，
  // 写进 state 会把它整个插到新会话里并被当成新会话的记录存下来，直接丢弃。
  const discard = () => {
    console.warn("[chat] 会话已切换，丢弃迟到的回复");
  };

  // 包一层以便追踪进行中的请求：handleBack 要等它落地，否则最后一句 AI 回复不进记录
  const send = (text, channel = "text") => {
    const p = sendInner(text, channel);
    inflightRef.current = p;
    p.then(() => { if (inflightRef.current === p) inflightRef.current = null; });
    return p;
  };

  const handleMic = () => { if (listening) { stopListening(); return; } startListening(t => { setInput(t); send(t, "voice"); }); };

  // ── 离开对话：AI 评分本次会话并存练习记录（雷达图五维数据来源）──
  const handleBack = () => {
    // 等正在生成的回复落地再取快照，否则学生刚发的那句会被存下来而 AI 的回应不会。
    // 组件这会儿已经卸载了，所以靠 messagesRef 而不是 state 拿最新消息。
    const pending = inflightRef.current;
    (pending ? pending.catch(() => {}) : Promise.resolve())
      .then(() => submit(snapshot()));
    if (params.sceneId) navigate("/oral/scenes");
    else if (params.mode) navigate("/written");
    else navigate("/oral"); // free chat
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
      <TopBar title={module.title} subtitle={module.titleEn} onBack={handleBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 120px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 640 }}>
          {messages.map((msg, i) => (
            <ChatBubble
              key={i}
              sender={msg.sender}
              content={msg.content}
              kind={msg.kind}
              mode={mode}
              color={module.color}
              bg={module.bg}
              icon={module.icon}
              showVoice={showVoice}
              speaking={speaking}
              onSpeak={speak}
              onStopSpeak={stopSpeaking}
            />
          ))}
          {/* ── 话题推荐（自由对话，尚未开始对话时显示）── */}
          {isFreeChat && messages.length === 1 && topicRecs.length > 0 && (
            <div style={{ margin: "20px 0 8px", animation: "su 0.3s both" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#555" }}>💡 不知道聊什么？试试这些话题</div>
                <button onClick={refreshTopics} style={{
                  background: "none", border: "1px solid #e0dcd0", borderRadius: 14, cursor: "pointer",
                  padding: "4px 12px", fontSize: 12, color: "#888", fontFamily: "inherit",
                }}>
                  🔄 换一批
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topicRecs.map(t => (
                  <button key={t.id} onClick={() => send(t.title)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                      background: "#fff", borderRadius: 14, border: "1px solid #f0efe8",
                      padding: "14px 18px", cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = module.color + "80"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#f0efe8"; e.currentTarget.style.transform = "none"; }}
                  >
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{t.emoji}</span>
                    <span style={{ flex: 1, fontSize: 15, color: "#333", fontWeight: 500 }}>{t.title}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 10, textAlign: "center" }}>
                基于你的 HSK 等级和练习历史推荐 · 点击即可开始对话
              </div>
            </div>
          )}

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
