#!/bin/bash
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_HOME="$HOME/.jobclaw"
INSTALL_DIR="$APP_HOME/bridge"
PLIST="$HOME/Library/LaunchAgents/com.jobclaw.bridge.plist"
LABEL="com.jobclaw.bridge"
PORT="17899"

finish() {
  echo
  read -r -p "按回车关闭窗口。" _
}
trap finish EXIT

echo "========================================"
echo " JobClaw 桌面桥接安装 / 修复"
echo "========================================"

NODE=""
for candidate in "$(command -v node 2>/dev/null || true)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then NODE="$candidate"; break; fi
done
if [ -z "$NODE" ]; then
  echo "❌ 未找到 Node.js。请先安装 Node.js 20 或更高版本。"
  exit 1
fi

echo "✓ Node.js: $NODE ($($NODE -v 2>/dev/null || true))"
mkdir -p "$APP_HOME" "$INSTALL_DIR" "$HOME/Library/LaunchAgents"

# Copy to a stable path. The service no longer depends on the Downloads folder.
rm -rf "$INSTALL_DIR.tmp"
mkdir -p "$INSTALL_DIR.tmp"
cp -R "$ROOT/desktop-bridge/." "$INSTALL_DIR.tmp/"
rm -rf "$INSTALL_DIR"
mv "$INSTALL_DIR.tmp" "$INSTALL_DIR"
chmod -R u+rwX "$INSTALL_DIR"
xattr -dr com.apple.quarantine "$INSTALL_DIR" 2>/dev/null || true

echo "✓ 桥接文件已复制到 $INSTALL_DIR"

# Compile the macOS PDFKit + Vision helper once. If Xcode tools are absent,
# the bridge still works with metadata/pdftotext and can fall back to Swift later.
if command -v xcrun >/dev/null 2>&1; then
  echo "• 正在准备 PDFKit / Vision OCR（首次可能需要几十秒）…"
  if /usr/bin/xcrun swiftc "$INSTALL_DIR/resume_parser.swift" \
      -o "$INSTALL_DIR/resume_parser" \
      -framework Foundation -framework PDFKit -framework Vision -framework CoreGraphics \
      >"$APP_HOME/swift-build.log" 2>&1; then
    chmod +x "$INSTALL_DIR/resume_parser"
    echo "✓ PDFKit / Vision OCR 已就绪"
  else
    echo "⚠ OCR 编译未完成，运行时会自动使用 Swift 脚本兜底"
  fi
fi

RUNNER="$APP_HOME/run-bridge.sh"
cat > "$RUNNER" <<RUNNER
#!/bin/bash
export HOME="$HOME"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$INSTALL_DIR"
exec "$NODE" "$INSTALL_DIR/server.js"
RUNNER
chmod +x "$RUNNER"

NATIVE_RUNNER="$INSTALL_DIR/native-host-launcher.sh"
cat > "$NATIVE_RUNNER" <<NATIVE
#!/bin/bash
export HOME="$HOME"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$INSTALL_DIR"
exec "$NODE" "$INSTALL_DIR/native-host.js"
NATIVE
chmod +x "$NATIVE_RUNNER"

install_native_manifest() {
  local host_dir="$1"
  mkdir -p "$host_dir"
  cat > "$host_dir/com.jobclaw.bridge.json" <<JSON
{
  "name": "com.jobclaw.bridge",
  "description": "JobClaw OpenClaw native bridge",
  "path": "$NATIVE_RUNNER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://dkfilgjiooigjbollljdionbnnofekkh/"]
}
JSON
}

install_native_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
install_native_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
install_native_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
install_native_manifest "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
echo "✓ Native Messaging 自动唤醒通道已安装"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUNNER</string></array>
  <key>WorkingDirectory</key><string>$INSTALL_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>3</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$APP_HOME/bridge.log</string>
  <key>StandardErrorPath</key><string>$APP_HOME/bridge-error.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true

check_bridge() {
  /usr/bin/curl -fsS --max-time 2 "http://127.0.0.1:$PORT/status" >/dev/null 2>&1
}

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if check_bridge; then break; fi
  sleep 1
done

# Some macOS setups reject LaunchAgent bootstrap because of stale state.
# Keep a direct background fallback so users are not blocked.
if ! check_bridge; then
  echo "• LaunchAgent 尚未响应，正在使用直接启动兜底…"
  pkill -f "$INSTALL_DIR/server.js" >/dev/null 2>&1 || true
  nohup "$RUNNER" >>"$APP_HOME/bridge.log" 2>>"$APP_HOME/bridge-error.log" </dev/null &
  disown || true
  for _ in 1 2 3 4 5 6 7 8; do
    if check_bridge; then break; fi
    sleep 1
  done
fi

if check_bridge; then
  echo "✓ 桌面桥接已启动"
  echo "✓ PDF 深度识别 OpenClaw日报与 Native Messaging 自动唤醒可以使用"
  echo
  /usr/bin/curl -fsS "http://127.0.0.1:$PORT/status" || true
  echo
  echo "回到 Chrome 的 OpenClaw 页面 点击“检测并修复”即可。"
  exit 0
fi

echo "❌ 桌面桥接仍未启动。以下是最近错误："
tail -n 20 "$APP_HOME/bridge-error.log" 2>/dev/null || true
echo
echo "日志位置：$APP_HOME/bridge-error.log"
exit 1
