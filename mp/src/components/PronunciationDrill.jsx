import { useState, useRef, useEffect, useCallback } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useApp } from '../context/AppContext'
import { TopBar } from './TopBar'
import { PageWrap } from './PageWrap'
import { useSpeech } from '../hooks/useSpeech'
import { evaluatePronunciation } from '../core/utils/api'
import { resetRecorder, startRecording, stopRecording } from '../platform/recorder'
import { micErrorToast } from '../platform/privacy'
import { buildRecord, saveRecord } from '../core/utils/recordStore'
import { coreFor, extractFeedback, dimensionCells } from '../core/utils/pronunciationBank'

// records.scenario 在库里是 VARCHAR(128)，超长会触发 MySQL 严格模式的 ER_DATA_TOO_LONG。
// saveRecord 遇到写入失败只会静默降级到本地存储（见 core/utils/recordStore.js），
// 结果是学生看到「已保存」、老师端却永远收不到这条记录。自定义练习的文本长度不可控，
// 所以必须在进库前截断。题库里的句子本来就不长，截断对它们无影响。
const MAX_SCENARIO = 128
const cutScenario = (s) => String(s || '').slice(0, MAX_SCENARIO)

/**
 * 发音测评的评测界面：录音 → 讯飞评测 → 逐字/多维反馈 → 结果页。
 * 被「自定义练习」和题库驱动的日常/测试/单题练习共用。
 *
 * 与 Web 版的差异集中在录音那一段：Web 用 Web Audio API 采集 PCM 并自己拼 WAV 头，
 * 小程序换成 wx.getRecorderManager（见 platform/recorder.js），录出来的直接是 mp3。
 * 服务端对非 WAV 输入原样透传给讯飞，所以 /api/evaluate 一行都不用改。
 */
export function PronunciationDrill({
  bank,
  title,
  subtitle,
  onBack,
  isCustom = false,
  source = '',
  onRestart,
  onNextRound
}) {
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp()

  const [idx, setIdx] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scores, setScores] = useState([])
  const [done, setDone] = useState(false)
  const [recording, setRecording] = useState(false)
  const { speaking, speak, stopSpeaking } = useSpeech()
  const fbRef = useRef(null)

  const q = bank[idx]
  const total = bank.length
  const color = '#7B6CF6'
  const bg = '#F3F0FF'

  // 反馈出现后滚到它那里。Web 版用 scrollIntoView，小程序对应 pageScrollTo。
  // 拿不到元素位置就退化成滚到页面顶部，不至于什么都不做。
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

  // 页面卸载/切走时必须复位录音状态。
  //
  // 这里刻意**不加** `if (isRecording())` 那种条件 —— 原来的写法就是这么写的，
  // 而 isRecording() 不含 'stopping'，于是「点了停止但 onStop 没来」这一种卡死
  // 场景下，退出页面也解不开，之后每次点麦克风都报「正在录音中」。
  // 无条件复位才是对的：这个页面走了，它持有的录音状态就该一并清掉。
  useEffect(() => () => resetRecorder(), [])

  // ── Pronunciation mode: 录音 → 讯飞评测 ──
  const handleStart = useCallback(async () => {
    try {
      // 播放中的示范音会被麦克风一起录进去，先掐掉（在 recorder 里也做了一次，
      // 这里显式再停一下是为了让 UI 的 playing 状态立刻落下去）
      stopSpeaking()
      await startRecording()
      setRecording(true)
    } catch (e) {
      console.error('Mic access failed:', e)
      micErrorToast(e)
    }
  }, [stopSpeaking])

  const stopAndEvaluate = useCallback(async () => {
    setRecording(false)
    setLoading(true)
    setFeedback(null)

    try {
      const { base64 } = await stopRecording()

      // 字/词用 word 评测，句用 sent（见 core/utils/pronunciationBank.coreFor）。
      // 同一场测试里 core 会中途切换：标准卷前 20 题是字/词，后 5 题是句。
      const result = await evaluatePronunciation(base64, q.text, coreFor(q.unit))
      const { feedback: fb, record } = extractFeedback(result, q)

      saveRecord(
        buildRecord({
          module: '发音测评',
          scenario: cutScenario(q.text),
          score: record.score,
          hskLevel,
          dimensions: record.dimensions,
          problems: record.problems,
          suggestion: record.suggestion,
          source
        })
      )

      setFeedback(fb)
      setScores((p) => [...p, fb.overall])
    } catch (e) {
      console.error('Evaluation failed:', e)
      if (e?.code === 'ABORTED') {
        setLoading(false)
        return
      }
      setFeedback({ type: 'error', text: e?.message || '评测服务暂时不可用，请稍后重试', score: 0 })
    }
    setLoading(false)
  }, [q?.text, source, hskLevel]) // 依赖数组在渲染期求值：尚未开始时 q 还不存在

  const handleMic = () => {
    if (recording) stopAndEvaluate()
    else handleStart()
  }

  const next = () => {
    if (idx + 1 >= total) {
      setDone(true)
      return
    }
    setIdx(idx + 1)
    setFeedback(null)
  }

  const restart = () => {
    setIdx(0)
    setFeedback(null)
    setScores([])
    setDone(false)
    // 自定义练习：退回输入页（文本框保留上次内容，方便改一改再练）
    onRestart?.()
  }

  // 反复练习同一题：清掉反馈重录。回退 scores 最后一项，
  // 否则同一题会占两个成绩、把结果页的平均分算歪。
  // 记录仍然每次都写——题库浏览的「已练次数」就是按录音次数统计的。
  const retry = () => {
    setFeedback(null)
    setScores((p) => p.slice(0, -1))
  }

  // ── Score color helper ──
  const scoreColor = (s) => (s >= 80 ? '#2DAA6E' : s >= 60 ? '#E8A838' : s > 0 ? '#D4413A' : '#ccc')
  const scoreBg = (s) => (s >= 80 ? '#EDFAF3' : s >= 60 ? '#FFF8ED' : s > 0 ? '#FDF0EF' : '#f5f5f5')

  // ── Results page ──
  if (done) {
    const validScores = scores.filter((s) => s > 0)
    const avg = validScores.length
      ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
      : 0
    return (
      <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
        <TopBar
          title={title}
          subtitle="Results"
          onBack={onBack}
          hskLevel={hskLevel}
          onChangeHSK={onChangeHSK}
          mode={mode}
          onChangeMode={onChangeMode}
        />
        <PageWrap>
          <View style={{ padding: '32px 0', textAlign: 'center', animation: 'su 0.4s both' }}>
            <Text
              style={{ fontSize: 48, fontWeight: 700, color, display: 'block', marginTop: 12 }}
            >
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
                    Q{i + 1}. {(bank[i]?.text || '').slice(0, 15)}…
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: 600, color: scoreColor(s) }}>
                    {s > 0 ? s : '—'}
                  </Text>
                </View>
              ))}
            </View>

            {/* 下一轮：顺序/专项接着往下轮转、随机换一批。没有它的话顺序模式永远
                只练池子前 10 题，第 11 题往后学生根本碰不到 */}
            {onNextRound && (
              <View
                onClick={onNextRound}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: color,
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: 10
                }}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>下一轮 →</Text>
              </View>
            )}

            <View style={{ display: 'flex', gap: 10 }}>
              <View
                onClick={restart}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  border: onNextRound ? '1px solid #e8e6de' : `1.5px solid ${color}`,
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: 600, color: onNextRound ? '#888' : color }}>
                  {isCustom ? '修改文本' : '再练一遍'}
                </Text>
              </View>
              <View
                onClick={onBack}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  background: onNextRound ? '#F5F0FA' : color,
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: 600, color: onNextRound ? color : '#fff' }}>
                  返回
                </Text>
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
        title={title}
        subtitle={subtitle}
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
            <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: 600, color: '#bbb', letterSpacing: 1 }}>
                {q.unit === '字'
                  ? 'Read this character aloud'
                  : q.unit === '词'
                    ? 'Read this word aloud'
                    : 'Read this sentence aloud'}
              </Text>
              {q.unit ? (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: bg,
                    color
                  }}
                >
                  {q.unit}
                </Text>
              ) : null}
            </View>

            <Text
              style={{
                fontSize: q.unit === '句' ? 26 : 40,
                fontWeight: 700,
                color: '#1a1a1a',
                display: 'block',
                marginBottom: 8,
                lineHeight: 1.5
              }}
            >
              {q.text}
            </Text>
            {(mode === 'HPE' || mode === 'HP') && q.pinyin ? (
              <Text style={{ fontSize: 15, color, display: 'block', marginBottom: 4 }}>{q.pinyin}</Text>
            ) : null}
            {(mode === 'HPE' || mode === 'HE') && q.english ? (
              <Text style={{ fontSize: 14, color: '#999', display: 'block' }}>{q.english}</Text>
            ) : null}

            {/* 难点标签：让「专项练习」的针对性可见 */}
            {q.tags && q.tags.length > 0 ? (
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {q.tags.map((t) => (
                  <Text
                    key={t}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: '#F5F5F0',
                      color: '#999'
                    }}
                  >
                    {t}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={{ display: 'flex', gap: 8 }}>
              <View
                onClick={() => (speaking ? stopSpeaking() : speak(q.text))}
                style={{
                  marginTop: 14,
                  background: bg,
                  border: `1px solid ${color}30`,
                  borderRadius: 20,
                  padding: '8px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Text style={{ fontSize: 13, color }}>{speaking ? '⏹ 停止' : '🔊 播放'}</Text>
              </View>
              <View
                onClick={() => speak(q.text, true)}
                style={{
                  marginTop: 14,
                  background: '#fff',
                  border: `1px solid ${color}30`,
                  borderRadius: 20,
                  padding: '8px 14px'
                }}
              >
                <Text style={{ fontSize: 13, color }}>慢速</Text>
              </View>
            </View>
          </View>

          {/* ── Pronunciation mode feedback (iFlytek multi-dimension) ── */}
          {feedback && feedback.type === 'iflytek' && (
            <View id="drill-feedback" style={{ animation: 'su 0.3s both' }}>
              {/* Overall score */}
              <View
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: `1.5px solid ${scoreColor(feedback.overall)}40`,
                  padding: 24,
                  marginBottom: 16,
                  textAlign: 'center'
                }}
              >
                <Text style={{ fontSize: 13, color: '#999', display: 'block', marginBottom: 8 }}>
                  综合评分
                </Text>
                <Text
                  style={{
                    fontSize: 52,
                    fontWeight: 700,
                    color: scoreColor(feedback.overall),
                    lineHeight: 1
                  }}
                >
                  {feedback.overall}
                </Text>
                <Text style={{ fontSize: 14, color: '#bbb', display: 'block', marginTop: 4 }}>/ 100</Text>
              </View>

              {/* Dimension scores —— 只渲染有值的格：word 模式（字/词）没有
                  流利度/完整度/韵律度/语速，固定 6 格会变成 4 个连着的「—」。
                  Web 版用 grid repeat(3,1fr)，WXSS 的 grid 支持不稳，改成 flex 三列。 */}
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                {dimensionCells(feedback).map((d) => (
                  <View
                    key={d.label}
                    style={{
                      width: '31.5%',
                      background: '#fff',
                      borderRadius: 12,
                      border: '1px solid #f0efe8',
                      padding: '14px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ fontSize: 11, color: '#bbb', marginBottom: 4 }}>{d.label}</Text>
                    <Text
                      style={
                        d.raw
                          ? { fontSize: 14, fontWeight: 600, color: '#666' }
                          : { fontSize: 22, fontWeight: 700, color: scoreColor(d.value) }
                      }
                    >
                      {d.value}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Per-character breakdown */}
              {feedback.words && feedback.words.length > 0 && (
                <View
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    border: '1px solid #f0efe8',
                    padding: '20px 24px',
                    marginBottom: 16
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: 600, color: '#888', display: 'block', marginBottom: 14 }}>
                    逐字评分
                  </Text>
                  <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {feedback.words
                      .filter((w) => w.charType !== 1)
                      .map((w, i) => {
                        const ws = w.scores?.overall ?? 0
                        const readLabel =
                          w.readType === 1 ? ' (增读)' : w.readType === 2 ? ' (漏读)' : w.readType === 4 ? ' (错读)' : ''
                        return (
                          <View
                            key={i}
                            style={{
                              background: scoreBg(ws),
                              borderRadius: 10,
                              padding: '8px 14px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2,
                              border: `1px solid ${scoreColor(ws)}20`
                            }}
                          >
                            <Text style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>{w.word}</Text>
                            {(mode === 'HPE' || mode === 'HP') && w.pinyin ? (
                              <Text style={{ fontSize: 11, color: '#999' }}>{w.pinyin}</Text>
                            ) : null}
                            <Text style={{ fontSize: 15, fontWeight: 600, color: scoreColor(ws) }}>{ws}</Text>
                            {readLabel ? (
                              <Text style={{ fontSize: 10, color: '#D4413A' }}>{readLabel}</Text>
                            ) : null}
                          </View>
                        )
                      })}
                  </View>

                  {/* readType legend */}
                  {feedback.words.some((w) => w.readType > 0) && (
                    <View style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
                      <Text style={{ fontSize: 11, color: '#aaa' }}>🟡 增读 = 多读了字</Text>
                      <Text style={{ fontSize: 11, color: '#aaa' }}>🔴 漏读 = 少读了字</Text>
                      <Text style={{ fontSize: 11, color: '#aaa' }}>🟠 错读 = 发音错误</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Warnings */}
              {feedback.warning && feedback.warning.length > 0 && (
                <View
                  style={{
                    background: '#FFF8ED',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 16,
                    border: '1px solid #E8A83830'
                  }}
                >
                  {feedback.warning.map((w, i) => (
                    <Text key={i} style={{ fontSize: 13, color: '#E8A838', display: 'block' }}>
                      {w.message === 'Audio noisy!' ? '检测到环境噪音，建议在安静环境中录音' : w.message}
                    </Text>
                  ))}
                </View>
              )}

              {/* Reference —— 直接渲染字段，不走 ExampleText。
                  那个 helper 靠正则拆「汉字(拼音)英文」，而题库的拼音/英文是独立字段、
                  文本里没有括号，用它会静默丢掉拼音和英文、模式切换也失效。
                  自定义练习的题目没有 pinyin/english，这里自然只显示正文。 */}
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
                  参考发音
                </Text>
                <View style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text style={{ fontSize: 16, color: '#1a1a1a', lineHeight: 1.7 }}>{q.text}</Text>
                  {(mode === 'HPE' || mode === 'HP') && q.pinyin ? (
                    <Text style={{ fontSize: 14, color: '#888' }}>{q.pinyin}</Text>
                  ) : null}
                  {(mode === 'HPE' || mode === 'HE') && q.english ? (
                    <Text style={{ fontSize: 13, color: '#aaa' }}>{q.english}</Text>
                  ) : null}
                </View>
              </View>

              <View style={{ display: 'flex', gap: 10 }}>
                <View
                  onClick={retry}
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    border: `1.5px solid ${color}`,
                    display: 'flex',
                    justifyContent: 'center'
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: 600, color }}>再练一次</Text>
                </View>
                <View
                  onClick={next}
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    background: color,
                    display: 'flex',
                    justifyContent: 'center'
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                    {idx + 1 >= total ? '看结果 →' : '下一题 →'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Error feedback ── */}
          {feedback && feedback.type === 'error' && (
            <View id="drill-feedback">
              <View
                style={{
                  background: '#FDF0EF',
                  borderRadius: 16,
                  border: '1.5px solid #D4413A40',
                  padding: 22,
                  marginBottom: 14,
                  animation: 'su 0.3s both',
                  textAlign: 'center'
                }}
              >
                <Text style={{ fontSize: 15, color: '#D4413A' }}>{feedback.text}</Text>
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
                  {idx + 1 >= total ? '看结果 →' : '下一题 →'}
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
              <Text style={{ fontSize: 13, color: '#999', marginTop: 8 }}>评测中...</Text>
            </View>
          )}
        </View>
      </PageWrap>

      {/* ── Bottom mic bar ── */}
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
          <View style={{ width: '100%' }}>
            <View
              onClick={handleMic}
              style={{
                padding: 16,
                borderRadius: 28,
                border: `2px solid ${color}`,
                background: recording ? color : 'transparent',
                animation: recording ? 'pulse 1.5s infinite' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <Text style={{ fontSize: 18 }}>{recording ? '⏹' : '🎤'}</Text>
              <Text style={{ fontSize: 16, fontWeight: 600, color: recording ? '#fff' : color }}>
                {recording ? '点击停止评测' : '点击开始录音'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
