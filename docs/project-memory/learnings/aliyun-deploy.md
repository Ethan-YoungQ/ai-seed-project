# 阿里云部署经验

## 韩国 vs 国内服务器

| 对比 | 国内（杭州） | 韩国 |
|------|------------|------|
| GitHub 连接 | 经常超时 | 稳定 |
| 部署方式 | Base64 直写 | git pull |
| GLM API 延迟 | ~0.5s | ~1s（可接受） |
| 飞书 WS | 正常 | 正常 |

## 7 条部署经验

1. **RunCommand shebang 问题** — Windows CLI 传 `#!/bin/bash` 会被破坏，省略 shebang 用 `set -e` 开头
2. **`npm install --omit=dev` 跳过 tsc** — 先完整安装 → build → 可选 prune
3. **source .env 含中文** — `FEISHU_TEST_CHAT_NAME=HBU奇点玩家` 让 bash 报错，用 `grep + cut` 提取
4. **频繁重启 WS 不稳定** — 重启后等 2-3 分钟让飞书路由事件到新连接
5. **build 不能用管道** — `npm run build | tail` 吞退出码，用 `set -e` 直接执行
6. **GitHub token 用完即清** — `git remote set-url origin https://github.com/...` 清除 token
7. **systemctl restart 后验证** — 末尾必须 `systemctl is-active` + `curl health`

## 部署命令模板

见 `docs/skills/aliyun-swas-deploy.md`（更详细），或 `docs/project-memory/status/infrastructure.md`（快速参考）。
