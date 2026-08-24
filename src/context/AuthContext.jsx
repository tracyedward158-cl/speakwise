import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, getToken, setToken } from "../utils/api.js";
import { migrateLocalRecords } from "../utils/recordStore.js";

const GUEST_KEY = "speakwise_guest";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [guest, setGuest] = useState(() => localStorage.getItem(GUEST_KEY) === "true");
  const [loading, setLoading] = useState(true); // 恢复会话中

  // 挂载时用本地 token 恢复会话（StrictMode 双执行无害：幂等 GET）
  useEffect(() => {
    if (getToken()) {
      authApi.me()
        .then(({ user: u, class: c }) => setUser({ ...u, class: c }))
        .catch(() => { setToken(null); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // 登录/注册成功后的公共处理：存 token、设用户、后台迁移本地记录
  const handleAuthSuccess = useCallback(async (data) => {
    setToken(data.token);
    setGuest(false);
    localStorage.removeItem(GUEST_KEY);
    setUser(data.user);
    migrateLocalRecords().catch(err => console.warn("[migrate] 本地记录迁移失败:", err.message));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await authApi.login({ username, password });
    await handleAuthSuccess(data);
    return data;
  }, [handleAuthSuccess]);

  const register = useCallback(async (payload) => {
    const data = await authApi.register(payload);
    await handleAuthSuccess(data);
    return data;
  }, [handleAuthSuccess]);

  const enterGuest = useCallback(() => {
    setToken(null);
    setUser(null);
    setGuest(true);
    localStorage.setItem(GUEST_KEY, "true");
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setGuest(false);
    localStorage.removeItem(GUEST_KEY);
  }, []);

  const patchMe = useCallback(async (payload) => {
    const { user: u } = await authApi.patchMe(payload);
    setUser(prev => (prev ? { ...prev, ...u } : prev));
    return u;
  }, []);

  const joinClass = useCallback(async (code) => {
    const { class: c } = await authApi.joinClass(code);
    setUser(prev => (prev ? { ...prev, class: c } : prev));
    return c;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, guest, loading, login, register, enterGuest, logout, patchMe, joinClass }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
