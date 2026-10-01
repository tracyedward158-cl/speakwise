import { useState, useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { UNITS, ALL_TAGS, countAvailable, TRAIN_SIZE } from '../../core/utils/pronunciationBank'
import { ROUTES, back, go } from '../../platform/nav'

const COLOR = '#7B6CF6'

const MODES = [
  { id: 'seq', label: '顺序', desc: '按题库顺序出题' },
  { id: 'random', label: '随机', desc: '随机抽取一轮' },
  { id: 'focus', label: '专项', desc: '只练某个难点' }
]

function Section({ title, sub, children }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <View style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>{title}</Text>
        <Text style={{ fontSize: 11, color: '#bbb' }}>{sub}</Text>
      </View>
      {children}
    </View>
  )
}

function Chip({ active, disabled, onClick, children, count }) {
  return (
    <View
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        background: disabled ? '#F5F5F0' : active ? COLOR : '#fff',
        border: `1px solid ${disabled ? '#eeece4' : active ? COLOR : '#e8e6de'}`,
        display: 'flex',
        alignItems: 'baseline'
      }}
    >
      <Text style={{ fontSize: 13, color: disabled ? '#ccc' : active ? '#fff' : '#666', fontWeight: active ? 600 : 400 }}>
        {children}
      </Text>
      {count != null && (
        <Text style={{ fontSize: 11, opacity: 0.65, marginLeft: 6, color: disabled ? '#ccc' : active ? '#fff' : '#666' }}>
          {count}
        </Text>
      )}
    </View>
  )
}

export default function PronunciationDaily() {
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp()

  const [unit, setUnit] = useState('句')
  const [pickMode, setPickMode] = useState('random')
  const [tag, setTag] = useState(ALL_TAGS[0])

  // 每个专项标签在当前粒度下的题量。0 题的置灰：题库里字+轻声、字+儿化、
  // 字/词+多音节语流这类组合本来就是空的（单字不可能有轻声或儿化）。
  const tagCounts = useMemo(
    () =>
      Object.fromEntries(
        ALL_TAGS.map((t) => [t, countAvailable({ level: hskLevel, unit, tag: t, set: 'train' })])
      ),
    [hskLevel, unit]
  )

  const available =
    pickMode === 'focus'
      ? tagCounts[tag] || 0
      : countAvailable({ level: hskLevel, unit, set: 'train' })
  const canStart = available > 0
  const willTake = Math.min(available, TRAIN_SIZE)

  // 换粒度后当前专项可能变成 0 题，自动跳到第一个有题的，避免点开始开出空练习
  const changeUnit = (u) => {
    setUnit(u)
    if (countAvailable({ level: hskLevel, unit: u, tag, set: 'train' }) === 0) {
      const first = ALL_TAGS.find(
        (t) => countAvailable({ level: hskLevel, unit: u, tag: t, set: 'train' }) > 0
      )
      if (first) setTag(first)
    }
  }

  const start = () => {
    const params = { set: 'train', unit, mode: pickMode, from: 'daily' }
    if (pickMode === 'focus') params.tag = tag
    // 随机模式必须带种子：否则刷新或前进后退会重新洗牌，写到一半题就变了
    if (pickMode === 'random') params.seed = String(Date.now() % 1000000)
    go(ROUTES.drill, { ...params, type: 'practice', section: 'oral' })
  }

  if (!ready) return <View style={{ background: '#FAFAF7' }} />

  return (
    <View style={{ background: '#FAFAF7' }}>
      <TopBar
        title="日常练习"
        subtitle="Daily Practice"
        onBack={() => back(ROUTES.pronunciation)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
        mode={mode}
        onChangeMode={onChangeMode}
      />
      <PageWrap>
        <View style={{ padding: '24px 0 40px' }}>
          <View
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #f0efe8',
              padding: 24,
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}
          >
            <Section title="选择粒度" sub="Granularity">
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {UNITS.map((u) => (
                  <Chip
                    key={u}
                    active={unit === u}
                    onClick={() => changeUnit(u)}
                    count={countAvailable({ level: hskLevel, unit: u, set: 'train' })}
                  >
                    {u}
                  </Chip>
                ))}
              </View>
            </Section>

            <Section title="选择模式" sub="Mode">
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {MODES.map((m) => (
                  <Chip key={m.id} active={pickMode === m.id} onClick={() => setPickMode(m.id)}>
                    {m.label}
                  </Chip>
                ))}
              </View>
              <Text style={{ fontSize: 12, color: '#bbb', display: 'block', marginTop: 8 }}>
                {MODES.find((m) => m.id === pickMode).desc}
              </Text>
            </Section>

            {pickMode === 'focus' && (
              <Section title="选择专项" sub="Focus">
                <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ALL_TAGS.map((t) => (
                    <Chip
                      key={t}
                      active={tag === t}
                      disabled={tagCounts[t] === 0}
                      onClick={() => setTag(t)}
                      count={tagCounts[t]}
                    >
                      {t}
                    </Chip>
                  ))}
                </View>
                {tagCounts[tag] === 0 && (
                  <Text style={{ fontSize: 12, color: '#E8A838', display: 'block', marginTop: 8 }}>
                    该组合暂无题目，换一个粒度或专项
                  </Text>
                )}
              </Section>
            )}

            {/* 题量如实显示：题库单组常常不足 10 题（专项练习尤为明显），不补齐、不假装 */}
            <View
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
                padding: '14px 16px',
                background: '#F8F7FF',
                borderRadius: 12,
                marginBottom: 18
              }}
            >
              <Text style={{ fontSize: 12, color: '#888' }}>可练</Text>
              <Text style={{ fontSize: 17, fontWeight: 700, color: canStart ? COLOR : '#ccc' }}>
                {available}
              </Text>
              <Text style={{ fontSize: 12, color: '#888' }}>题</Text>
              {canStart && (
                <Text style={{ fontSize: 12, color: '#aaa', marginLeft: 'auto' }}>
                  {available > TRAIN_SIZE ? `本轮取 ${willTake} 题` : '本轮全部做完'}
                </Text>
              )}
            </View>

            <View
              onClick={canStart ? start : undefined}
              style={{
                padding: 13,
                borderRadius: 12,
                background: canStart ? COLOR : '#e8e6de',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: 600, color: canStart ? '#fff' : '#aaa' }}>
                开始练习 →
              </Text>
            </View>
          </View>

          <Text
            style={{
              fontSize: 12,
              color: '#bbb',
              display: 'block',
              textAlign: 'center',
              marginTop: 12,
              lineHeight: 1.7
            }}
          >
            题目按当前 HSK 等级（{hskLevel || '未设置'}）筛选 · 可在右上角切换
          </Text>
        </View>
      </PageWrap>
    </View>
  )
}
