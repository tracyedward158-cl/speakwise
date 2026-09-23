import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { MANUAL_DATA } from '../../core/data/studyManual'
import { HSK_LEVELS } from '../../core/data/constants'
import { ROUTES, back } from '../../platform/nav'

const TABS = [
  { id: 'vocab', label: '重点词汇', icon: '📚' },
  { id: 'grammar', label: '核心语法', icon: '⚙️' },
  { id: 'pinyin', label: '语音声调', icon: '🗣️' }
]

export default function StudyManual() {
  const [tab, setTab] = useState('vocab')
  const [openCard, setOpenCard] = useState(null)
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp()

  const data = MANUAL_DATA[hskLevel]?.[tab] || []
  const lv = HSK_LEVELS.find((l) => l.id === hskLevel)

  if (!ready) return <View style={{ background: '#FAFAF7' }} />

  return (
    <View style={{ background: '#FAFAF7' }}>
      <TopBar
        title="学习手册"
        subtitle="Study Manual"
        onBack={() => back(ROUTES.main)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
      />
      <PageWrap>
        <View style={{ padding: '32px 0 80px' }}>
          <View
            style={{
              background: '#fff',
              borderRadius: 20,
              padding: '24px 28px',
              marginBottom: 32,
              border: '1px solid #f0efe8',
              display: 'flex',
              gap: 20,
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
            }}
          >
            <Text style={{ fontSize: 40 }}>{lv?.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 17, color: '#1a1a1a', fontWeight: 600, display: 'block', marginBottom: 8 }}
              >
                {lv?.label} 知识图谱
              </Text>
              <Text style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                系统化梳理该阶段的{lv?.desc}。建议按照"词汇 → 语法 → 发音"的模块顺序进行复习，构建完整的汉语框架。
              </Text>
            </View>
          </View>

          <View
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: 28,
              background: '#fff',
              padding: 6,
              borderRadius: 16,
              border: '1px solid #f0efe8',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}
          >
            {TABS.map((t) => (
              <View
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  setOpenCard(null)
                }}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 12,
                  background: tab === t.id ? '#D4413A' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <Text style={{ fontSize: 15 }}>{t.icon}</Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: tab === t.id ? '#fff' : '#888'
                  }}
                >
                  {t.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.map((item, i) => {
              const isOpen = openCard === i
              const idxStr = (i + 1).toString().padStart(2, '0')
              return (
                <View
                  key={i}
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    border: `1.5px solid ${isOpen ? '#D4413A40' : '#f0efe8'}`,
                    overflow: 'hidden',
                    boxShadow: isOpen ? '0 6px 16px rgba(212,65,58,0.08)' : '0 1px 3px rgba(0,0,0,0.02)'
                  }}
                >
                  <View
                    onClick={() => setOpenCard(isOpen ? null : i)}
                    style={{ padding: '20px 24px', display: 'flex', alignItems: 'center' }}
                  >
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: isOpen ? '#D4413A' : '#eee',
                        marginRight: 16,
                        fontStyle: 'italic'
                      }}
                    >
                      {idxStr}
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: isOpen ? '#D4413A' : '#1a1a1a',
                        flex: 1
                      }}
                    >
                      {item.title}
                    </Text>
                    {/* Web 版是内联 svg 折角，小程序渲染不了 —— CSS 画一个 */}
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRight: `2.5px solid ${isOpen ? '#D4413A' : '#ccc'}`,
                        borderBottom: `2.5px solid ${isOpen ? '#D4413A' : '#ccc'}`,
                        transform: isOpen ? 'rotate(225deg)' : 'rotate(45deg)',
                        marginBottom: isOpen ? -4 : 4,
                        marginRight: 2
                      }}
                    />
                  </View>

                  {isOpen && (
                    <View style={{ padding: '0 24px 24px', marginLeft: 40, animation: 'su 0.3s both' }}>
                      <Text
                        style={{ fontSize: 13, color: '#555', lineHeight: 1.7, display: 'block', marginBottom: 16 }}
                      >
                        {item.desc}
                      </Text>
                      <View
                        style={{
                          background: '#FDF0EF',
                          padding: '14px 18px',
                          borderRadius: 12,
                          borderLeft: '4px solid #D4413A'
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#D4413A',
                            opacity: 0.8,
                            display: 'block',
                            marginBottom: 6
                          }}
                        >
                          Example / 示例
                        </Text>
                        <Text style={{ lineHeight: 1.5, color: '#D4413A', fontSize: 13 }}>
                          {item.example}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        </View>
      </PageWrap>
    </View>
  )
}
