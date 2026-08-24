#!/bin/bash
# ── SpeakWise SCF 部署打包脚本 ──
# 用法: bash scripts/deploy-scf.sh
# 产物: scf-deploy.zip（上传到腾讯云 SCF 控制台）
# 注意: 部署前先 npm run build 构建前端（dist/ 另行上传静态托管）

set -e
cd "$(dirname "$0")/.."

echo "① 前端构建..."
npm run build >/dev/null 2>&1 || { echo "❌ 前端构建失败"; exit 1; }
echo "   dist/ 已更新（静态托管用）"

echo "② 打包 SCF 部署包..."
rm -f scf-deploy.zip
zip -r scf-deploy.zip \
  server.cjs \
  server/ \
  scf_bootstrap \
  node_modules/ \
  -x "node_modules/.bin/*" \
  -x "node_modules/.cache/*" \
  -x "node_modules/.vite/*" \
  > /dev/null

echo "③ 完成: scf-deploy.zip ($(du -h scf-deploy.zip | cut -f1))"
echo ""
echo "下一步（SCF 控制台）:"
echo "  1. 云函数 → 选择函数 → 「函数代码」→ 上传 scf-deploy.zip"
echo "  2. 「函数配置」→ 环境变量：确认含以下全部键（缺 DB_* 和 JWT_SECRET 会导致用户系统不可用）"
echo "     IFLYTEK_APP_ID / IFLYTEK_API_KEY / IFLYTEK_API_SECRET"
echo "     DEEPSEEK_API_KEY / DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / JWT_SECRET"
echo "  3. 「函数配置」→ 执行超时时间：建议 30-60 秒（自动暂停唤醒 + 重试需要时间）"
echo "  4. 发布版本后访问 https://<SCF地址>/api/health 验证"
