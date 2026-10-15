#!/usr/bin/env bash
# 风翼诗咒 → GitHub 一键推送脚本
# 用法（Git Bash）：bash push-to-github.sh
# 凭据通过浏览器 OAuth 授权，直接进入系统凭据管理器，脚本本身不接触任何密钥。

set -euo pipefail

REPO="windwing-verse"   # 仓库名
VIS="private"           # private（私有）| public（公开）
BRANCH="main"

cd "$(dirname "$0")"
echo "==> 工作目录: $(pwd)"
echo "==> 目标仓库: $REPO ($VIS)  分支: $BRANCH"
echo

# 代理自检：git 只认环境变量 http_proxy / https_proxy
if [ -z "${http_proxy:-}" ] && [ -z "${HTTP_PROXY:-}" ]; then
  echo "提示: 本终端未设置 http_proxy。若推送卡住或超时，先配置代理再重试："
  echo "    git config --global http.proxy  http://127.0.0.1:<端口>"
  echo "    git config --global https.proxy http://127.0.0.1:<端口>"
  echo
fi

if command -v gh >/dev/null 2>&1; then
  # ---------- 方案 A：GitHub CLI（自动建仓库 + 推送）----------
  echo "==> 检测到 GitHub CLI，走自动流程"

  if ! gh auth status >/dev/null 2>&1; then
    echo "==> 未登录，即将打开浏览器，请在页面中点 Authorize"
    gh auth login --hostname github.com --git-protocol https --web
  fi

  OWNER="$(gh api user --jq .login)"
  echo "==> 已登录为: $OWNER"

  if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
    echo "==> 远端仓库已存在，直接推送"
    git remote remove origin 2>/dev/null || true
    git remote add origin "https://github.com/$OWNER/$REPO.git"
    git branch -M "$BRANCH"
    git push -u origin "$BRANCH"
  else
    echo "==> 创建仓库并推送"
    gh repo create "$REPO" --"$VIS" --source=. --remote=origin --push
  fi
else
  # ---------- 方案 B：纯 git（需先在网页建空仓库）----------
  echo "==> 未检测到 gh，走纯 git 流程"
  echo
  echo "    请先在浏览器创建空仓库（不要勾选 README / LICENSE / .gitignore）："
  echo "        https://github.com/new"
  echo "        名称: $REPO      可见性: Private"
  echo
  read -rp "    创建完成后，在此输入你的 GitHub 用户名: " OWNER
  if [ -z "${OWNER:-}" ]; then echo "用户名不能为空，已取消"; exit 1; fi

  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$OWNER/$REPO.git"
  git branch -M "$BRANCH"
  echo "==> 推送中（若弹出登录窗口，请在浏览器中授权）..."
  git push -u origin "$BRANCH"
fi

echo
echo "==> 完成！访问: https://github.com/${OWNER:-<你的用户名>}/$REPO"
