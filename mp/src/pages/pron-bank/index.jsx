import { useState, useMemo, useEffect } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { recordApi } from '../../core/utils/api'
import { getStudentProfile, getStudentRecords } from '../../core/utils/recordStore'
import { formatRecordDate } from '../../core/utils/transcript'
import { PRON_BANK, ALL_TAGS, UNITS, statsByText } from '../../core/utils/pronunciationBank'
import { ROUTES, back, go } from '../../platform/nav'

const COLOR = '#4A90D9'
const ALL = '全部'

const scoreColor = (s) => (s >= 80 ? '#2DAA6E' : s >= 60 ? '#E8A838' : s > 0 ? '#D4413A' : '#ccc')

function FilterChip({ active, onClick, children }) {
  return (
    <View
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderRadius: 16,
        whiteSpace: 'nowrap',
        background: active ? COLOR : '#fff',
        border: `1px solid ${active ? COLOR : '#e8e6de'}`,
        flexShrink: 0
      }}
    >
      <Text style={{ fontSize: 13, color: active ? '#fff' : '#777', fontWeight: active ? 600 : 400 }}>
        {children}
      </Text>
    </View>
  )
}

export default function PronunciationBank() {
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp()
  const { user } = useAuth()
  const isGuest = !user

  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState(ALL)
  const [tag, setTag] = useState(ALL)
  const [expanded, setExpanded] = useState(null) // 展开历史的那条题目 id

  // 练习记录：与「我的练习记录」同一口径——登录取云端，游客取本地
  const [profile] = useState(() => (user ? { id: user.id } : getStudentProfile()))
  const [cloudRecords, setCloudRecords] = useState(null) // null = 加载中
  useEffect(() => {
    if (isGuest) return
    let cancelled = false
    recordApi
      .mine()
      .then(({ records }) => {
        if (!cancelled) setCloudRecords(records)
      })
      .catch((err) => {
        console.warn('[PronunciationBank] 云端记录获取失败:', err.message)
        if (!cancelled) setCloudRecords([])
      })
    return () => {
      cancelled = true
    }
  }, [isGuest, user?.id])

  const records = useMemo(
    () => (isGuest ? getStudentRecords(profile.id) : cloudRecords || []),
    [isGuest, profile.id, cloudRecords]
  )
  // 记录里没存题库 id，句子原文是唯一的关联键
  const stats = useMemo(() => statsByText(records), [records])

  const list = useMemo(() => {
    const kw = query.trim().toLowerCase()
    return PRON_BANK.filter(
      (it) =>
        it.level === hskLevel &&
        (unit === ALL || it.unit === unit) &&
        (tag === ALL || it.tags.includes(tag)) &&
        (!kw ||
          it.text.toLowerCase().includes(kw) ||
          (it.pinyin || '').toLowerCase().includes(kw) ||
          (it.english || '').toLowerCase().includes(kw))
    )
  }, [hskLevel, unit, tag, query])

  const practice = (it) =>
    go(ROUTES.drill, { mode: 'single', item: it.id, from: 'bank', type: 'practice', section: 'oral' })

  if (!ready) return <View style={{ minHeight: '100vh', background: '#FAFAF7' }} />

  return (
    <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      <TopBar
        title="题库浏览"
        subtitle="Question Bank"
        onBack={() => back(ROUTES.pronunciation)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
        mode={mode}
        onChangeMode={onChangeMode}
      />
      <PageWrap>
        <View style={{ padding: '18px 0 40px' }}>
          {/* ── 搜索 ── */}
          <View style={{ position: 'relative', marginBottom: 14 }}>
            <Input
              value={query}
              onInput={(e) => setQuery(e.detail.value)}
              placeholder="搜索汉字、拼音或英文…"
              style={{
                width: '100%',
                padding: '13px 40px 13px 16px',
                borderRadius: 12,
                border: '1px solid #e8e6de',
                background: '#fff',
                fontSize: 15,
                color: '#1a1a1a'
              }}
            />
            {query ? (
              <View
                onClick={() => setQuery('')}
                style={{ position: 'absolute', right: 12, top: 10, padding: 4 }}
              >
                <Text style={{ fontSize: 16, color: '#ccc' }}>✕</Text>
              </View>
            ) : null}
          </View>

          {/* ── 两排筛选 ──
              Web 版用 overflowX:auto 做横向滚动。小程序的 View 滚不了，
              要换成 ScrollView scrollX。 */}
          <ScrollView scrollX style={{ whiteSpace: 'nowrap', paddingBottom: 8 }}>
            <View style={{ display: 'flex', gap: 8, paddingRight: 8 }}>
              {[ALL, ...UNITS].map((u) => (
                <FilterChip key={u} active={unit === u} onClick={() => setUnit(u)}>
                  {u}
                </FilterChip>
              ))}
            </View>
          </ScrollView>

          <ScrollView scrollX style={{ whiteSpace: 'nowrap', paddingBottom: 8, marginBottom: 12 }}>
            <View style={{ display: 'flex', gap: 8, paddingRight: 8 }}>
              {[ALL, ...ALL_TAGS].map((t) => (
                <FilterChip key={t} active={tag === t} onClick={() => setTag(t)}>
                  {t}
                </FilterChip>
              ))}
            </View>
          </ScrollView>

          <Text style={{ fontSize: 12, color: '#bbb', display: 'block', marginBottom: 10 }}>
            共 {list.length} 题 · HSK {hskLevel || '未设置'}　点题目直接朗读评测
          </Text>

          {/* ── 题目列表 ── */}
          {list.length === 0 && (
            <View
              style={{
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #f0efe8',
                padding: '40px 20px',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <Text style={{ color: '#bbb', fontSize: 14 }}>没有匹配的题目</Text>
            </View>
          )}

          {list.length > 0 && (
            <View style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0efe8', overflow: 'hidden' }}>
              {list.map((it, i) => {
                const st = stats.get(it.text)
                const isOpen = expanded === it.id
                return (
                  <View
                    key={it.id}
                    style={{ borderBottom: i < list.length - 1 ? '1px solid #f7f6f1' : 'none' }}
                  >
                    <View
                      onClick={() => practice(it)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <Text
                            style={{
                              fontSize: it.unit === '句' ? 16 : 20,
                              fontWeight: 600,
                              color: '#1a1a1a'
                            }}
                          >
                            {it.text}
                          </Text>
                          {(mode === 'HPE' || mode === 'HP') && (
                            <Text style={{ fontSize: 12, color: '#aaa' }}>{it.pinyin}</Text>
                          )}
                        </View>

                        <View
                          style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              padding: '1px 7px',
                              borderRadius: 8,
                              background: '#EEF4FB',
                              color: COLOR,
                              fontWeight: 600
                            }}
                          >
                            {it.unit}
                          </Text>
                          {it.tags.map((t) => (
                            <Text
                              key={t}
                              style={{
                                fontSize: 10,
                                padding: '1px 7px',
                                borderRadius: 8,
                                background: '#F5F5F0',
                                color: '#999'
                              }}
                            >
                              {t}
                            </Text>
                          ))}
                        </View>
                      </View>

                      <View style={{ textAlign: 'right', flexShrink: 0, minWidth: 62 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: st ? '#666' : '#ccc',
                            display: 'block'
                          }}
                        >
                          {st ? `已练 ${st.count} 次` : '未练'}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            display: 'block',
                            color: st && st.best > 0 ? scoreColor(st.best) : '#ccc',
                            fontWeight: st && st.best > 0 ? 700 : 400
                          }}
                        >
                          {st && st.best > 0 ? `最高 ${st.best}` : '最高 —'}
                        </Text>
                      </View>

                      {/* 展开历史。stopPropagation 让这次点击不触发上面那行的「开始练习」 */}
                      <View
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpanded(isOpen ? null : it.id)
                        }}
                        style={{ padding: 6, flexShrink: 0 }}
                      >
                        <Text
                          style={{
                            color: '#ccc',
                            fontSize: 12,
                            display: 'block',
                            transform: isOpen ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s'
                          }}
                        >
                          ▼
                        </Text>
                      </View>
                    </View>

                    {/* ── 历史评分记录 ── */}
                    {isOpen && (
                      <View style={{ background: '#FAFAF7', padding: '12px 16px', borderTop: '1px solid #f7f6f1' }}>
                        {!st && (
                          <Text style={{ fontSize: 12, color: '#bbb' }}>
                            还没有练习记录，点题目开始第一次朗读。
                          </Text>
                        )}
                        {st && (
                          <>
                            <Text style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 8 }}>
                              历史评分 · 共 {st.count} 次
                            </Text>
                            <View style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {st.history.slice(0, 8).map((r) => (
                                <View key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <Text style={{ color: '#bbb', flexShrink: 0, fontSize: 12 }}>
                                    {formatRecordDate(r)}
                                  </Text>
                                  <Text
                                    style={{
                                      width: 34,
                                      textAlign: 'right',
                                      fontWeight: 700,
                                      color: scoreColor(r.score),
                                      flexShrink: 0,
                                      fontSize: 12
                                    }}
                                  >
                                    {r.score > 0 ? r.score : '—'}
                                  </Text>
                                  <Text
                                    style={{
                                      color: '#ccc',
                                      fontSize: 12,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1
                                    }}
                                  >
                                    {r.dimensions
                                      ? [
                                          ['发音', r.dimensions.pronunciation],
                                          ['声调', r.dimensions.tone],
                                          ['流利度', r.dimensions.fluency]
                                        ]
                                          .filter(([, v]) => v != null)
                                          .map(([k, v]) => `${k} ${v}`)
                                          .join(' · ')
                                      : ''}
                                  </Text>
                                </View>
                              ))}
                              {st.history.length > 8 && (
                                <Text style={{ fontSize: 11, color: '#ccc' }}>
                                  …还有 {st.history.length - 8} 次
                                </Text>
                              )}
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          <Text
            style={{
              fontSize: 12,
              color: '#bbb',
              display: 'block',
              textAlign: 'center',
              marginTop: 14,
              lineHeight: 1.7
            }}
          >
            已练次数与最高分来自你自己的练习记录 · 按题目原文匹配
          </Text>
        </View>
      </PageWrap>
    </View>
  )
}
