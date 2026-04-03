# 架构说明

## 总体结构

系统由一个 Cloudflare Worker 组成，并依赖以下 Cloudflare 资源：

- Workers：对外提供 HTTP 接口、Cron 调度、Queue consumer
- Queues：承接手动和定时任务，解决长任务不适合挂在 HTTP 生命周期后的问题
- KV：保存快照、最近结果、错误记录和重复推送历史
- Email Routing / `send_email`：负责实际发信

## 执行路径

### 定时任务

1. Cron 触发 Worker
2. Worker 不直接执行摘要逻辑，而是把任务写入 Queue
3. Queue consumer 读取消息并执行 `runDigest()`

### 手动任务

1. 用户访问 `/run`
2. Worker 验证 `RUN_SECRET`
3. 写入 Queue
4. Queue consumer 执行 `runDigest()`

这样做的原因是：

- HTTP 请求后的 `waitUntil()` 生命周期有限
- 正式摘要任务可能较长
- Queue consumer 更适合承载 LLM + 抓取 + 发信的完整流程

## 候选项目发现

候选源分为两层：

### 第一层：网页热榜

- GitHub Trending 日榜：主候选源
- Trendshift：辅助候选源

### 第二层：API 补充

- GitHub REST API：补充仓库元数据
- GitHub Release API：补充最近发布信号

## 筛选逻辑

项目不会直接按单一字段截断，而是经过多层筛选：

1. 合并网页源候选
2. 计算短期热度信号
3. 计算真实性与风险信号
4. 做家族聚合与同类去重
5. 结合短期热门优先策略输出最终列表

## 新闻与摘要

新闻侧使用外部 RSS 作为输入，然后通过兼容 OpenAI Chat Completions 协议的 LLM 输出：

- 邮件标题
- 开头总览
- 主线关联
- 新闻摘要条目
- 项目中文说明

## 状态数据

KV 中主要保存：

- 最近结果 `digest:last`
- 最近错误 `digest:last-error`
- 最近快照 `state:last-snapshot`
- 观察快照 `state:last-observed-snapshot`
- 推送历史 `state:delivery-history`

## 设计取舍

这个项目的核心取舍是：

- 更关注“今天值得看什么”
- 不追求全站绝对精确排名
- 用可解释的网页热榜 + 元数据增强，替代纯 API 单点排序
