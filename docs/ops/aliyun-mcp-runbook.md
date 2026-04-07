# 阿里云 MCP 运行手册

一期部署优先走 Aliyun MCP。它适合做云资源查询、实例配置、命令投递、重装和网络校验等云侧动作。

## 推荐顺序

1. 优先通过阿里云官方 MCP / OpenAPI 完成云侧配置。
2. 如果 MCP 当前不可用，改用脚本/SSH/Cloud Assistant。
3. 如果需要云侧救援，先确认实例状态、网络和安全组，再执行应用脚本。

## 适用边界

- 适合：ECS、轻量应用服务器、密钥对、防火墙、命令执行、资源查询。
- 不适合：把业务逻辑塞进 MCP；MCP 不是生产评分引擎。

## 当前一期落地约定

- Linux 底座保持干净，优先单 ECS + systemd + Node/Fastify + SQLite。
- 应用部署脚本只依赖最少参数。
- 服务器内的安装、构建、重启、备份，仍以脚本为准。

## 兜底方式

当 Aliyun MCP 不可用时，按下面顺序回退：

1. Cloud Assistant 执行脚本。
2. SSH 远程执行 `scripts/ops/*.sh`。
3. 通过本地 Windows/macOS 一键包装脚本触发远程动作。

## 最少需要确认的信息

- 实例 IP 或连接方式
- 站点目录
- 数据库路径
- `PORT`
- 飞书和模型相关密钥

## 验证建议

- `scripts/ops/check-health.sh`
- `systemctl status ai-seed-project`
- `journalctl -u ai-seed-project -n 100 --no-pager`
