import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { PageWrap } from '../../components/PageWrap'
import { MenuItem } from '../../components/MenuItem'
import { HSK_LEVELS } from '../../core/data/constants'
import { ROUTES, replace } from '../../platform/nav'

export default function HSKSelect() {
  const [hovered, setHovered] = useState(null)
  const { setHsk } = useApp()
  // requireHsk: false —— 这个页面存在的意义就是「还没有 hsk」，
  // 带上守卫会自己把自己弹回去，死循环。
  useGuard({ requireHsk: false })

  return (
    <PageWrap>
      <View style={{ padding: '60px 0' }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#D4413A',
            marginBottom: 8,
            display: 'block',
            textAlign: 'center'
          }}
        >
          欢迎来到 SpeakWise 琢音
        </Text>
        <Text style={{ fontSize: 20, fontWeight: 600, marginBottom: 32, display: 'block', textAlign: 'center' }}>
          请选择你的汉语水平
        </Text>

        <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {HSK_LEVELS.map((l) => (
            <MenuItem
              key={l.id}
              item={{
                id: l.id,
                title: l.label,
                titleEn: l.sub,
                icon: l.emoji,
                color: l.color,
                bg: l.color + '15',
                desc: l.desc
              }}
              onClick={() => {
                setHsk(l.id)
                // 与 Web 版一致：选完即进主菜单，不在栈里留这一页
                replace(ROUTES.main)
              }}
              hovered={hovered}
              onHover={setHovered}
            />
          ))}
        </View>
      </View>
    </PageWrap>
  )
}
