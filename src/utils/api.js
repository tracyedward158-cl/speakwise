// ── Unified API helpers ──
// 本地开发：Vite proxy /api → localhost:3000 (server.cjs)
// 生产环境：前端静态页面托管 → 直连 SCF Web Function
// 部署后在下方填入 SCF 地址，形如 https://xxx.ap-nanjing.tencentscf.com
const API_BASE = import.meta.env.DEV
  ? ""
  : "https://1421249792-l5mg9larpx.ap-nanjing.tencentscf.com";

// ── Token 存取 ──
export const TOKEN_KEY = "speakwise_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ── 统一请求封装：自动附带 Bearer token；401 时清 token 并跳登录页 ──
export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token) {
    // 会话过期：清除令牌并回到登录页（HashRouter 下用 hash 跳转）
    setToken(null);
    if (!window.location.hash.startsWith("#/login")) window.location.hash = "#/login";
  }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

// ── AI 能力 ──
export async function callAI(system, messages, maxTokens = 600, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const data = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
      });
      if (!data.reply || data.reply.trim() === "") throw new Error("Empty reply");
      return data.reply;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

export async function evaluatePronunciation(audioBase64, refText, core = "sent") {
  return apiFetch("/api/evaluate", {
    method: "POST",
    body: JSON.stringify({ audio: audioBase64, refText, core }),
  });
}

// ── 用户系统 ──
export const authApi = {
  register: (payload) => apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => apiFetch("/api/auth/me"),
  patchMe: (payload) => apiFetch("/api/auth/me", { method: "PATCH", body: JSON.stringify(payload) }),
  changePassword: (payload) => apiFetch("/api/auth/change-password", { method: "POST", body: JSON.stringify(payload) }),
  joinClass: (code) => apiFetch("/api/auth/class/join", { method: "POST", body: JSON.stringify({ code }) }),
};

// ── 练习记录 ──
export const recordApi = {
  save: (record) => apiFetch("/api/records", { method: "POST", body: JSON.stringify(record) }),
  migrate: (records) => apiFetch("/api/records/migrate", { method: "POST", body: JSON.stringify({ records }) }),
  mine: () => apiFetch("/api/records/mine"),
  classRecords: () => apiFetch("/api/records/class"),
};
