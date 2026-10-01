import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { storage } from '../platform/storage'
import { useAuth } from './AuthContext'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [isMounted, setIsMounted] = useState(false)
  const [hsk, setHsk] = useState(null)
  const [viewMode, setViewMode] = useState('HPE')

  // Web 版把下面这两段 HSK 同步逻辑放在 App.jsx 里，靠顶层组件的 effect 驱动。
  // Taro 的 app.js 不按页跑 effect，所以搬进了这个 Provider —— 语义不变。
  const { user, patchMe } = useAuth()

  useEffect(() => {
    const savedHsk = storage.getItem('hsk')
    const savedMode = storage.getItem('viewMode')
    if (savedHsk) setHsk(savedHsk)
    if (savedMode) setViewMode(savedMode)
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (isMounted && hsk) storage.setItem('hsk', hsk)
  }, [hsk, isMounted])

  useEffect(() => {
    if (isMounted) storage.setItem('viewMode', viewMode)
  }, [viewMode, isMounted])

  // ── HSK 与云端同步 ──
  // 用户切换时：hsk 以云端账号为准（无 hsk 的账号回到 HSK 选择页）
  const prevUserId = useRef(undefined)
  useEffect(() => {
    const id = user ? user.id : undefined
    if (prevUserId.current === id) return
    prevUserId.current = id
    if (user) setHsk(user.hsk || null)
  }, [user])

  // 本地 hsk 变化（HSK 选择页 / TopBar 切换）→ 同步到云端。
  // 只看 hsk：带上 user 会让它在登录瞬间重复触发一次。
  useEffect(() => {
    if (user && hsk && hsk !== user.hsk) {
      patchMe({ hsk }).catch((err) => console.warn('[hsk sync] 同步失败:', err.message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsk])

  return (
    <AppContext.Provider value={{ isMounted, hsk, setHsk, viewMode, setViewMode }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
