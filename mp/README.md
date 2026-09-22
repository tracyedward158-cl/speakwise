# SpeakWise 小程序端（Taro 4 + React）

微信小程序版。与 Web 版（仓库根目录的 `src/`）**并存**，共用一份纯业务逻辑。
背景与取舍见根目录的 [`小程序化方案.md`](../小程序化方案.md)。

## 跑起来

```bash
cd mp
npm install
npm run build:weapp          # 产物在 mp/dist
# 或开发模式（增量编译）
npm run dev:weapp
```

然后用微信开发者工具导入，**两个入口都可以**（`miniprogramRoot` 已各自配好）：

- 导入**仓库根目录** `speakwise/` —— 根目录的 `project.config.json` 指向 `mp/dist/`
- 导入 **`mp/`** —— 它自己的 `project.config.json` 指向 `./dist/`

两者不要混用（同一份代码被开发者工具同时打开两次会各写各的缓存）。
无论从哪个入口，**都不要直接导入 `mp/dist`** —— 那是构建产物，清一次 dist 工程就废了。

`project.private.config.json`（开发者工具的本机设置，含「不校验合法域名」这类开关）
按官方约定不入库，已在 `.gitignore` 里。

开发期需要：详情 → 本地设置 → 勾上**「不校验合法域名」**。

后端默认指向已部署的 SCF。要连本地 `node server.cjs`，在 `mp/.env.local` 里写一行：

```
TARO_APP_API_BASE=http://localhost:3000
```

⚠️ 这个值在**构建期**被替换成字面量，改完必须重新构建。
（`.env.local` 已在 .gitignore 里。）

## 两个只在运行期暴露的坑

这两个都是「构建成功、类型检查通过、开发者工具只在运行时报」，已各有防线：

**1. 源码里不能直接读 `process.env.XXX`。** 小程序运行时没有 `process` 全局，
构建期没被替换掉的引用会直接崩在 app.js 求值阶段，报错却是
`ReferenceError: process is not defined` + 「页面尚未注册」——指不到根因。
用到的键必须在 `config/index.js` 的 `defineConstants` 里逐个登记。
`scripts/check-dist.mjs` 会扫产物兜住这个疏漏，已挂进 `npm run build:weapp`。

**2. `app.json` 的 `permission` 只认地理位置类 scope。** 写 `scope.record` 会被判
「无效的 app.json permission[...]」。麦克风授权只有运行时一条路
（`Taro.authorize`，见 `platform/privacy.js`）；能不能用还取决于管理后台
《用户隐私保护指引》里有没有声明麦克风 —— 没声明时录音 API 会被直接禁用，
而且可能是静默失败。

## 分层

```
src/
├── core/        共享业务逻辑。不出现任何 wx.* / Taro.*
│   ├── data/      数据集与题库（从 Web 版同步）
│   └── utils/     纯算法、解析、存储规则
├── platform/    平台适配层。**唯一**碰 Taro API 的地方
├── pages/       页面（一页一目录）
├── components/  UI 组件
├── context/     AppContext / AuthContext
├── hooks/       useSpeech / useGuard / useTranscriptDetail / useNavMetrics
└── config.js    API_BASE、录音格式、功能开关
```

**铁律**：`core/` 与 `pages/` 里不出现 `wx.*` / `Taro.*`。
把平台差异全部收敛进 `platform/` 的 8 个文件，语音链路出问题时只需要看它们。

| 适配层文件 | 职责 |
|---|---|
| `storage.js` | `localStorage` 语义垫片（字符串进 / 字符串出） |
| `request.js` | `apiFetch` on `Taro.request`：超时 / 401 清 token / 非 JSON 兜底 |
| `nav.js` | 路由表 + `go` / `replace` / `back` |
| `recorder.js` | 录音单例状态机（`RecorderManager` 是全局单例，`onStop` 解绑不了） |
| `asr.js` | 录音 → `/api/asr` 转写 |
| `tts.js` | `/api/tts` 合成 + 单例播放 + 本地缓存 |
| `privacy.js` | 隐私协议 + `scope.record` 两层授权 |
| `file.js` / `export.js` | 文件读写；导出走微信转发面板 |

## core/ 的同步机制

`core/data/` 与部分 `core/utils/` 是**从 Web 版复制**过来的，不是重写。
改那些文件请改 Web 版，然后：

```bash
npm run sync:core
```

同步脚本按白名单复制，并对少数文件施加**登记在案的补丁**（例如
`transcript.js` 的两处 `toLocale*` 要换成手工格式化 —— 小程序 JSCore 的 Intl
在 iOS/Android 上不一致）。补丁对不上时脚本会**直接报错退出**，
不会悄悄产出一份与上游不一致的副本。

不参与同步、在 `core/` 手写的：`api.js`、`recordStore.js`、`exporters.js`、`text.js`
（都有平台接缝，或者是从 `.jsx` 拆出来的）。

## 自检

两道，都已挂进构建流程：

```bash
npm run check:core    # 纯逻辑（esbuild + 桩件，在 Node 里跑真实源码）
npm run check:dist    # 产物体检（已随 npm run build:weapp 自动执行）
```

`check:dist` 检查四件事：产物里没有残留的 `process.*` 引用、
`app.json` 的 `permission` 没写非法 scope、全局 keyframes（`su`/`pulse`/`dp`）都在、
以及 `app.config.js` 声明的每个页面都真的编译出了 js/wxml/json。

`check:core` 的说明：

用 esbuild 把源码连同断言一起打成单文件，在 Node 里跑**真正的产品代码**
（`scripts/stub-taro.js` 顶掉平台依赖）。124 项断言，覆盖：

- 题库选卷确定性、评测响应解析、对话指标口径、雷达图极坐标数学、记录存储规则
- **录音状态机的时序**（见下）

### 录音状态机为什么单独测

`platform/recorder.js` 是整个移植里最容易坏的一块，而且坏法很隐蔽 ——
表现只是「点麦克风说正在录音中」，看不出根因。它已经有两次真实故障了：

1. `startRecording()` 的 promise 只在 `onStop` 才兑现 → UI 永远不变红 →
   用户以为没录上又点一下 → 报「正在录音中」
2. `pending` 对象漏了一个 `promise` 字段 → `await pending.promise` 变成
   `await undefined` → `stopRecording()` 根本不等录音结束

这两条现在都有回归测试钉着。测试的编排方式是**自己决定哪个回调发、哪个不发** ——
因为「回调不保证来」正是真机（尤其开发者工具）上的常态：假录音器的 `start()`
默认会像真机那样自动跟一个 `onStart`，但 `onStop` **永远由测试显式触发**，
也可以用 `suppressAutoStart` 把 onStart 也扣住。

小程序没有 CI 可跑，但这批逻辑是平台无关的，也是移植中最容易被悄悄改坏的部分。

## 语音链路

```
跟读评测  wx.getRecorderManager(mp3) → /api/evaluate → 讯飞 ISE
语音输入  wx.getRecorderManager(mp3) → /api/asr      → 讯飞 IAT
朗读示范  /api/tts → 讯飞 TTS(可调语速) → 落盘 → InnerAudioContext
```

服务端**一行都没改**就支持了「录 mp3 直传」：`server.cjs` 原本就用
`audio.startsWith('UklGR')` 判 WAV，非 WAV 一律当 MP3 原样透传给讯飞，
正好跳过 lamejs 转码。

### 三个必须知道的约束

1. **讯飞 IAT / TTS 需要在控制台单独开通**，服务 ID 与 ISE 的 `s8e098720` 不通用。
   地址已做成环境变量（`IFLYTEK_IAT_HOST/PATH`、`IFLYTEK_TTS_HOST/PATH`），
   私有域服务 ID 直接填 `.env.local` 即可。
2. **管理后台《用户隐私保护指引》里必须声明「麦克风」**，否则录音 API 会被平台
   直接禁用，而且可能是静默失败（不弹窗、不报错）。见 `platform/privacy.js`。
3. **`InnerAudioContext.src` 不接受 base64**，iOS 上会静默不出声。必须先
   `fs.writeFile({encoding:'base64'})` 落盘再播放。见 `platform/file.js`。

### 排查工具

`pages/diag`（语音链路诊断页，开发期入口留在主菜单外，可直接用
`/pages/diag/index` 路径访问）会打印：基础库版本、麦克风授权态、
录音产物的 `fileSize`/`duration` 和**前 16 字节 hex**。

判读：`FF FB` / `FF F3` / `FF E3` = 合法 MP3；`ID3` = 带标签（服务端会剥）；
第 4~8 字节是 `ftyp` = 拿到了 m4a/aac，讯飞不收 —— 这时把 `config.js` 的
`RECORD_FORMAT` 切到 `'pcm'`（客户端自己拼 WAV 头，走服务端已验证过的转码分支）。

**开发者工具在语音这件事上会骗人**（无视 format、返回 0 字节文件、路径形态与真机不同），
结论一律以真机为准。

## 本轮未迁移

用 `src/config.js` 的 `FEATURES` 开关控制，关掉的入口在界面上自动隐藏，不留死链。

- **教师面板**（602 行）——教师侧不使用语音，不阻塞语音链路验证
- **文化文游**——依赖 49MB 插图的压缩 + COS/CDN + 分包方案
- 微信登录（账号密码在小程序里完全可用）
- AI 生成内容合规标识与模型登记号公示

## 与 Web 版的已知行为差异

移植不是逐字节复刻，以下几处是平台逼出来的、有意为之的差异：

| 位置 | Web 版 | 小程序版 | 原因 |
|---|---|---|---|
| `useSpeech.startListening` | 浏览器 VAD 停顿后自动结束并回调 | **必须用户显式停止**（另有 20s 自动收尾） | 录音→上传→服务端这条链路没有本地 VAD |
| 语音识别结果 | 边说边出字 | 整段返回 | 同上，无中间结果 |
| 菜单卡片交互 | hover 浮起 | 按压浮起 | WXSS 无 `:hover`，手机上也没有悬停 |
| 导出 | 浏览器下载 | 微信转发面板 / 剪贴板兜底 | 小程序没有「下载到磁盘」 |
| 雷达图 | 内联 SVG | canvas 2d | 小程序不支持内联 SVG |
| `DrillView` 的返回目标 | 嗅探 `location.pathname` | 显式 `section` 查询参数 | Taro 的 `useRouter().path` 区分不出 oral / written |
| 记录本地存储上限 | localStorage ~5MB | 单键 1MB | 小程序存储限制更紧，见 `platform/storage.js` |
