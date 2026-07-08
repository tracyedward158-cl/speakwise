# SpeakWise 说慧 — AI 中文口语教练

SRTP 项目：师-生-机深度交互式汉语口语教学模式创新研究

## 项目结构

```
speakwise/
├── src/
│   ├── App.jsx            ← 主应用代码
│   ├── main.jsx           ← 入口文件
│   ├── pages/             ← 页面组件
│   ├── components/        ← 通用组件
│   ├── context/           ← React Context（HSK、ViewMode）
│   ├── hooks/             ← 自定义 Hooks
│   ├── utils/             ← API 封装、录音、记录存储
│   └── data/              ← 题库、场景、文化游戏数据
├── server.cjs             ← 统一 API 服务器（本地 + SCF）
├── index.html             ← HTML 入口
├── package.json           ← 依赖配置
├── vite.config.js         ← Vite 构建配置
└── .env.example           ← 环境变量示例
```

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的 API Key（详见下方"环境变量"）

# 3. 启动 API 服务器（端口 3000）
npm run dev:api

# 4. 启动前端开发服务器（端口 5173，自动代理 /api → 3000）
npm run dev
```

## 环境变量

在 `.env.local`（本地开发）或 SCF 环境变量（生产）中配置：

| 变量 | 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI 对话） |
| `IFLYTEK_APP_ID` | 科大讯飞应用 ID |
| `IFLYTEK_API_KEY` | 科大讯飞 API Key |
| `IFLYTEK_API_SECRET` | 科大讯飞 API Secret |

## 部署到腾讯云 SCF

### 准备工作

1. 开通 [腾讯云 SCF](https://console.cloud.tencent.com/scf) 服务
2. 构建前端：`npm run build`（生成 `dist/`）

### 部署 API（Web Function）

1. 在 SCF 控制台 → 函数服务 → 新建
2. 选择 **Web 函数**（不是事件函数）
3. 运行环境：**Node.js 18.x**（或更高）
4. 上传方式：本地 ZIP 打包

   ```bash
   # 在项目根目录执行
   zip -r scf-deploy.zip server.cjs node_modules/lamejs node_modules/express node_modules/accepts node_modules/array-flatten node_modules/body-parser node_modules/bytes node_modules/call-bind node_modules/content-disposition node_modules/content-type node_modules/cookie node_modules/cookie-signature node_modules/debug node_modules/depd node_modules/destroy node_modules/ee-first node_modules/encodeurl node_modules/escape-html node_modules/etag node_modules/finalhandler node_modules/forwarded node_modules/fresh node_modules/function-bind node_modules/get-intrinsic node_modules/gopd node_modules/has-symbols node_modules/hasown node_modules/http-errors node_modules/iconv-lite node_modules/inherits node_modules/ipaddr.js node_modules/media-typer node_modules/merge-descriptors node_modules/methods node_modules/mime-db node_modules/mime-types node_modules/mime node_modules/ms node_modules/negotiator node_modules/object-inspect node_modules/on-finished node_modules/once node_modules/parseurl node_modules/path-to-regexp node_modules/proxy-addr node_modules/qs node_modules/range-parser node_modules/raw-body node_modules/safe-buffer node_modules/safer-buffer node_modules/send node_modules/serve-static node_modules/setprototypeof node_modules/side-channel node_modules/side-channel-list node_modules/side-channel-map node_modules/side-channel-weakmap node_modules/statuses node_modules/toidentifier node_modules/type-is node_modules/unpipe node_modules/utils-merge node_modules/vary node_modules/wrappy
   ```

   > **简便方法：** 也可以在 SCF 控制台选择「在线依赖安装」自动安装 `express`，这样只需上传 `server.cjs` 即可。lamejs 已在项目中直接安装。

5. 函数配置：
   - 执行方法：`scf_bootstrap` 填写 `node server.cjs`
   - 内存：**512 MB**（WAV→MP3 转码需要）
   - 超时时间：**30 秒**（iFlytek WebSocket 评测需要）
6. 添加环境变量（见上方"环境变量"表格）
7. 点击完成，记录生成的 **SCF 访问 URL**（形如 `https://xxx.ap-nanjing.tencentscf.com`）

### 部署前端（静态托管）

将 `dist/` 目录上传到任意静态托管服务（腾讯云 COS、EdgeOne Pages 等），然后在 `src/utils/api.js` 中把 `YOUR-SCF-ID` 替换为实际的 SCF URL 后重新构建。

## API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/chat` | AI 对话代理 (DeepSeek) |
| `POST` | `/api/evaluate` | 语音评测代理 (iFlytek)

## 技术栈

- 前端：React + Vite
- AI：DeepSeek + iFlytek（语音评测）
- 语音：Web Speech API (浏览器自带)
- 部署：腾讯云 SCF
