$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$target = $env:OPS_SSH_TARGET
$remoteDir = $env:OPS_REMOTE_APP_DIR

if (-not $target) {
  Write-Host "请先设置环境变量 OPS_SSH_TARGET，例如 root@1.2.3.4"
  Write-Host "当前参考路径：$repoRoot"
  exit 1
}

if (-not $remoteDir) {
  $remoteDir = "/opt/ai-seed-project"
}

ssh $target "cd '$remoteDir' && bash scripts/ops/check-health.sh"
