import Taro from '@tarojs/taro'

// 文件系统。只有两件事：把录音读成 base64 交给后端，把后端合成的音频落盘给播放器。
//
// 为什么音频必须落盘：`InnerAudioContext.src` **不接受 base64**。
// 安卓和开发者工具上碰巧能放，iOS 上会静默失败（不报错、不出声），
// 是个只在真机上才暴露的坑。所以一律先写文件再给路径。

const fs = () => Taro.getFileSystemManager()

// Taro.env.USER_DATA_PATH 在 Taro 4 上未必有；wx.env 是小程序的稳定入口。
// 不要硬编码 wxfile:// —— 开发者工具返回的是 http:// 形态，写死会两边坏一边。
export const USER_DATA_PATH =
  Taro.env?.USER_DATA_PATH || (typeof wx !== 'undefined' && wx.env?.USER_DATA_PATH) || ''

export function userPath(...segments) {
  return [USER_DATA_PATH, ...segments].join('/')
}

/** 读成裸 base64（不带 data: 前缀 —— 服务端靠前缀判 WAV，带上就判错了） */
export function readAsBase64(filePath) {
  return new Promise((resolve, reject) => {
    fs().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(r.data),
      fail: (e) => reject(new Error(e?.errMsg || '读取录音文件失败'))
    })
  })
}

/** 读成 ArrayBuffer。PCM 兜底路径要自己拼 WAV 头，需要字节。 */
export function readAsArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    fs().readFile({
      filePath,
      success: (r) => resolve(r.data),
      fail: (e) => reject(new Error(e?.errMsg || '读取录音文件失败'))
    })
  })
}

/** base64 写文件。data 传 base64 字符串，encoding 直接写 'base64'。 */
export function writeBase64(filePath, base64) {
  return new Promise((resolve, reject) => {
    fs().writeFile({
      filePath,
      data: base64,
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: (e) => reject(new Error(e?.errMsg || '写入文件失败'))
    })
  })
}

export function writeText(filePath, text) {
  return new Promise((resolve, reject) => {
    fs().writeFile({
      filePath,
      data: text,
      encoding: 'utf8',
      success: () => resolve(filePath),
      fail: (e) => reject(new Error(e?.errMsg || '写入文件失败'))
    })
  })
}

export function mkdirIfNeeded(dirPath) {
  return new Promise((resolve) => {
    try {
      fs().mkdirSync(dirPath, true)
    } catch (e) {
      /* 已存在即忽略 */
    }
    resolve(dirPath)
  })
}

export function unlink(filePath) {
  try {
    fs().unlinkSync(filePath)
  } catch (e) {
    /* 不存在即忽略 */
  }
}

export function exists(filePath) {
  try {
    fs().accessSync(filePath)
    return true
  } catch (e) {
    return false
  }
}

export function stat(filePath) {
  try {
    return fs().statSync(filePath)
  } catch (e) {
    return null
  }
}

export function readdir(dirPath) {
  try {
    return fs().readdirSync(dirPath)
  } catch (e) {
    return []
  }
}

/** 32 位字符串哈希。TTS 缓存文件名用它 —— 纯十六进制，避开中文路径。 */
export function hash32(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}
