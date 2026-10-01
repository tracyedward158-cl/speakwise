// 对应 Web 版 src/utils/api.js。
// 请求原语换成了 Taro（见 platform/request.js），接口清单与超时值逐条对齐，
// 调用方（chatGrading / pronunciationBank / 各页面）无需感知差异。

import { apiFetch, getToken, setToken, TOKEN_KEY } from '../../platform/request'

export { getToken, setToken, TOKEN_KEY }

// ── AI 能力 ──
// AI 生成慢（尤其会话评分），显式放宽到 60s，否则会被 apiFetch 的默认超时切断
// json=true 时服务端会开 DeepSeek 的 JSON 输出模式（提示词里必须出现 "json" 字样）
export async function callAI(system, messages, maxTokens = 600, retries = 2, json = false) {
  for (let i = 0; i <= retries; i++) {
    try {
      const data = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ system, messages, max_tokens: maxTokens, json }),
        timeout: 60000
      })
      if (!data.reply || data.reply.trim() === '') throw new Error('Empty reply')
      return data.reply
    } catch (e) {
      if (i === retries) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

// ⚠️ 入参是**裸 base64**、不带 data: 前缀。
// 服务端靠 `audio.startsWith('UklGR')`（"RIFF" 的 base64）判断是不是 WAV：
// 是 WAV 就 lamejs 转码，否则原样当 MP3 透传。
// 小程序端录 mp3、走透传分支，服务端一行都不用改。
export async function evaluatePronunciation(audioBase64, refText, core = 'sent') {
  return apiFetch('/api/evaluate', {
    method: 'POST',
    body: JSON.stringify({ audio: audioBase64, refText, core }),
    timeout: 60000 // 音频上传 + 服务端评测，慢网络下会超过默认 20s
  })
}

// ── 语音识别（小程序新增）──
// Web 版走浏览器 SpeechRecognition，没有服务端接口；这里补一个。
// 服务端内部转发讯飞 IAT。返回 { text }。
export async function transcribeAudio(audioBase64, timeout = 30000) {
  // 分帧发送到讯飞本身就有节奏开销（见 server.cjs 的 IAT 客户端），
  // 所以超时比 evaluate 还宽。
  return apiFetch('/api/asr', {
    method: 'POST',
    body: JSON.stringify({ audio: audioBase64 }),
    timeout
  })
}

// ── 语音合成（小程序新增）──
// speed ∈ [0,100]，50 为常速。返回 { audio: base64mp3, format }
export async function synthesizeSpeech(text, speed = 50, timeout = 20000) {
  return apiFetch('/api/tts', {
    method: 'POST',
    body: JSON.stringify({ text, speed }),
    timeout
  })
}

// ── 用户系统 ──
export const authApi = {
  register: (payload) => apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => apiFetch('/api/auth/me'),
  patchMe: (payload) => apiFetch('/api/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  changePassword: (payload) =>
    apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify(payload) }),
  joinClass: (code) => apiFetch('/api/auth/class/join', { method: 'POST', body: JSON.stringify({ code }) }),
  leaveClass: () => apiFetch('/api/auth/class/leave', { method: 'POST' })
}

// ── 练习记录 ──
export const recordApi = {
  save: (record) => apiFetch('/api/records', { method: 'POST', body: JSON.stringify(record) }),
  // 批量迁移会带上全部本地对话记录，服务端按 ~1MB 分批顺序写入
  migrate: (records) =>
    apiFetch('/api/records/migrate', { method: 'POST', body: JSON.stringify({ records }), timeout: 60000 }),
  mine: () => apiFetch('/api/records/mine'),
  classRecords: () => apiFetch('/api/records/class'),
  scenarios: () => apiFetch('/api/records/scenarios'),
  detail: (id) => apiFetch(`/api/records/${id}`)
}

// ── 教师任务 ──
// 注意：GET /api/tasks 目前对 (任务 × 学生) 逐个 COUNT，属于 N+1，
// 班级规模一大就会逼近超时。这里放宽到 45s 是权宜，根治要改成单条 GROUP BY。
export const taskApi = {
  create: (payload) => apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  list: () => apiFetch('/api/tasks', { timeout: 45000 }),
  mine: () => apiFetch('/api/tasks/mine', { timeout: 45000 }),
  remove: (id) => apiFetch(`/api/tasks/${id}`, { method: 'DELETE' })
}
