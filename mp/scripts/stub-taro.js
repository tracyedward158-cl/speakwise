// 自检用的 @tarojs/taro 替身。
//
// 目的：让 core/ 与 platform/ 里那些「逻辑复杂、又碰平台 API」的模块能在 Node 里
// 被真实执行。存储用内存 Map（语义与 platform/storage.js 垫片一致：字符串进、
// 字符串出）；录音器和文件系统是**可控的假实现** —— 测试自己决定回调什么时候来、
// 甚至不来，这正是 platform/recorder.js 那台状态机最需要被验证的地方。
//
// 网络一律抛错：自检是纯离线断言，任何用例意外触网都该失败得很难看。

const mem = new Map()

const notAvailable = (what) => () => {
  throw new Error(`[check] 自检环境不提供 ${what}`)
}

// ── 可控的假录音器 ──
// 关键点：`start()` **不自动触发 onStart**。真机上 onStart 是异步来的、
// 开发者工具里 onStop 有时压根不来 —— 这些时序必须由测试显式编排，
// 自动触发就测不出「回调缺失」这类问题了。
function makeRecorderManager() {
  const handlers = { start: [], stop: [], error: [], interruptionBegin: [], interruptionEnd: [] }
  const m = {
    onStart: (cb) => handlers.start.push(cb),
    onStop: (cb) => handlers.stop.push(cb),
    onError: (cb) => handlers.error.push(cb),
    onInterruptionBegin: (cb) => handlers.interruptionBegin.push(cb),
    onInterruptionEnd: (cb) => handlers.interruptionEnd.push(cb),
    // 真机上 onStart 总是**跟在 start() 后面异步到达**。默认照这个来，
    // 测试里 `await startRecording()` 才能自然兑现。
    // 需要模拟「onStart 不来」时，把 suppressAutoStart 置 true 即可。
    start: () => {
      m.startCalls++
      if (!m.suppressAutoStart) setTimeout(() => m.emit('start'), 0)
    },
    // onStop **刻意不自动触发**：什么时候结束、甚至不结束，都由测试决定 ——
    // 「回调不来」正是这个模块最需要被验证的那条路径。
    stop: () => {
      m.stopCalls++
    },
    startCalls: 0,
    stopCalls: 0,
    suppressAutoStart: false,
    /** 测试用：把某个回调放出去。arg 会原样传给回调。 */
    emit(name, arg) {
      for (const cb of handlers[name]) cb(arg)
    },
    reset() {
      for (const k of Object.keys(handlers)) handlers[k].length = 0
      m.startCalls = 0
      m.stopCalls = 0
      m.suppressAutoStart = false
    }
  }
  return m
}

let recorderManager = makeRecorderManager()

// ── 假文件系统 ──
// 返回一段最小的、能通过嗅探的 mp3 头（FF F3 ...），让 finalize() 走到最后。
const FAKE_MP3_BASE64 = Buffer.concat([
  Buffer.from([0xff, 0xf3, 0x68, 0xc4]),
  Buffer.alloc(1200, 0x11)
]).toString('base64')

const fakeFs = {
  readFile: ({ encoding, success, fail }) => {
    if (encoding === 'base64') return success({ data: FAKE_MP3_BASE64 })
    const ab = new ArrayBuffer(8)
    new Uint8Array(ab).set([0xff, 0xf3, 0x68, 0xc4, 0, 0, 0, 0])
    return success({ data: ab })
  },
  writeFile: ({ success }) => success && success(),
  mkdirSync: () => {},
  unlinkSync: () => {},
  accessSync: () => {},
  statSync: () => ({ size: 1204 }),
  readdirSync: () => []
}

const Taro = {
  // ── 存储（真实现）──
  getStorageSync: (k) => (mem.has(k) ? mem.get(k) : ''),
  setStorageSync: (k, v) => {
    mem.set(k, String(v))
  },
  removeStorageSync: (k) => {
    mem.delete(k)
  },
  clearStorageSync: () => mem.clear(),

  // ── 录音（假实现，可控）──
  getRecorderManager: () => recorderManager,

  // ── 文件（假实现）──
  getFileSystemManager: () => fakeFs,
  arrayBufferToBase64: (ab) => Buffer.from(new Uint8Array(ab)).toString('base64'),

  // ── 权限：默认已授权，让等待授权的分支不参与测试 ──
  getSetting: () => Promise.resolve({ authSetting: { 'scope.record': true } }),
  authorize: () => Promise.resolve(),
  openSetting: () => Promise.resolve({ authSetting: { 'scope.record': true } }),

  // ── 以下都应是死路 ──
  request: notAvailable('网络请求'),
  createInnerAudioContext: notAvailable('音频播放'),

  // ── 无关紧要的桩 ──
  env: { USER_DATA_PATH: '/__check__' },
  getSystemInfoSync: () => ({ SDKVersion: 'check', pixelRatio: 2, windowWidth: 375 }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 280, right: 368 }),
  showToast: () => {},
  showModal: () => {},
  setInnerAudioOption: () => Promise.resolve(),
  useRouter: () => ({ path: '', params: {} }),
  navigateTo: () => {},
  redirectTo: () => {},
  reLaunch: () => {},
  navigateBack: () => {},
  getCurrentPages: () => [],

  __mem: mem,
  /** 测试用：换一个全新的假录音器（会重置已注册的回调） */
  __newRecorder: () => {
    recorderManager = makeRecorderManager()
    return recorderManager
  },
  __recorder: () => recorderManager
}

export default Taro
