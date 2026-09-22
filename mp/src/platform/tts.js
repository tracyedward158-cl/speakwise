import Taro from '@tarojs/taro'
import {
  TTS_SPEED_NORMAL,
  TTS_SPEED_SLOW,
  TTS_VOICE,
  TTS_CACHE_DIR,
  TTS_CACHE_MAX_FILES,
  TTS_CACHE_MAX_BYTES
} from '../config'
import { synthesizeSpeech } from '../core/utils/api'
import { cleanForTTS } from '../core/utils/text'
import {
  USER_DATA_PATH,
  userPath,
  mkdirIfNeeded,
  writeBase64,
  exists,
  unlink,
  stat,
  readdir,
  hash32
} from './file'
import { storage } from './storage'

// 语音合成 + 播放。
//
// ── 为什么是单例，以及 ChatBubble 那条约束为什么还成立 ──
//
// Web 版的约束是「`window.speechSynthesis` 是全局单例，所以不要在 ChatterBubble
// 里各自调 useSpeech」。小程序里引擎换了（InnerAudioContext 每次调用都能拿到
// 独立实例），但约束**依然成立**，只是理由变了：同一时刻只能有一条音频在响，
// 否则两段朗读叠在一起。所以父组件调一次 useSpeech、把 speaking/onSpeak
// 传下去的写法原样保留，只是这里的实现换成模块级单例。
//
// ── token 而不是布尔量 ──
//
// `stop()` 会为「上一段」音频触发 onStop。如果那时已经播到下一段了，
// 把 speaking 置false 就会让新开始播放的那段按钮几百毫秒后自己灭掉。
// 所以每次 speak 先自增 seq，回调里比对 seq，不是当前的一律忽略。

const CACHE_INDEX_KEY = 'speakwise_tts_index'

let ctx = null
let bound = false
let seq = 0
let current = null // { id, text, resolve, reject }
const listeners = new Set()

const cacheDir = () => userPath(TTS_CACHE_DIR)

function notify() {
  const snapshot = getSnapshot()
  listeners.forEach((fn) => {
    try {
      fn(snapshot)
    } catch (e) {
      /* 订阅者自己的错不该影响播放 */
    }
  })
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return { playing: current != null, text: current?.text ?? null, id: current?.id ?? null }
}

function context() {
  if (ctx) return ctx
  ctx = Taro.createInnerAudioContext()
  ctx.autoplay = false
  bind()
  return ctx
}

function finish(reason, e) {
  const cur = current
  current = null
  notify()
  if (!cur) return
  if (reason === 'error') {
    const err = new Error('播放失败')
    err.code = e?.errCode === 10003 ? 'FILE_MISSING' : 'PLAY_FAILED'
    err.errCode = e?.errCode
    cur.reject(err)
  } else {
    cur.resolve(reason)
  }
}

function bind() {
  if (bound) return
  bound = true
  const c = ctx
  c.onPlay(() => notify())
  c.onEnded(() => finish('ended'))
  c.onStop(() => finish('stopped'))
  c.onError((e) => finish('error', e))
}

// ── 缓存 ──
// 文件名用哈希，纯十六进制 —— 中文文件名在某些机型上会让 InnerAudioContext.src
// 静默失败（路径编码问题）。

function cacheKey(text, slow) {
  return hash32(`${text}|${TTS_VOICE}|${slow ? TTS_SPEED_SLOW : TTS_SPEED_NORMAL}`)
}

function readIndex() {
  try {
    return JSON.parse(storage.getItem(CACHE_INDEX_KEY) || '{}') || {}
  } catch (e) {
    return {}
  }
}

function writeIndex(idx) {
  try {
    storage.setItem(CACHE_INDEX_KEY, JSON.stringify(idx))
  } catch (e) {
    // 索引写不进去不是致命问题（只是退化成不缓存），不该打断朗读
    console.warn('[tts] 缓存索引写入失败:', e?.message)
  }
}

function sweepIfNeeded() {
  const idx = readIndex()
  const keys = Object.keys(idx)
  if (keys.length <= TTS_CACHE_MAX_FILES) {
    // 数量没超时也偶尔看一眼体积，超了再淘汰
    let total = 0
    let over = false
    for (const k of keys) {
      const s = stat(userPath(TTS_CACHE_DIR, `${k}.mp3`))
      if (s) total += s.size
      if (total > TTS_CACHE_MAX_BYTES) {
        over = true
        break
      }
    }
    if (!over) return
  }

  // 按最后使用时间从旧到新淘汰
  const sorted = keys.sort((a, b) => (idx[a] || 0) - (idx[b] || 0))
  const keep = sorted.slice(-Math.floor(TTS_CACHE_MAX_FILES * 0.7))
  const keepSet = new Set(keep)

  let total = 0
  for (const k of keep) {
    const s = stat(userPath(TTS_CACHE_DIR, `${k}.mp3`))
    if (s) total += s.size
  }

  const next = {}
  for (const k of keep) next[k] = idx[k]

  for (const k of keys) {
    if (keepSet.has(k)) continue
    unlink(userPath(TTS_CACHE_DIR, `${k}.mp3`))
  }
  // 体积仍超标就继续按时间丢
  for (const k of keep) {
    if (total <= TTS_CACHE_MAX_BYTES) break
    const s = stat(userPath(TTS_CACHE_DIR, `${k}.mp3`))
    if (s) total -= s.size
    unlink(userPath(TTS_CACHE_DIR, `${k}.mp3`))
    delete next[k]
  }
  writeIndex(next)
}

/** 启动时清一次孤儿文件（索引里有、磁盘上没有，或反过来） */
export async function initTtsCache() {
  await mkdirIfNeeded(cacheDir())
  const idx = readIndex()
  const files = readdir(cacheDir())
  const onDisk = new Set(files.map((f) => f.replace(/\.mp3$/, '')))
  let dirty = false
  for (const k of Object.keys(idx)) {
    if (!onDisk.has(k)) {
      delete idx[k]
      dirty = true
    }
  }
  for (const k of onDisk) {
    if (!idx[k]) {
      idx[k] = Date.now()
      dirty = true
    }
  }
  if (dirty) writeIndex(idx)
  sweepIfNeeded()
}

// ── 长文本切分 ──
// 讯飞单次合成要求文本 base64 前 < 8000 字节（约 2000 汉字）。
// 按句号切，逐段合成后把音频拼起来。
const MAX_TTS_CHARS = 1200

function splitText(text) {
  if (text.length <= MAX_TTS_CHARS) return [text]
  const parts = []
  let buf = ''
  for (const ch of text) {
    buf += ch
    if (buf.length >= MAX_TTS_CHARS && /[。！？；\n]/.test(ch)) {
      parts.push(buf)
      buf = ''
    }
  }
  if (buf) parts.push(buf)
  return parts
}

/** 取（必要时合成）音频文件路径。带缓存。 */
async function ensureAudioFile(text, slow) {
  await mkdirIfNeeded(cacheDir())
  const key = cacheKey(text, slow)
  const filePath = userPath(TTS_CACHE_DIR, `${key}.mp3`)

  const idx = readIndex()
  if (idx[key] && exists(filePath)) {
    idx[key] = Date.now()
    writeIndex(idx)
    return filePath
  }

  const speed = slow ? TTS_SPEED_SLOW : TTS_SPEED_NORMAL
  const parts = splitText(text)

  let base64
  if (parts.length === 1) {
    const res = await synthesizeSpeech(parts[0], speed)
    base64 = res.audio
  } else {
    // MP3 是帧结构，逐段合成的字节可以直接首尾相连。
    // 段与段之间可能有极短的接缝，对跟读演示无影响。
    const pieces = []
    for (const p of parts) {
      const res = await synthesizeSpeech(p, speed)
      pieces.push(res.audio)
    }
    base64 = pieces.join('')
  }

  if (!base64) throw new Error('语音合成返回为空')

  await writeBase64(filePath, base64)

  idx[key] = Date.now()
  writeIndex(idx)
  sweepIfNeeded()

  return filePath
}

// ── 对外 API ──

/**
 * 朗读一段文本。
 * @param {string} rawText 原文（内部会走 cleanForTTS 清洗）
 * @param {boolean} slow   慢速（跟读示范）
 */
export async function speak(rawText, slow = false) {
  const text = cleanForTTS(rawText)
  if (!text.trim()) return null

  const id = ++seq
  const c = context()

  // 先停掉正在播的。停旧的那一下会触发 onStop，但那时 current 已经被我们
  // 置空，finish() 里 `if (!cur) return` 会把它吃掉。
  try {
    c.stop()
  } catch (e) {
    /* 没在播 */
  }
  current = null
  notify()

  const filePath = await ensureAudioFile(text, slow)

  // 等网络这段时间里用户可能又点了别的 —— 这次请求作废
  if (id !== seq) return null

  return new Promise((resolve, reject) => {
    current = { id, text, resolve, reject }
    notify()

    c.src = filePath
    // playbackRate 范围 0.5–2.0（基础库 2.11.0+）。
    // 慢速主要靠服务端 speed 参数实现（音高不变，才是合格的教学示范），
    // 这里只在服务端速度之上做一点微调，不作为主要手段。
    try {
      c.playbackRate = slow ? 0.95 : 1
    } catch (e) {
      /* 低版本基础库不支持，忽略 */
    }
    c.play()
    notify()
  })
}

export function stopSpeaking() {
  seq++
  try {
    context().stop()
  } catch (e) {
    /* 没在播 */
  }
  current = null
  notify()
}

/** 释放播放器（页面卸载时不必调，音频是 App 级的；登出/热重载时可用） */
export function destroyAudio() {
  stopSpeaking()
  if (ctx) {
    try {
      ctx.destroy()
    } catch (e) {
      /* ignore */
    }
    ctx = null
    bound = false
  }
}

export function isSpeaking() {
  return current != null
}
