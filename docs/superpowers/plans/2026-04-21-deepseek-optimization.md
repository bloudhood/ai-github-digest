# DeepSeek 优化与体验提升 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用并行单项 DS 调用彻底消除项目描述串扰，并引入 DS 驱动的新闻标签分类系统，提升邮件内容质量。

**Architecture:** 将现有批量项目摘要（5个/批）替换为并发单项调用（每个 repo 1次 DS 调用，最多 5 个并发），同时扩展 overview 调用的 schema 使每条新闻拥有独立 DS 摘要和从固定分类表中选取的标签。

**Tech Stack:** Cloudflare Worker（单文件 `index.js`，~3900 行），DeepSeek API（`deepseek-v4-pro` + `thinking=max` 用于 overview，`deepseek-v4-flash` + `thinking=high` 用于 per-repo 调用），`wrangler deploy` 部署。

---

## 文件变更范围

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `index.js` | 修改 | 唯一需要改动的文件，所有逻辑都在此 |

---

### Task 1: 添加常量和标签分类表

**Files:**
- Modify: `index.js:11-12`（常量块）

- [ ] **Step 1: 在常量块（`DEFAULT_PROJECT_SUMMARY_BATCH_SIZE` 所在行附近）添加三个新常量**

在 `index.js` 第 11 行 `DEFAULT_PROJECT_SUMMARY_BATCH_SIZE` 的**下方**插入：

```js
const PER_REPO_SUMMARY_CONCURRENCY = 5;
const NEWS_TAG_TAXONOMY = ["模型发布", "产品更新", "开源发布", "研究突破", "安全漏洞", "行业动态", "工具发布"];
```

操作：用 Edit 工具将：
```js
const DEFAULT_PROJECT_SUMMARY_BATCH_SIZE = 5;
```
替换为：
```js
const DEFAULT_PROJECT_SUMMARY_BATCH_SIZE = 5;
const PER_REPO_SUMMARY_CONCURRENCY = 5;
const NEWS_TAG_TAXONOMY = ["模型发布", "产品更新", "开源发布", "研究突破", "安全漏洞", "行业动态", "工具发布"];
```

- [ ] **Step 2: 验证常量出现在文件顶部**

```bash
grep -n "PER_REPO_SUMMARY_CONCURRENCY\|NEWS_TAG_TAXONOMY" index.js
```
预期输出：两行，行号均在 15 以内。

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add PER_REPO_SUMMARY_CONCURRENCY and NEWS_TAG_TAXONOMY constants"
```

---

### Task 2: 添加 `createConcurrencyLimiter`、`validateNewsTag`、`getTagStyle`、`renderNewsTagBadge`

**Files:**
- Modify: `index.js`（在 `buildDeepSeekAttempts` 函数附近，约 3202 行后）

- [ ] **Step 1: 在 `buildDeepSeekAttempts` 函数之前插入四个新函数**

用 Edit 工具将：
```js
function buildDeepSeekAttempts(requestedModel) {
```
替换为：
```js
function createConcurrencyLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (!queue.length || active >= max) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active -= 1; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

function validateNewsTag(tag) {
  const cleaned = sanitizeLine(tag || "");
  return NEWS_TAG_TAXONOMY.includes(cleaned) ? cleaned : "行业动态";
}

function getTagStyle(tag) {
  const styles = {
    "模型发布": { bg: "#dbeafe", color: "#1d4ed8" },
    "产品更新": { bg: "#d1fae5", color: "#065f46" },
    "开源发布": { bg: "#ede9fe", color: "#5b21b6" },
    "研究突破": { bg: "#e0e7ff", color: "#3730a3" },
    "安全漏洞": { bg: "#fee2e2", color: "#991b1b" },
    "行业动态": { bg: "#f3f4f6", color: "#374151" },
    "工具发布": { bg: "#ffedd5", color: "#9a3412" },
  };
  return styles[tag] || styles["行业动态"];
}

function renderNewsTagBadge(tag) {
  const validated = validateNewsTag(tag);
  const { bg, color } = getTagStyle(validated);
  return `<div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:800;margin-bottom:10px;">${escapeHtml(validated)}</div>`;
}

function buildDeepSeekAttempts(requestedModel) {
```

- [ ] **Step 2: 验证四个函数存在**

```bash
grep -n "createConcurrencyLimiter\|validateNewsTag\|getTagStyle\|renderNewsTagBadge" index.js
```
预期：每个函数名出现 1 次（定义处）。

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add concurrency limiter, news tag validator and badge renderer"
```

---

### Task 3: 添加 `callDeepSeekSingleRepo` 和 `summarizeProjectDigestsParallel`

**Files:**
- Modify: `index.js`（在 `summarizeProjectBatch` 函数之后，约 2256 行后）

- [ ] **Step 1: 在 `summarizeProjectBatch` 函数结束后（`callDeepSeekJson` 函数之前）插入两个新函数**

用 Edit 工具将：
```js
async function callDeepSeekJson(env, options) {
```
替换为：
```js
async function callDeepSeekSingleRepo(env, repo, newsHint) {
  const newsTitles = newsHint
    ? [
        ...(Array.isArray(newsHint.entries) ? newsHint.entries.map((e) => sanitizeLine(e.title || "")).filter(Boolean) : []),
        ...(Array.isArray(newsHint.official_updates) ? newsHint.official_updates.map((e) => sanitizeLine(e.title || "")).filter(Boolean) : []),
      ].slice(0, 10)
    : [];

  const repoInput = {
    full_name: repo.full_name,
    description: repo.description || "",
    language: repo.language || "",
    stars: repo.stars,
    star_delta_24h: repo.star_delta_24h,
    forks: repo.forks,
    created_at: repo.created_at,
    pushed_at: repo.pushed_at,
    homepage: repo.homepage || "",
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    has_recent_release: Boolean(repo.has_recent_release),
    release_name: repo.recent_release && repo.recent_release.name ? repo.recent_release.name : "",
    selection_context: buildRepositorySelectionContext(repo),
    risk_hints: inferProjectRisk(repo),
    readme_excerpt: String(repo.readme_excerpt || "").slice(0, PROJECT_SUMMARY_README_LIMIT),
  };

  try {
    const data = await callDeepSeekJson(env, {
      modelOverride: "deepseek-v4-flash",
      maxTokens: 800,
      payload: { repository: repoInput, news_titles: newsTitles },
      systemLines: [
        "You generate a Chinese summary for a single GitHub repository for an email digest.",
        "Return JSON only.",
        "You are summarizing ONLY the one repository provided. Do not reference or mix content from any other repository.",
        "Do not invent facts beyond the provided repository metadata and README excerpt.",
        "positioning_cn: 2-3 sentences in Chinese. First sentence: what the project concretely does. Second sentence: why it is interesting right now or who should use it.",
        "Avoid openers such as 这是一个 or 该项目是一个; start directly from the category or capability.",
        "risk_cn: one sentence about a concrete legal, dependency, integrity, or security risk. Empty string if no real risk exists.",
        "Do not invent risks. If risk_hints is empty or generic, keep risk_cn as empty string.",
        "Do not use emoji in any field.",
        "Never leak internal phrases like selection context, momentum score, or ranking reasons.",
        'Output schema: { "positioning_cn": string, "risk_cn": string }',
      ],
    });
    return normalizeProjectSummaryItem(repo, data);
  } catch (error) {
    return buildFallbackProjectSummary(repo, `single-repo-error: ${formatError(error)}`);
  }
}

async function summarizeProjectDigestsParallel(env, payload) {
  const repositories = Array.isArray(payload.repositories) ? payload.repositories : [];
  if (!repositories.length) {
    return { projects: [], batch_count: 0, fallback_count: 0, missing_projects: [], fallback_reasons: [] };
  }

  const newsHint = buildProjectSummaryNewsHint(payload.news);
  const limit = createConcurrencyLimiter(PER_REPO_SUMMARY_CONCURRENCY);

  const results = await Promise.allSettled(
    repositories.map((repo) => limit(() => callDeepSeekSingleRepo(env, repo, newsHint))),
  );

  const projects = [];
  let fallbackCount = 0;
  const missingProjects = [];
  const fallbackReasons = [];

  results.forEach((result, index) => {
    const repo = repositories[index];
    if (result.status === "fulfilled") {
      const item = result.value;
      if (item.__fallback) {
        fallbackCount += 1;
        missingProjects.push(repo.full_name);
        if (item.__fallback_reason) {
          fallbackReasons.push(`${repo.full_name}: ${item.__fallback_reason}`);
        }
      }
      projects.push(stripProjectSummaryDebug(item));
    } else {
      fallbackCount += 1;
      missingProjects.push(repo.full_name);
      const reason = `call-rejected: ${formatError(result.reason)}`;
      fallbackReasons.push(`${repo.full_name}: ${reason}`);
      projects.push(stripProjectSummaryDebug(buildFallbackProjectSummary(repo, reason)));
    }
  });

  return {
    projects,
    batch_count: repositories.length,
    fallback_count: fallbackCount,
    missing_projects: Array.from(new Set(missingProjects)),
    fallback_reasons: Array.from(new Set(fallbackReasons)).slice(0, 12),
  };
}

async function callDeepSeekJson(env, options) {
```

- [ ] **Step 2: 验证两个函数存在**

```bash
grep -n "callDeepSeekSingleRepo\|summarizeProjectDigestsParallel" index.js
```
预期：每个函数名出现 2 次（定义 + 调用占位）。

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add callDeepSeekSingleRepo and summarizeProjectDigestsParallel"
```

---

### Task 4: 将 `summarizeDigest` 切换为并行版本

**Files:**
- Modify: `index.js:2043`

- [ ] **Step 1: 在 `summarizeDigest` 函数中将 `summarizeProjectDigests` 改为 `summarizeProjectDigestsParallel`**

用 Edit 工具将：
```js
  const projectDigest = await summarizeProjectDigests(env, payload);
```
替换为：
```js
  const projectDigest = await summarizeProjectDigestsParallel(env, payload);
```

- [ ] **Step 2: 验证切换生效**

```bash
grep -n "summarizeProjectDigests" index.js
```
预期：`summarizeDigest` 函数体内引用的是 `summarizeProjectDigestsParallel`，旧的 `summarizeProjectDigests` 定义仍然存在（稍后可选删除），但不再被调用。

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: switch summarizeDigest to parallel per-repo DS calls"
```

---

### Task 5: 扩展 Overview DS 调用的 prompt 和 schema

**Files:**
- Modify: `index.js:2063-2118`（`summarizeDigestOverview` 函数）

- [ ] **Step 1: 更新 `summarizeDigestOverview` 中的 maxTokens 和 systemLines**

用 Edit 工具将：
```js
    const data = await callDeepSeekJson(env, {
      modelOverride: getDigestOverviewModel(env),
      maxTokens: 3500,
      payload: {
        reportDate: payload.reportDate,
        timezone: payload.timezone,
        trigger: payload.trigger,
        repositories: buildOverviewRepositoryInputs(payload.repositories),
        news: compactNewsForOverview(payload.news),
        news_status: payload.news_status,
      },
      systemLines: [
        "You generate a Chinese GitHub daily digest overview.",
        "Return JSON only.",
        "Do not invent facts beyond the provided repository metadata and news items.",
        "Write concise, readable Chinese for email.",
        "Focus on practical signal instead of hype.",
        "Do not output scoring numbers, internal system fields, timestamps, or debugging reasons.",
        "Produce one clear subject line, one opening sentence, one bridge sentence, and one overall summary.",
        "When news.entries are provided, cover ALL provided entries in news_section.items_cn — do not skip or truncate any entry.",
        "bridge_cn must be grounded in today's Juya news entries and selected repositories, and should explicitly explain the shared theme in one sentence.",
        "Each news item needs a title and one-sentence signal.",
        "When content_excerpt and entries are rich, preserve Juya's concrete detail instead of over-compressing into generic summaries.",
        "Do not repeat the same news item twice with different wording.",
        "Do not use emoji inside opening, bridge, overall summary, or news signals.",
        "Never leak system phrases like selection context, momentum score, authenticity score, or ranking reasons.",
        "Output schema:",
        "{",
        '  "email_subject": string,',
        '  "opening_cn": string,',
        '  "bridge_cn": string,',
        '  "overall_summary": string,',
        '  "news_section": {',
        '    "items_cn": [',
        "      {",
        '        "title": string,',
        '        "signal_cn": string',
        "      }",
        "    ]",
        "  } | null",
        "}",
      ],
    });
```
替换为：
```js
    const data = await callDeepSeekJson(env, {
      modelOverride: getDigestOverviewModel(env),
      maxTokens: 4000,
      payload: {
        reportDate: payload.reportDate,
        timezone: payload.timezone,
        trigger: payload.trigger,
        repositories: buildOverviewRepositoryInputs(payload.repositories),
        news: compactNewsForOverview(payload.news),
        news_status: payload.news_status,
      },
      systemLines: [
        "You generate a Chinese GitHub daily digest overview.",
        "Return JSON only.",
        "Do not invent facts beyond the provided repository metadata and news items.",
        "Write concise, readable Chinese for email.",
        "Focus on practical signal instead of hype.",
        "Do not output scoring numbers, internal system fields, timestamps, or debugging reasons.",
        "Produce one clear subject line, one opening sentence, one bridge sentence, and one overall summary.",
        "When news.entries are provided, cover ALL provided entries in news_section.items_cn — do not skip or truncate any entry.",
        "bridge_cn must be grounded in today's Juya news entries and selected repositories, and should explicitly explain the shared theme in one sentence.",
        "For each news item, write an individual summary_cn of 2-3 sentences covering ONLY that item. Do not mix or combine content from different entries.",
        "For each news item, assign exactly one tag from this list: 模型发布, 产品更新, 开源发布, 研究突破, 安全漏洞, 行业动态, 工具发布.",
        "Tag definitions — 模型发布: new AI model or version released; 产品更新: existing product feature update; 开源发布: open source code or project released; 研究突破: paper or research result; 安全漏洞: security breach or vulnerability disclosure; 行业动态: business or industry news; 工具发布: new developer tool or framework.",
        "When content_excerpt and entries are rich, preserve Juya's concrete detail instead of over-compressing into generic summaries.",
        "Do not repeat the same news item twice with different wording.",
        "Do not use emoji inside opening, bridge, overall summary, or news summaries.",
        "Never leak system phrases like selection context, momentum score, authenticity score, or ranking reasons.",
        "Output schema:",
        "{",
        '  "email_subject": string,',
        '  "opening_cn": string,',
        '  "bridge_cn": string,',
        '  "overall_summary": string,',
        '  "news_section": {',
        '    "items_cn": [',
        "      {",
        '        "title": string,',
        '        "summary_cn": string,',
        '        "tag": string',
        "      }",
        "    ]",
        "  } | null",
        "}",
      ],
    });
```

- [ ] **Step 2: 验证 schema 更新**

```bash
grep -n "summary_cn\|\"tag\"" index.js | head -10
```
预期：schema 定义中出现 `summary_cn` 和 `"tag": string`。

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: extend overview DS schema with per-item summary_cn and tag fields"
```

---

### Task 6: 更新 `normalizeOverviewDigest` 处理新字段

**Files:**
- Modify: `index.js:2283-2308`

- [ ] **Step 1: 更新 `normalizeOverviewDigest` 使其处理 `summary_cn` 和 `tag`**

用 Edit 工具将：
```js
function normalizeOverviewDigest(raw, fallback) {
  const rawItems = raw && raw.news_section && Array.isArray(raw.news_section.items_cn)
    ? raw.news_section.items_cn
    : [];
  const newsItems = rawItems
    .map((item) => ({
      title: sanitizeLine(item && item.title ? item.title : ""),
      signal_cn: sanitizeLine(item && item.signal_cn ? item.signal_cn : ""),
    }))
    .filter((item) => item.title && item.signal_cn);
  const usedFallback = !sanitizeLine(raw && raw.email_subject ? raw.email_subject : "")
    || !sanitizeLine(raw && raw.opening_cn ? raw.opening_cn : "")
    || !sanitizeParagraph(raw && raw.bridge_cn ? raw.bridge_cn : "")
    || !sanitizeParagraph(raw && raw.overall_summary ? raw.overall_summary : "");

  return {
    email_subject: sanitizeLine(raw && raw.email_subject ? raw.email_subject : "") || fallback.email_subject,
    opening_cn: sanitizeLine(raw && raw.opening_cn ? raw.opening_cn : "") || fallback.opening_cn,
    bridge_cn: sanitizeParagraph(raw && raw.bridge_cn ? raw.bridge_cn : "") || fallback.bridge_cn,
    overall_summary: sanitizeParagraph(raw && raw.overall_summary ? raw.overall_summary : "") || fallback.overall_summary,
    news_section: {
      items_cn: newsItems.length ? newsItems : fallback.news_section.items_cn,
    },
    __fallback: usedFallback,
  };
}
```
替换为：
```js
function normalizeOverviewDigest(raw, fallback) {
  const rawItems = raw && raw.news_section && Array.isArray(raw.news_section.items_cn)
    ? raw.news_section.items_cn
    : [];
  const newsItems = rawItems
    .map((item) => ({
      title: sanitizeLine(item && item.title ? item.title : ""),
      summary_cn: sanitizeParagraph(item && item.summary_cn ? item.summary_cn : ""),
      tag: validateNewsTag(item && item.tag ? item.tag : ""),
    }))
    .filter((item) => item.title && item.summary_cn);
  const usedFallback = !sanitizeLine(raw && raw.email_subject ? raw.email_subject : "")
    || !sanitizeLine(raw && raw.opening_cn ? raw.opening_cn : "")
    || !sanitizeParagraph(raw && raw.bridge_cn ? raw.bridge_cn : "")
    || !sanitizeParagraph(raw && raw.overall_summary ? raw.overall_summary : "");

  return {
    email_subject: sanitizeLine(raw && raw.email_subject ? raw.email_subject : "") || fallback.email_subject,
    opening_cn: sanitizeLine(raw && raw.opening_cn ? raw.opening_cn : "") || fallback.opening_cn,
    bridge_cn: sanitizeParagraph(raw && raw.bridge_cn ? raw.bridge_cn : "") || fallback.bridge_cn,
    overall_summary: sanitizeParagraph(raw && raw.overall_summary ? raw.overall_summary : "") || fallback.overall_summary,
    news_section: {
      items_cn: newsItems.length ? newsItems : fallback.news_section.items_cn,
    },
    __fallback: usedFallback,
  };
}
```

- [ ] **Step 2: 验证**

```bash
grep -n "summary_cn\|validateNewsTag" index.js | head -10
```
预期：`normalizeOverviewDigest` 函数内出现 `summary_cn` 和 `validateNewsTag`。

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: normalize overview digest items to summary_cn and validated tag"
```

---

### Task 7: 更新 `collectRenderableNewsItems` 传递 `summary_cn` 和 `tag`

**Files:**
- Modify: `index.js:3321-3363`

- [ ] **Step 1: 更新 `collectRenderableNewsItems` 使用新字段**

用 Edit 工具将：
```js
  const aiItems = aiNews && Array.isArray(aiNews.items_cn) ? aiNews.items_cn : [];
  aiItems.forEach((item) => {
    const title = sanitizeLine(item && item.title ? item.title : "");
    const signal = sanitizeLine(item && item.signal_cn ? item.signal_cn : "");
    if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
      return;
    }
    seenTitles.push(title);
    const matchedRaw = findMatchingRawEntry(rawEntries, title);
    items.push({
      title,
      signal_cn: signal || "详见原文",
      link: matchedRaw && matchedRaw.link ? matchedRaw.link : "",
      image_url: matchedRaw && matchedRaw.image_url ? matchedRaw.image_url : "",
      image_urls: matchedRaw && Array.isArray(matchedRaw.image_urls) ? matchedRaw.image_urls : [],
      source_links: matchedRaw && Array.isArray(matchedRaw.source_links) ? matchedRaw.source_links : [],
    });
  });

  rawEntries.forEach((entry) => {
    const title = sanitizeLine(entry && entry.title ? entry.title : "");
    const signal = sanitizeLine(entry && entry.summary ? entry.summary : "");
    if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
      return;
    }
    seenTitles.push(title);
    items.push({
      title,
      signal_cn: signal || "详见原文",
      link: entry.link || "",
      image_url: entry.image_url || "",
      image_urls: Array.isArray(entry.image_urls) ? entry.image_urls : [],
      source_links: Array.isArray(entry.source_links) ? entry.source_links : [],
    });
  });
```
替换为：
```js
  const aiItems = aiNews && Array.isArray(aiNews.items_cn) ? aiNews.items_cn : [];
  aiItems.forEach((item) => {
    const title = sanitizeLine(item && item.title ? item.title : "");
    const summary = sanitizeParagraph(item && item.summary_cn ? item.summary_cn : "");
    const tag = validateNewsTag(item && item.tag ? item.tag : "");
    if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
      return;
    }
    seenTitles.push(title);
    const matchedRaw = findMatchingRawEntry(rawEntries, title);
    items.push({
      title,
      summary_cn: summary || "详见原文",
      tag,
      link: matchedRaw && matchedRaw.link ? matchedRaw.link : "",
      image_url: matchedRaw && matchedRaw.image_url ? matchedRaw.image_url : "",
      image_urls: matchedRaw && Array.isArray(matchedRaw.image_urls) ? matchedRaw.image_urls : [],
      source_links: matchedRaw && Array.isArray(matchedRaw.source_links) ? matchedRaw.source_links : [],
    });
  });

  rawEntries.forEach((entry) => {
    const title = sanitizeLine(entry && entry.title ? entry.title : "");
    const summary = sanitizeLine(entry && entry.summary ? entry.summary : "");
    if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
      return;
    }
    seenTitles.push(title);
    items.push({
      title,
      summary_cn: summary || "详见原文",
      tag: "行业动态",
      link: entry.link || "",
      image_url: entry.image_url || "",
      image_urls: Array.isArray(entry.image_urls) ? entry.image_urls : [],
      source_links: Array.isArray(entry.source_links) ? entry.source_links : [],
    });
  });
```

- [ ] **Step 2: Commit**

```bash
git add index.js
git commit -m "feat: propagate summary_cn and tag through collectRenderableNewsItems"
```

---

### Task 8: 更新 `buildHtmlNewsCards` 和 `renderNewsCard` 渲染标签徽章

**Files:**
- Modify: `index.js:2848-2884`（`buildHtmlNewsCards`）
- Modify: `index.js:2819-2834`（`renderNewsCard`）

- [ ] **Step 1: 更新 `buildHtmlNewsCards` 使用 `summary_cn` 和 `tag`**

用 Edit 工具将：
```js
function buildHtmlNewsCards(rawEntries, aiItems) {
  const signalMap = new Map();
  (aiItems || []).forEach((item) => {
    const key = canonicalNewsKey(item.title);
    if (key && !signalMap.has(key)) {
      signalMap.set(key, sanitizeLine(item.signal_cn || ""));
    }
  });

  const cards = [];
  const seen = [];

  (rawEntries || []).forEach((entry) => {
    const title = sanitizeLine(entry && entry.title ? entry.title : "");
    if (!title || hasEquivalentNewsTitle(seen, title)) {
      return;
    }
    seen.push(title);
    const key = canonicalNewsKey(title);
    cards.push(renderNewsCard({
      title,
      signal_cn: signalMap.get(key) || sanitizeLine(entry.summary || "详见原文"),
      link: entry.link || "",
      image_url: entry.image_url || "",
      image_urls: Array.isArray(entry.image_urls) ? entry.image_urls : [],
      source_links: Array.isArray(entry.source_links) ? entry.source_links : [],
    }));
  });

  if (!cards.length) {
    (aiItems || []).forEach((item) => {
      cards.push(renderNewsCard(item));
    });
  }

  return cards.join("");
}
```
替换为：
```js
function buildHtmlNewsCards(rawEntries, aiItems) {
  const summaryMap = new Map();
  const tagMap = new Map();
  (aiItems || []).forEach((item) => {
    const key = canonicalNewsKey(item.title);
    if (key && !summaryMap.has(key)) {
      summaryMap.set(key, sanitizeParagraph(item.summary_cn || ""));
      tagMap.set(key, validateNewsTag(item.tag || ""));
    }
  });

  const cards = [];
  const seen = [];

  (rawEntries || []).forEach((entry) => {
    const title = sanitizeLine(entry && entry.title ? entry.title : "");
    if (!title || hasEquivalentNewsTitle(seen, title)) {
      return;
    }
    seen.push(title);
    const key = canonicalNewsKey(title);
    cards.push(renderNewsCard({
      title,
      summary_cn: summaryMap.get(key) || sanitizeLine(entry.summary || "详见原文"),
      tag: tagMap.get(key) || "行业动态",
      link: entry.link || "",
      image_url: entry.image_url || "",
      image_urls: Array.isArray(entry.image_urls) ? entry.image_urls : [],
      source_links: Array.isArray(entry.source_links) ? entry.source_links : [],
    }));
  });

  if (!cards.length) {
    (aiItems || []).forEach((item) => {
      cards.push(renderNewsCard(item));
    });
  }

  return cards.join("");
}
```

- [ ] **Step 2: 更新 `renderNewsCard` 使用标签徽章和 `summary_cn`**

用 Edit 工具将：
```js
function renderNewsCard(item) {
  const imageHtml = renderNewsImages(item);
  const sourceLabel = getPrimarySourceLabel(item);

  return [
    `<div style="${cardStyle({ padding: item.image_url ? "0 0 16px 0" : "18px" })}">`,
    imageHtml,
    `<div style="${item.image_url ? "padding:16px 18px 0 18px;" : ""}">`,
    `<div style="${newsChipStyle(item.title, item.signal_cn)}">${escapeHtml(getNewsEmoji(item.title, item.signal_cn))} ${escapeHtml(getNewsCategoryLabel(item.title, item.signal_cn))}</div>`,
    `<div style="${cardTitleStyle()}">${escapeHtml(item.title)}</div>`,
    `<div style="${paragraphStyle()}">${escapeHtml(item.signal_cn || "详见原文")}</div>`,
    `<div style="margin-top:12px;">${item.link ? `<a href="${escapeAttribute(item.link)}" style="${buttonStyle("#111827", "#ffffff")}">查看条目</a>` : ""}<span style="${sourceBadgeStyle()}">来源：${escapeHtml(sourceLabel)}</span></div>`,
    "</div>",
    "</div>",
  ].join("");
}
```
替换为：
```js
function renderNewsCard(item) {
  const imageHtml = renderNewsImages(item);
  const sourceLabel = getPrimarySourceLabel(item);

  return [
    `<div style="${cardStyle({ padding: item.image_url ? "0 0 16px 0" : "18px" })}">`,
    imageHtml,
    `<div style="${item.image_url ? "padding:16px 18px 0 18px;" : ""}">`,
    renderNewsTagBadge(item.tag || "行业动态"),
    `<div style="${cardTitleStyle()}">${escapeHtml(item.title)}</div>`,
    `<div style="${paragraphStyle()}">${escapeHtml(item.summary_cn || "详见原文")}</div>`,
    `<div style="margin-top:12px;">${item.link ? `<a href="${escapeAttribute(item.link)}" style="${buttonStyle("#111827", "#ffffff")}">查看条目</a>` : ""}<span style="${sourceBadgeStyle()}">来源：${escapeHtml(sourceLabel)}</span></div>`,
    "</div>",
    "</div>",
  ].join("");
}
```

- [ ] **Step 3: 验证**

```bash
grep -n "summaryMap\|tagMap\|renderNewsTagBadge\|summary_cn" index.js | grep -v "^Binary" | head -20
```
预期：`buildHtmlNewsCards` 和 `renderNewsCard` 中均出现新字段引用。

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "feat: render DS-assigned tag badges and per-item summary in news cards"
```

---

### Task 9: 更新文字版邮件正文使用 `summary_cn`

**Files:**
- Modify: `index.js:2664-2671`（`buildEmailPayload` 文字版新闻渲染）

- [ ] **Step 1: 更新文字版新闻渲染**

用 Edit 工具将：
```js
    if (newsItems.length) {
      newsItems.forEach((item) => {
        lines.push(`- ${renderNewsTitle(item.title, item.signal_cn)}`);
        lines.push(`  ${sanitizeLine(item.signal_cn)}`);
      });
    } else {
      lines.push(`- ${sanitizeLine(aiNews && aiNews.summary_cn ? aiNews.summary_cn : input.news.freshNews.description || "详见原文")}`);
    }
```
替换为：
```js
    if (newsItems.length) {
      newsItems.forEach((item) => {
        lines.push(`- [${item.tag || "行业动态"}] ${sanitizeLine(item.title)}`);
        lines.push(`  ${sanitizeLine(item.summary_cn)}`);
      });
    } else {
      lines.push(`- ${sanitizeLine(input.news.freshNews.description || "详见原文")}`);
    }
```

- [ ] **Step 2: Commit**

```bash
git add index.js
git commit -m "feat: use summary_cn and tag in plain text email body"
```

---

### Task 10: 在项目卡片中显示降级指示

**Files:**
- Modify: `index.js:2903-2920`（`renderProjectCard`）

- [ ] **Step 1: 在 `renderProjectCard` 中为降级项目添加小字标注**

用 Edit 工具将：
```js
function renderProjectCard(repo, ai, index, riskText) {
  const fallbackAi = buildFallbackProjectSummary(repo);
  const riskHtml = riskText
    ? `<div style="margin-top:12px;padding:12px 14px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:14px;line-height:1.6;">⚠️ ${escapeHtml(riskText)}</div>`
    : "";
  const signalLine = buildProjectSignalLine(repo);

  return [
    `<div style="${cardStyle()}">`,
    `<div style="${cardTitleStyle()}">${index + 1}. ${escapeHtml(repo.full_name)}</div>`,
    `<div style="${metaRowStyle()}">${escapeHtml(renderLanguageLabel(repo.language))} <span style="margin-left:10px;">⭐ ${escapeHtml(formatCompactNumber(repo.stars))}</span> <span style="margin-left:10px;">📈 +${escapeHtml(String(repo.star_delta_24h))}</span></div>`,
    `<div style="${paragraphStyle()}">${escapeHtml(sanitizeParagraph(ai.positioning_cn || fallbackAi.positioning_cn))}</div>`,
    `<div style="${metaRowStyle()}">今日信号：${escapeHtml(signalLine)}</div>`,
    riskHtml,
    `<div style="margin-top:14px;"><a href="${escapeAttribute(repo.html_url)}" style="${buttonStyle("#111827", "#ffffff")}">打开 GitHub</a></div>`,
    "</div>",
  ].join("");
}
```
替换为：
```js
function renderProjectCard(repo, ai, index, riskText) {
  const fallbackAi = buildFallbackProjectSummary(repo);
  const isFallback = Boolean(ai && ai.__fallback);
  const riskHtml = riskText
    ? `<div style="margin-top:12px;padding:12px 14px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:14px;line-height:1.6;">⚠️ ${escapeHtml(riskText)}</div>`
    : "";
  const fallbackNote = isFallback
    ? `<div style="margin-top:6px;font-size:11px;color:#9ca3af;">（摘要自动生成）</div>`
    : "";
  const signalLine = buildProjectSignalLine(repo);

  return [
    `<div style="${cardStyle()}">`,
    `<div style="${cardTitleStyle()}">${index + 1}. ${escapeHtml(repo.full_name)}</div>`,
    `<div style="${metaRowStyle()}">${escapeHtml(renderLanguageLabel(repo.language))} <span style="margin-left:10px;">⭐ ${escapeHtml(formatCompactNumber(repo.stars))}</span> <span style="margin-left:10px;">📈 +${escapeHtml(String(repo.star_delta_24h))}</span></div>`,
    `<div style="${paragraphStyle()}">${escapeHtml(sanitizeParagraph(ai.positioning_cn || fallbackAi.positioning_cn))}</div>`,
    fallbackNote,
    `<div style="${metaRowStyle()}">今日信号：${escapeHtml(signalLine)}</div>`,
    riskHtml,
    `<div style="margin-top:14px;"><a href="${escapeAttribute(repo.html_url)}" style="${buttonStyle("#111827", "#ffffff")}">打开 GitHub</a></div>`,
    "</div>",
  ].join("");
}
```

注意：`buildEmailPayload` 中的 `aiByRepo` map 是通过 `input.aiDigest.projects` 构建的，而 `__fallback` 字段在 `stripProjectSummaryDebug` 中被剥离（已有逻辑）。需确认：检查 `stripProjectSummaryDebug` 是否保留了 `__fallback`。

- [ ] **Step 2: 确认 `stripProjectSummaryDebug` 不保留 `__fallback`**

```bash
grep -n "stripProjectSummaryDebug" index.js
```
找到函数定义并读取其内容，确认 `__fallback` 是否在结果中。如果被剥离，则 `renderProjectCard` 中的 `ai.__fallback` 始终为 `undefined`（false），`fallbackNote` 永不显示——这是正常的，因为 `buildEmailPayload` 中的 `aiByRepo` 来自剥离后的 `projects`。

如果 `stripProjectSummaryDebug` 确实剥离了 `__fallback`，更新 `buildHtmlEmail` 中的 `renderProjectCard` 调用，传入 `fallback` 标志：

在 `buildHtmlEmail` 中：
```js
      const ai = aiByRepo.get(repo.full_name) || {};
      const fallbackAi = buildFallbackProjectSummary(repo);
      const riskText = extractRiskText(ai) || fallbackAi.risk_cn;
      return renderProjectCard(repo, ai, index, riskText);
```
改为：
```js
      const ai = aiByRepo.get(repo.full_name) || {};
      const isFallback = !ai.positioning_cn;
      const fallbackAi = buildFallbackProjectSummary(repo);
      const riskText = extractRiskText(ai) || fallbackAi.risk_cn;
      return renderProjectCard(repo, { ...ai, __fallback: isFallback }, index, riskText);
```

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: show fallback indicator on auto-generated project summaries"
```

---

### Task 11: 部署并验证

**Files:**
- 无代码变更，执行部署和测试

- [ ] **Step 1: 部署到 Cloudflare**

```bash
cd /path/to/ai-github-digest
NO_PROXY="*" HTTPS_PROXY="" HTTP_PROXY="" npx wrangler deploy
```
预期：输出 `Uploaded github-digest` 和新的 `Current Version ID`。

- [ ] **Step 2: 触发 dry-run 验证流程不崩溃**

```bash
NO_PROXY="*" HTTPS_PROXY="" HTTP_PROXY="" curl -s "https://digest.example.com/dry-run?secret=YOUR_RUN_SECRET" | head -c 500
```
预期：返回 JSON，包含 `"ok": true` 或 `"skipped"` 等字段，无 500 错误。

- [ ] **Step 3: 触发真实测试邮件**

```bash
NO_PROXY="*" HTTPS_PROXY="" HTTP_PROXY="" curl -s -o /dev/null -w "%{http_code}" "https://digest.example.com/run?secret=YOUR_RUN_SECRET"
```
预期：返回 `202`。等待 3-5 分钟后检查你的收件箱。

- [ ] **Step 4: 验证新闻卡片有彩色标签徽章**

打开收到的邮件，确认每张新闻卡片顶部有彩色标签（如"模型发布"蓝色、"安全漏洞"红色等），卡片正文为独立摘要（非揉合文本）。

- [ ] **Step 5: 验证项目描述无串扰**

确认每个项目的描述只描述该项目自身，无其他项目内容混入。

- [ ] **Step 6: 检查最后一次运行结果**

```bash
NO_PROXY="*" HTTPS_PROXY="" HTTP_PROXY="" curl -s "https://digest.example.com/last?secret=YOUR_RUN_SECRET" | python -m json.tool | grep -E "fallback_count|batch_count|missing_projects"
```
预期：`batch_count` 等于本次入选项目数（非批次数），`fallback_count` 应为 0 或较低。

---

## 自检

**Spec 覆盖：**
- ✅ 并行单项 DS 调用（Task 3, 4）
- ✅ 并发控制器（Task 2）
- ✅ DS 新闻标签分类（Task 5, 6）
- ✅ 每条新闻独立摘要（Task 5, 6, 7, 8）
- ✅ 彩色标签徽章渲染（Task 2, 8）
- ✅ 降级项目标注（Task 10）
- ✅ 文字版邮件同步更新（Task 9）
- ✅ 部署验证（Task 11）

**类型一致性：**
- `summary_cn` 字段在 Task 6（normalizeOverviewDigest）、Task 7（collectRenderableNewsItems）、Task 8（buildHtmlNewsCards/renderNewsCard）、Task 9（文字版）全部一致使用
- `tag` 字段在所有流转节点均通过 `validateNewsTag()` 校验，确保只有 taxonomy 内的值进入渲染

**无 placeholder。**
