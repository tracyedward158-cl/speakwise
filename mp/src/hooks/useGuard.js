import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { ROUTES, replace } from '../platform/nav'

// 路由守卫。替代 Web 版 App.jsx 里那棵按登录态/角色拼出来的 <Routes>。
//
// 小程序的路由表是静态的，所有页面任何人理论上都到得了，所以每个页面必须自己守。
// 判定次序与 Web 版一致：未登录 → 登录页；教师 → 主菜单；学生无 HSK → HSK 页。
//
// ⚠️ 一定要在组件的**第一个** hook 位置调用它，并且不要在它之后写提前 return ——
//    TeacherDashboard 那边就因为提前 return 之后还有 5 个 hook 而埋了雷，
//    本次没迁那个页面，但这里的分支写法刻意避开了同一个坑：本 hook 内部只有
//    effect、不改变调用方的 hook 数量。
export function useGuard({ requireHsk = true, studentOnly = false } = {}) {
  const { user, guest, loading } = useAuth()
  const { hsk, isMounted } = useApp()

  const isTeacher = user?.role === 'teacher'
  const authed = !!user || guest
  const ready = !loading && isMounted && authed

  useEffect(() => {
    if (loading || !isMounted) return

    if (!authed) {
      replace(ROUTES.login)
      return
    }
    if (isTeacher) {
      // 教师没有学生侧页面；直接送回主菜单，对应 Web 版里那些路由对教师根本不存在
      if (studentOnly) replace(ROUTES.main)
      return
    }
    if (requireHsk && !hsk) {
      replace(ROUTES.hsk)
    }
  }, [loading, isMounted, authed, isTeacher, hsk, requireHsk, studentOnly])

  return { ready, user, guest, isTeacher }
}
