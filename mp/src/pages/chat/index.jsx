import { useState, useRef, useEffect, useMemo } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { useApp } from '../../context/AppContext'
import { TopBar } from '../../components/TopBar'
import { HSK_PROMPT } from '../../core/data/constants'
import { SCENARIOS } from '../../core/data/scenarios'
import { useSpeech } from '../../hooks/useSpeech'
import { ChatBubble } from '../../components/ChatBubble'
import { callAI, getToken, recordApi } from '../../core/utils/api'
import {
  getAllRecords,
  buildRecord,
  saveRecord,
  getOwnerId,
  readDrafts,
  putDraft,
  dropDraft
} from '../../core/utils/recordStore'
import { recommendTopics } from '../../core/utils/topicRecommender'
import { buildFreeModule, buildWritingChat } from '../../core/utils/moduleBuilders'
import { toTranscript, countStudentTurns, nowIso } from '../../core/utils/transcript'
import { gradeConversation } from '../../core/utils/chatGrading'
import { useGuard } from '../../hooks/useGuard'
import { ROUTES, back } from '../../platform/nav'

export default function ChatView() {
  const { ready } = useGuard({ studentOnly: true })
  const router = useRouterParams()
  const {
    hsk: hskLevel,
    setHsk: onChangeHSK,
    viewMode: mode,
    setViewMode: onChangeMode
  } = useApp()

  const { sceneId, mode: chatMode, free } = router

  // Reconstruct module from URL params
  const module = useMemo(() => {
    if (sceneId) {
      const scene = SCENARIOS.find((s) => s.id === sceneId)
      if (!scene) return buildFreeModule(hskLevel)
      return {
        ...scene,
        system: `SCENARIO: ${scene.role}\nStay in character, 2-3 sentences, correct gently. No markdown.`,
        greeting: scene.greeting[hskLevel] || scene.greeting['4-6']
      }
    }
    if (chatMode) {
      // buildWritingChat 对不认识的 mode 返回 undefined（它只认 paragraph / essay）。
      // 原样透下去会让下面 `module.title` 直接炸 —— 查询串是可以被人手改的，
      // 兜到自由对话比白屏强。
      return buildWritingChat(chatMode, hskLevel) || buildFreeModule(hskLevel)
    }
    return buildFreeModule(hskLevel)
  }, [sceneId, chatMode, hskLevel])

  // Writing chats have no voice; free chat and scenes do
  const showVoice = !chatMode

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const { listening, speaking, startListening, stopListening, speak, stopSpeaking } = useSpeech()

  // ── 话题推荐引擎（仅自由对话模式）──
  const isFreeChat = !sceneId && !chatMode
  const [topicRecs, setTopicRecs] = useState([])
  const topicExcluded = useRef([]) // 已展示过的话题（换一批不重复）
  const practicedRef = useRef([]) // 历史练过的场景标题

  useEffect(() => {
    if (!isFreeChat) return
    let cancelled = false
    const load = async () => {
      let practiced = []
      if (getToken()) {
        try {
          // 只取场景名字符串。原先调 /mine 会把全部记录的每一列都拉回来。
          practiced = (await recordApi.scenarios()).scenarios
        } catch (e) {
          console.warn('[topics] 云端记录获取失败，按无历史推荐:', e.message)
        }
      } else {
        practiced = getAllRecords()
          .map((r) => r.scenario)
          .filter(Boolean)
      }
      if (cancelled) return
      practicedRef.current = practiced
      setTopicRecs(recommendTopics({ hsk: hskLevel, practicedScenarios: practiced }))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isFreeChat, hskLevel])

  const refreshTopics = () => {
    const recs = recommendTopics({
      hsk: hskLevel,
      practicedScenarios: practicedRef.current,
      excludeIds: topicExcluded.current
    })
    topicExcluded.current = [...topicExcluded.current, ...recs.map((t) => t.id)]
    setTopicRecs(recs)
  }

  // ── 会话快照 / 草稿 / 提交 ──────────────────────────────────────
  // draftId 在每次新会话开始时重新生成，作为记录的 legacy_id：
  // 「离开时提交」与「下次进入补交」共享它，服务端唯一键去重。
  //
  // ⚠️ 它同时是**会话起始时刻**（下面那个重置 effect 里与开场白同一 tick 生成），
  //    下游用 legacyId 反推开场白时间来计算「首轮回复间隔」（见
  //    core/utils/conversationMetrics.js）。所以提交时 buildRecord 必须带上它；
  //    漏传会让 buildRecord 兜底成提交时刻，首轮间隔静默变成整段会话的时长。
  const draftIdRef = useRef(Date.now())

  // messages 的 ref 副本。提交要读最新值：点返回时可能还有一条 AI 回复在飞，
  // 那条回复落地时组件可能已经卸载，state 更新会被丢弃，只能靠 ref 拿到。
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  const inflightRef = useRef(null) // send() 进行中的 Promise

  // 当前内存 messages → 可提交的快照（剔除 greeting/error 并截断）。
  // hsk 必须显式传入：flushing 旧会话时 hskLevel 已经被切到新值了，
  // 直接读 state 会把 1-3 水平的对话标成 4-6（被试数据结构被污染）。
  const snapshot = (hsk = hskLevel) => ({
    draftId: draftIdRef.current,
    module: sceneId ? '生活情境' : chatMode ? '写作辅导' : '自由对话',
    scenario: chatMode ? module.title : sceneId ? module.title : '自由对话',
    hskLevel: hsk,
    messages: toTranscript(messagesRef.current)
  })

  // 提交一段会话。**只有落库成功才把它从待提交队列移除** ——
  // 中途关页面、断网、评分超时都会让它留在队列里，下次进入自动补交。
  const submit = (snap) =>
    flushSession(snap)
      .then(() => dropDraft(snap.draftId))
      .catch((e) => console.warn('[grade] 会话提交失败，仍留在待提交队列:', e.message))

  // 评分 + 落库。评分失败也照常保存对话（score=0），不因一个 AI 请求丢掉整段记录。
  const flushSession = async (snap) => {
    const msgs = snap.messages || []
    if (countStudentTurns(msgs) < 2) return // 没有实质对话，不评分不落库

    let grade = { score: 0, problems: [], suggestion: '' }
    try {
      grade = await gradeConversation(msgs)
    } catch (e) {
      console.warn('[grade] 会话评分失败，仅保存对话:', e.message)
    }

    await saveRecord(
      buildRecord({
        id: snap.draftId,
        module: snap.module,
        scenario: snap.scenario,
        hskLevel: snap.hskLevel,
        messages: msgs,
        ...grade
      })
    )
  }

  // ⚠️ 这个 effect 必须声明在下面的 greeting 重置 effect 之前。
  //    切 HSK 或换场景都会重置 messages，先把上一段对话交出去再重置，
  //    否则那段对话会被静默丢弃。
  //    sessionRef 存的是「这段对话属于哪个会话」——提交时要用它自己的
  //    hskLevel/module，而不是当前渲染的值（切 HSK 时两者已经不同了）。
  const sessionRef = useRef(null)
  useEffect(() => {
    const key = `${module.id}|${hskLevel}`
    const prev = sessionRef.current
    sessionRef.current = { key, hskLevel }
    if (!prev || prev.key === key) return // 首次挂载 / 会话未变
    submit(snapshot(prev.hskLevel))
  }, [module.id, hskLevel])

  useEffect(() => {
    draftIdRef.current = Date.now()
    const g =
      typeof module.greeting === 'object'
        ? module.greeting[hskLevel] || module.greeting['4-6']
        : module.greeting
    setMessages([{ sender: 'ai', content: g, at: nowIso(), kind: 'greeting' }])
  }, [module.id, hskLevel])

  // 每轮对话后同步写队列 —— 刷新/关页面/崩溃都能恢复。
  // 用 effect 而不是写在 send() 里，catch 分支、话题按钮、语音输入都不会漏。
  useEffect(() => {
    if (messages.length < 2) return // 只有开场白，别用空会话覆盖有效草稿
    const snap = snapshot()
    if (countStudentTurns(snap.messages) === 0) return
    putDraft({ v: 1, ownerKey: getOwnerId(), updatedAt: nowIso(), ...snap })
  }, [messages])

  // 挂载时补交队列里残留的会话（刷新/关页面/断网/评分超时留下的）。
  useEffect(() => {
    const owner = getOwnerId()
    for (const pending of readDrafts()) {
      // ownerKey 不匹配就先留着：认证恢复瞬时失败会让登录用户暂时看起来像游客，
      // 那种情况丢弃草稿会永久丢数据
      if (pending.ownerKey !== owner) continue
      if (countStudentTurns(pending.messages) < 2) {
        dropDraft(pending.draftId)
        continue
      }
      submit(pending)
    }
  }, [])

  // 滚动到底。ScrollView 的 scrollIntoView 需要 id 变化才会重新滚动，
  // 所以把消息条数编进 id 里 —— 用固定 id 的话第二次之后就不动了。
  const anchorId = `chat-end-${messages.length}-${loading ? 1 : 0}`

  // 内存用 sender，仅此一处映射回 OpenAI 兼容的 role
  const toLLM = (msgs) =>
    msgs.map((m) => ({
      role: m.sender === 'student' ? 'user' : 'assistant',
      content: m.content
    }))

  const sys = () =>
    `You are a Chinese language coach.\n${HSK_PROMPT[hskLevel]}\nROLE: ${module.system || module.role || ''}\nRULES: Stay in character, 2-3 sentences max. You MUST format your reply strictly in these 3 lines using exactly these prefixes:\n汉字: [Chinese Characters]\n拼音: [Pinyin]\n英文: [English Translation]\nDo not use markdown.`

  const sendInner = async (text, channel) => {
    if (!text.trim() || loading) return
    const myDraftId = draftIdRef.current // 这次请求属于哪一段会话
    const u = { sender: 'student', content: text.trim(), at: nowIso(), channel }
    const up = [...messages, u]
    setMessages(up)
    setInput('')
    setLoading(true)
    try {
      const raw = await callAI(sys(), toLLM(up), 800)
      if (draftIdRef.current !== myDraftId) return discard()
      const withReply = [...up, { sender: 'ai', content: raw, at: nowIso() }]
      setMessages(withReply)
      // 同时写 ref：点返回时这条回复可能刚落地、组件已卸载，state 更新会被丢弃
      messagesRef.current = withReply
    } catch {
      if (draftIdRef.current !== myDraftId) return discard()
      // 网络失败时的兜底文案 —— 标记 kind:"error"，不入库，否则会污染回看视图
      const withErr = [
        ...up,
        {
          sender: 'ai',
          kind: 'error',
          at: nowIso(),
          content:
            '汉字: 网络连接有点慢哦，请重试。\n拼音: Wǎngluò liánjiē yǒudiǎn màn o, qǐng chóngshì.\n英文: The network connection is a bit slow, please try again.'
        }
      ]
      setMessages(withErr)
      messagesRef.current = withErr
    } finally {
      setLoading(false)
    }
  }

  // 回复到达时会话已经重置（切 HSK / 换场景）——up 是上一段对话的数组，
  // 写进 state 会把它整个插到新会话里并被当成新会话的记录存下来，直接丢弃。
  const discard = () => {
    console.warn('[chat] 会话已切换，丢弃迟到的回复')
  }

  // 包一层以便追踪进行中的请求：handleBack 要等它落地，否则最后一句 AI 回复不进记录
  const send = (text, channel = 'text') => {
    const p = sendInner(text, channel)
    inflightRef.current = p
    p.then(() => {
      if (inflightRef.current === p) inflightRef.current = null
    })
    return p
  }

  const handleMic = () => {
    if (listening) {
      stopListening()
      return
    }
    startListening((t) => {
      setInput(t)
      send(t, 'voice')
    })
  }

  // ── 离开对话：AI 评分本次会话并存练习记录（雷达图五维数据来源）──
  const handleBack = () => {
    // 等正在生成的回复落地再取快照，否则学生刚发的那句会被存下来而 AI 的回应不会。
    // 组件这会儿已经卸载了，所以靠 messagesRef 而不是 state 拿最新消息。
    const pending = inflightRef.current
    ;(pending ? pending.catch(() => {}) : Promise.resolve()).then(() => submit(snapshot()))
    const target = sceneId ? ROUTES.scenes : chatMode ? ROUTES.written : ROUTES.oral
    back(target)
  }

  if (!ready) return <View style={{ height: '100vh', background: '#FAFAF7' }} />

  return (
    <View style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FAFAF7' }}>
      <TopBar
        title={module.title}
        subtitle={module.titleEn}
        onBack={handleBack}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
        mode={mode}
        onChangeMode={onChangeMode}
      />

      <ScrollView
        scrollY
        scrollIntoView={anchorId}
        scrollWithAnimation
        style={{ flex: 1, minHeight: 0, padding: '16px 20px 120px' }}
      >
        <View style={{ width: '100%' }}>
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
            <View style={{ margin: '20px 0 8px', animation: 'su 0.3s both' }}>
              <View
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: 700, color: '#555' }}>
                  💡 不知道聊什么？试试这些话题
                </Text>
                <View
                  onClick={refreshTopics}
                  style={{ border: '1px solid #e0dcd0', borderRadius: 14, padding: '4px 12px' }}
                >
                  <Text style={{ fontSize: 12, color: '#888' }}>🔄 换一批</Text>
                </View>
              </View>

              <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topicRecs.map((t) => (
                  <View
                    key={t.id}
                    onClick={() => send(t.title)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#fff',
                      borderRadius: 14,
                      border: '1px solid #f0efe8',
                      padding: '14px 18px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                  >
                    <Text style={{ fontSize: 24, flexShrink: 0 }}>{t.emoji}</Text>
                    <Text style={{ flex: 1, fontSize: 15, color: '#333', fontWeight: 500 }}>
                      {t.title}
                    </Text>
                    {/* Web 版这里是内联 svg 右箭头 —— 同 MenuItem 处理，CSS 画 */}
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        flexShrink: 0,
                        borderTop: '2px solid #ccc',
                        borderRight: '2px solid #ccc',
                        transform: 'rotate(45deg)'
                      }}
                    />
                  </View>
                ))}
              </View>

              <Text
                style={{
                  fontSize: 11,
                  color: '#bbb',
                  marginTop: 10,
                  display: 'block',
                  textAlign: 'center'
                }}
              >
                基于你的 HSK 等级和练习历史推荐 · 点击即可开始对话
              </Text>
            </View>
          )}

          {loading && (
            <View
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                padding: '8px 0',
                animation: 'su 0.3s both'
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: module.bg || '#f0f0f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 16 }}>{module.icon}</Text>
              </View>
              <View
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  padding: '12px 18px',
                  border: '1px solid #f0efe8',
                  display: 'flex',
                  gap: 5
                }}
              >
                {[0, 1, 2].map((j) => (
                  <View
                    key={j}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#ccc',
                      animation: `dp 1.2s ${j * 0.2}s infinite`
                    }}
                  />
                ))}
              </View>
            </View>
          )}

          <View id={anchorId} />
        </View>
      </ScrollView>

      <View
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 20px',
          paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
          background: '#fff',
          borderTop: '1px solid #f0efe8',
          display: 'flex',
          justifyContent: 'center'
        }}
      >
        <View style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <Input
            value={input}
            // Web 版靠 Enter / onKeyDown 提交；小程序改成键盘右下角的「发送」
            confirmType="send"
            onConfirm={() => send(input)}
            onInput={(e) => setInput(e.detail.value)}
            placeholder={showVoice ? 'Type or tap mic...' : 'Type here...'}
            style={{
              flex: 1,
              padding: '14px 18px',
              borderRadius: 24,
              border: '1px solid #e8e6de',
              background: '#FAFAF7',
              fontSize: 15,
              color: '#1a1a1a'
            }}
          />

          {showVoice && (
            <View
              onClick={handleMic}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: listening ? module.color || '#4A90D9' : 'transparent',
                border: `2px solid ${module.color || '#4A90D9'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: listening ? 'pulse 1.5s infinite' : 'none',
                flexShrink: 0
              }}
            >
              <Text style={{ fontSize: 18 }}>{listening ? '⏺' : '🎤'}</Text>
            </View>
          )}

          <View
            onClick={() => send(input)}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: input.trim() ? module.color || '#4A90D9' : '#e8e6de',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Text style={{ fontSize: 18, color: '#fff' }}>➤</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// Taro 的 useRouter().params 每次渲染返回新对象，直接当 useMemo 依赖会让
// module 每秒重建一次。这里只取需要的三个标量。
function useRouterParams() {
  const router = useRouter()
  const p = router?.params || {}
  return { sceneId: p.sceneId, mode: p.mode, free: p.free }
}
