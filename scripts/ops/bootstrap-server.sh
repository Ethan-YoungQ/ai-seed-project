#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT_DIR}"
SERVICE_NAME="${SERVICE_NAME:-ai-seed-project}"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_FILE="${SERVICE_FILE:-$SYSTEMD_DIR/$SERVICE_NAME.service}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
RUN_USER="${RUN_USER:-ai-seed}"
RUN_GROUP="${RUN_GROUP:-$RUN_USER}"
DATABASE_URL="${DATABASE_URL:-$APP_DIR/data/app.db}"

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "缺少 root/sudo，无法执行需要提权的系统初始化步骤"
    exit 1
  fi
}

ensure_base_packages() {
  local packages=(
    curl
    tar
    gzip
    git
    python3
    make
    gcc-c++
  )

  if command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y "${packages[@]}"
  elif command -v yum >/dev/null 2>&1; then
    run_privileged yum install -y "${packages[@]}"
  elif command -v apt-get >/dev/null 2>&1; then
    run_privileged apt-get update
    run_privileged apt-get install -y curl tar gzip git python3 make g++
  else
    echo "未识别的包管理器，无法自动安装基础依赖"
    exit 1
  fi
}

ensure_node_runtime() {
  local node_ok="false"
  if command -v "$NODE_BIN" >/dev/null 2>&1; then
    local node_major
    node_major="$("$NODE_BIN" -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
    if [[ "$node_major" =~ ^[0-9]+$ ]] && [ "$node_major" -ge 20 ]; then
      node_ok="true"
    fi
  fi

  if [ "$node_ok" = "true" ] && command -v "$NPM_BIN" >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    ensure_base_packages
  fi

  if command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    run_privileged bash -lc "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -"
    if command -v dnf >/dev/null 2>&1; then
      run_privileged dnf install -y nodejs
    else
      run_privileged yum install -y nodejs
    fi
  elif command -v apt-get >/dev/null 2>&1; then
    run_privileged bash -lc "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    run_privileged apt-get install -y nodejs
  else
    echo "未识别的包管理器，无法自动安装 Node.js"
    exit 1
  fi
}

cd "$APP_DIR"

ensure_base_packages
ensure_node_runtime

mkdir -p "$APP_DIR/data" "$APP_DIR/backups"

if [ -f "$APP_DIR/package-lock.json" ]; then
  "$NPM_BIN" ci
else
  "$NPM_BIN" install
fi

"$NPM_BIN" run build

if [ -f "$ROOT_DIR/deploy/systemd/ai-seed-project.service" ]; then
  NODE_PATH="$(command -v "$NODE_BIN" || true)"
  if [ -z "$NODE_PATH" ]; then
    echo "无法解析 NODE_BIN=$NODE_BIN 对应的可执行路径"
    exit 1
  fi

  escape_sed_replacement() {
    printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'
  }

  render_service_file() {
    local target_file="$1"
    sed \
      -e "s|__APP_DIR__|$(escape_sed_replacement "$APP_DIR")|g" \
      -e "s|__DATABASE_URL__|$(escape_sed_replacement "$DATABASE_URL")|g" \
      -e "s|__NODE_BIN__|$(escape_sed_replacement "$NODE_PATH")|g" \
      -e "s|__RUN_USER__|$(escape_sed_replacement "$RUN_USER")|g" \
      -e "s|__RUN_GROUP__|$(escape_sed_replacement "$RUN_GROUP")|g" \
      "$ROOT_DIR/deploy/systemd/ai-seed-project.service" > "$target_file"
  }

  ensure_service_user() {
    if id "$RUN_USER" >/dev/null 2>&1; then
      return 0
    fi
    useradd --system --create-home --shell /usr/sbin/nologin "$RUN_USER"
  }

  TMP_SERVICE_FILE="$(mktemp "${TMPDIR:-/tmp}/${SERVICE_NAME}.XXXXXX.service")"
  trap 'rm -f "$TMP_SERVICE_FILE"' EXIT
  render_service_file "$TMP_SERVICE_FILE"

  if [ "$(id -u)" -eq 0 ]; then
    ensure_service_user
    chown -R "$RUN_USER:$RUN_GROUP" "$APP_DIR/data" "$APP_DIR/backups"
    install -Dm644 "$TMP_SERVICE_FILE" "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    systemctl restart "$SERVICE_NAME"
  elif command -v sudo >/dev/null 2>&1; then
    run_privileged env RUN_USER="$RUN_USER" bash -lc "$(declare -f ensure_service_user); ensure_service_user"
    run_privileged chown -R "$RUN_USER:$RUN_GROUP" "$APP_DIR/data" "$APP_DIR/backups"
    run_privileged install -Dm644 "$TMP_SERVICE_FILE" "$SERVICE_FILE"
    run_privileged systemctl daemon-reload
    run_privileged systemctl enable "$SERVICE_NAME"
    run_privileged systemctl restart "$SERVICE_NAME"
  else
    FALLBACK_SERVICE_FILE="$APP_DIR/$SERVICE_NAME.service"
    cp "$TMP_SERVICE_FILE" "$FALLBACK_SERVICE_FILE"
    echo "缺少 root/sudo，已完成构建，但未安装 systemd 服务。"
    echo "请手动执行：install -Dm644 \"$FALLBACK_SERVICE_FILE\" \"$SERVICE_FILE\""
  fi
fi

if [ -f "$ENV_FILE" ]; then
  echo "已检测到环境文件：$ENV_FILE"
fi

echo "bootstrap completed"
