# 阿里云 MCP 运行手册

一期部署优先走阿里云官方 MCP / OpenAPI 自动化。MCP 适合做云资源查询、实例配置、防火墙、快照、命令投递和部署校验；它不是生产评分引擎，真正的业务系统仍然运行在干净 Linux + Node/Fastify + SQLite + systemd 上。

## 当前结论

- 目标底座：优先使用阿里云轻量应用服务器的干净 Linux 系统，而不是宝塔镜像或面板式部署。
- 自动化优先级：先走 MCP/OpenAPI；当前 MCP 做不到时再走 SSH、命令助手或控制台手动步骤。
- 当前会话状态：已能调用 ECS OpenAPI，但已检查的常见地域没有 ECS 实例；项目设计文档指向轻量应用服务器，当前会话尚未暴露 SWAS-OPEN 工具。
- CLI 状态：当前 shell 未发现 `aliyun` 命令；本轮不以 CLI 作为默认自动化路径。即使本机另有可用 CLI，当前 Codex MCP 工具面仍取决于远端 OpenAPI MCP Server 是否已经加入 `SWAS-OPEN/2020-06-01` API。
- 审计备注：2026-04-08 已通过当前 ECS MCP 依次查询 `cn-hangzhou`、`cn-shanghai`、`cn-beijing`、`cn-shenzhen`、`cn-guangzhou`、`cn-hongkong`、`cn-chengdu`、`cn-qingdao`、`cn-huhehaote`、`cn-zhangjiakou`、`cn-wulanchabu`、`cn-heyuan`、`cn-nanjing`、`cn-fuzhou`、`cn-wuhan-lr`、`cn-zhengzhou-jva`、`us-east-1`、`us-west-1`、`us-southeast-1`、`eu-central-1`、`eu-west-1`、`ap-southeast-1`、`ap-southeast-3`、`ap-southeast-5`、`ap-southeast-6`、`ap-southeast-7`、`ap-northeast-1`、`ap-northeast-2`、`na-south-1`、`me-east-1`、`me-central-1`，成功返回地域均为 0 台 ECS；`ap-southeast-2` 和 `ap-south-1` 是端点解析失败，不应解读为全账号绝对不存在 ECS。

## 官方依据

- [OpenAPI MCP Server 使用指南](https://help.aliyun.com/zh/openapi/user-guide/openapi-mcp-server-guide)：阿里云 OpenAPI MCP Server 支持通过自然语言调用阿里云 API 操作云上资源，自定义版可把选定 API 直接暴露为 MCP Tool。
- [使用 aliyun mcp-proxy 代理 OpenAPI MCP Server](https://help.aliyun.com/zh/openapi/use-aliyun-mcp-proxy-agent-openapi-mcp-server)：`aliyun mcp-proxy` 可作为本地认证代理，首次需要 OAuth 授权，后续自动处理 Token 刷新；代理端口不能对外暴露，应按最小权限配置。
- [CreateApiMcpServer](https://help.aliyun.com/zh/openapi/developer-reference/api-openapiexplorer-2024-11-30-createapimcpserver) / [UpdateApiMcpServer](https://help.aliyun.com/zh/openapi/developer-reference/api-openapiexplorer-2024-11-30-updateapimcpserver)：OpenAPI Explorer 提供 API MCP Server 的创建和修改 API，因此在具备访问密钥、RAM 权限和目标 MCP Server ID 时，可以脚本化创建或更新 MCP 服务。
- [轻量应用服务器 OpenAPI 集成概览](https://help.aliyun.com/zh/simple-application-server/developer-reference/using-openapi)：轻量应用服务器提供实例、磁盘、镜像、密钥对、防火墙等 OpenAPI；本轮自动化优先通过 OpenAPI MCP Server 暴露所需 API，而不是依赖本机 CLI。
- [轻量应用服务器 API 概览](https://help.aliyun.com/zh/simple-application-server/developer-reference/api-swas-open-2020-06-01-overview)：SWAS-OPEN/2020-06-01 覆盖实例、密钥对、防火墙、快照、磁盘、镜像、命令助手、标签等 API。
- [重置轻量应用服务器系统](https://help.aliyun.com/zh/simple-application-server/user-guide/reset-a-simple-application-server)：重置系统会清除系统盘数据，重置后需要重新设置登录凭证，重置前快照会保留但无法用于回滚重置后的系统。
- [使用命令助手执行命令](https://help.aliyun.com/zh/simple-application-server/user-guide/use-command-assistant)：控制台可对单个轻量服务器执行 Shell / Bat / PowerShell 命令。
- [使用命令助手上传文件](https://help.aliyun.com/zh/simple-application-server/user-guide/upload-files-to-the-lightweight-application-server)：控制台命令助手支持向轻量服务器上传文件。
- [管理防火墙规则](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-the-firewall-of-a-server)：防火墙规则应按需开放端口和来源 IP，遵循最小授权原则。
- [管理快照](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-snapshots)：轻量服务器快照适合备份和误操作恢复；单台服务器最多 3 个快照，创建快照约需 10 到 30 分钟。

## 自动化能力矩阵

| 动作 | 首选方式 | 当前可自动化状态 | 需要的下一步 |
| --- | --- | --- | --- |
| 查询 ECS 目标 | 当前 ECS MCP Tool | 已自动化，常见地域返回 0 台 ECS | 不继续走 ECS，除非用户确认目标是 ECS 并提供地域/实例 ID |
| 查询轻量服务器目标 | SWAS `ListInstances` / `ListInstanceStatus` MCP Tool | 当前不可自动化，工具未暴露 | 在阿里云 OpenAPI MCP 自定义服务中加入 SWAS 查询工具，或用户提供公网 IP / 实例 ID |
| 创建部署前快照 | SWAS `CreateSnapshot` / `ListSnapshots` | 当前不可自动化，工具未暴露 | 暴露 SWAS 快照工具；否则按官方快照文档手动创建 |
| 重装为干净 Linux | 控制台手动确认，或确认后通过 OpenAPI | 当前不自动执行 | 该动作会清空系统盘，必须由用户确认；优先手动按官方重置系统文档执行 |
| 设置登录密码/密钥 | 控制台手动 | 不自动化 | 属于安全凭据动作，由用户设置或确认 |
| 防火墙规则 | SWAS `ListFirewallRules`；写操作需人工确认 | 当前只应自动化查询，写操作工具未暴露 | 默认只暴露查询；如需创建/删除规则，临时暴露并明确端口、协议、来源 IP |
| 远端执行 bootstrap/deploy/check | SWAS 命令助手 OpenAPI，或 SSH | 当前只能在拿到 `OPS_SSH_TARGET` 后通过脚本自动化 | 用户提供 `OPS_SSH_TARGET=root@<ip>`，或在确认目标后临时暴露命令助手执行工具 |
| 上传项目包 | SSH/scp，或命令助手上传文件 | 当前只能在拿到 `OPS_SSH_TARGET` 后通过脚本自动化 | 用户提供 SSH 连接方式，或按官方上传文件文档手动上传 |
| 安装 Node/systemd 服务/SQLite 目录 | 仓库脚本 | 拿到远端执行通道后可自动化 | 使用 `scripts/ops/bootstrap-server.sh`、`scripts/ops/deploy-app.sh`、`scripts/ops/check-health.sh` |
| 写入 `.env.production` 密钥 | 用户提供/粘贴，agent 只校验非空 | 不自动代填密钥 | 用户提供 Feishu 与 `LLM_*` 密钥；agent 不在文档或日志中输出密钥值 |

## 推荐暴露的 SWAS MCP Tools

如果继续 MCP-first，请在阿里云 OpenAPI MCP 自定义服务里为轻量应用服务器 `SWAS-OPEN/2020-06-01` 先加入只读和低风险 API。单个自定义 MCP Server 建议保持在 30 个 API 以内，可以单独建一个 `swas-ops-readonly` 服务。

- `ListInstances`
- `ListInstanceStatus`
- `DescribeInstancePasswordsSetting`
- `ListFirewallRules`
- `ListSnapshots`
- `DescribeCommands`
- `DescribeInvocations`
- `DescribeCommandInvocations`
- `DescribeInvocationResult`
- `DescribeCloudAssistantStatus`

### 临时写操作工具

下面这些 API 可以用于部署，但不应默认暴露。只有在目标实例、地域、预期动作和回滚方式都明确后，才临时加入 MCP 并在调用前再次确认。

- `CreateSnapshot`
- `CreateFirewallRule`
- `DeleteFirewallRule`
- `CreateCommand`
- `RunCommand`
- `InvokeCommand`
- `DeleteCommand`
- `InstallCloudAssistant`

`RunCommand` / `InvokeCommand` 只能用于运行本仓库的固定运维脚本，例如 `scripts/ops/bootstrap-server.sh`、`scripts/ops/deploy-app.sh` 和 `scripts/ops/check-health.sh`，不能作为任意远程 Shell 入口使用。

高风险 API 例如 `UpdateInstanceAttribute`、`ResetSystem`、`ResetDisk`、删除实例、删除快照、回滚磁盘，不建议默认暴露给 MCP。确实需要时，应单独临时暴露并在执行前再次人工确认。

## 不使用 AliYun Plugin 时的 SWAS MCP 暴露步骤

本项目不内置阿里云 plugin 源码，也不保存云端凭证；项目只消费已经配置好的全局 MCP：`aliyun-openapi`。因此，不使用 AliYun Plugin 时，不能通过改仓库文件直接让当前会话出现 SWAS tools，必须更新阿里云侧的自定义 OpenAPI MCP Server，并重载 Codex 会话。

如果要用 AccessKey 自动化这一步，理论路径是调用 OpenAPI Explorer 的 `CreateApiMcpServer` 或 `UpdateApiMcpServer`。当前仓库尚未内置该签名/SDK脚本，当前会话也没有暴露 OpenAPI Explorer 的 MCP Server 管理工具；因此除非用户明确把 AK/SK 以本机环境变量方式提供并授权新增临时脚本，否则默认采用控制台步骤。不要把 AK/SK 明文写进仓库、文档或聊天记录。

1. 打开阿里云官方 OpenAPI MCP Server 配置入口，找到当前 `aliyun-openapi` 自定义服务；如果不想影响现有 ECS 工具，也可以新建一个只读服务，例如 `swas-ops-readonly`。
2. 在自定义服务中加入产品 `SWAS-OPEN`，API 版本选择 `2020-06-01`。
3. 先只加入只读或低风险 API：
   - `ListInstances`
   - `ListInstanceStatus`
   - `DescribeInstancePasswordsSetting`
   - `ListFirewallRules`
   - `ListSnapshots`
   - `DescribeCommands`
   - `DescribeInvocations`
   - `DescribeCommandInvocations`
   - `DescribeInvocationResult`
   - `DescribeCloudAssistantStatus`
4. 暂时不要默认加入写操作 API。只有在目标实例、地域、预期动作和回滚方式都明确后，再临时加入 `CreateSnapshot`、`CreateFirewallRule`、`DeleteFirewallRule`、`CreateCommand`、`RunCommand`、`InvokeCommand`、`DeleteCommand`、`InstallCloudAssistant`。
5. 保存自定义 MCP Server。如果 SSE 地址变化，需要同步更新本机 Codex 的 MCP 配置；如果继续使用同名同地址服务，只需要让 Codex 重新加载 MCP 工具。
6. 重启或刷新 Codex 会话，让新的 `mcp__aliyun_openapi__Swas...` 工具出现在工具面。
7. 恢复本任务后，先调用 SWAS `ListInstances` 找目标轻量服务器，再进入快照、防火墙、命令助手和部署步骤。

## 手动路径

如果当前会话暂时无法暴露 SWAS MCP 工具，请按下面步骤走最小手动路径。完成后把 `OPS_SSH_TARGET` 或轻量服务器实例 ID / 地域 / 公网 IP 发回当前线程，我再继续自动化部署。

1. 打开轻量应用服务器控制台，找到目标服务器，确认地域、实例 ID、公网 IP 和当前镜像类型。
2. 如果服务器内已有重要数据，先按官方快照文档创建快照；注意重置系统前的快照在重置后会保留，但不能用于回滚新系统。
3. 如果当前不是干净 Linux，按官方“重置系统”文档重装为干净 Linux；该动作会清除系统盘数据。
4. 重置后设置或确认登录密码/密钥；不要把密码写进仓库或聊天记录。
5. 在防火墙中确认 SSH 端口可用。若一期只跑飞书长连接，不需要为公网用户开放应用端口；后续二期独立 Web 或公网健康检查再考虑 80/443 或应用端口。
6. 确认可从本机 SSH 登录后，在 PowerShell 里设置：

```powershell
$env:OPS_SSH_TARGET = "root@<public-ip>"
$env:OPS_REMOTE_APP_DIR = "/opt/ai-seed-project"
```

7. 回到当前线程，我将执行：

```powershell
.\scripts\ops\windows-init.ps1
.\scripts\ops\windows-deploy.ps1
.\scripts\ops\windows-check.ps1
```

## 自动化恢复点

当前断点是“轻量服务器目标不可见”。恢复时先执行以下判断：

1. 如果已暴露 SWAS MCP 工具，先调用 `ListInstances` 找目标服务器，再做快照、防火墙、命令助手和部署。
2. 如果用户提供了 `OPS_SSH_TARGET`，直接走仓库脚本部署，不再等待 MCP。
3. 如果只提供公网 IP 和地域，先确认 SSH 是否可用；不可用则要求用户按官方登录凭据/防火墙文档补齐。
4. 如果目标其实是 ECS，重新用 ECS MCP 查实例状态、安全组和磁盘快照，再进入 ECS 部署路径。

## 验证建议

- `scripts/ops/check-health.sh`
- `systemctl status ai-seed-project`
- `journalctl -u ai-seed-project -n 100 --no-pager`
- `GET /api/health`
- `GET /api/feishu/status`

## 2026-04-09 status update

The custom SWAS MCP server `aliyun-hbu-seed` (`id=lFh1K3Co32eeWk13`) has now been upgraded from read-only discovery to deployment-ready command execution.

Confirmed selectors on `SWAS-OPEN/2020-06-01`:

- `DescribeCloudAssistantStatus`
- `DescribeCommandInvocations`
- `DescribeCommands`
- `DescribeInstancePasswordsSetting`
- `DescribeInvocationResult`
- `DescribeInvocations`
- `ListFirewallRules`
- `ListInstanceStatus`
- `ListInstances`
- `ListInstancesTrafficPackages`
- `ListSnapshots`
- `RunCommand`
- `CreateCommand`
- `InvokeCommand`
- `DeleteCommand`
- `CreateSnapshot`

Verification completed against instance `0cf24a62cd3a463baf31c196913dc3cd` in `cn-hangzhou`:

- Cloud Assistant status: `true`
- Instance status: `Running`
- Remote smoke command: `uname -a`
- Result: `Success`, `ExitCode=0`

This means SWAS-side MCP permissions are no longer the blocker. The next blocker is the actual bootstrap and application deployment flow.
