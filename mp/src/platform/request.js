import Taro from '@tarojs/taro'
import { storage } from './storage'
import { API_BASE } from '../config'

// Web 版 src/utils/api.js 里 apiFetch 的 Taro 移植。
//
// 原封不动保留的：默认 20s 超时、Bearer 注入、401 清 token、非 JSON 响应兜底、
// 「超时」与「返回空对象」不能混为一谈这条不变量。
//
// 唯一实质改动：401 时原来是 `window.location.hash = "#/login"` —— 小程序没有
// location，而且一个工具函数不该硬编码导航。改成可注入的回调。

export const TOKEN_KEY = 'speakwise_token'

export function getToken() {
  return storage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) storage.setItem(TOKEN_KEY, token)
  else storage.removeItem(TOKEN_KEY)
}

let onUnauthorized = () => {
  Taro.reLaunch({ url: '/pages/login/index' })
}

/** 覆盖 401 的默认行为（页面里可注入带 toast 提示的版本） */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

const TIMEOUT_MSG = '请求超时，请检查网络后重试'

function isAbort(err) {
  const msg = err?.errMsg || err?.message || ''
  return /abort/i.test(msg)
}

function isTimeout(err) {
  const msg = err?.errMsg || err?.message || ''
  return /timeout/i.test(msg)
}

/**
 * @param {string} path  以 /api 开头
 * @param {object} opts  { timeout, method, body, header } —— body 与 fetch 一样传 JSON 字符串
 */
export async function apiFetch(path, { timeout = 20000, method = 'GET', body, header: extraHeader } = {}) {
  const token = getToken()
  const header = { 'Content-Type': 'application/json', ...(extraHeader || {}) }
  if (token) header.Authorization = `Bearer ${token}`

  let task = null
  const timedOut = () => new Error(TIMEOUT_MSG)

  const res = await new Promise((resolve, reject) => {
    task = Taro.request({
      url: API_BASE + path,
      method,
      // 传字符串时 wx.request 原样发送，语义与 fetch 的 body 一致。
      // 传对象时 Taro 会按 Content-Type 自己序列化 —— 两种都支持。
      data: body,
      header,
      timeout,
      dataType: 'json',
      success: resolve,
      fail: (err) => reject(err)
    })
  }).catch((err) => {
    if (isAbort(err)) throw timedOut()
    if (isTimeout(err)) throw timedOut()
    throw new Error(err?.errMsg ? err.errMsg.replace(/^request:fail\s*/, '') : '网络请求失败')
  })

  const status = res.statusCode

  // 与 Web 版同样的小心：非 JSON 响应（网关的 HTML 错误页、空响应体）不能当成
  // 「成功但返回空对象」—— 那会让调用方拿到 undefined 字段却以为请求成功了。
  let data = res.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (e) {
      data = {}
    }
  }
  if (!data || typeof data !== 'object') data = {}

  if (status === 401 && token) {
    setToken(null)
    onUnauthorized()
  }
  if (status < 200 || status >= 300) {
    throw new Error(data.error || `请求失败 (${status})`)
  }
  return data
}
