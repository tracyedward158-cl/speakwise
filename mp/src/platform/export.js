import Taro from '@tarojs/taro'
import { userPath, writeText, mkdirIfNeeded, stat, unlink } from './file'

// 导出「文件」。
//
// Web 版是 `document.createElement('a').download` —— 小程序里没有「下载到磁盘」
// 这回事。可行的出口只有两个：
//
//   1. shareFileMessage：调起微信转发面板，用户可以把文件发给自己/发给文件传输助手
//      再另存。这是手机上把文件拿出去的标准做法。
//   2. 剪贴板兜底：转发面板不可用时（比如桌面版微信、或文件太大），
//      至少让 JSON 能被复制走。
//
// 文件必须先落到 USER_DATA_PATH 才能被转发 —— 临时文件路径是不行的。
// 用完立刻删，不留垃圾（USER_DATA_PATH 全小程序共用 200MB）。

const EXPORT_DIR = 'export'

export async function exportJsonFile(filename, payload) {
  await mkdirIfNeeded(userPath(EXPORT_DIR))
  const filePath = userPath(EXPORT_DIR, filename)

  // 缩进两个空格：这是给人看也会给脚本读的科研数据，体积翻倍换可直接翻阅是划算的
  const json = JSON.stringify(payload, null, 2)
  await writeText(filePath, json)

  const size = stat(filePath)?.size || json.length

  // shareFileMessage 基础库 2.16.1+；低版本直接走剪贴板
  if (typeof Taro.shareFileMessage === 'function') {
    try {
      await Taro.shareFileMessage({ filePath, fileName: filename })
      // 转发完成后清理。失败也无所谓，下次导出会覆盖同名文件。
      setTimeout(() => unlink(filePath), 3000)
      return { ok: true, method: 'share', size }
    } catch (e) {
      // 用户取消也会走到这里，不当成错误往外抛
      const msg = e?.errMsg || e?.message || ''
      if (!/cancel/i.test(msg)) {
        console.warn('[export] shareFileMessage 失败，改走剪贴板:', msg)
      }
    }
  }

  // 兜底：剪贴板。整包 JSON 贴进剪贴板对几 MB 的数据不现实，所以截断并说明。
  const CLIP_LIMIT = 200 * 1024
  const text = json.length > CLIP_LIMIT ? json.slice(0, CLIP_LIMIT) : json
  await Taro.setClipboardData({ data: text })
  unlink(filePath)

  return {
    ok: true,
    method: 'clipboard',
    size,
    truncated: json.length > CLIP_LIMIT
  }
}

/** 给用户的结果提示。导出这件事失败了必须说清楚，静默失败对科研数据不可接受。 */
export function reportExportResult(res, recordCount) {
  if (res?.method === 'clipboard') {
    Taro.showModal({
      title: '已复制到剪贴板',
      content: res.truncated
        ? `共 ${recordCount} 条。数据量较大，剪贴板里只放了前 200KB —— 建议在手机上重试「转发文件」。`
        : `共 ${recordCount} 条，已复制为 JSON 文本，粘贴到任意地方即可保存。`,
      showCancel: false
    })
    return
  }
  Taro.showToast({ title: `已导出 ${recordCount} 条`, icon: 'success' })
}

export function reportExportError(e) {
  Taro.showModal({
    title: '导出失败',
    content: e?.message || '未知错误，请重试',
    showCancel: false
  })
}
