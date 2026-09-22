import { useState } from 'react'
import { View } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { MenuItem } from '../../components/MenuItem'
import { ROUTES, back, go } from '../../platform/nav'

export default function WrittenMenu() {
  const [hovered, setHovered] = useState(null)
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp()

  if (!ready) return <View style={{ minHeight: '100vh', background: '#FAFAF7' }} />

  return (
    <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      <TopBar
        title="写作辅导"
        subtitle="Writing Coach"
        onBack={() => back(ROUTES.main)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
      />
      <PageWrap>
        <View style={{ padding: '40px 0' }}>
          <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <MenuItem
              item={{
                id: 'sentence',
                title: '造句练习',
                titleEn: 'Sentence Building',
                icon: '✏️',
                color: '#4A90D9',
                bg: '#EEF4FB',
                desc: '使用指定词汇写句子，AI 批改'
              }}
              onClick={() => go(ROUTES.drill, { type: 'sentence', section: 'written' })}
              hovered={hovered}
              onHover={setHovered}
            />
            <MenuItem
              item={{
                id: 'paragraph',
                title: '段落写作',
                titleEn: 'Paragraphs',
                icon: '📝',
                color: '#E8A838',
                bg: '#FFF8ED',
                desc: '写几个连贯的句子'
              }}
              onClick={() => go(ROUTES.chat, { mode: 'paragraph' })}
              hovered={hovered}
              onHover={setHovered}
            />
            <MenuItem
              item={{
                id: 'essay',
                title: '短文写作',
                titleEn: 'Essays',
                icon: '📄',
                color: '#7B6CF6',
                bg: '#F3F0FF',
                desc: '写一篇完整的短文，打分并反馈'
              }}
              onClick={() => go(ROUTES.chat, { mode: 'essay' })}
              hovered={hovered}
              onHover={setHovered}
            />
          </View>
        </View>
      </PageWrap>
    </View>
  )
}
