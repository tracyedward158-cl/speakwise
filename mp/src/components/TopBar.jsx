import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { HSK_LEVELS, MODES } from '../core/data/constants'
import { useNavMetrics } from '../hooks/useNavMetrics'

// 顶部栏 + 全局 HSK / 显示模式切换。
//
// 与 Web 版的三处差异，都是平台约束逼出来的：
//
//   1. `position: sticky` 在小程序里不生效 → 改成 fixed，并在文档流里留一块
//      等高的占位 View。不做占位的话页面内容会从顶栏底下穿过去。
//
//   2. 三处内联 `<svg>`（返回箭头 / 下拉三角 / 选中勾）小程序都渲染不了。
//      返回箭头和三角改成 CSS 画，勾直接用文字「✓」—— 一个勾不值得为它引图标字体。
//
//   3. 顶部要自己让开状态栏和右上角胶囊，见 useNavMetrics。
//
// 全屏透明遮罩关下拉这个交互保留：小程序里 fixed 元素照样能被点到。
export function TopBar({ title, subtitle, onBack, hskLevel, onChangeHSK, mode, onChangeMode }) {
  const [openHSK, setOpenHSK] = useState(false)
  const [openMode, setOpenMode] = useState(false)
  const nav = useNavMetrics()

  const lv = HSK_LEVELS.find((l) => l.id === hskLevel)
  const curMode = MODES.find((m) => m.id === mode)

  const closeAll = () => {
    setOpenHSK(false)
    setOpenMode(false)
  }

  const mask = (open) =>
    open ? (
      <View
        onClick={closeAll}
        catchMove
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }}
      />
    ) : null

  const panelStyle = {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 6px)',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #f0efe8',
    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
    zIndex: 31,
    overflow: 'hidden'
  }

  return (
    <>
      {/* 占位：fixed 顶栏脱离了文档流，不留这个的话内容会钻到它下面 */}
      <View style={{ height: nav.totalHeight, flexShrink: 0 }} />

      <View
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: '#fff',
          borderBottom: '1px solid #f0efe8',
          paddingTop: nav.statusBarHeight
        }}
      >
        <View
          style={{
            height: nav.barHeight,
            padding: '0 20px',
            // 右上角让开系统胶囊
            paddingRight: nav.rightInset,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          {onBack && (
            <View
              onClick={onBack}
              style={{ padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* 左向 chevron：留上+左边框，转 -45° */}
              <View
                style={{
                  width: 11,
                  height: 11,
                  borderTop: '2.5px solid #333',
                  borderLeft: '2.5px solid #333',
                  transform: 'rotate(-45deg)',
                  marginLeft: 4
                }}
              />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a' }}>{title}</Text>
            {subtitle && (
              <View>
                <Text style={{ fontSize: 12, color: '#999' }}>{subtitle}</Text>
              </View>
            )}
          </View>

          {hskLevel && lv && (
            <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {onChangeMode && (
                <View style={{ position: 'relative' }}>
                  <View
                    onClick={() => {
                      setOpenMode(!openMode)
                      setOpenHSK(false)
                    }}
                    style={{
                      background: '#f0efe8',
                      borderRadius: 20,
                      padding: '6px 12px',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 600,
                      color: '#666'
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: 600, color: '#666' }}>
                      ⚙️ {curMode?.label.slice(0, 2)}
                    </Text>
                  </View>
                  {openMode && (
                    <>
                      {mask(true)}
                      <View style={{ ...panelStyle, minWidth: 150 }}>
                        {MODES.map((m) => (
                          <View
                            key={m.id}
                            onClick={() => {
                              onChangeMode(m.id)
                              closeAll()
                            }}
                            style={{
                              padding: '12px 14px',
                              background: m.id === mode ? '#f8f8f8' : 'transparent'
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: m.id === mode ? '#333' : '#555',
                                display: 'block'
                              }}
                            >
                              {m.label}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#999' }}>{m.desc}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              )}

              <View style={{ position: 'relative' }}>
                <View
                  onClick={() => {
                    setOpenHSK(!openHSK)
                    setOpenMode(false)
                  }}
                  style={{
                    background: lv.color + '14',
                    border: `1px solid ${lv.color}30`,
                    borderRadius: 20,
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: 600, color: lv.color }}>
                    {lv.emoji} {lv.label}
                  </Text>
                  {/* 下向三角 */}
                  <View
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: `5px solid ${lv.color}`,
                      marginTop: 1
                    }}
                  />
                </View>

                {openHSK && (
                  <>
                    {mask(true)}
                    <View style={{ ...panelStyle, minWidth: 180 }}>
                      {HSK_LEVELS.map((l) => (
                        <View
                          key={l.id}
                          onClick={() => {
                            onChangeHSK(l.id)
                            closeAll()
                          }}
                          style={{
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: l.id === hskLevel ? l.color + '10' : 'transparent'
                          }}
                        >
                          <Text style={{ fontSize: 18 }}>{l.emoji}</Text>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: l.id === hskLevel ? l.color : '#1a1a1a',
                                display: 'block'
                              }}
                            >
                              {l.label}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#999' }}>{l.sub}</Text>
                          </View>
                          {l.id === hskLevel && (
                            <Text style={{ fontSize: 16, color: l.color, fontWeight: 700 }}>✓</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </>
  )
}
