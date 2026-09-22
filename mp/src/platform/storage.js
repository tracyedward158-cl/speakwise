import Taro from '@tarojs/taro'

// localStorage 的语义垫片：**字符串进、字符串出**。
//
// 为什么不做成「对象直接存取」：Web 版的 recordStore.js / AppContext / AuthContext
// 里全是 `JSON.parse(localStorage.getItem(k))` 和 `JSON.stringify(...)` 的成对写法，
// 一共 35 处。刻意把语义做成与 localStorage 逐位一致之后，那些文件只需要换 import，
// 业务逻辑一行都不用改 —— 也就没有「改的时候手滑漏了一处」的空间。
//
// 与真 localStorage 的两点差异：
//
// 1. **单键上限 1MB**（localStorage 是整域 ~5MB）。`speakwise_practice_records`
//    是唯一可能撞上这条的键 —— 游客的本地记录会一直累积。真撞上时这里会像
//    localStorage 一样抛 QuotaExceededError（而不是静默吞掉），让上游的
//    try/catch 行为和 Web 版完全一致，不至于在这里悄悄丢数据。
// 2. 取不到的键，Taro 返回空字符串，这里归一成 null（localStorage 的语义）。
//    代价是存了空字符串的键读出来也是 null；本项目没有这种用法。

const KEY_LIMIT_BYTES = 1024 * 1024

function quotaError(key, size) {
  const e = new Error(
    `存储写入失败：键 "${key}" 约 ${Math.round(size / 1024)}KB，超过小程序单键 1MB 上限`
  )
  e.name = 'QuotaExceededError'
  return e
}

export const storage = {
  getItem(key) {
    try {
      const v = Taro.getStorageSync(key)
      if (v === '' || v === undefined || v === null) return null
      return v
    } catch (e) {
      // 读取失败（键不存在、存储被清）一律当「没有」，与 localStorage 一致
      console.warn('[storage] 读取失败:', key, e?.errMsg || e?.message)
      return null
    }
  },

  setItem(key, value) {
    const str = String(value)
    // 先按字节量拦一道：小程序超限时抛出的错误信息（1300202）不区分是哪个键，
    // 混在业务栈里很难定位。这里补一个能直接看出是哪个键、多大的错误。
    if (str.length > KEY_LIMIT_BYTES) throw quotaError(key, str.length)
    try {
      Taro.setStorageSync(key, str)
    } catch (e) {
      const msg = e?.errMsg || e?.message || ''
      if (msg.includes('1300202') || msg.includes('exceed') || msg.includes('size')) {
        throw quotaError(key, str.length)
      }
      throw e
    }
  },

  removeItem(key) {
    try {
      Taro.removeStorageSync(key)
    } catch (e) {
      console.warn('[storage] 删除失败:', key, e?.errMsg || e?.message)
    }
  }
}

