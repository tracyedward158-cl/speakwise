import Taro from '@tarojs/taro'
import { RECORD_OPTIONS, RECORD_FORMAT, MAX_AUDIO_BASE64 } from '../config'
import { readAsBase64, readAsArrayBuffer } from './file'
import { ensureMicAccess } from './privacy'

// 录音。整个迁移里最容易出错的一块。
//
// ── 为什么是个状态机，而不是「一个布尔量 + 回调」 ──
//
// 1. `Taro.getRecorderManager()` 是**全局单例**，而 `onStop` / `onError` 只能注册、
//    没有 off 可以解绑（微信端没有 offStop；那是支付宝的 API）。每次录音都注册一遍
//    的话，回调会跨页面越积越多，上一页的 onStop 会去 resolve 这一页的 promise。
//    解法：模块加载时**只注册一次**，事件投进一个可变的 pending 槽；
//    槽是空的时候来的回调，可以证明是过期事件，直接丢掉。
//
// 2. `stop()` 在 `onStart` 之前调用会失败（真机报 `recorder not start`）。
//    用户点得快就会撞上 —— 所以需要 stopRequested 这个「等 onStart 到了再停」的中间态。
//
// 3. **回调不保证一定来**。开发者工具里 onStop 有时根本不触发；后台挂起、
//    系统抢占麦克风也都可能什么都不发。任何一次 await 挂住，phase 就会永久
//    停在中间态，之后每次点麦克风都是「正在录音中」，而且**退出页面也解不开**。
//    所以这台状态机有三层自愈：每段有独立看门狗、进入新录音前检测卡死并复位、
//    页面卸载/切后台无条件复位。

let mgr = null
let bound = false
let phase = 'idle' // idle | starting | recording | stopping
let phaseSince = 0 // 进入当前阶段的时间戳，卡死检测靠它
let starting = false // 同步重入闸：盖住 await 权限那段窗口
let stopRequested = false
// 一次录音有两个独立的等待点，必须分开：
//   startWaiter —— 只等 onStart。startRecording() 在它兑现时就返回，
//                  调用方据此把按钮切成「录音中」。
//   pending     —— 等到 onStop/onError。stopRecording() 在它兑现时拿到文件。
//
// ⚠️ 早先把两者合成一个 promise，结果 startRecording() 要等到**整段录音结束**
//    才返回，于是 UI 永远不变红 → 用户以为没录上 → 再点一下 → 报「正在录音中」。
//    这个 bug 在真机上表现为「点麦克风没反应，再点说正在录音中」。
let pending = null // { resolve, reject, timer, stopTimer }
let startWaiter = null // { resolve, reject }
let interruptCb = null

const manager = () => (mgr || (mgr = Taro.getRecorderManager()))

function recError(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

function setPhase(p) {
  phase = p
  phaseSince = Date.now()
}

// 各阶段的合法最长时长。超了就是状态机坏了，不是「还在忙」。
//
// 做成可改的对象而不是三个常量：自检脚本要把它调小，才能在毫秒级里验证
// 「回调不来时状态机会自己解开」—— 那正是这个模块最容易坏、也最难在界面上
// 察觉的一条路径（表现只是「点麦克风说正在录音中」）。
export const RECORDER_LIMITS = {
  starting: 30000, // 用户在权限弹窗上可能犹豫很久
  stopping: 6000,
  recording: RECORD_OPTIONS.duration + 8000
}

function isStuck() {
  if (phase === 'idle') return false
  const limit =
    phase === 'recording'
      ? RECORDER_LIMITS.recording
      : phase === 'starting'
        ? RECORDER_LIMITS.starting
        : RECORDER_LIMITS.stopping
  return Date.now() - phaseSince > limit
}

/** 消费掉两个等待槽。都空 = 过期事件，安静丢弃。 */
function settle(kind, value) {
  const p = pending
  const w = startWaiter
  if (!p && !w) return
  pending = null
  startWaiter = null
  setPhase('idle')
  stopRequested = false
  if (p) {
    clearTimeout(p.timer)
    if (p.stopTimer) clearTimeout(p.stopTimer)
  }
  // 还没开始就结束了（onError、看门狗、复位）—— 等 onStart 的那一方也要收尾，
  // 否则 startRecording() 会永久挂着，按钮永远不变红。
  if (w) w.reject(value instanceof Error ? value : recError('ABORTED', '录音未能开始'))
  if (p) {
    if (kind === 'ok') p.resolve(value)
    else p.reject(value)
  }
}

/**
 * 无条件复位：停掉硬件、拒绝在途 promise、回到 idle。
 * 这是「不管现在什么状态，都给我回到能重新开始」的那把钥匙 ——
 * 看门狗、卡死自愈、页面卸载、切后台，全都走它。
 */
export function resetRecorder() {
  const p = pending
  const w = startWaiter
  pending = null
  startWaiter = null
  starting = false
  stopRequested = false
  setPhase('idle')
  if (p) {
    clearTimeout(p.timer)
    if (p.stopTimer) clearTimeout(p.stopTimer)
    p.reject(recError('ABORTED', '已取消'))
  }
  if (w) w.reject(recError('ABORTED', '已取消'))
  try {
    manager().stop()
  } catch (e) {
    /* 没在录，忽略 */
  }
}

function normalizeError(e) {
  const msg = e?.errMsg || e?.message || String(e)
  if (/auth|authorize|deny|1107601/i.test(msg)) return recError('NO_PERMISSION', '没有麦克风权限')
  if (/not start/i.test(msg)) return recError('NOT_STARTED', '录音还没开始')
  if (/format|sampleRate|encodeBitRate|1107603/i.test(msg)) {
    // 基本意味着 RECORD_OPTIONS 配错了（比如 sampleRate 16000 配了范围外的 encodeBitRate）
    return recError('BAD_CONFIG', `录音参数不合法：${msg}`)
  }
  if (/1107607|interrupt/i.test(msg)) return recError('INTERRUPTED', '录音被系统打断，请重试')
  if (/1107608|busy/i.test(msg)) return recError('BUSY', '正在录音中')
  return recError('UNKNOWN', msg)
}

function bindOnce() {
  if (bound) return
  bound = true
  const m = manager()

  m.onStart(() => {
    setPhase('recording')
    // 兑现 startRecording 的等待者：它只关心「真的开始录了」，
    // 好让调用方立刻把按钮切成「录音中」。这里**不能**等到 onStop。
    if (startWaiter) {
      const w = startWaiter
      startWaiter = null
      w.resolve()
    }
    // start 还没回调时用户就按了停止 —— 现在才真的能停
    if (stopRequested) {
      stopRequested = false
      try {
        m.stop()
      } catch (e) {
        settle('err', normalizeError(e))
      }
    }
  })

  m.onStop((res) => {
    if (!res || !res.tempFilePath) {
      return settle('err', recError('EMPTY', '没录到声音，请再说一次'))
    }
    if (!res.fileSize) {
      return settle('err', recError('EMPTY', '录音文件是空的，请重试'))
    }
    // 太短的多半是误触，送去评测只会拿到一段自信的胡话
    if (res.duration != null && res.duration < 200) {
      return settle('err', recError('TOO_SHORT', '太短了，再说一次'))
    }
    settle('ok', res) // { tempFilePath, duration, fileSize }
  })

  m.onError((e) => settle('err', normalizeError(e)))

  // 来电 / 微信语音通话抢占麦克风。此时录音被系统暂停，我们的 promise 必须收尾，
  // 否则页面会一直停在「录音中」。
  m.onInterruptionBegin(() => {
    try {
      manager().stop()
    } catch (e) {
      /* ignore */
    }
    settle('err', recError('INTERRUPTED', '麦克风被系统占用，请重试'))
    if (interruptCb) interruptCb('begin')
  })

  if (m.onInterruptionEnd) {
    m.onInterruptionEnd(() => {
      if (interruptCb) interruptCb('end')
    })
  }
}

/**
 * 开始录音。会先过隐私协议与 scope.record 两道权限。
 * @returns {Promise<void>} 在 onStart 之后 resolve —— 让 UI 不要在弹权限框时就说「录音中」
 */
export async function startRecording({ onInterrupt } = {}) {
  // 重入闸。必须是同步的：下面 await 权限那段可能弹窗等很久，
  // 光靠 phase 挡不住连点两下。
  if (starting) throw recError('BUSY', '正在录音中')

  if (phase !== 'idle') {
    if (isStuck()) {
      // 上一轮的回调没来（开发者工具里很常见），别把用户永久挡在门外
      console.warn('[recorder] 状态机卡在', phase, '，自动复位后重来')
      resetRecorder()
    } else {
      throw recError('BUSY', '正在录音中')
    }
  }

  starting = true
  try {
    await ensureMicAccess()
  } finally {
    starting = false
  }

  bindOnce()
  interruptCb = onInterrupt || null
  setPhase('starting')

  // 只等「开始」的那一半。stopRecording() 会去等 pending 那一半。
  const started = new Promise((resolve, reject) => {
    startWaiter = { resolve, reject }
  })

  // ⚠️ promise 必须自己存进 pending。
  //    stopRecording() 里写的是 `await pending.promise`；漏了这个字段的话
  //    那行就变成 `await undefined` —— 立即返回 undefined，
  //    finalize(undefined) 直接炸，而且**根本不会等 onStop**。
  //    两个阶段分开写是因为在 executor 里引用 stopped 会撞上 TDZ。
  let stoppedResolve
  let stoppedReject
  const stopped = new Promise((resolve, reject) => {
    stoppedResolve = resolve
    stoppedReject = reject
  })

  // 看门狗 1：整段录音。duration 到了录音器会自己停并触发 onStop；
  // 再留 8 秒余量，超了说明状态机卡住了（onError 没来、onStop 也没来）。
  const timer = setTimeout(() => {
    try {
      manager().stop()
    } catch (e) {
      /* ignore */
    }
    settle('err', recError('TIMEOUT', '录音超时，请重试'))
  }, RECORD_OPTIONS.duration + 8000)

  pending = { promise: stopped, resolve: stoppedResolve, reject: stoppedReject, timer, stopTimer: null }

  try {
    manager().start(RECORD_OPTIONS)
  } catch (e) {
    settle('err', normalizeError(e))
  }

  // pending 那一半可能一直没人 await（用户始终没点停止就退出了页面），
  // 挂个空 catch 免得控制台冒 unhandled rejection。
  // 这只是多了一个订阅者，stopRecording() 照样能收到拒绝。
  stopped.catch(() => {})

  // ⚠️ 等的是 started，不是 stopped。
  //    等 stopped 的话这个函数要等整段录音结束才返回，调用方的
  //    `setRecording(true)` 就永远慢一拍 —— 用户看着按钮没反应会再点一下，
  //    然后拿到「正在录音中」。
  await started
}

/** 停止录音。resolve 出来的就是可直接上行的 base64。 */
export async function stopRecording() {
  if (phase === 'idle') throw recError('NOT_STARTED', '当前没有在录音')

  if (phase === 'starting') {
    // 还在等 onStart，直接 stop 会失败；打个标记让 onStart 去停
    stopRequested = true
    const res = await pending.promise
    return finalize(res)
  }

  setPhase('stopping')
  try {
    manager().stop()
  } catch (e) {
    settle('err', normalizeError(e))
  }

  // 看门狗 2：**结束这一段单独设**。
  // 开发者工具里 onStop 有时不触发，而看门狗 1 要等满整段录音上限（68 秒）才响 ——
  // 那期间 phase 一直卡在 stopping，用户每次点麦克风都是「正在录音中」，
  // 退出页面也解不开。这个 6 秒的兜底才是让状态机不粘住的关键。
  const p = pending
  if (p && !p.stopTimer) {
    p.stopTimer = setTimeout(() => {
      settle('err', recError('STOP_TIMEOUT', '结束录音超时，请重试'))
    }, RECORDER_LIMITS.stopping)
  }

  const res = await pending.promise
  return finalize(res)
}

/**
 * 放弃本次录音：停掉硬件，并且**丢弃结果**。
 * 页面卸载、切后台、用户取消都走它。
 */
export function abortRecording() {
  resetRecorder()
}

export function isRecording() {
  return phase === 'recording' || phase === 'starting'
}

/** 当前状态，诊断页用 */
export function recorderState() {
  return { phase, since: phaseSince, stuck: isStuck() }
}

// ── 读文件 + 格式处理 ──

async function finalize(res) {
  const { tempFilePath, duration, fileSize } = res

  let base64
  let format = RECORD_FORMAT

  if (RECORD_FORMAT === 'pcm') {
    base64 = await pcmFileToWavBase64(tempFilePath)
    format = 'wav' // 拼完头之后，对服务端而言它就是个 WAV
  } else {
    base64 = await readAsBase64(tempFilePath)
  }

  // 腾讯云 API 网关的请求体上限约 6MB，**低于**服务端 Express 那边的 10MB 检查。
  // 网关拒绝发生在 Express 之前，服务端的 413 JSON 处理器根本不会执行，
  // 客户端拿到的是网关的 HTML 错误页。所以在客户端就拦住。
  if (base64.length > MAX_AUDIO_BASE64) {
    throw recError('TOO_LARGE', '录音太长了，请分次练习')
  }

  return { base64, format, duration, fileSize, tempFilePath }
}

// ── PCM 兜底路径 ──
// 只在 config.RECORD_FORMAT = 'pcm' 时走到。
// 服务端认 WAV 头（base64 以 UklGR 开头），会自己转 MP3 送讯飞 ——
// 那条分支是 Web 版已经在跑的，等于复用一条已验证的路径，代价是服务端 CPU。

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

/** 与 Web 版 src/utils/audioRecorder.js 的 buildWav 逐字节一致（44 字节头，PCM/mono/16bit） */
function buildWav(pcmBytes, sampleRate) {
  const dataSize = pcmBytes.length
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)

  writeStr(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(view, 8, 'WAVE')
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byteRate
  view.setUint16(32, 2, true) // blockAlign
  view.setUint16(34, 16, true) // bitsPerSample
  writeStr(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  new Uint8Array(buf, 44).set(pcmBytes)
  return buf
}

// 小程序没有 btoa。优先用平台提供的实现，没有再手工编码。
function arrayBufferToBase64(buffer) {
  if (typeof Taro.arrayBufferToBase64 === 'function') {
    return Taro.arrayBufferToBase64(buffer)
  }
  if (typeof wx !== 'undefined' && typeof wx.arrayBufferToBase64 === 'function') {
    return wx.arrayBufferToBase64(buffer)
  }
  const bytes = new Uint8Array(buffer)
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += CHARS[b0 >> 2]
    out += CHARS[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    out += i + 1 < bytes.length ? CHARS[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : '='
    out += i + 2 < bytes.length ? CHARS[b2 & 63] : '='
  }
  return out
}

async function pcmFileToWavBase64(filePath) {
  const ab = await readAsArrayBuffer(filePath)
  let src = new Uint8Array(ab)

  // 某些基础库对 format:'pcm' 也会带上 RIFF 头。再拼一个的话，
  // 服务端 subarray(44) 就会从错的偏移开始切，整段变成噪声。
  const hasRiff =
    src.length > 4 && src[0] === 0x52 && src[1] === 0x49 && src[2] === 0x46 && src[3] === 0x46
  if (hasRiff) src = src.subarray(44)

  // 奇数长度会让服务端的 Int16Array 构造抛 RangeError
  const pcm = src.length % 2 ? src.subarray(0, src.length - 1) : src

  const wav = buildWav(pcm, RECORD_OPTIONS.sampleRate)
  return arrayBufferToBase64(wav)
}
