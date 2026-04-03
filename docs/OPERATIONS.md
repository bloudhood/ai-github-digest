# 运行与维护

## 日常操作

### 查看健康状态

```text
GET /health
```

### 查看最近一次结果

```text
GET /last?secret=YOUR_SECRET
```

### 查看最近一次错误

```text
GET /last-error?secret=YOUR_SECRET
```

### 提交手动运行

```text
GET /run?secret=YOUR_SECRET
```

### 强制重跑

```text
GET /run?secret=YOUR_SECRET&force=1
```

### Dry run

```text
GET /run?secret=YOUR_SECRET&dry_run=1
```

## 运行特性

### 手动运行是排队执行

`/run` 不会直接在 HTTP 请求里完成整个摘要流程，而是：

1. 接收请求
2. 写入 Queue
3. 由 Queue consumer 在后台执行

这样可以显著提升正式长任务的稳定性。

### force 模式不会污染正式快照

手动 `force=1` 的主要用途是重新测试当前逻辑，不应该改变正式日更基线。

## 常见问题

### 1. 邮件没有收到

先检查：

- `/last` 是否出现了新的 `generated_at`
- `/last-error` 是否有新的错误
- 收件地址是否已在 Cloudflare Email Routing 中验证
- 邮件是否被邮箱客户端折叠到旧线程

### 2. GitHub 热门项目太少

先确认：

- GitHub Trending 日榜当天是否本身候选就很少
- 家族聚合是否过严
- 风险/重复抑制是否压掉太多项目

### 3. 手动运行返回 queued

这是正常的。

表示：

- 请求已经通过鉴权
- 任务已写入 Queue
- 后台 consumer 会继续执行

## 维护建议

### 定期检查

- Queue 是否正常消费
- KV 是否持续写入新结果
- 目标邮箱验证状态是否仍然有效
- LLM 提供方配额和 GitHub Token 配额是否正常

### 发布前检查

- `wrangler.toml` 是否仍保留占位值
- 收件邮箱是否已验证
- KV ID、域名、队列名是否与当前环境一致
- 如果公开代码仓库，确保未提交任何真实 Secrets
