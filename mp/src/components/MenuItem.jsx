import { View, Text } from '@tarojs/components'

// 菜单卡片。
//
// 与 Web 版的两处差异：
//   1. `<svg>` 的右向箭头换成了 CSS：一个正方形只留上边框和右边框，转 45°。
//      小程序渲染不了内联 SVG，图标要么走字体、要么走图片，要么这么画。
//   2. 悬停态改成按压态（onTouchStart/End）。WXSS 没有 :hover，而手机上本来
//      也没有「悬停」这个概念 —— 手指按下时卡片浮起来，反馈反而更直接。
export function MenuItem({ item, onClick, hovered, onHover, badge }) {
  const on = hovered === item.id
  const arrowColor = on ? item.color : '#ccc'

  return (
    <View
      onClick={onClick}
      onTouchStart={() => onHover(item.id)}
      onTouchEnd={() => onHover(null)}
      onTouchCancel={() => onHover(null)}
      style={{
        background: '#fff',
        borderRadius: 18,
        padding: '26px 24px',
        border: `1px solid ${on ? item.color + '60' : '#f0efe8'}`,
        transition: 'all 0.3s',
        transform: on ? 'translateY(-3px)' : 'none',
        boxShadow: on ? `0 10px 28px ${item.color}15` : '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <View style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: item.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: on ? 'scale(1.06)' : 'none'
          }}
        >
          <Text>{item.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a' }}>{item.title}</Text>
            {badge && (
              <Text
                style={{
                  fontSize: 11,
                  background: item.color + '18',
                  color: item.color,
                  padding: '2px 10px',
                  borderRadius: 10,
                  fontWeight: 600
                }}
              >
                {badge}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>{item.titleEn}</Text>
        </View>
      </View>

      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flex: 1 }}>
        <Text style={{ fontSize: 14, color: '#666', lineHeight: 1.5, paddingRight: 10, flex: 1 }}>
          {item.desc}
        </Text>
        {/* 右向 chevron：正方形留上+右两条边，转 45° */}
        <View
          style={{
            width: 9,
            height: 9,
            flexShrink: 0,
            marginBottom: 2,
            borderTop: `2px solid ${arrowColor}`,
            borderRight: `2px solid ${arrowColor}`,
            transform: 'rotate(45deg)',
            transition: 'all 0.25s',
            marginRight: on ? 2 : 6
          }}
        />
      </View>
    </View>
  )
}
