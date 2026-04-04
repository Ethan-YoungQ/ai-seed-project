# 飞书接入配置说明

## 目标
- 用企业自建应用接入真实飞书群。
- 最短路径优先走实时新消息，不做历史全量补抓。
- 本地开发优先使用长连接模式，避免公网回调依赖。

## 环境变量
参考 [`.env.example`](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/.env.example)：

```bash
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_EVENT_MODE=long_connection
FEISHU_VERIFICATION_TOKEN=
FEISHU_ENCRYPT_KEY=
FEISHU_BOT_CHAT_ID=
FEISHU_BOT_RECEIVE_ID_TYPE=chat_id
FEISHU_BASE_ENABLED=true
FEISHU_BASE_APP_TOKEN=
FEISHU_BASE_MEMBERS_TABLE=
FEISHU_BASE_RAW_EVENTS_TABLE=
FEISHU_BASE_SCORES_TABLE=
FEISHU_BASE_WARNINGS_TABLE=
FEISHU_BASE_SNAPSHOTS_TABLE=
```

## 飞书后台最短配置
1. 在飞书开放平台创建企业自建应用。
2. 开启机器人能力。
3. 给应用添加消息事件订阅：`im.message.receive_v1`。
4. 本地调试优先用长连接模式；如果改用 webhook，再配置事件订阅请求地址到 `/api/feishu/events`。
5. 开通消息发送、消息读取、消息资源访问、Base 读写权限。
6. 把机器人加入目标群。

## 本地验证
1. 启动服务：`npm run dev`
2. 先写入演示数据：`POST /api/demo/seed`
3. 查看飞书配置状态：`GET /api/feishu/status`
4. 发送机器人测试消息：`POST /api/feishu/send-test`
5. 在目标群发一条带 `#HW01 #作业提交` 的消息，确认：
   - 服务收到事件
   - 数据写入 SQLite
   - `/api/public-board` 能看到榜单变化
   - 如果配置了 Base，同步表里出现新记录

## 说明
- 数据库仍然是事实源，Base 只是镜像。
- 机器人播报通过 `/api/announcements/run` 触发；配置了 `FEISHU_BOT_CHAT_ID` 后会真实发送群消息。
