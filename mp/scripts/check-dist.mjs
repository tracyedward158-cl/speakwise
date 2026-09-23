#!/usr/bin/env node
// 构建产物体检。
//
// 为什么需要：小程序运行时**没有 Node 的全局对象**。源码里任何
// `process.env.XXX` 如果没有在构建期被替换成字面量，进包之后就是一个必然崩的
// 引用 —— 而且崩在 app.js 求值阶段，报错是
// `ReferenceError: process is not defined`，伴随的却是「页面尚未注册」这种
// 完全指不到根因的现象。这类问题构建**成功**、类型检查**通过**、
// 开发者工具**只在运行时报**，很容易漏到真机上。
//
// 所以：构建完就扫一遍产物，发现残留直接失败。
//
// 顺带确认几条同样「构建期看不出来、运行期才炸」的约束：
//   · app.json 的 permission 只认地理位置类 scope
//   · 全局 keyframes 都在（缺一个就是动画静默失效）
//   · 页面表声明的页面都编译出了产物
//   · 输入框都走了 formStyles（原生 input 的默认高度会裁字）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, '..', 'dist')

if (!fs.existsSync(DIST)) {
  console.error('✗ 找不到 dist/ —— 先跑 npm run build:weapp')
  process.exit(1)
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })

const files = walk(DIST)
const problems = []

// ── 1. 残留的 process 引用 ──
// 只扫 .js。允许 `typeof process` 这种守卫式写法（第三方库偶尔这么干），
// 但 `process.env` / `process.xxx` 的直接访问一律算问题。
for (const f of files.filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(f, 'utf8')
  const re = /(?<!typeof\s)process\s*\.\s*([A-Za-z_$][\w$]*)/g
  let m
  while ((m = re.exec(src)) !== null) {
    const before = src.slice(Math.max(0, m.index - 70), m.index)
    if (/typeof\s*$/.test(before)) continue // typeof process.x —— 守卫，安全
    problems.push({
      file: path.relative(DIST, f),
      what: `process.${m[1]}`,
      ctx: src.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' ')
    })
  }
}

// ── 2. app.json 的 permission 只认地理位置类 scope ──
// 写了别的（比如 scope.record）微信会报「无效的 app.json permission[...]」。
const appJsonPath = path.join(DIST, 'app.json')
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
  const ALLOWED = new Set(['scope.userLocation', 'scope.userFuzzyLocation', 'scope.userLocationBackground'])
  for (const k of Object.keys(appJson.permission || {})) {
    if (!ALLOWED.has(k)) {
      problems.push({
        file: 'app.json',
        what: `permission["${k}"]`,
        ctx: 'app.json 的 permission 字段只支持地理位置类 scope；麦克风等其余授权只能运行时用 Taro.authorize 获取'
      })
    }
  }
}

// ── 3. 全局 keyframes 必须在 app.wxss 里 ──
// 约 20 处内联 style 按名字引用 su / pulse / dp，缺一个就是「动画静默不动」——
// 不报错、不警告，只是没效果。
const appWxssPath = path.join(DIST, 'app.wxss')
if (fs.existsSync(appWxssPath)) {
  const css = fs.readFileSync(appWxssPath, 'utf8')
  for (const name of ['su', 'pulse', 'dp']) {
    if (!new RegExp(`@keyframes\\s+${name}\\b`).test(css)) {
      problems.push({ file: 'app.wxss', what: `缺少 @keyframes ${name}`, ctx: '内联 animation 引用它会静默失效' })
    }
  }
}

// ── 4. 页面表与产物是否对得上 ──
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
  for (const p of appJson.pages || []) {
    for (const ext of ['js', 'wxml', 'json']) {
      const f = path.join(DIST, `${p}.${ext}`)
      if (!fs.existsSync(f)) {
        problems.push({ file: p, what: `缺 ${ext} 产物`, ctx: 'app.config.js 里声明了但没编译出来' })
      }
    }
  }
}

// ── 5. 输入框必须走 formStyles ──
//
// 小程序的 <input> 是原生组件，自带固定默认高度且不随 font-size / padding 长高；
// 我们又全局设了 box-sizing: border-box，手写样式会让 padding 从那个高度里扣，
// 文字被裁掉下半截（现象是「输入框里只剩文字上半部分」）。
// 唯一的可靠写法是显式给高度，也就是走 components/formStyles.js。
//
// 这条检查很粗但很准：只要一个文件从 @tarojs/components 引了 Input/Textarea，
// 就必须同时引 formStyles。误报可以用行内注释 `// check-dist:allow-raw-input` 豁免。
const SRC = path.resolve(HERE, '..', 'src')
if (fs.existsSync(SRC)) {
  for (const f of walk(SRC)) {
    if (!/\.jsx?$/.test(f)) continue
    const src = fs.readFileSync(f, 'utf8')
    const m = src.match(/import\s*\{([^}]+)\}\s*from\s*'@tarojs\/components'/)
    if (!m) continue
    if (!/\b(Input|Textarea)\b/.test(m[1])) continue
    if (src.includes('formStyles') || src.includes('check-dist:allow-raw-input')) continue
    problems.push({
      file: path.relative(path.resolve(HERE, '..'), f),
      what: '引入了 Input/Textarea 但没走 formStyles',
      ctx: '原生 <input> 的默认高度会裁掉文字下半截，必须用 fieldStyle()/areaStyle() 显式给高度'
    })
  }
}

// ── 6. 不要在元素的 style 里用 100vh ──
//
// 首帧 WebView 还不知道自己的高度，100vh 会先给出一个错的值、之后才纠正。
// 而小程序的原生组件（<input> / <textarea>）的几何是按**第一版布局**算的，
// 布局变了它不会自己跟上 —— 表现就是「输入框里的文字要交互一下才显示全」。
//
// 页面根节点原本写 `minHeight: '100vh'` 只是为了铺满背景，而 app.scss 的
// `page { background }` 已经在做这件事了，所以那些声明是纯风险、零收益。
//
// 真正需要整屏高度的页面（登录页垂直居中、对话页 flex 撑满），
// 用 useNavMetrics().screenHeight —— 那是运行时量到的真实数值。
//
// 注释里提到 100vh 不算，跳过注释行。
if (fs.existsSync(SRC)) {
  for (const f of walk(SRC)) {
    if (!/\.(jsx|js|scss)$/.test(f)) continue
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      if (/100vh|100dvh/.test(line)) {
        problems.push({
          file: path.relative(path.resolve(HERE, '..'), f) + ':' + (i + 1),
          what: '使用了 100vh / 100dvh',
          ctx: '首帧高度不确定会让原生输入框的位置算错；改用 useNavMetrics().screenHeight'
        })
      }
    })
  }
}

// ── 7. 模块图自洽 ──
//
// 小程序每个页面是一个独立 chunk 文件，**模块 ID 是全局编号的**。
// 只要两份 chunk 来自不同的构建（增量构建错乱、或者工具在盯着目录写的时候重建），
// 编号就会错位，运行时报出来的是 `n[e] is not a function` 这类
// 「模块明明存在却调不通」的错，很难往构建产物上去想。
//
// 这条检查把那种情况变成构建期就能看见的失败。
{
  const jsFiles = files.filter((f) => f.endsWith('.js'))
  const defined = new Set()
  const refs = new Map()
  for (const f of jsFiles) {
    const s = fs.readFileSync(f, 'utf8')
    for (const m of s.matchAll(/(?:^|[{,])(\d{2,6}):(?:function|\()/g)) defined.add(m[1])
    for (const m of s.matchAll(/[tn]\((\d{2,6})\)/g)) if (!refs.has(m[1])) refs.set(m[1], f)
  }
  const dangling = [...refs.keys()].filter((id) => !defined.has(id))
  if (dangling.length) {
    problems.push({
      file: 'dist/*.js',
      what: `${dangling.length} 个模块被引用但没有定义：${dangling.slice(0, 8).join(', ')}`,
      ctx: '产物内部不自洽，通常意味着多次构建的 chunk 混在了一起 —— 清空 dist 重新构建'
    })
  }
}

if (problems.length) {
  console.error(`\n✗ 产物体检未通过（${problems.length} 项）：\n`)
  for (const p of problems) {
    console.error(`  ✗ [${p.file}] ${p.what}`)
    if (p.ctx) console.error(`      ${p.ctx}`)
  }
  console.error('')
  process.exit(1)
}

const size = files.reduce((a, f) => a + fs.statSync(f).size, 0)
console.log(`✓ 产物体检通过（${files.length} 个文件，${Math.round(size / 1024)} KB / 2048 KB 主包上限）`)
