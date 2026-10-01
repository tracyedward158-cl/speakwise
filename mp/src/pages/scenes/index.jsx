import { useState } from 'react'
import { View } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useGuard } from '../../hooks/useGuard'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { MenuItem } from '../../components/MenuItem'
import { SCENARIOS } from '../../core/data/scenarios'
import { ROUTES, back, go } from '../../platform/nav'

export default function SceneList() {
  const [hovered, setHovered] = useState(null)
  const { ready } = useGuard({ studentOnly: true })
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp()

  if (!ready) return <View style={{ background: '#FAFAF7' }} />

  return (
    <View style={{ background: '#FAFAF7' }}>
      <TopBar
        title="选择场景"
        subtitle="Select a Scenario"
        onBack={() => back(ROUTES.oral)}
        hskLevel={hskLevel}
        onChangeHSK={onChangeHSK}
        mode={mode}
        onChangeMode={onChangeMode}
      />
      <PageWrap>
        <View style={{ padding: '40px 0' }}>
          {/* .menu-grid 见 app.scss：Web 版在 <480px 下切成单列，手机端就是那一档 */}
          <View className="menu-grid">
            {SCENARIOS.map((s) => (
              <MenuItem
                key={s.id}
                item={s}
                onClick={() => go(ROUTES.chat, { sceneId: s.id })}
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
