# SpeakWise 说慧 — AI 中文口语教练

SRTP 项目：师-生-机深度交互式汉语口语教学模式创新研究

## 项目结构

```
speakwise/
├── api/
│   └── chat.js          ← 后端代理（隐藏 API Key，仅15行）
├── src/
│   ├── App.jsx          ← 主应用代码
│   └── main.jsx         ← 入口文件
├── index.html           ← HTML 入口
├── package.json         ← 依赖配置
├── vite.config.js       ← Vite 构建配置
├── vercel.json          ← Vercel 部署配置
└── .env.example         ← 环境变量示例
```

## 部署到 Vercel（20分钟搞定）

### 第1步：上传到 GitHub

1. 登录 GitHub (github.com)
2. 点右上角 "+" → "New repository"
3. 仓库名填 `speakwise`，选 Public，点 Create
4. 在仓库页面点 "uploading an existing file"
5. 把这个文件夹里的所有文件拖进去
6. 点 "Commit changes"

### 第2步：部署到 Vercel

1. 打开 vercel.com，用 GitHub 账号登录
2. 点 "Add New Project"
3. 找到你的 `speakwise` 仓库，点 "Import"
4. Framework Preset 选 "Vite"
5. 点 "Environment Variables"，添加三个变量：
   - `API_URL` = `https://xh.v1api.cc/v1/chat/completions`
   - `API_KEY` = `你的新API Key（记得去后台重新生成一个！）`
   - `MODEL` = `gpt-5`
6. 点 "Deploy"
7. 等1-2分钟，完成！Vercel 会给你一个网址

### 第3步：访问你的网站

部署完成后，Vercel 会给你一个类似 `speakwise-xxx.vercel.app` 的网址。
任何人都可以通过这个网址访问你的应用。

## 本地开发（可选）

```bash
# 安装依赖
npm install

# 创建 .env.local
cp .env.example .env.local
# 编辑 .env.local 填入你的 API Key

# 启动开发服务器
npm run dev
```

## 技术栈

- 前端：React + Vite
- AI：GPT-5 (via OpenAI-compatible API)
- 语音：Web Speech API (浏览器自带)
- 部署：Vercel (免费)
