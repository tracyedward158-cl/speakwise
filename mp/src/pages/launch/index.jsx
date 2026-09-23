import { useEffect } from 'react'
import { View } from '@tarojs/components'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { ROUTES, replace } from '../../platform/nav'

// 入口页。对应 Web 版 App.jsx 里 RequireAuth + AppRoutes 的那一整套条件路由。
//
// 为什么要单独一个空壳页而不是把登录页当入口：小程序把 pages[0] 当启动页，
// 已登录用户会先闪一下登录界面。这里什么都不画，只做重定向，
// 用 redirectTo 替换掉自己，栈里不留痕迹（所以也按不了返回）。
export default function Launch() {
  const { user, guest, loading } = useAuth()
  const { isMounted, hsk } = useApp()

  useEffect(() => {
    // 等会话恢复完成再判断，否则会把已登录用户当成未登录踢去登录页
    if (loading || !isMounted) return

    if (!user && !guest) {
      replace(ROUTES.login)
      return
    }
    // 教师不看 HSK 选择，直接进主菜单
    if (user?.role === 'teacher') {
      replace(ROUTES.main)
      return
    }
    if (!hsk) {
      replace(ROUTES.hsk)
      return
    }
    replace(ROUTES.main)
  }, [loading, isMounted, user, guest, hsk])

  return <View style={{ background: '#FAFAF7' }} />
}
