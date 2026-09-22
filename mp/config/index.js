// Taro 构建配置。
//
// 两个刻意的选择：
//
// 1. `pxtransform` 关掉。Web 版是 97% 内联 style 写的，而 postcss 只处理 WXSS，
//    不碰内联 style 对象 —— 开着的话两边单位会不一致（WXSS 走 rpx、内联走 px），
//    同一个间距在两种写法下渲染出不同大小，排查起来很折磨。关掉之后 px 就是
//    CSS px，与 Web 版 1:1，迁移时不需要任何单位换算。
//
// 2. `url` 的 limit 设 0。小程序 WXSS 禁止引用本地图片，样式里的
//    background-image 只能是网络地址或 base64。设 0 会让构建期直接报错，
//    而不是产出一个在小程序里静默不显示的样式。
const path = require('path')
const fs = require('fs')

// ── 读取 .env 系列文件 ──
//
// 小程序运行时不提供 `process` 全局。源码里写的 `process.env.XXX` 只有在
// **构建期被替换成字面量**才是安全的 —— 一旦原样进包，就是
// `ReferenceError: process is not defined`，而且是在 app.js 求值阶段就炸，
// 表现成「白屏 + 页未注册」。
//
// Taro 只会替换 `defineConstants` 里登记过的键。所以下面把用到的键逐个登记，
// 值来自构建期的 process.env（Node 里有 process），或者工程根下的 .env.local。
//
// ⚠️ 往后凡是在 src/ 里新读一个 process.env.XXX，都必须在这里加一行，
//    否则构建产物会带上一个必然崩的引用。scripts/check-dist.mjs 会兜住这个疏漏。
function loadEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, i).trim()] = v
  }
  return out
}

// 优先级：真实环境变量 > .env.local
const fileEnv = loadEnvFile(path.resolve(__dirname, '..', '.env.local'))
const appEnv = (key) => process.env[key] || fileEnv[key] || ''

const config = {
  projectName: 'speakwise-mp',
  date: '2026-9-21',
  designWidth: 375,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
    375: 2 / 1
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {
    // 只登记用得到的键。空字符串也是合法值 —— src/config.js 里用 `||` 兜默认值。
    'process.env.TARO_APP_API_BASE': JSON.stringify(appEnv('TARO_APP_API_BASE')),
    'process.env.TARO_APP_TTS_VCN': JSON.stringify(appEnv('TARO_APP_TTS_VCN'))
  },
  copy: {
    patterns: [],
    options: {}
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false
    }
  },
  cache: {
    enable: false
  },
  alias: {
    '@': path.resolve(__dirname, '..', 'src')
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: false,
        config: {}
      },
      url: {
        enable: true,
        config: {
          limit: 0
        }
      },
      cssModules: {
        enable: false
      }
    }
  }
}

module.exports = function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  return merge({}, config, require('./prod'))
}
