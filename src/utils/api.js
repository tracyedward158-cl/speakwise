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

// ── 统一请求封装：自动附带 Bearer token；超时中断；401 时清 token 并跳登录页 ──
// 默认 20s。没有超时的话，一个卡住的请求会让 await 它的调用方永久挂起
// （例如 TeacherDashboard 的 Promise.all）。
export async function apiFetch(path, { timeout = 20000, ...options } = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const timedOut = () => new Error("请求超时，请检查网络后重试");
  try {
    const res = await fetch(API_BASE + path, { ...options, headers, signal: ctl.signal });

    // res.json() 在响应体传输中途被中断时同样会 reject。不能无差别吞掉它，
    // 否则「超时」会变成「成功但返回空对象」——调用方拿到 undefined 字段却以为成功。
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      if (ctl.signal.aborted) throw timedOut();
      data = {};   // 非 JSON 响应（如网关的 HTML 错误页），交给下面的 !res.ok 分支
    }

    if (res.status === 401 && token) {
      // 会话过期：清除令牌并回到登录页（HashRouter 下用 hash 跳转）
      setToken(null);
      if (!window.location.hash.startsWith("#/login")) window.location.hash = "#/login";
    }
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw timedOut();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── AI 能力 ──
// AI 生成慢（尤其会话评分），显式放宽到 60s，否则会被 apiFetch 的默认超时切断
export async function callAI(system, messages, maxTokens = 600, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const data = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
        timeout: 60000,
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
    timeout: 60000,   // 音频上传 + 服务端评测，慢网络下会超过默认 20s
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
  leaveClass: () => apiFetch("/api/auth/class/leave", { method: "POST" }),
};

// ── 练习记录 ──
export const recordApi = {
  save: (record) => apiFetch("/api/records", { method: "POST", body: JSON.stringify(record) }),
  // 批量迁移会带上全部本地对话记录，服务端按 ~1MB 分批顺序写入，冷启动下会超过默认 20s
  migrate: (records) => apiFetch("/api/records/migrate", { method: "POST", body: JSON.stringify({ records }), timeout: 60000 }),
  mine: () => apiFetch("/api/records/mine"),
  classRecords: () => apiFetch("/api/records/class"),
  scenarios: () => apiFetch("/api/records/scenarios"),
  detail: (id) => apiFetch(`/api/records/${id}`),
};

// ── 教师任务 ──
// 注意：GET /api/tasks 目前对 (任务 × 学生) 逐个 COUNT，属于 N+1，
// 班级规模一大就会逼近超时。这里放宽到 45s 是权宜，根治要改成单条 GROUP BY。
export const taskApi = {
  create: (payload) => apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),
  list: () => apiFetch("/api/tasks", { timeout: 45000 }),
  mine: () => apiFetch("/api/tasks/mine", { timeout: 45000 }),
  remove: (id) => apiFetch(`/api/tasks/${id}`, { method: "DELETE" }),
};
