import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { MenuItem } from '../../components/MenuItem'
import { ROUTES, back, go } from '../../platform/nav'

// 发音测评的四个入口。
// 题库来自 core/data/pronunciationBank.json（552 条：字/词/句 × train/testA/testB），
// 具体选课逻辑在 core/utils/pronunciationBank.js，四个入口最终都进 drill 页共用同一套评测界面。
const MODES = [
  {
    id: 'daily',
    title: '日常练习',
    titleEn: 'Daily Practice',
    icon: '🎙️',
    color: '#7B6CF6',
    bg: '#F3F0FF',
    desc: '系统出题练习 · 选粒度与模式，每轮 10 题',
    to: ROUTES.pronDaily
  },
  {
    id: 'bank',
    title: '题库浏览',
    titleEn: 'Question Bank',
    icon: '🔍',
    color: '#4A90D9',
    bg: '#EEF4FB',
    desc: '搜索 · 浏览 · 历史，随时单练某一道',
    to: ROUTES.pronBank
  },
  {
    id: 'test',
    title: '测试模式',
    titleEn: 'Test Mode',
    icon: '⏱️',
    color: '#E8A838',
    bg: '#FFF8ED',
    desc: '标准化评测 · 字 10 → 词 10 → 句 5，可选 A/B 卷',
    to: ROUTES.pronTest
  },
  {
    id: 'custom',
    title: '自定义练习',
    titleEn: 'Custom Practice',
    icon: '✏️',
    color: '#2DAA6E',
    bg: '#EDFAF3',
    desc: '自由输入内容，逐句朗读并评测',
    to: null,
    type: 'custom'
  }
]

export default function PronunciationMenu() {
  const [hovered, setHovered] = useState(null)
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp()

  if (!ready) return <View style={{ minHeight: '100vh', background: '#FAFAF7' }} />

  return (
    <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      <TopBar
        title="发音测评"
        subtitle="Pronunciation"
        onBack={() => back(ROUTES.oral)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
        mode={mode}
        onChangeMode={onChangeMode}
      />
      <PageWrap>
        <View style={{ padding: '40px 0' }}>
          <Text style={{ fontSize: 13, color: '#bbb', marginBottom: 16, display: 'block' }}>
            选择练习模式
          </Text>
          <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {MODES.map((m) => (
              <MenuItem
                key={m.id}
                item={m}
                onClick={() => (m.type ? go(ROUTES.drill, { type: m.type, section: 'oral' }) : go(m.to))}
                hovered={hovered}
                onHover={setHovered}
              />
            ))}
          </View>
        </View>
      </PageWrap>
    </View>
  )
}
