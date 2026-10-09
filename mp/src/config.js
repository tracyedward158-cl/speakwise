// 运行期配置。所有「可能要改的数」集中在这里。

// ── 后端地址 ──
//
// 本地联调：在 mp/.env.local 里写一行
//     TARO_APP_API_BASE=http://localhost:3000
//   然后在开发者工具里勾「不校验合法域名」。
// 不设就用下面这个已部署的 SCF 地址。
//
// ⚠️ 这个值在**构建期**被替换成字面量（见 config/index.js 的 defineConstants），
//    改完必须重新构建，热重载不会生效。
//
// 注意：体验版 / 正式版只能访问已 ICP 备案的 HTTPS 域名，且要写进小程序后台的
// request 合法域名。现在这个 SCF 默认域名（*.tencentscf.com）备案不了，也进不了白名单 ——
// 域名备案属 P0 外部流程，与代码无关。
export const API_BASE =
  process.env.TARO_APP_API_BASE || 'https://1421249792-l5mg9larpx.ap-nanjing.tencentscf.com'

// ── 录音格式 ──
// 'mp3'：微信录音器原生输出，服务端按「非 WAV 一律透传」分支直接送讯飞，跳过 lamejs 转码。
//        正常路径就是它。
// 'pcm'：兜底路径。若某些机型上 mp3 实测拿不到（比如返回了 aac），切到这里 ——
//        客户端自己拼 44 字节 WAV 头，服务端走它已经验证过的 WAV→MP3 分支。
//        代价是服务端 CPU（lamejs）且体积大 8 倍。
//
// 刻意不自动降级：自动 fallback 会把「mp3 到底行不行」这个待验证的问题藏起来，
// 而质量在会话中途无声变化比直接报错更难查。手动切。
export const RECORD_FORMAT = 'mp3'

export const RECORD_OPTIONS = {
  duration: 60000, // 对上讯飞 IAT 的 60 秒上限，超了也白录
  sampleRate: 16000,
  numberOfChannels: 1,
  // ⚠️ sampleRate=16000 时 encodeBitRate 必须落在 [24000, 96000]，否则 start() 直接失败。
  encodeBitRate: 48000,
  format: RECORD_FORMAT
}

// ── TTS ──
// 讯飞 speed 取值 [0,100]，50 为常速，**0 是最慢的一档**。
// 2026-10 实测全程：99 → ×0.68，50 → ×1.00，0 → ×1.34（同一句话 3.96s / 5.80s / 7.74s）。
//
// ⚠️ 慢速走服务端合成（传 TTS_SPEED_SLOW），**不要在客户端变速** ——
//    InnerAudioContext.playbackRate 在小程序上是否保音高因平台而异，
//    而网页端有 preservesPitch 保证，两端会各是各的效果。合成端做，两端逐字节一致。
// （踩过的坑：服务端曾写 `Number(speed) || 50`，把 0 当成「没传」换回 50，
//   表现为「慢速调了没反应」；现在只有非数字才回落常速。）
export const TTS_SPEED_NORMAL = 50
export const TTS_SPEED_SLOW = 0

export const TTS_VOICE = process.env.TARO_APP_TTS_VCN || 'xiaoyan'

// 本地合成结果缓存。USER_DATA_PATH 全局上限 200MB，且是**整个小程序共用**的，
// 写爆了会连累别的存储（报 1300202），所以必须有上限 + 淘汰。
export const TTS_CACHE_DIR = 'tts'
export const TTS_CACHE_MAX_FILES = 400
export const TTS_CACHE_MAX_BYTES = 30 * 1024 * 1024

// ── 网络 ──
// 腾讯云 API 网关的请求体上限约 6MB，**低于** Express 那边的 10MB 检查。
// 网关拒绝发生在 Express 之前，服务端那个 413 JSON 处理器根本不会执行，
// 客户端拿到的是网关的 HTML 错误页。所以在客户端就按 4MB 拦。
export const MAX_AUDIO_BASE64 = 4 * 1024 * 1024

// ── 功能开关 ──
// 本轮（P1+P4 骨架+语音链路）尚未迁移的模块。关掉的入口会在主菜单里隐藏，
// 不留死链。迁移完一页把对应项翻成 true 即可。
export const FEATURES = {
  // 依赖 49MB 插图的压缩 + COS/CDN + 分包方案，属 P3
  culture: false,
  // 教师侧不使用语音，不阻塞 P4
  teacher: false,
  // 语音链路诊断页。开发期建议开着，它能把「录音到底产出了什么格式」
  // 直接打出来 —— 开发者工具在这件事上经常说谎。
  diag: true
}
