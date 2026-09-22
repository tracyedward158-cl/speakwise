import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useApp } from '../../context/AppContext'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { PronunciationDrill } from '../../components/PronunciationDrill'
import { ExampleText } from '../../components/ChatText'
import { SENTENCE_BANK } from '../../core/data/drills'
import { HSK_PROMPT } from '../../core/data/constants'
import { clean } from '../../core/utils/text'
import { callAI } from '../../core/utils/api'
import { buildRecord, saveRecord } from '../../core/utils/recordStore'
import {
  buildCustomBank,
  buildPracticeSession,
  enrichCustomBank,
  nextRoundParams
} from '../../core/utils/pronunciationBank'
import { useGuard } from '../../hooks/useGuard'
import { ROUTES, back, go, replace, stableParamsKey } from '../../platform/nav'

// ── 自定义练习：学生自己输入的文本 ──
const MAX_CUSTOM_CHARS = 500 // 输入上限：够读一小段课文，又不至于一次录几分钟音

// 参与选课的查询参数。顺序固定，用来拼一个稳定的 memo key ——
// Web 版用的是 `searchParams.toString()`，Taro 的 params 是对象、每次渲染都是新引用，
// 直接当依赖会让下面的 useMemo 每帧重算（随机模式就重新洗牌）。
const PARAM_KEYS = ['set', 'unit', 'mode', 'tag', 'seed', 'item', 'from']

function pickParams(params) {
  const out = {}
  for (const k of PARAM_KEYS) {
    if (params?.[k] !== undefined && params[k] !== '') out[k] = params[k]
  }
  return out
}

export default function DrillView() {
  const { ready } = useGuard({ studentOnly: true })
  const router = useRouter()
  const params = router?.params || {}
  const {
    hsk: hskLevel,
    setHsk: onChangeHSK,
    viewMode: mode,
    setViewMode: onChangeMode
  } = useApp()

  const type = params.type // "sentence" | "custom" | "practice"
  // ⚠️ Web 版用 `useLocation().pathname.startsWith('/written/')` 判断是不是写作侧，
  //    Taro 的 useRouter().path 只给到 pages/drill/index，区分不出 oral / written。
  //    所以改成显式的 section 查询参数，由导航方带上。
  const section = params.section

  const isPractice = type === 'practice'
  const isCustom = type === 'custom'
  const isSen = !isPractice && !isCustom // 其余（含历史 type）一律走造句分支

  const sessionKey = stableParamsKey(params, PARAM_KEYS)
  const session = useMemo(
    () => (isPractice ? buildPracticeSession(pickParams(params), hskLevel) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPractice, sessionKey, hskLevel]
  )

  // 自定义练习：customText 是输入框原文（重来时保留，方便改一改再练），
  // customBank 是断句结果；customBank === null 表示还停在输入页。
  const [customText, setCustomText] = useState('')
  const [customBank, setCustomBank] = useState(null)

  // 开始前的 AI 补全（拼音/英文/粒度）：断句是同步的、补全要等网络，
  // 所以「开始测评」是个异步动作，用这两个状态撑住等待期和失败重试。
  const [enriching, setEnriching] = useState(false)
  const [enrichError, setEnrichError] = useState(null)

  const bank = isPractice
    ? session?.items || []
    : isCustom
      ? customBank || []
      : SENTENCE_BANK[hskLevel]
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scores, setScores] = useState([])
  const [done, setDone] = useState(false)
  const fbRef = useRef(null)
  const q = bank[idx]
  const total = bank.length
  const color = isSen ? '#4A90D9' : '#7B6CF6'
  const bg = isSen ? '#EEF4FB' : '#F3F0FF'
  const pageTitle = isSen ? '造句练习' : isPractice ? session?.title || '练习' : '自定义练习'
  const pageSubtitle = isSen ? 'Sentence building' : isPractice ? session?.subtitle || '' : 'Custom practice'

  // 每个页面把自己的父页面写死 —— 与 Web 版一致，不依赖历史栈
  const onBack = useCallback(() => {
    if (section === 'written') return back(ROUTES.written)
    // 自定义练习是从模式选择页进来的，退回模式选择而不是口语主页
    back(isCustom ? ROUTES.pronunciation : ROUTES.oral)
  }, [section, isCustom])

  // 练习页要退回它进来的那一页（日常设置 / 题库浏览 / 测试选卷）
  const practiceBack = useCallback(() => {
    const from = params.from
    if (from === 'bank') return back(ROUTES.pronBank)
    if (from === 'test') return back(ROUTES.pronTest)
    if (from === 'daily') return back(ROUTES.pronDaily)
    back(ROUTES.pronunciation)
  }, [params.from])

  // 下一轮：顺序/专项把 offset 往前推一轮（到底绕回开头），随机模式换新种子。
  // 测试卷与单题练习没有下一轮——前者前后测必须拿到同一份固定卷，后者只有一道题。
  const canNextRound = isPractice && !!session && session.mode !== 'test' && session.mode !== 'single'
  const handleNextRound = useCallback(() => {
    const next = nextRoundParams(pickParams(params), session)
    // 用 replace 而不是 go：下一轮是「同一页换参数」，压栈的话练十轮就顶到小程序的 10 页上限
    replace(ROUTES.drill, { ...next, type: 'practice', section: params.section })
  }, [session, sessionKey, params.section])

  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => {
      Taro.createSelectorQuery()
        .select('#drill-feedback')
        .boundingClientRect((rect) => {
          if (rect && rect.top != null) {
            Taro.pageScrollTo({ scrollTop: Math.max(0, rect.top - 20), duration: 250 })
          }
        })
        .exec()
    }, 80)
    return () => clearTimeout(timer)
  }, [feedback])

  // ── Sentence mode: submit text to AI ──
  const submitSentence = async (text) => {
    if (!text.trim() || loading) return
    setInput(text.trim())
    setLoading(true)
    setFeedback(null)
    const sys = `Grade this Chinese sentence. Word: "${q.word}". Student wrote: "${text.trim()}". ${HSK_PROMPT[hskLevel]} Reply ONLY:\nSCORE: [0-100]\nFEEDBACK: [1 sentence]\nCORRECTION: [corrected version or "None"]`
    try {
      const raw = await callAI(sys, [{ role: 'user', content: text.trim() }], 300)
      const reply = clean(raw)
      const m = reply.match(/SCORE:\s*(\d+)/i)
      const score = m ? Math.min(parseInt(m[1]), 100) : 70
      setFeedback({ text: reply.replace(/SCORE:\s*\d+\s*/i, '').trim(), score })
      setScores((p) => [...p, score])
      saveRecord(
        buildRecord({
          module: '造句练习',
          scenario: q.word,
          score,
          hskLevel,
          problems: score < 70 ? ['语序错误', '词汇使用不当'] : score < 85 ? ['表达可更自然'] : [],
          suggestion: reply
            .replace(/SCORE:\s*\d+\s*/i, '')
            .trim()
            .slice(0, 80)
        })
      )
    } catch {
      setFeedback({ text: "网络稍有波动，请点击 'Next question' 尝试下一题哦~", score: 0 })
    }
    setLoading(false)
  }

  const next = () => {
    if (idx + 1 >= total) {
      setDone(true)
      return
    }
    setIdx(idx + 1)
    setInput('')
    setFeedback(null)
  }
  const restart = () => {
    setIdx(0)
    setInput('')
    setFeedback(null)
    setScores([])
    setDone(false)
  }

  // ── Score color helper ──
  const scoreColor = (s) => (s >= 80 ? '#2DAA6E' : s >= 60 ? '#E8A838' : s > 0 ? '#D4413A' : '#ccc')
  const scoreBg = (s) => (s >= 80 ? '#EDFAF3' : s >= 60 ? '#FFF8ED' : s > 0 ? '#FDF0EF' : '#f5f5f5')

  // ── 自定义练习：开始前先让 AI 补齐拼音/英文/粒度 ──
  // 缓存进 customBank 而不是评测时现取：录音-评测本来就有等待，
  // 再插一次网络请求会把「录音→出分」的节奏打断，而开始按钮上的等待是学生预期内的。
  const beginDrill = useCallback((items) => {
    setCustomBank(items)
    setIdx(0)
    setFeedback(null)
    setScores([])
    setDone(false)
  }, [])

  const startCustomDrill = useCallback(
    async (items) => {
      setEnriching(true)
      setEnrichError(null)
      try {
        const { bank: enriched, enriched: n } = await enrichCustomBank(items, callAI)
        // 一条都没补上说明 AI 没按格式回（而不是个别句子缺失），
        // 直接放行会让学生对着没有拼音的界面练，不如让他选重试还是照常开始
        if (n === 0) {
          setEnrichError('AI 没能生成拼音和英文，可以重试，或直接开始练习。')
          return
        }
        beginDrill(enriched)
      } catch (e) {
        setEnrichError(e?.message || '生成拼音和英文失败，请重试。')
      } finally {
        setEnriching(false)
      }
    },
    [beginDrill]
  )

  if (!ready) return <View style={{ minHeight: '100vh', background: '#FAFAF7' }} />

  // ── Custom mode: 输入文本（还没开始测评）──
  if (isCustom && !customBank) {
    const preview = buildCustomBank(customText)
    const overLimit = customText.length >= MAX_CUSTOM_CHARS
    const canStart = preview.length > 0 && !enriching

    return (
      <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
        <TopBar
          title={pageTitle}
          subtitle={pageSubtitle}
          onBack={onBack}
          hskLevel={hskLevel}
          onChangeHSK={onChangeHSK}
          mode={mode}
          onChangeMode={onChangeMode}
        />
        <PageWrap>
          <View style={{ padding: '20px 0 40px', animation: 'su 0.4s both' }}>
            <View
              style={{
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #f0efe8',
                padding: 24,
                marginBottom: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#bbb',
                  letterSpacing: 1,
                  display: 'block',
                  marginBottom: 12
                }}
              >
                Enter your text
              </Text>
              <Textarea
                value={customText}
                // 生成期间锁住：练习用的是点击那一刻的文本，中途改了会和界面对不上
                disabled={enriching}
                onInput={(e) => setCustomText(String(e.detail.value).slice(0, MAX_CUSTOM_CHARS))}
                placeholder="输入或粘贴你想练习的文本，比如课文段落、演讲稿、常用句子…"
                maxlength={-1}
                style={{
                  width: '100%',
                  height: 180,
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid #e8e6de',
                  background: '#FAFAF7',
                  fontSize: 17,
                  lineHeight: 1.8,
                  color: '#1a1a1a'
                }}
              />
              <View
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 8
                }}
              >
                <Text style={{ fontSize: 12, color: '#bbb' }}>
                  {preview.length > 0 ? `按标点分成 ${preview.length} 句，逐句朗读评测` : '还没有内容'}
                </Text>
                <Text style={{ fontSize: 12, color: overLimit ? '#D4413A' : '#ccc' }}>
                  {customText.length}/{MAX_CUSTOM_CHARS}
                </Text>
              </View>
            </View>

            {/* 断句预览：让学生看到自己的文本会被切成哪几句，切错了能改 */}
            {preview.length > 0 && (
              <View
                style={{
                  background: bg,
                  borderRadius: 14,
                  padding: '16px 20px',
                  marginBottom: 20,
                  borderLeft: `3px solid ${color}`
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color,
                    display: 'block',
                    marginBottom: 8,
                    letterSpacing: 1
                  }}
                >
                  Preview
                </Text>
                <View style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {preview.slice(0, 8).map((item, i) => (
                    <Text key={i} style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
                      {i + 1}. {item.text}
                    </Text>
                  ))}
                  {preview.length > 8 && (
                    <Text style={{ fontSize: 12, color: '#aaa' }}>…共 {preview.length} 句</Text>
                  )}
                </View>
              </View>
            )}

            {/* 补全失败不拦路：重试还是照常开始由学生决定，别让人卡在输入页 */}
            {enrichError && (
              <View
                style={{
                  background: '#FFF8ED',
                  borderRadius: 12,
                  border: '1px solid #E8A83840',
                  padding: '12px 16px',
                  marginBottom: 12
                }}
              >
                <Text style={{ fontSize: 13, color: '#B07A20', lineHeight: 1.7 }}>{enrichError}</Text>
              </View>
            )}

            <View
              onClick={() => canStart && startCustomDrill(preview)}
              style={{
                padding: 16,
                borderRadius: 12,
                background: canStart ? color : '#e8e6de',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              {enriching && (
                <View style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map((j) => (
                    <View
                      key={j}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#aaa',
                        animation: `dp 1.2s ${j * 0.2}s infinite`
                      }}
                    />
                  ))}
                </View>
              )}
              <Text style={{ fontSize: 16, fontWeight: 600, color: canStart ? '#fff' : '#aaa' }}>
                {enriching ? '正在生成拼音和英文…' : '开始测评 →'}
              </Text>
            </View>

            {enrichError && (
              <View
                onClick={() => beginDrill(preview)}
                style={{
                  marginTop: 10,
                  padding: 14,
                  borderRadius: 12,
                  border: `1.5px solid ${color}`,
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: 600, color }}>跳过，直接开始练习</Text>
              </View>
            )}

            <Text
              style={{
                fontSize: 12,
                color: '#bbb',
                display: 'block',
                textAlign: 'center',
                marginTop: 10,
                lineHeight: 1.7
              }}
            >
              {enriching ? '正在为每一句生成拼音、英文和粒度，请稍候' : '开始后逐句录音评测，全部读完给出总评'}
            </Text>
          </View>
        </PageWrap>
      </View>
    )
  }

  // ── 练习模式选不出题（手改参数或题库变动导致）：给出明确出口，不要渲染空题崩溃 ──
  if (isPractice && bank.length === 0) {
    return (
      <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
        <TopBar
          title={pageTitle}
          subtitle={pageSubtitle}
          onBack={practiceBack}
          hskLevel={hskLevel}
          onChangeHSK={onChangeHSK}
          mode={mode}
          onChangeMode={onChangeMode}
        />
        <PageWrap>
          <View style={{ padding: '60px 0', textAlign: 'center', animation: 'su 0.4s both' }}>
            <Text style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🗂️</Text>
            <Text style={{ fontSize: 16, color: '#666', display: 'block', marginBottom: 6 }}>
              这个组合下暂时没有题目
            </Text>
            <Text style={{ fontSize: 13, color: '#bbb', display: 'block', marginBottom: 24, lineHeight: 1.7 }}>
              换一个粒度或专项再试
            </Text>
            <View
              onClick={practiceBack}
              style={{
                padding: '14px 32px',
                borderRadius: 12,
                background: '#7B6CF6',
                display: 'inline-flex'
              }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>返回选择</Text>
            </View>
          </View>
        </PageWrap>
      </View>
    )
  }

  // ── 练习 / 自定义练习：评测界面交给共用组件 ──
  if (!isSen) {
    return (
      <PronunciationDrill
        // key 绑在查询参数上：点「下一轮」换了 offset/seed 就重新挂载，
        // 否则组件的 idx/done 等内部状态会留着，新题会从上一轮的结果页开始
        key={isPractice ? sessionKey : 'custom'}
        bank={bank}
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={isPractice ? practiceBack : onBack}
        isCustom={isCustom}
        source={isPractice ? params.set || 'train' : 'custom'}
        onRestart={isCustom ? () => setCustomBank(null) : undefined}
        onNextRound={canNextRound ? handleNextRound : undefined}
      />
    )
  }

  // ── Results page ──
  if (done) {
    const validScores = scores.filter((s) => s > 0)
    const avg = validScores.length
      ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
      : 0
    const emoji = avg >= 90 ? '🤩' : avg >= 80 ? '😎' : avg >= 70 ? '😊' : avg >= 60 ? '🤔' : '😅'
    return (
      <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
        <TopBar
          title={pageTitle}
          subtitle="Results"
          onBack={onBack}
          hskLevel={hskLevel}
          onChangeHSK={onChangeHSK}
          mode={mode}
          onChangeMode={onChangeMode}
        />
        <PageWrap>
          <View style={{ padding: '32px 0', textAlign: 'center', animation: 'su 0.4s both' }}>
            <Text style={{ fontSize: 56, display: 'block', marginBottom: 12 }}>{emoji}</Text>
            <Text style={{ fontSize: 48, fontWeight: 700, color, display: 'block', marginBottom: 4 }}>
              {avg}
              <Text style={{ fontSize: 20, color: '#999' }}>/100</Text>
            </Text>
            <Text style={{ fontSize: 15, color: '#888', display: 'block', marginBottom: 28 }}>
              Average across {validScores.length} questions
            </Text>

            <View
              style={{
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #f0efe8',
                overflow: 'hidden',
                marginBottom: 24
              }}
            >
              {scores.map((s, i) => (
                <View
                  key={i}
                  style={{
                    padding: '14px 18px',
                    borderBottom: i < scores.length - 1 ? '1px solid #f7f6f1' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ fontSize: 14, color: '#666' }}>
                    Q{i + 1}. {bank[i].word}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: 600, color: scoreColor(s) }}>
                    {s > 0 ? s : '—'}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ display: 'flex', gap: 10 }}>
              <View
                onClick={restart}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  border: `1.5px solid ${color}`,
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: 600, color }}>Try again</Text>
              </View>
              <View
                onClick={onBack}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  background: color,
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>Back</Text>
              </View>
            </View>
          </View>
        </PageWrap>
      </View>
    )
  }

  // ── Active drill view ──
  return (
    <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      <TopBar
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={onBack}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
        mode={mode}
        onChangeMode={onChangeMode}
      />
      <PageWrap>
        <View style={{ padding: '20px 0 140px' }}>
          {/* ── Progress bar ── */}
          <View style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <View style={{ flex: 1, height: 6, background: '#ebe9e1', borderRadius: 3, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${((idx + (feedback ? 1 : 0)) / total) * 100}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 3,
                  transition: 'width 0.4s'
                }}
              />
            </View>
            <Text style={{ fontSize: 13, color: '#999', fontWeight: 600 }}>
              {idx + 1}/{total}
            </Text>
          </View>

          {/* ── Question card ── */}
          <View
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #f0efe8',
              padding: '28px 24px',
              marginBottom: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#bbb',
                letterSpacing: 1,
                display: 'block',
                marginBottom: 16
              }}
            >
              Use this word to make a sentence
            </Text>
            <Text style={{ fontSize: 30, fontWeight: 700, color: '#1a1a1a', display: 'block', marginBottom: 8 }}>
              {q.word}
            </Text>
            {(mode === 'HPE' || mode === 'HP') && q.pinyin ? (
              <Text style={{ fontSize: 15, color, display: 'block', marginBottom: 4 }}>{q.pinyin}</Text>
            ) : null}
            {(mode === 'HPE' || mode === 'HE') && q.meaning ? (
              <Text style={{ fontSize: 14, color: '#999', display: 'block' }}>{q.meaning}</Text>
            ) : null}
            <Text style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic', display: 'block', marginTop: 8 }}>
              Hint: {q.hint}
            </Text>
          </View>

          {/* ── Sentence mode feedback (text-based AI grading) ── */}
          {feedback && (
            <View id="drill-feedback">
              <View
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: `1.5px solid ${feedback.score >= 80 ? '#2DAA6E40' : feedback.score >= 60 ? '#E8A83840' : '#D4413A40'}`,
                  padding: 22,
                  marginBottom: 14,
                  animation: 'su 0.3s both'
                }}
              >
                <View
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: 600, color: '#888' }}>AI feedback</Text>
                  <View
                    style={{
                      background: scoreBg(feedback.score),
                      borderRadius: 20,
                      padding: '5px 16px'
                    }}
                  >
                    <Text
                      style={{ fontSize: 17, fontWeight: 700, color: scoreColor(feedback.score) }}
                    >
                      {feedback.score > 0 ? feedback.score + '/100' : 'Error'}
                    </Text>
                  </View>
                </View>
                {input ? (
                  <Text style={{ fontSize: 14, color: '#888', display: 'block', marginBottom: 10 }}>
                    Your answer: <Text style={{ color: '#1a1a1a' }}>{input}</Text>
                  </Text>
                ) : null}
                <Text style={{ fontSize: 15, color: '#444', lineHeight: 1.7 }}>{feedback.text}</Text>
              </View>

              <View
                style={{
                  background: bg,
                  borderRadius: 14,
                  padding: '18px 20px',
                  marginBottom: 20,
                  borderLeft: `3px solid ${color}`
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color,
                    display: 'block',
                    marginBottom: 8,
                    letterSpacing: 1
                  }}
                >
                  Reference example
                </Text>
                <ExampleText text={q.example || q.sentence} mode={mode} />
              </View>

              <View
                onClick={next}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: color,
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                  {idx + 1 >= total ? 'See results →' : 'Next question →'}
                </Text>
              </View>
            </View>
          )}

          {/* ── Loading state ── */}
          {loading && !feedback && (
            <View style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <View style={{ display: 'flex', gap: 5 }}>
                {[0, 1, 2].map((j) => (
                  <View
                    key={j}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                      animation: `dp 1.2s ${j * 0.2}s infinite`
                    }}
                  />
                ))}
              </View>
              <Text style={{ fontSize: 13, color: '#999', marginTop: 8 }}>AI grading...</Text>
            </View>
          )}
        </View>
      </PageWrap>

      {/* ── Bottom input bar ── */}
      {!feedback && !loading && (
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
              confirmType="send"
              onConfirm={() => submitSentence(input)}
              onInput={(e) => setInput(e.detail.value)}
              placeholder="Type your sentence..."
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
            <View
              onClick={() => submitSentence(input)}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: input.trim() ? color : '#e8e6de',
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
      )}
    </View>
  )
}
