# 2026-04-07 飞书原生一期路线设计

## 1. 设计结论

一期正式路线调整为：

- 飞书原生承接学员入口、排行榜/看板展示、运营管理入口与权限边界
- 阿里云轻量应用服务器承接常驻后端服务
- SQLite 继续作为系统事实源
- 飞书 Base 作为展示层与运营协作层
- 评分模型改为国产、低成本、可多模态兜底的路线
- 学员/运营提供飞书内一键进入入口
- 项目负责人提供本地一键部署/更新/检查入口

一期**不再**把独立 Web 公共看板和独立 Web 管理后台作为正式交付面。现有 `web/` 资产保留为二期/三期增强项，不作为一期上线阻塞条件。

同时明确：

- 一期不是“纯飞书零后端方案”
- 一期是“飞书原生交付面 + 常驻后端计算服务”的方案

## 2. 背景与目标

当前项目已经具备以下真实基础：

- 飞书消息接入基础
- SQLite 事实源基础
- 飞书 Base 镜像同步基础
- Bot 消息发送基础
- 文档解析与评分链路基础

当前最大矛盾不是“系统完全做不出来”，而是“一期如果继续追求独立 Web 看板和独立后台，会显著增加上线复杂度”。用户当前只有阿里云轻量应用服务器、没有域名、缺乏服务器运维经验，且一期最重要的目标是：

1. 功能完整
2. 简单可行
3. 尽可能减少用户手动操作

因此，一期要优先完成“业务闭环上线”，而不是继续把资源投入到独立公网前端产品化。

## 3. 一期必须保持不变的业务能力

以下能力必须在一期保留，不能因为交付载体切换而被削弱：

- 学员在飞书群里提交 PDF / DOCX 作业
- 系统自动抓取文档并自动评分
- 同一周期内支持多次提交，并按最高有效分结算
- 学员可以查看排行榜与结果看板
- 运营/管理员具有与学员不同的管理权限
- 非学员或运营人员可以被排除出排行榜
- 排行榜头像和姓名必须与飞书群成员资料匹配
- Bot 可用于公告、播报与状态通知

本次设计只调整“实现方式与交付面”，不调整上述业务需求。

## 4. 为什么一期不再优先交付独立 Web

独立 Web 看板和独立 Web 后台的问题不在于“不能做”，而在于它们在一期会带来额外成本：

- 域名与公网访问问题
- Web 前后端正式部署问题
- 额外的登录、权限、路由、前端发布和运维问题
- 更高的用户教育成本

而一期真正不可替代的核心其实是：

- 飞书消息接收
- 文档解析
- 评分模型调用
- attempt 级结算
- 写回 Base 与发送 Bot 消息

因此，一期应把“界面问题”回收到飞书原生，把“业务自动化问题”保留在后端服务层解决。

## 5. 方案对比与最终推荐

### 方案 A：飞书原生交付面 + 阿里云常驻后端

- 学员入口：飞书知识库/文档首页
- 看板展示：飞书 Base 仪表盘
- 运营管理：飞书 Base 视图 + 权限
- 自动评分：阿里云上的 Node 常驻服务
- 事实源：SQLite

优点：

- 功能完整
- 不依赖域名
- 上线复杂度最低
- 对学员和运营最友好
- 适合后续平滑演进到二期/三期

缺点：

- 视觉上限低于完全自建 Web
- 仪表盘交互能力低于独立前端

### 方案 B：飞书原生交付面 + 本地电脑常驻后端

优点：

- 初始部署最少

缺点：

- 稳定性差
- 不适合作为正式一期上线方案

### 方案 C：继续交付独立 Web

优点：

- 展示效果和自定义能力理论上最好

缺点：

- 与一期“简单可行、快速上线”的目标冲突
- 会显著增加部署复杂度和运维成本

### 最终推荐

一期正式采用**方案 A：飞书原生交付面 + 阿里云常驻后端**。

## 6. 一期正式模块图

一期正式模块拆分为 6 个单元：

### 6.1 学员交互层：飞书群 + 飞书知识库首页

- 学员在飞书群提交 PDF / DOCX
- 学员在飞书知识库/文档首页查看规则、榜单入口、FAQ、公告说明
- 学员不接触服务器、不接触独立后台、不接触公网网页

### 6.2 看板与结果展示层：飞书 Base 仪表盘

- 排行榜
- 统计卡片
- 趋势图
- 状态展示
- 快照和公告辅助展示

一期应把 Base 仪表盘视为**正式产品界面**来设计，而不是“数据表凑合能看”。目标是尽可能替代原 Web 看板的核心信息结构与可读性。

### 6.3 运营管理层：飞书 Base 视图 + 飞书权限

- 运营在 Base 里查看成员、attempt、周期结果、预警与快照
- 指定管理员拥有编辑权限
- 学员没有管理视图权限

### 6.4 自动评分服务层：Node 常驻后端

负责：

- 接收飞书群消息
- 下载附件
- 解析 PDF / DOCX
- 执行本地规则校验
- 调用国产模型进行评分
- 计算周期最终结果
- 写回 SQLite 与 Base
- 发送 Bot 消息

这意味着飞书原生能力负责“入口、展示、权限、协作”，常驻后端负责“下载、解析、评分、结算、同步”。两者缺一不可。

### 6.5 事实源层：SQLite

- 原始事件
- 成员资料
- submission attempt
- 评分结果
- 周期最终结果
- 预警状态
- 审计记录

SQLite 继续是系统事实源。Base 是镜像和协作面，不反转为主事实源。

### 6.6 运行环境层：阿里云轻量应用服务器

- 只承接常驻后端与 SQLite
- 一期不承接公网 Web
- 一期不承接域名和证书
- 尽量通过 MCP / OpenAPI / CLI / 脚本完成配置与维护

## 7. 飞书原生替代看板的正式要求

一期里，飞书原生排行榜和看板不是“能用就行”，而是要尽可能覆盖原 Web 看板的核心能力。

### 7.1 必须覆盖的展示能力

- 排行榜
- 成员头像与昵称
- 周期总分/累计得分
- 趋势图或周期变化图
- 异常/预警状态提示
- 快照与公告辅助展示

### 7.2 美观要求

一期不追求完全复刻原高设计感 Web 视觉，但必须做到：

- 仪表盘结构清楚
- 信息层级明确
- 榜单、趋势、状态分区明显
- 学员入口页面具备“产品首页”感，而不是纯表格链接堆叠

### 7.3 头像与姓名匹配要求

- 排行榜展示必须使用飞书成员资料中的头像和显示名
- 后端缓存 `displayName` 与 `avatarUrl`
- 排行榜与仪表盘统一使用缓存后的飞书资料
- 非学员或运营人员可以被显式排除出榜单

## 8. 评分模型路线

一期必须完成“国产模型选型 + API 改写 + 全链路验证”，不能继续停留在旧的 `OPENAI_*` 路线和 heuristic-only 状态。

### 8.1 选型原则

- 优先选择中国国内模型服务
- 优先选择成本较低的模型
- 在满足成本前提下尽量覆盖多模态/文档理解需求
- 优先选择支持 OpenAI-compatible 接口的服务，降低改造成本

### 8.2 推荐模型组合

根据当前项目需求和参考资料，一期推荐采用：

- **主评分模型**：阿里云百炼 `qwen3-flash`
- **文档兜底模型**：阿里云百炼 `qwen-doc`

推荐原因：

- `qwen3-flash` 适合承担大多数过程分/质量分评分，成本更低
- `qwen-doc` 只在本地文档提取失败、扫描件、图片型 PDF 等场景下启用
- 该组合兼顾低成本与多模态兜底，不必默认让每份文档都走更贵的文档理解模型

### 8.3 模型职责边界

本地规则负责：

- 是否位于当前周期窗口
- 是否按时提交
- 是否为受支持的 PDF / DOCX
- 是否具备最低可评估条件

模型负责：

- `processScore`
- `qualityScore`
- 简短评分理由

### 8.4 配置层要求

配置必须改为 provider-neutral 命名，例如：

```env
LLM_ENABLED=true
LLM_PROVIDER=aliyun
LLM_BASE_URL=
LLM_API_KEY=
LLM_TEXT_MODEL=qwen3-flash
LLM_FILE_MODEL=qwen-doc
LLM_TIMEOUT_MS=15000
LLM_MAX_INPUT_CHARS=6000
LLM_CONCURRENCY=3
```

`.env.example` 中不再把 `OPENAI_*` 作为默认主入口。

### 8.5 测试要求

模型路线在一期必须完成：

- API 适配改写
- 本地/测试环境全链路跑通
- 在用户提供正式 API Key 后进行完整验收测试

## 9. 部署底座与阿里云自动化原则

### 9.1 为什么重装为干净 Linux

一期推荐把当前轻量服务器重装为干净 Linux，而不是保留宝塔镜像。原因不是“宝塔不能用”，而是：

- 一期不是网站托管项目，而是常驻后端服务项目
- 宝塔擅长的网站、站点、证书、Nginx 管理并不是一期核心需求
- 宝塔会引入额外一层面板复杂度和排障路径
- 干净 Linux 更适合脚本化、systemd、SQLite 备份和后续演进

### 9.2 阿里云 MCP / OpenAPI 的定位

阿里云官方已提供：

- OpenAPI MCP Server 使用指南  
  <https://help.aliyun.com/zh/openapi/user-guide/openapi-mcp-server-guide>
- aliyun mcp-proxy 使用方式  
  <https://help.aliyun.com/zh/openapi/use-aliyun-mcp-proxy-agent-openapi-mcp-server>
- 轻量应用服务器 OpenAPI 说明  
  <https://help.aliyun.com/zh/simple-application-server/developer-reference/using-openapi>

因此，一期应采用：

- **云侧资源操作优先尝试通过阿里云 MCP / OpenAPI / CLI 自动化**
- **系统内应用部署通过脚本和标准 Linux 方案完成**

MCP 的定位是增强自动化，不是替代服务器内部应用运行环境。

## 10. 最小用户操作原则

一期必须尽量减少无代码用户的操作成本。

### 10.1 保留给用户手动完成的动作

- 阿里云控制台中重装系统、初始密码确认等安全确认动作
- 飞书开放平台中的权限开通、事件订阅确认、发布确认
- 填写敏感环境变量，例如 API Key、App Secret

### 10.2 由 agent / 脚本承担的动作

- 服务器初始化
- Node 运行时安装
- 项目同步
- 依赖安装
- 数据目录初始化
- 服务配置与 `systemd` 安装
- 启动/停止/重启
- 健康检查
- 日志查看
- 升级部署
- 备份

## 11. 一键入口设计

一期必须同时覆盖两类“一键”能力。

### 11.1 学员与运营的一键进入

通过飞书内入口承接：

- 学员：飞书知识库/文档首页 -> 仪表盘链接
- 运营：飞书内运营文档首页 -> Base 运营视图/仪表盘链接

目标是让无代码用户完全在飞书内完成日常使用。

### 11.2 项目负责人的一键运维

通过本地一键脚本承接：

- 一键初始化
- 一键部署
- 一键更新
- 一键检查
- 一键重启
- 一键备份

这类入口优先做成本地固定脚本，而不是强行做成飞书内运维入口。原因是本地脚本更稳定、可控、易恢复。

一期建议至少提供：

- Windows 双击入口：`.ps1` + `.bat` 包装
- macOS 双击入口：`.command`
- 统一的运维能力集合：初始化、部署、更新、检查、重启、备份

## 12. 一期与后续阶段边界

### 12.1 一期正式交付

- 飞书知识库/文档首页
- 飞书 Base 仪表盘
- 飞书 Base 运营视图
- 阿里云常驻评分后端
- 国产模型评分链路
- 双一键入口（飞书内进入 + 本地运维脚本）

### 12.2 二期候选增强

- 恢复独立 Web 公共看板
- 更高设计感的独立赛季大厅
- 更细的可视化趋势分析

### 12.3 三期候选增强

- 正式公网产品化部署
- 域名与 HTTPS
- 更强的管理员后台
- 更正式的多环境部署体系

## 13. 一期正式功能映射

| 原业务能力 | 一期实现归属 | 是否保留 |
|---|---|---|
| 飞书群提交 PDF / DOCX | 飞书群 + 后端 | 保留 |
| 自动抓取作业 | 后端 | 保留 |
| 自动评分 | 后端 + 国产模型 API | 保留 |
| 多次提交取最高分 | SQLite + 规则层 | 保留 |
| 排行榜/看板 | 飞书 Base 仪表盘 | 保留 |
| 头像和姓名与群成员一致 | 后端同步飞书资料 + Base 展示 | 保留 |
| 运营管理权限 | 飞书 Base 权限和视图 | 保留 |
| 非学员不上榜 | 成员排除字段 + Base 管理 | 保留 |
| 公告/播报/快照 | 后端 + Bot + Base | 保留 |
| 独立 Web 公共看板 | 二期/三期增强 | 一期不交付 |
| 独立 Web 管理后台 | 二期/三期增强 | 一期不交付 |

## 14. 风险与应对

### 风险 1：把飞书原生看板做成“纯表格”

应对：

- 一期把 Base 仪表盘当成正式界面设计
- 明确要求排行榜、趋势图、状态卡片和入口首页结构

### 风险 2：模型路线继续模糊，导致 API 改写拖延

应对：

- 一期直接锁定国产模型路线
- 把模型 API 改写列为一期 P0
- 用户提供 API Key 后必须完成全链路跑通测试

### 风险 3：阿里云部署仍然过多依赖手工操作

应对：

- 云侧优先尝试 MCP / OpenAPI / CLI
- 系统内优先脚本化
- 把手工动作压缩到安全确认和密钥填写

### 风险 4：现有独立 Web 路线继续抢占一期资源

应对：

- README、setup、handoff、plan 文档统一改写为“飞书原生一期”
- 旧 Web 资产降级为二期/三期候选

## 15. 一期落地检查清单

当以下条件全部满足时，才视为飞书原生一期路线设计成立：

- 一期正式入口已固定为飞书知识库/文档首页
- 一期正式看板已固定为飞书 Base 仪表盘
- 一期正式管理入口已固定为飞书 Base 运营视图
- 服务器底座已确定为阿里云轻量服务器重装干净 Linux
- 阿里云侧自动化已明确优先使用官方 MCP / OpenAPI / CLI
- 系统内运维动作已明确脚本化
- 国产模型路线与 API 适配已纳入一期
- 学员/运营一键进入和负责人一键运维已同时纳入一期
- 独立 Web 看板和独立后台已明确降级为后续阶段资产

## 16. 官方依据

### 16.1 飞书官方依据

- 飞书 MCP 概览  
  <https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/mcp_introduction>
- 自建应用开发流程  
  <https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process>
- `im.message.receive_v1` 事件  
  <https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive>
- 多维表格新增记录  
  <https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create>
- 多维表格查询记录  
  <https://open.feishu.cn/document/docs/bitable-v1/app-table-record/search>
- 多维表格更新记录  
  <https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/update>

### 16.2 阿里云官方依据

- OpenAPI MCP Server 使用指南  
  <https://help.aliyun.com/zh/openapi/user-guide/openapi-mcp-server-guide>
- 使用 `aliyun mcp-proxy`  
  <https://help.aliyun.com/zh/openapi/use-aliyun-mcp-proxy-agent-openapi-mcp-server>
- 轻量应用服务器 OpenAPI 集成概览  
  <https://help.aliyun.com/zh/simple-application-server/developer-reference/using-openapi>
- 重置轻量应用服务器系统  
  <https://help.aliyun.com/zh/simple-application-server/user-guide/reset-a-simple-application-server>
- 使用命令助手执行命令  
  <https://help.aliyun.com/zh/simple-application-server/user-guide/use-command-assistant>
- 上传文件到轻量应用服务器  
  <https://help.aliyun.com/zh/simple-application-server/user-guide/upload-files-to-the-lightweight-application-server>
- 管理防火墙  
  <https://help.aliyun.com/zh/simple-application-server/user-guide/manage-the-firewall-of-a-server>
- 管理快照  
  <https://help.aliyun.com/zh/simple-application-server/user-guide/manage-snapshots>
