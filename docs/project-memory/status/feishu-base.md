# 飞书多维表格配置

## Base 信息

| 项目 | 值 |
|------|-----|
| 名称 | HBU AI 训练营 |
| App Token | `GKGAbIocda6Ki0se4XhcqbVzn2c` |
| 链接 | https://fcnxwpz0ut78.feishu.cn/base/GKGAbIocda6Ki0se4XhcqbVzn2c |
| Owner | YongQ |
| 协作者 | Karen, Dorothy (full_access) |

## 表清单

| 表名 | Table ID | 用途 |
|------|----------|------|
| members | `tblx0jS8hlZwebq5` | 成员信息 |
| quiz_bank | `tblZmCeIOQcC4XZC` | **题库管理（运营编辑）** |
| raw_events | `tblsO0n6pTyX8XpP` | 原始事件记录 |
| scores | `tbluLaklPXIhRT7C` | 评分记录 |
| warnings | `tblynZQOHfcuwsYd` | 警告记录 |
| snapshots | `tblrhaehC9qm6sQp` | 快照记录 |

## quiz_bank 表结构

| 列名 | 类型 | 说明 |
|------|------|------|
| 期数 | 数字 | 第几期（1,2,3...） |
| 题目 | 文本 | 题目内容 |
| 选项A | 文本 | 选项 A |
| 选项B | 文本 | 选项 B |
| 选项C | 文本 | 选项 C（可空） |
| 选项D | 文本 | 选项 D（可空） |
| 正确答案 | 文本 | A/B/C/D |

## 运营操作流程

1. 打开飞书多维表格链接
2. 切换到 `quiz_bank` 标签页
3. 每行填一道题：期数 + 题目 + 选项 + 正确答案
4. 在飞书群发"测验" → Bot 自动读取对应期数的题目

## 注意

- 旧 Base（appToken: OiclbQXUqaNmY8sthCqc5nbtn7b）**已被删除**，所有 API 返回 1002
- 当前 Base 于 2026-04-13 通过 API 新建
