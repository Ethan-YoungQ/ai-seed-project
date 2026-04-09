$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptRoot "..\..")).Path
$target = $env:OPS_SSH_TARGET
$remoteDir = $env:OPS_REMOTE_APP_DIR
$archiveDir = Join-Path $env:TEMP "ai-seed-project"
$archiveFile = Join-Path $archiveDir "phase-one-init.tar"

if (-not $target) {
  Write-Host "请先设置环境变量 OPS_SSH_TARGET，例如 root@1.2.3.4"
  Write-Host "当前参考路径：$repoRoot"
  exit 1
}

if (-not $remoteDir) {
  $remoteDir = "/opt/ai-seed-project"
}

New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null
git -C $repoRoot archive --format=tar HEAD -o $archiveFile
ssh $target "mkdir -p '$remoteDir'"
scp $archiveFile "${target}:$remoteDir/phase-one-init.tar"
ssh $target "cd '$remoteDir' && tar -xf phase-one-init.tar && rm -f phase-one-init.tar && bash scripts/ops/bootstrap-server.sh"
