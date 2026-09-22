import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, getToken, setToken } from '../core/utils/api'
import { migrateLocalRecords, setOwnerId } from '../core/utils/recordStore'
import { storage } from '../platform/storage'

const GUEST_KEY = 'speakwise_guest'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [guest, setGuest] = useState(() => storage.getItem(GUEST_KEY) === 'true')
  const [loading, setLoading] = useState(true) // 恢复会话中

  // 挂载时用本地 token 恢复会话
  useEffect(() => {
    if (getToken()) {
      authApi
        .me()
        .then(({ user: u, class: c }) => {
          setUser({ ...u, class: c })
          setOwnerId(u.id)
        })
        .catch(() => {
          setToken(null)
          setUser(null)
          setOwnerId(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // 登录/注册成功后的公共处理：存 token、设用户、后台迁移本地记录
  const handleAuthSuccess = useCallback(async (data) => {
    setToken(data.token)
    setGuest(false)
    storage.removeItem(GUEST_KEY)
    // 新后端在登录/注册响应里直接带 class；旧后端不带（JSON 里就是 undefined）。
    // 前端静态托管和 SCF 是分开部署的，两边版本错开是常态，缺了这一步用户会看到
    // 「还没加入班级」，而且只有整页刷新才会走 /me 恢复。所以缺了就补一次 /me。
    let cls = data.class
    if (cls === undefined) {
      cls = await authApi
        .me()
        .then((r) => r.class ?? null)
        .catch(() => null)
    }
    setUser({ ...data.user, class: cls ?? null })
    setOwnerId(data.user.id) // 记录归属切到账号 id，与云端 user_id 口径一致
    migrateLocalRecords().catch((err) => console.warn('[migrate] 本地记录迁移失败:', err.message))
  }, [])

  const login = useCallback(
    async (username, password) => {
      const data = await authApi.login({ username, password })
      await handleAuthSuccess(data)
      return data
    },
    [handleAuthSuccess]
  )

  const register = useCallback(
    async (payload) => {
      const data = await authApi.register(payload)
      await handleAuthSuccess(data)
      return data
    },
    [handleAuthSuccess]
  )

  const enterGuest = useCallback(() => {
    setToken(null)
    setUser(null)
    setGuest(true)
    storage.setItem(GUEST_KEY, 'true')
    setOwnerId(null) // 退回本地匿名编号
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setGuest(false)
    storage.removeItem(GUEST_KEY)
    setOwnerId(null)
  }, [])

  const patchMe = useCallback(async (payload) => {
    const { user: u } = await authApi.patchMe(payload)
    setUser((prev) => (prev ? { ...prev, ...u } : prev))
    return u
  }, [])

  const joinClass = useCallback(async (code) => {
    const { class: c } = await authApi.joinClass(code)
    setUser((prev) => (prev ? { ...prev, class: c } : prev))
    return c
  }, [])

  const leaveClass = useCallback(async () => {
    await authApi.leaveClass()
    setUser((prev) => (prev ? { ...prev, class: null } : prev))
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, guest, loading, login, register, enterGuest, logout, patchMe, joinClass, leaveClass }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
