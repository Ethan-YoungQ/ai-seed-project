# 无代码运维指南

这份指南给没有代码经验的使用者一个简单入口。

## 学员怎么进入

1. 打开飞书知识库首页。
2. 点击“进入学员看板”。
3. 查看自己的成绩、排名和勋章。
4. 这是学员的一键进入入口。

## 运营怎么进入

1. 打开飞书知识库或 Base 入口。
2. 点击“进入运营视图”。
3. 处理成员、公告、快照、预警和榜单排除。
4. 这是运营的一键进入入口。

## 负责人怎么启动

### 一键启动

- Windows：双击 `scripts/ops/windows-init.ps1`
- macOS：双击 `scripts/ops/mac-init.command`
- 这一步会先打包当前仓库版本，再上传到服务器完成首次初始化。

### 一键部署

- Windows：双击 `scripts/ops/windows-deploy.ps1`
- macOS：双击 `scripts/ops/mac-deploy.command`
- 这一步会先上传当前仓库 `HEAD`，再触发远端构建与重启。

### 一键检查

- Windows：双击 `scripts/ops/windows-check.ps1`
- macOS：双击 `scripts/ops/mac-check.command`

## 运维原则

- 优先使用 Aliyun MCP。
- 如果 MCP 不可用，直接回退到脚本、SSH 或 Cloud Assistant。
- 不需要理解数据库细节，也不需要手工拼复杂命令。

## 你需要准备的最少信息

- 服务器连接方式
- 站点目录
- 模型 API Key
- 飞书应用配置
- 本地可用的 `git`、`ssh`、`scp`

## 常见动作

- 启动服务
- 部署更新
- 检查健康状态
- 备份数据库
- 重新同步飞书数据
