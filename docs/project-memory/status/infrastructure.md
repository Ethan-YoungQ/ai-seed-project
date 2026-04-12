# 基础设施状态

## 韩国 SWAS 服务器

| 项目 | 值 |
|------|-----|
| 区域 | ap-northeast-2 (韩国首尔) |
| 实例 ID | `09495b57b769406a95c0c718f22c9d13` |
| 公网 IP | `43.108.20.246` |
| 配置 | 2C2G / 40GB ESSD / 200Mbps |
| OS | Alibaba Cloud Linux 3.21.04 |
| Node.js | v20.20.2 |
| 到期 | 2027-04-12 |
| 部署目录 | `/opt/ai-seed-project` |
| 分支 | `codex/phase-one-feishu` |
| systemd 服务 | `ai-seed-project.service` |
| 防火墙 | 端口 3000 已开放 |

## 阿里云 CLI

```
CLI 路径: D:/Vibe Coding Project/AI Seed Project/aliyun-cli-windows-latest-amd64/aliyun.exe
Profile: korea-deploy (AK/SK, ap-northeast-2)
```

## 访问地址

| 服务 | URL |
|------|-----|
| Health API | http://43.108.20.246:3000/api/health |
| Dashboard | http://43.108.20.246:3000/dashboard/ |
| Ranking API | http://43.108.20.246:3000/api/v2/board/ranking |

## LLM 配置

| 项目 | 值 |
|------|-----|
| Provider | GLM (智谱) |
| 文本模型 | glm-4.7 |
| 视觉模型 | glm-4.6v |
| 从韩国延迟 | ~1 秒 |
| 状态 | ✅ 可用 |

## 尚未配置

- [ ] HTTPS（无域名，当前 HTTP 直连 IP）
- [ ] 域名购买和 DNS 配置
