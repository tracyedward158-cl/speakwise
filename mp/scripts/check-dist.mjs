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
// 顺带确认几条同样「构建期看不出来、运行期才炸」的约束。

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
