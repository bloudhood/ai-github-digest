# GitHub Digest Worker — DeepSeek 优化与体验提升设计

**日期:** 2026-04-21  
**状态:** 已审批，待实施

---

## 问题诊断

审计发现三个根本性问题：

1. **上下文串扰（最高优先级）** — 每批 5 个项目打包进一次 DS 调用，DS 在同一上下文里处理多个项目，导致 `positioning_cn` / `risk_cn` 张冠李戴，是"牛头不对马嘴"的直接原因。

2. **新闻摘要质量差** — 所有新闻条目一次性揉进 overview 调用，DS 写出的描述像是多条混合，缺乏独立性和准确性。

3. **新闻标签误判** — 标签由关键词规则生成（不经 DS），匹配粗糙，导致"新模型发布"被打成"⚠安全漏洞"等错误标签。

---

## 目标

- 彻底消除项目描述串扰
- 每条新闻拥有独立的 DS 生成摘要
- 新闻标签由 DS 从固定分类中选择，确保语义准确
- 不降低系统稳定性，单项失败不影响整体
- 在可接受范围内适当增加分析深度

---

## 方案：并行单项处理 + DS 新闻标签

### 1. DeepSeek 调用架构重构

**现状：**
```
Overview 调用（1次，deepseek-v4-pro，thinking=max）
  输出：subject / opening / bridge / news_section

Project Batch 调用（N/5 次，5个/批，deepseek-v4-pro，thinking=max）
  输出：每个项目的 positioning_cn / risk_cn
```

**新架构：**
```
Overview 调用（1次，deepseek-v4-pro，thinking=max）
  输出：subject / opening / bridge
       + news_section.items_cn[]: {title, summary_cn, tag, source, url}  ← DS逐条处理

Per-Repo 调用（每项目1次，并行，deepseek-v4-flash，thinking=high）
  输入：仅该项目数据（名称/stars/delta/readme/新闻关联）
  输出：{positioning_cn, risk_cn}
```

**关键设计决策：**

- Per-repo 调用使用 `deepseek-v4-flash` + `thinking=high`：单项目描述是直接任务，用快速模型控制成本和延迟
- Overview 调用使用 `deepseek-v4-pro` + `thinking=max`：跨多项目的宏观分析和新闻综合更适合高思考强度
- 并发限制器：最多同时发起 5 个 per-repo 调用，防止 DeepSeek 限速
- `Promise.allSettled`：任意项目调用失败只降级该项目，不影响其他项目和整封邮件

**调用次数对比（以 15 个项目为例）：**

| | 现在 | 新方案 |
|--|--|--|
| Overview | 1次 | 1次 |
| 项目摘要 | 3次（5个/批，顺序） | 15次（并行，分批5个并发） |
| 总耗时 | ~4×55s 顺序 ≈ 220s | ~3批×55s ≈ 55-165s（更快）|
| 串扰风险 | 高 | 零 |

---

### 2. Overview 调用 Schema 扩展

**新增字段：** 每条新闻增加 `summary_cn`（独立摘要）和 `tag`（DS 分类标签）

```json
{
  "email_subject": "...",
  "opening_cn": "...",
  "bridge_cn": "...",
  "overall_summary": "...",
  "news_section": {
    "items_cn": [
      {
        "title": "...",
        "summary_cn": "2-3句独立摘要，不混入其他条目内容",
        "tag": "模型发布",
        "source": "...",
        "url": "..."
      }
    ]
  }
}
```

**系统提示新增指令：**
- 为每条新闻单独写 `summary_cn`，不得混合多条内容
- `tag` 必须从固定分类列表中选择一项（见下方分类表）
- 分类定义随 prompt 传入，防止 DS 自行发明分类

---

### 3. Per-Repo 调用设计

**输入（每次调用只传单个项目）：**
```
项目：{full_name}
描述：{description}
语言：{language}
Stars：{stars}（近期 +{star_delta}）
README 摘录：
{readme_excerpt}（上限 1400 字符，不变）

关联新闻标题：
{相关新闻列表，仅标题}
```

**输出 Schema：**
```json
{
  "positioning_cn": "2-3句，说明这个项目做什么、为什么现在值得关注、典型使用场景",
  "risk_cn": "一句话注意事项，若无真实风险则为空字符串"
}
```

**提示设计原则：**
- 明确标注"仅针对上方这一个项目"，不提及其他项目
- `positioning_cn` 要求具体，不得写泛化描述（如"一个优秀的开源工具"）
- `risk_cn` 只在有实质性风险时填写，不得强行填写

**Token 设置：**
- `maxTokens: 800`（deepseek-v4-flash，thinking=high）
- 超时：45秒（上下文小，比现有 55s 更紧）

---

### 4. 新闻标签分类系统

**固定分类（DS 必须选其一）：**

| 标签 | 含义 | 邮件显示颜色 |
|------|------|------|
| 模型发布 | 新 AI 模型/版本发布 | 蓝色 `#3B82F6` |
| 产品更新 | 现有产品功能更新 | 绿色 `#10B981` |
| 开源发布 | 开源项目/代码发布 | 紫色 `#8B5CF6` |
| 研究突破 | 论文/研究成果 | 靛蓝 `#6366F1` |
| 安全漏洞 | 安全问题/漏洞披露 | 红色 `#EF4444` |
| 行业动态 | 商业/行业新闻 | 灰色 `#6B7280` |
| 工具发布 | 开发者工具/框架发布 | 橙色 `#F59E0B` |

**校验逻辑：** 若 DS 返回的 tag 不在上述列表中，自动降级为 `行业动态`，不报错。

---

### 5. 邮件 HTML 改进

**新闻卡片（改动）：**
- 每张新闻卡片右上角显示彩色标签徽章（对应分类颜色）
- 摘要区域展示 DS 生成的 `summary_cn`（逐条独立，非拼合）
- `安全漏洞` 标签自动附加 ⚠️ 图标，其他标签不加警告图标

**项目卡片（改动）：**
- 若该项目 DS 调用失败，降级为自动摘要，卡片底部显示小字灰色注释"（摘要自动生成）"
- 正常情况不显示此注释

**整体排版（不变）：** hero / news / bridge / projects / footer 结构保留，不做结构性重排。

---

### 6. 可靠性改进

- **Per-repo 响应校验：** `positioning_cn` 为空字符串时视为失败，触发降级
- **risk_cn 幻觉过滤：** 非空但少于 10 字符的 `risk_cn` 视为无效，置为空字符串
- **Tag 校验：** 不在分类表中的 tag 值自动替换为 `行业动态`
- **降级透明化：** 失败项目在 KV `LAST_RESULT_KEY` 中记录原因（已有机制），邮件内加小字标注

---

### 7. 不在本次范围内的变更

- 数据源（GitHub Trending / Juya RSS / 官方 Feed）：不变
- 整体邮件结构（5个区块）：不变
- Cron 时间、收件人配置：不变
- KV 状态管理逻辑：不变
- `filterRepeatedProjects` / 排名算法：不变

---

## 新增函数清单

| 函数 | 作用 |
|------|------|
| `createConcurrencyLimiter(max)` | 信号量，控制最大并发数 |
| `callDeepSeekSingleRepo(env, repo, newsContext)` | 单项目 DS 调用，返回 `{positioning_cn, risk_cn}` |
| `callDeepSeekAllRepos(env, repos, newsContext)` | 并行调度所有项目调用，返回 `Map<fullName, result>` |
| `validateRepoSummary(result)` | 校验单项目 DS 响应，过滤空值/幻觉 |
| `renderNewsTag(tag)` | 返回 tag 对应的 HTML 徽章字符串 |
| `getTagColor(tag)` | 返回 tag 颜色值 |

## 修改函数清单

| 函数 | 变更内容 |
|------|------|
| `buildProjectSummaries()` | 替换为调用 `callDeepSeekAllRepos()` |
| `callDeepSeekOverview()` | 扩展输出 schema，增加 `summary_cn` / `tag` 字段 |
| `buildOverviewPrompt()` | 增加 tag 分类表和逐条摘要指令 |
| `renderNewsCard()` | 增加标签徽章渲染 |
| `buildHtmlEmail()` | 增加降级项目注释渲染 |
| `normalizeOverviewDigest()` | 增加 `summary_cn` / `tag` 字段处理 |
