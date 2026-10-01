import { useMemo } from 'react'
import Taro from '@tarojs/taro'

// 自定义导航栏的尺寸。
//
// app.config.js 里开了 `navigationStyle: 'custom'`（因为 TopBar 要放 HSK / 显示模式
// 两个下拉，系统导航栏装不下），代价是状态栏高度和右上角胶囊的避让都要自己算：
//
//   ┌──────────────┐ ← statusBarHeight（刘海/状态栏，内容不能压上去）
//   │  ← barHeight ┤ 内容区。右上角那颗胶囊是系统画的、盖在最上层，
//   │              │ 我们自己画的按钮必须让开它，否则点不到。
//   └──────────────┘
//
// 胶囊的位置各机型不同，只能问系统要，不能写死。
export function useNavMetrics() {
  return useMemo(() => {
    let info = {}
    try {
      info = Taro.getSystemInfoSync() || {}
    } catch (e) {
      /* 取不到就用兜底值 */
    }

    const statusBarHeight = info.statusBarHeight || 20

    let capsule = null
    try {
      capsule = Taro.getMenuButtonBoundingClientRect()
    } catch (e) {
      /* 部分环境没有这颗胶囊 */
    }

    // 胶囊上下留白相等 → 内容区高度 = 胶囊高度 + 上下各一份留白
    const gap = capsule && capsule.top > statusBarHeight ? capsule.top - statusBarHeight : 6
    const barHeight = capsule && capsule.height ? capsule.height + gap * 2 : 44

    const screenWidth = info.windowWidth || info.screenWidth || 375
    // 从胶囊左边缘到屏幕右边缘，再留 8px。右侧放按钮时把它当右内边距用。
    const rightInset = capsule && capsule.left ? Math.max(0, screenWidth - capsule.left + 8) : 100

    return {
      statusBarHeight,
      barHeight,
      rightInset,
      totalHeight: statusBarHeight + barHeight,
      screenWidth,
      screenHeight: info.windowHeight || info.screenHeight || 667
    }
  }, [])
}
