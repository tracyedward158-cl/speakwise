import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { buildTestSequence, TEST_PLAN } from '../../core/utils/pronunciationBank'
import { ROUTES, back, go } from '../../platform/nav'

const COLOR = '#E8A838'
const PLANS = [
  { id: 'testA', label: 'Test A', icon: '🅰️', desc: '标准卷 A' },
  { id: 'testB', label: 'Test B', icon: '🅱️', desc: '标准卷 B' }
]

export default function PronunciationTest() {
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp()

  // 题量按题库实际内容算，不写死 25：某组不足时该卷题量就会少于 25，
  // 界面如实标注。前后测对比时必须知道两卷在各级别的真实题量。
  const counts = useMemo(
    () => ({
      testA: buildTestSequence({ set: 'testA', level: hskLevel }).length,
      testB: buildTestSequence({ set: 'testB', level: hskLevel }).length
    }),
    [hskLevel]
  )

  if (!ready) return <View style={{ background: '#FAFAF7' }} />

  return (
    <View style={{ background: '#FAFAF7' }}>
      <TopBar
        title="测试模式"
        subtitle="Test Mode"
        onBack={() => back(ROUTES.pronunciation)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
        mode={mode}
        onChangeMode={onChangeMode}
      />
      <PageWrap>
        <View style={{ padding: '24px 0 40px' }}>
          <Text style={{ fontSize: 12, color: '#bbb', display: 'block', marginBottom: 14 }}>选择试卷</Text>

          <View style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
            {PLANS.map((p) => {
              const total = counts[p.id]
              const short = total < TEST_PLAN.reduce((a, x) => a + x.count, 0)
              return (
                <View
                  key={p.id}
                  onClick={() => go(ROUTES.drill, { set: p.id, from: 'test', type: 'practice', section: 'oral' })}
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    border: '1px solid #f0efe8',
                    padding: '20px 22px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}
                >
                  <View style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <Text style={{ fontSize: 22 }}>{p.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', display: 'block' }}>
                        {p.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#aaa', display: 'block', marginTop: 2 }}>
                        {p.desc}
                      </Text>
                    </View>
                    <View style={{ textAlign: 'right' }}>
                      <Text style={{ fontSize: 18, fontWeight: 700, color: COLOR, display: 'block' }}>
                        {total}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#bbb' }}>题</Text>
                    </View>
                  </View>

                  <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {TEST_PLAN.map((x) => (
                      <Text
                        key={x.unit}
                        style={{
                          fontSize: 12,
                          padding: '3px 10px',
                          borderRadius: 10,
                          background: '#FFF8ED',
                          color: '#C98A28',
                          fontWeight: 600
                        }}
                      >
                        {x.unit} {x.count}
                      </Text>
                    ))}
                    <Text style={{ fontSize: 11, color: '#ccc' }}>按此顺序一次做完</Text>
                  </View>

                  {short && (
                    <Text style={{ fontSize: 11, color: '#E8A838', display: 'block', marginTop: 8 }}>
                      本级题库题量不足，本卷实际 {total} 题
                    </Text>
                  )}
                </View>
              )
            })}
          </View>

          <View
            style={{
              background: '#FDF8ED',
              borderRadius: 14,
              padding: '16px 18px',
              border: '1px solid #F0E4C8'
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: 600, color: '#C98A28', display: 'block', marginBottom: 6 }}>
              关于测试模式
            </Text>
            <Text style={{ fontSize: 12, color: '#A8843F', lineHeight: 1.8 }}>
              题目按当前 HSK 等级（{hskLevel || '未设置'}）从题库的 testA / testB
              两卷中抽取，顺序固定不变，同一份卷对所有学生一致。
              {'\n'}
              成绩以「发音测评」模块记入练习记录，并带来源标记，导出数据时可区分测试与日常练习。
            </Text>
          </View>
        </View>
      </PageWrap>
    </View>
  )
}
