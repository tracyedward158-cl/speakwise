import { useState, useMemo, useEffect } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { AbilityRadar } from '../../components/AbilityRadar'
import { TranscriptModal } from '../../components/TranscriptModal'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { useGuard } from '../../hooks/useGuard'
import { useTranscriptDetail } from '../../hooks/useTranscriptDetail'
import { recordApi } from '../../core/utils/api'
import { moduleColor } from '../../core/data/moduleMeta'
import { hasTranscript, messageCount, formatRecordDate } from '../../core/utils/transcript'
import { exportRecordsJson, hydrateRecords, EXPORT_LIMIT } from '../../core/utils/exporters'
import { reportExportError, reportExportResult } from '../../platform/export'
import {
  getStudentProfile,
  setStudentNickname,
  getStudentStats,
  getStudentRecords,
  getWeakDimensions,
  getRecommendedExercises,
  getRadarDimensions
} from '../../core/utils/recordStore'
import { FEATURES } from '../../config'
import { ROUTES, back, go } from '../../platform/nav'

const DIM_LABELS = { pronunciation: '发音', tone: '声调', fluency: '流利度', completeness: '完整度' }

export default function StudentRecords() {
  const { ready } = useGuard({ studentOnly: true })
  const { hsk } = useApp()
  const { user, patchMe } = useAuth()
  const isGuest = !user
  const { modal, open: openTranscript, close: closeTranscript, retry: retryTranscript, getCached } =
    useTranscriptDetail()

  // 登录用户：资料来自云端账号；游客：本地匿名资料
  const [profile, setProfile] = useState(() =>
    user
      ? { id: user.id, nickname: user.nickname || user.username, hsk: user.hsk }
      : getStudentProfile()
  )
  const [editing, setEditing] = useState(false)
  const [nickDraft, setNickDraft] = useState('')
  const [filterModule, setFilterModule] = useState('全部')
  const [filterScore, setFilterScore] = useState('全部')
  const [cloudRecords, setCloudRecords] = useState(null) // null = 加载中

  // 登录用户：云端资料变化时同步 profile（昵称编辑、HSK 切换）
  useEffect(() => {
    if (user) {
      setProfile({ id: user.id, nickname: user.nickname || user.username, hsk: user.hsk })
    }
  }, [user?.id, user?.nickname, user?.hsk])

  // 登录用户：从云端拉取练习记录
  useEffect(() => {
    if (isGuest) return
    let cancelled = false
    recordApi
      .mine()
      .then(({ records }) => {
        if (!cancelled) setCloudRecords(records)
      })
      .catch((err) => {
        console.warn('[StudentRecords] 云端记录获取失败:', err.message)
        if (!cancelled) setCloudRecords([])
      })
    return () => {
      cancelled = true
    }
  }, [isGuest, user?.id])

  const allRecords = useMemo(
    () => (isGuest ? getStudentRecords(profile.id) : cloudRecords || []),
    [isGuest, profile.id, cloudRecords]
  )

  const records = useMemo(() => {
    let rs = allRecords
    if (filterModule !== '全部') rs = rs.filter((r) => r.module === filterModule)
    if (filterScore === '≥80') rs = rs.filter((r) => r.score >= 80)
    if (filterScore === '60-79') rs = rs.filter((r) => r.score >= 60 && r.score < 80)
    if (filterScore === '<60') rs = rs.filter((r) => r.score > 0 && r.score < 60)
    return rs
  }, [allRecords, filterModule, filterScore])

  const stats = useMemo(() => getStudentStats(allRecords), [allRecords])
  const weakDims = useMemo(() => getWeakDimensions(allRecords), [allRecords])
  const recommendations = useMemo(() => getRecommendedExercises(allRecords), [allRecords])
  const radar = useMemo(() => getRadarDimensions(allRecords), [allRecords])
  const weakOnly = weakDims.filter((w) => w.isWeak)

  const displayName = profile.nickname || profile.id

  const handleSaveNickname = async () => {
    const name = nickDraft.trim() || profile.nickname || String(profile.id)
    if (isGuest) {
      setStudentNickname(name)
    } else {
      try {
        await patchMe({ nickname: name })
      } catch (err) {
        console.warn('[StudentRecords] 昵称保存失败:', err.message)
      }
    }
    setProfile((p) => ({ ...p, nickname: name }))
    setEditing(false)
  }

  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(null) // { done, total } | null

  // 导出当前筛选出的记录。登录用户的列表只有 messageCount，对话由 hydrateRecords
  // 逐条按需拉取（拉不到的保留元信息）。上限见 exporters 的 EXPORT_LIMIT。
  const handleExportAll = async () => {
    setExporting(true)
    const picked = records.slice(0, EXPORT_LIMIT)
    setExportProgress({ done: 0, total: picked.length })
    try {
      const full = await hydrateRecords(picked, {
        getCached,
        onProgress: (done, total) => setExportProgress({ done, total })
      })
      await exportRecordsJson(full, { scope: '全部', label: displayName })
      reportExportResult({ method: 'share' }, full.length)
    } catch (e) {
      reportExportError(e)
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  const exportableCount = records.length
  const moduleList = useMemo(() => ['全部', ...new Set(allRecords.map((r) => r.module))], [allRecords])

  // 推荐项的跳转目标。recommendations 里的 target 是**逻辑名**（recordStore 里
  // 原来写的是 react-router 的 "/culture"，移植时改成了不带斜杠的逻辑名），
  // 由页面这一层解析成小程序路径 —— 平台路径不该硬编码在纯逻辑模块里。
  const goRecommendation = (rec) => {
    if (rec.action.type === 'drill') return go(ROUTES.pronDaily)
    if (rec.action.target === 'culture' && FEATURES.culture) return go(ROUTES.culture)
    // 文化文游本轮未迁移，退到主菜单而不是留一个死链
    return back(ROUTES.main)
  }

  if (!ready) return <View style={{ minHeight: '100vh', background: '#FAFAF7' }} />

  return (
    <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      <TopBar title="我的练习记录" subtitle="学习档案" onBack={() => back(ROUTES.main)} />
      <PageWrap>
        <View style={{ padding: '28px 0 80px' }}>
          {/* ── 学生身份卡片 ── */}
          <View
            style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #f0efe8',
              padding: '20px 24px',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #D4413A, #9B59B6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Text style={{ fontSize: 22, color: '#fff', fontWeight: 700 }}>{String(displayName)[0]}</Text>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              {editing ? (
                <View style={{ display: 'flex', gap: 8 }}>
                  <Input
                    value={nickDraft}
                    placeholder={displayName}
                    confirmType="done"
                    onConfirm={handleSaveNickname}
                    onInput={(e) => setNickDraft(e.detail.value)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #e0dcd0',
                      fontSize: 15
                    }}
                  />
                  <View
                    onClick={handleSaveNickname}
                    style={{ padding: '6px 14px', borderRadius: 8, background: '#D4413A' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13 }}>确定</Text>
                  </View>
                </View>
              ) : (
                <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>{displayName}</Text>
                  <View
                    onClick={() => {
                      setNickDraft(displayName)
                      setEditing(true)
                    }}
                    style={{ padding: 2 }}
                  >
                    <Text style={{ fontSize: 14 }}>✏️</Text>
                  </View>
                </View>
              )}
              <Text style={{ fontSize: 12, color: '#aaa', display: 'block', marginTop: 2 }}>
                {isGuest ? '游客模式' : user.role === 'teacher' ? '教师' : '学生'}
                {' · '}HSK {profile.hsk || hsk || '未设置'} · 累计练习 {stats.daysSinceFirst || 0} 天
              </Text>
            </View>
          </View>

          {/* ── 统计卡片 ──
              Web 版用 grid repeat(4,1fr)，WXSS 的 grid 支持不稳，改 flex 四列 */}
          <View style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            {[
              { label: '总练习', value: stats.total, sub: '次', color: '#4A90D9' },
              { label: '平均分', value: stats.average, sub: '/100', color: '#2DAA6E' },
              { label: '最高分', value: stats.best, sub: '', color: '#E8A838' },
              { label: '近7天', value: stats.recentDays, sub: '天有练习', color: '#9B59B6' }
            ].map((d) => (
              <View
                key={d.label}
                style={{
                  flex: 1,
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #f0efe8',
                  padding: '14px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: 700, color: d.color }}>{d.value || '—'}</Text>
                <Text style={{ fontSize: 11, color: '#999' }}>{d.label}</Text>
                {d.sub ? <Text style={{ fontSize: 10, color: '#bbb' }}>{d.sub}</Text> : null}
              </View>
            ))}
          </View>

          {/* ── 能力雷达图：五维可视化成长 ── */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#888', display: 'block', marginBottom: 10 }}>
              能力雷达图
              <Text style={{ fontSize: 12, color: '#aaa', fontWeight: 400 }}> 发音 · 语法 · 词汇量 · 流利度 · 写作逻辑</Text>
            </Text>
            <View
              style={{
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #f0efe8',
                padding: '24px 24px 18px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
            >
              <AbilityRadar data={radar} />
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                {radar.map((d) => (
                  <View
                    key={d.key}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 14,
                      background: '#FAFAF7',
                      border: '1px solid #f0efe8'
                    }}
                  >
                    <Text style={{ fontSize: 12, color: '#888' }}>{d.label}</Text>
                    <Text style={{ fontSize: 12, color: d.value == null ? '#ccc' : '#D4413A', marginLeft: 4, fontWeight: 700 }}>
                      {d.value ?? '—'}
                    </Text>
                    {d.count > 0 ? (
                      <Text style={{ fontSize: 10, color: '#bbb', marginLeft: 3 }}>×{d.count}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 11, color: '#bbb', display: 'block', marginTop: 10 }}>
                每次练习后自动更新 · 完成对应模块练习即可点亮维度
              </Text>
            </View>
          </View>

          {/* ── 弱项维度追踪 ── */}
          {weakDims.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: 600, color: '#888', display: 'block', marginBottom: 10 }}>
                能力维度追踪
                {weakOnly.length > 0 ? (
                  <Text style={{ fontSize: 12, color: '#D4413A' }}>（{weakOnly.length} 项需关注）</Text>
                ) : null}
              </Text>
              <View style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0efe8', padding: '12px 20px' }}>
                {weakDims.map((d) => {
                  const pct = Math.min(d.avg, 100)
                  return (
                    <View
                      key={d.dim}
                      style={{
                        padding: '10px 0',
                        borderBottom: '1px solid #f7f6f1',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <Text style={{ width: 48, fontSize: 12, fontWeight: 600, color: '#555' }}>{d.label}</Text>
                      <View style={{ flex: 1, height: 6, background: '#f0efe8', borderRadius: 3, overflow: 'hidden' }}>
                        <View
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: d.isWeak ? '#D4413A' : '#2DAA6E',
                            borderRadius: 3
                          }}
                        />
                      </View>
                      <Text
                        style={{
                          width: 36,
                          textAlign: 'right',
                          fontSize: 14,
                          fontWeight: 700,
                          color: d.isWeak ? '#D4413A' : '#2DAA6E'
                        }}
                      >
                        {d.avg}
                      </Text>
                      <Text style={{ width: 52, textAlign: 'right', fontSize: 11, color: '#aaa' }}>{d.trend}</Text>
                      <Text style={{ width: 24, textAlign: 'right', fontSize: 10, color: '#bbb' }}>{d.occurrences}次</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}

          {/* ── 筛选栏 ── */}
          <View style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {moduleList.map((m) => (
              <View
                key={m}
                onClick={() => setFilterModule(m)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: '1px solid #e0dcd0',
                  background: filterModule === m ? '#D4413A' : '#fff'
                }}
              >
                <Text style={{ fontSize: 12, color: filterModule === m ? '#fff' : '#888' }}>{m}</Text>
              </View>
            ))}
            {['全部', '≥80', '60-79', '<60'].map((s) => (
              <View
                key={s}
                onClick={() => setFilterScore(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: '1px solid #e0dcd0',
                  background: filterScore === s ? '#666' : '#fff'
                }}
              >
                <Text style={{ fontSize: 12, color: filterScore === s ? '#fff' : '#aaa' }}>{s}</Text>
              </View>
            ))}
          </View>

          {/* ── 导出 ── */}
          {records.length > 0 && (
            <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 10, gap: 4 }}>
              <View
                onClick={exporting ? undefined : handleExportAll}
                style={{ border: '1px solid #e0dcd0', borderRadius: 14, padding: '6px 14px' }}
              >
                <Text style={{ fontSize: 12, color: exporting ? '#ccc' : '#888' }}>
                  {exporting
                    ? exportProgress
                      ? `导出中 ${exportProgress.done}/${exportProgress.total}…`
                      : '导出中…'
                    : '⬇ 导出记录 JSON'}
                </Text>
              </View>
              {/* 上限必须说出来：静默截断对科研数据不可接受 */}
              {exportableCount > EXPORT_LIMIT && (
                <Text style={{ fontSize: 11, color: '#D4413A' }}>
                  共 {exportableCount} 条，本次只导出最近 {EXPORT_LIMIT} 条
                </Text>
              )}
            </View>
          )}

          {/* ── 练习记录列表 ── */}
          <View style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {cloudRecords === null && !isGuest && (
              <View style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <Text style={{ color: '#bbb', fontSize: 14 }}>加载中…</Text>
              </View>
            )}
            {records.length === 0 && cloudRecords !== null && (
              <View style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <Text style={{ color: '#bbb', fontSize: 14 }}>暂无记录。完成一次练习后这里会出现数据。</Text>
              </View>
            )}

            {records.map((r) => {
              const canOpen = hasTranscript(r)
              const color = moduleColor(r.module)
              // 补交的记录可能没评上分（评分请求失败但对话保住了），显示「待评」而非红色 0
              const ungraded = canOpen && !(r.score > 0)
              return (
                <View
                  key={r.id}
                  onClick={() => canOpen && openTranscript(r)}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    border: '1px solid #f0efe8',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: ungraded
                        ? '#F5F5F0'
                        : r.score >= 80
                          ? '#EDFAF3'
                          : r.score >= 60
                            ? '#FFF8ED'
                            : '#FDF0EF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: ungraded ? 10 : 14,
                        fontWeight: 700,
                        color: ungraded ? '#aaa' : r.score >= 80 ? '#2DAA6E' : r.score >= 60 ? '#E8A838' : '#D4413A'
                      }}
                    >
                      {ungraded ? '待评' : r.score}
                    </Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: 600, color: '#333', display: 'block' }}>
                      {r.scenario || r.module}
                      {canOpen ? (
                        <Text style={{ fontSize: 10, color: '#bbb', fontWeight: 400 }}> 💬 {messageCount(r)}</Text>
                      ) : null}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#aaa', display: 'block', marginTop: 2 }}>
                      <Text style={{ color, fontWeight: 500 }}>{r.module}</Text>
                      {' · '}
                      {formatRecordDate(r)}
                    </Text>
                    {r.problems?.length > 0 && (
                      <Text style={{ fontSize: 11, color: '#bbb', display: 'block', marginTop: 3 }}>
                        {r.problems.slice(0, 2).join(' · ')}
                      </Text>
                    )}
                  </View>

                  {r.dimensions && (
                    <View style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {Object.entries(DIM_LABELS).map(([dim, label]) => {
                        const val = r.dimensions[dim]
                        if (val == null) return null
                        return (
                          <View
                            key={dim}
                            style={{
                              padding: '3px 6px',
                              borderRadius: 6,
                              background: val >= 70 ? '#EDFAF3' : '#FDF0EF'
                            }}
                          >
                            <Text style={{ fontSize: 10, color: val >= 70 ? '#2DAA6E' : '#D4413A' }}>
                              {label[0]}
                              {val}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })}
          </View>

          {/* ── 练习推荐 ── */}
          <View>
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#888', display: 'block', marginBottom: 10 }}>
              建议练习
            </Text>
            <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recommendations.map((rec, i) => (
                <View
                  key={i}
                  onClick={() => goRecommendation(rec)}
                  style={{
                    background: '#FDF0EF',
                    borderRadius: 14,
                    border: '1px solid #fbe3e1',
                    padding: '16px 20px'
                  }}
                >
                  <View
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: 600, color: '#D4413A' }}>{rec.label}</Text>
                    {rec.weakDetail ? (
                      <Text style={{ fontSize: 11, color: '#999' }}>{rec.weakDetail}</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>{rec.suggest}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </PageWrap>

      {/* ── 完整对话回看 ── */}
      <TranscriptModal
        record={modal?.record}
        messages={modal?.messages}
        loading={modal?.loading}
        error={modal?.error}
        onRetry={retryTranscript}
        onClose={closeTranscript}
        onExport={async () => {
          try {
            await exportRecordsJson([modal.record], { scope: '单条', label: displayName })
            reportExportResult({ method: 'share' }, 1)
          } catch (e) {
            reportExportError(e)
          }
        }}
      />
    </View>
  )
}
