#!/usr/bin/env bash
set -Eeuo pipefail
MODEL="${JOBCLAW_LOCAL_MODEL:-qwen3:1.7b}"

printf '\nJobClaw 本地轻量模型安装助手\n'
printf '推荐模型: %s\n\n' "$MODEL"

if ! command -v ollama >/dev/null 2>&1; then
  echo '未检测到 Ollama。'
  echo '请先安装 Ollama，然后重新运行本脚本：'
  echo '  https://ollama.com/download'
  echo
  echo '安装完成后也可以手动执行：'
  echo "  ollama pull $MODEL"
  exit 1
fi

if ! curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo '正在启动 Ollama...'
  nohup ollama serve >"${HOME}/.jobclaw-ollama.log" 2>&1 &
  for _ in {1..30}; do
    if curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

if ! curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo 'Ollama 没有成功启动，请打开 Ollama 应用后重试。'
  exit 1
fi

echo "正在下载 $MODEL，首次下载可能需要一些时间..."
ollama pull "$MODEL"

echo
echo '安装完成。JobClaw 设置建议：'
echo '  AI 路由: 自动选择 或 仅本地模型'
echo '  本地 Base URL: http://127.0.0.1:11434/v1'
echo "  本地模型名称: $MODEL"
echo
echo '按回车退出。'
read -r _
