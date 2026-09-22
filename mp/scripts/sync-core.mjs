#!/usr/bin/env node
// 从 Web 版（../src）同步「纯逻辑」到本工程的 core/。
//
// 为什么要复制而不是引用：Taro 的构建只吃 sourceRoot 里的文件，跨工程 import
// 要额外配 alias 和 babel 作用域，反而更脆。方案文档也是这个结论（独立工程 + 共享纯逻辑）。
//
// 为什么要有这个脚本：复制本身不难，难的是**复制之后两边各自漂移**。
// 所以：
//   - 每个被复制的文件顶部打上只读横幅，打开就知道别手改；
//   - 需要改动的文件走 PATCHES 显式登记，补丁对不上就**直接报错退出**，
//     而不是悄悄产出一份和上游不一致的副本。
//
// 不在同步范围内的（有平台接缝，手写在 core/utils/ 里）：
//   api.js         → Taro.request
//   recordStore.js → 存储垫片
//   exporters.js   → 文件导出，本轮未迁
//   helpers.jsx    → 拆成 core/utils/text.js + Taro 组件

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..', '..', 'src')
const DEST = path.resolve(HERE, '..', 'src', 'core')

const BANNER = (rel) => `// ⚠️ 本文件由 mp/scripts/sync-core.mjs 从 Web 版 src/${rel} 复制生成，请勿直接修改。
//    要改就在 Web 版改，然后跑 \`npm run sync:core\`。
//    确有平台差异需要保留的，登记到 sync-core.mjs 的 PATCHES 里。
`

// 逐字复制，零改动 —— 这些文件不碰任何平台 API
const VERBATIM = [
  'data/constants.js',
  'data/cultureGameCh1.js',
  'data/cultureGameCh2.js',
  'data/cultureGameCh3.js',
  'data/drills.js',
  'data/moduleMeta.js',
  'data/scenarios.js',
  'data/studyManual.js',
  'data/topics.js',
  'data/pronunciationBank.json',
  'utils/pronunciationBank.js',
  'utils/conversationMetrics.js',
  'utils/topicRecommender.js',
  'utils/moduleBuilders.js',
  'utils/chatGrading.js',
]

// 需要打补丁的文件：登记每一处偏离，补丁匹配不上就报错
const PATCHES = {
  'utils/transcript.js': [
    {
      why: '小程序 JSCore 的 Intl 在 iOS/Android 上支持不一致，toLocaleTimeString 带 options 在部分引擎上会抛 RangeError',
      from: `    : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });`,
      to: `    : \`\${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}\`;`
    },
    {
      why: '同上。桌面上 zh-CN 的 toLocaleDateString 输出形如 2026/9/21，这里手工等价实现',
      from: `  const day = d.toLocaleDateString('zh-CN');`,
      to: `  const day = \`\${d.getFullYear()}/\${d.getMonth() + 1}/\${d.getDate()}\`;`
    }
  ]
}

const ALL = [...VERBATIM, ...Object.keys(PATCHES)]

const errors = []
let written = 0

for (const rel of ALL) {
  const srcPath = path.join(SRC, rel)
  const destPath = path.join(DEST, rel)

  if (!fs.existsSync(srcPath)) {
    errors.push(`源文件不存在：src/${rel}`)
    continue
  }

  let code = fs.readFileSync(srcPath, 'utf8')

  for (const p of PATCHES[rel] || []) {
    if (!code.includes(p.from)) {
      errors.push(
        `补丁失配：src/${rel}\n` +
          `  期望找到：${JSON.stringify(p.from)}\n` +
          `  原因：${p.why}\n` +
          `  → Web 版这边很可能改过。请人工确认后更新 sync-core.mjs 的 PATCHES。`
      )
      continue
    }
    code = code.replace(p.from, p.to)
  }

  // .json 不能打 JS 注释
  const body = rel.endsWith('.json') ? code : BANNER(rel) + code

  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, body)
  written++
  console.log(`  ✓ ${rel}`)
}

if (errors.length) {
  console.error('\n同步失败：\n' + errors.map((e) => '  ✗ ' + e).join('\n\n'))
  process.exit(1)
}

console.log(`\ncore/ 同步完成，共 ${written} 个文件。`)
