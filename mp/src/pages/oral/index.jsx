import { useState } from 'react'
import { View } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { MenuItem } from '../../components/MenuItem'
import { ROUTES, back, go } from '../../platform/nav'

export default function OralMenu() {
  const [hovered, setHovered] = useState(null)
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp()

  if (!ready) return <View style={{ minHeight: '100vh', background: '#FAFAF7' }} />

  return (
    <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      <TopBar
        title="口语训练"
        subtitle="Speaking Training"
        onBack={() => back(ROUTES.main)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
      />
      <PageWrap>
        <View style={{ padding: '40px 0' }}>
          <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <MenuItem
              item={{
                id: 'scenes',
                title: '场景模拟',
                titleEn: 'Roleplay Scenes',
                icon: '🎭',
                color: '#9B59B6',
                bg: '#F5F0FA',
                desc: '在真实场景中扮演角色对话'
              }}
              onClick={() => go(ROUTES.scenes)}
              hovered={hovered}
              onHover={setHovered}
            />
            <MenuItem
              item={{
                id: 'assess',
                title: '发音测评',
                titleEn: 'Pronunciation',
                icon: '🎙️',
                color: '#7B6CF6',
                bg: '#F3F0FF',
                desc: '跟读句子，AI 打分纠音'
              }}
              onClick={() => go(ROUTES.pronunciation)}
              hovered={hovered}
              onHover={setHovered}
            />
            <MenuItem
              item={{
                id: 'free',
                title: '自由对话',
                titleEn: 'Free Chat',
                icon: '💬',
                color: '#2DAA6E',
                bg: '#EDFAF3',
                desc: '和 AI 教练随便聊聊'
              }}
              // 自由对话没有 sceneId，chat 页靠这个区分
              onClick={() => go(ROUTES.chat, { free: 1 })}
              hovered={hovered}
              onHover={setHovered}
            />
          </View>
        </View>
      </PageWrap>
    </View>
  )
}
