import test from "node:test";
import assert from "node:assert/strict";

import {
  collectRenderableNewsItems,
  compactNewsForOverview,
  extractAihotPageImageUrls,
  integrateAihotItemsByTopic,
  mergeAihotItemsIntoNewsContext,
  normalizeAihotItemsForNews,
  orderRenderableNewsItemsBySourceAndPriority,
  parseAihotFeedItems,
  renderNewsCard,
  selectUnifiedNewsEntries,
} from "../index.js";

test("normalizes legacy AI HOT API items into the unified news entry shape", () => {
  const items = normalizeAihotItemsForNews([
    {
      id: "cmp1ervr50xjgsllhjgjk2b4c",
      title: " Claude平台在AWS全面上线 ",
      url: "https://x.com/claudeai/status/2053868592286822443",
      source: "X：Claude (@claudeai)",
      publishedAt: "2026-05-11T16:03:26.000Z",
      summary: "Claude平台现已在AWS全面上线。\n\nAWS客户可获得全套Claude API功能。",
      category: "ai-products",
    },
  ]);

  assert.deepEqual(items, [
    {
      title: "Claude平台在AWS全面上线",
      link: "https://x.com/claudeai/status/2053868592286822443",
      summary: "Claude平台现已在AWS全面上线。 AWS客户可获得全套Claude API功能。",
      section: "产品发布/更新",
      source: "X：Claude (@claudeai)",
      category: "ai-products",
      score: 0,
      source_group: "AIHOT",
      is_secondary: true,
      published_at: "2026-05-11T16:03:26.000Z",
      source_links: [
        {
          href: "https://x.com/claudeai/status/2053868592286822443",
          label: "X：Claude (@claudeai)",
        },
      ],
      aihot_permalink: null,
      aihot_can_enrich_image: false,
      image_url: "",
      image_urls: [],
      image_layout: "",
    },
  ]);
});

test("parses the current AI HOT RSS contract including original links and redistributable media", () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <title>Claude 发布新的代码迁移能力</title>
      <link>https://aihot.virxact.com/items/example-1</link>
      <description><![CDATA[Claude 发布迁移能力摘要。

🔗 阅读原文：https://www.anthropic.com/news/code-migration?utm_source=aihot

via AI HOT · https://aihot.virxact.com/items/example-1]]></description>
      <content:encoded><![CDATA[<p>允许再分发的正文。</p><img src="https://cdn.example.com/claude-migration.png" alt="">]]></content:encoded>
      <category>AI 产品</category>
      <pubDate>Sat, 18 Jul 2026 04:47:25 GMT</pubDate>
      <guid isPermaLink="false">example-1</guid>
      <author>noreply@aihot.virxact.com (Anthropic：官方博客)</author>
    </item>
  </channel>
</rss>`;

  const items = parseAihotFeedItems(rss);

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    id: "example-1",
    title: "Claude 发布新的代码迁移能力",
    url: "https://www.anthropic.com/news/code-migration?utm_source=aihot",
    permalink: "https://aihot.virxact.com/items/example-1",
    source: "Anthropic：官方博客",
    publishedAt: "Sat, 18 Jul 2026 04:47:25 GMT",
    summary: "Claude 发布迁移能力摘要。",
    category: "ai-products",
    section: "产品发布/更新",
    score: 0,
    content_html: '<p>允许再分发的正文。</p><img src="https://cdn.example.com/claude-migration.png" alt="">',
    redistributable_content: true,
    image_urls: ["https://cdn.example.com/claude-migration.png"],
  });

  const normalized = normalizeAihotItemsForNews(items)[0];
  assert.equal(normalized.link, "https://www.anthropic.com/news/code-migration?utm_source=aihot");
  assert.equal(normalized.aihot_permalink, "https://aihot.virxact.com/items/example-1");
  assert.equal(normalized.aihot_can_enrich_image, true);
  assert.equal(normalized.image_url, "https://cdn.example.com/claude-migration.png");
  assert.equal(normalized.image_layout, "full");
  assert.deepEqual(normalized.source_links.map((item) => item.label), ["Anthropic：官方博客", "AI HOT"]);
});

test("extracts durable content images from AI HOT proxy URLs and ignores avatars", () => {
  const html = `
    <img src="/api/img-proxy?u=https%3A%2F%2Fpbs.twimg.com%2Fprofile_images%2F1%2Favatar_normal.jpg&amp;mode=avatar&amp;exp=1&amp;sig=x">
    <img src="/api/img-proxy?u=https%3A%2F%2Fcdn.example.com%2Farticle%2Fhero.png&amp;exp=1784440800&amp;sig=y">
  `;

  assert.deepEqual(
    extractAihotPageImageUrls(html, "https://aihot.virxact.com/items/example-1"),
    ["https://cdn.example.com/article/hero.png"],
  );
});

test("merges AI HOT items into the existing AI news context without duplicate titles", () => {
  const juyaContext = {
    source: "橘鸦 AI 早报",
    status: "fresh",
    latest: null,
    freshNews: {
      title: "橘鸦日报",
      link: "https://example.com/juya",
      pubDate: "2026-05-11T00:00:00.000Z",
      description: "今日 AI 动态",
      content_text: "今日 AI 动态",
      entries: [
        {
          title: "Claude平台在AWS全面上线",
          link: "https://example.com/original",
          summary: "已有摘要",
          section: "产品发布/更新",
        },
      ],
    },
  };

  const merged = mergeAihotItemsIntoNewsContext(juyaContext, [
    {
      title: "Claude平台在AWS全面上线",
      link: "https://x.com/claudeai/status/2053868592286822443",
      summary: "重复标题不应插入",
      section: "产品发布/更新",
    },
    {
      title: "谷歌DeepMind推出开发者课程",
      link: "https://x.com/googleaidevs/status/2053868609747746897",
      summary: "新条目应补充进入同一新闻区。",
      section: "技巧与观点",
    },
  ]);

  assert.equal(merged.source, "橘鸦 AI 早报");
  assert.equal(merged.freshNews.title, "橘鸦日报");
  assert.deepEqual(
    merged.freshNews.entries.map((entry) => entry.title),
    ["Claude平台在AWS全面上线", "谷歌DeepMind推出开发者课程"],
  );
  assert.equal(merged.freshNews.entries[1].section, "技巧与观点");
  assert.equal(merged.aihot_status, "fused_and_merged");
  assert.equal(merged.aihot_updates.length, 1);
  assert.equal(merged.aihot_fused_count, 1);
  assert.equal(merged.aihot_inserted_count, 1);
  assert.equal(merged.freshNews.entries[0].aihot_fused, true);
});

test("fuses different headlines that point to the same underlying fact URL", () => {
  const juyaContext = {
    source: "橘鸦 AI 早报",
    status: "fresh",
    freshNews: {
      title: "橘鸦日报",
      link: "https://example.com/juya",
      content_text: "",
      entries: [
        {
          title: "OpenAI 公布每美元有用智能指标",
          link: "https://openai.com/index/useful-intelligence?utm_source=juya",
          summary: "指标更新。",
          section: "技术与洞察",
          source_links: [],
        },
      ],
    },
  };

  const merged = mergeAihotItemsIntoNewsContext(juyaContext, [
    {
      title: "AI 时代 ROI 新算法：衡量每美元可用智能",
      link: "https://openai.com/index/useful-intelligence",
      summary: "OpenAI 提议用每美元产生的有用智能衡量 AI 投资回报。",
      section: "技巧与观点",
      source: "OpenAI 官方",
      image_url: "https://cdn.example.com/roi.png",
      image_urls: ["https://cdn.example.com/roi.png"],
    },
  ]);

  assert.equal(merged.freshNews.entries.length, 1);
  assert.equal(merged.aihot_status, "fused");
  assert.equal(merged.aihot_fused_count, 1);
  assert.equal(merged.freshNews.entries[0].summary, "OpenAI 提议用每美元产生的有用智能衡量 AI 投资回报。");
  assert.equal(merged.freshNews.entries[0].image_url, "https://cdn.example.com/roi.png");
  assert.equal(merged.freshNews.entries[0].image_layout, "full");
});

test("places AI HOT additions inside matching topic groups instead of appending a source block", () => {
  const existing = [
    { title: "Juya 模型", section: "模型发布" },
    { title: "Juya 产品", section: "产品应用" },
    { title: "Juya 研究", section: "技术与洞察" },
    { title: "Juya 行业", section: "行业动态" },
  ];
  const additions = [
    { title: "AIHot 论文", section: "论文研究", source_group: "AIHOT", is_secondary: true },
    { title: "AIHot 模型", section: "模型发布/更新", source_group: "AIHOT", is_secondary: true },
  ];

  const integrated = integrateAihotItemsByTopic(existing, additions);

  assert.deepEqual(integrated.entries.map((item) => item.title), [
    "Juya 模型",
    "AIHot 模型",
    "Juya 产品",
    "Juya 研究",
    "AIHot 论文",
    "Juya 行业",
  ]);
  assert.equal(integrated.entries[1].section, "模型发布");
  assert.equal(integrated.entries[4].section, "技术与洞察");
});

test("keeps the fused order while applying independent Juya and AI HOT quotas", () => {
  const entries = [];
  for (let index = 0; index < 13; index += 1) {
    entries.push({ title: `Juya ${index + 1}`, section: "产品应用" });
    if (index < 5) {
      entries.push({
        title: `AIHot ${index + 1}`,
        section: "产品应用",
        source_group: "AIHOT",
        is_secondary: true,
        image_url: index % 2 === 0 ? `https://cdn.example.com/${index}.png` : "",
      });
    }
  }

  const selected = selectUnifiedNewsEntries(entries);

  assert.equal(selected.filter((item) => item.source_group === "AIHOT").length, 4);
  assert.equal(selected.filter((item) => item.source_group !== "AIHOT").length, 12);
  assert.deepEqual(selected.slice(0, 6).map((item) => item.title), [
    "Juya 1", "AIHot 1", "Juya 2", "AIHot 2", "Juya 3", "AIHot 3",
  ]);
});

test("renders AI HOT media as one full-width image without weakening text-only cards", () => {
  const withImage = renderNewsCard({
    title: "带图新闻",
    summary_cn: "摘要保持完整显示。",
    tag: "产品更新",
    link: "https://example.com/item",
    source: "AI HOT source",
    image_url: "https://cdn.example.com/hero.png",
    image_urls: ["https://cdn.example.com/hero.png", "https://cdn.example.com/extra.png"],
    image_layout: "full",
  });
  const withoutImage = renderNewsCard({
    title: "纯文本新闻",
    summary_cn: "没有图片时仍使用完整卡片宽度。",
    tag: "行业动态",
    link: "https://example.com/text",
    source: "AI HOT source",
    image_url: "",
    image_urls: [],
    image_layout: "",
  });

  assert.equal((withImage.match(/<img\b/g) || []).length, 1);
  assert.match(withImage, /width:100%;height:auto/);
  assert.doesNotMatch(withImage, /width="112" height="86"/);
  assert.doesNotMatch(withImage, /table-layout:fixed/);
  assert.match(withImage, /摘要保持完整显示/);
  assert.equal((withoutImage.match(/<img\b/g) || []).length, 0);
  assert.doesNotMatch(withoutImage, /table-layout:fixed/);
  assert.match(withoutImage, /没有图片时仍使用完整卡片宽度/);
});

test("keeps the full ranked AI HOT candidate pool for model curation", () => {
  const juyaContext = {
    source: "橘鸦 AI 早报",
    status: "fresh",
    latest: null,
    freshNews: {
      title: "橘鸦日报",
      link: "https://example.com/juya",
      pubDate: "2026-05-11T00:00:00.000Z",
      description: "今日 AI 动态",
      content_text: "今日 AI 动态",
      entries: [],
    },
  };

  const candidates = [
    ["low-x-tip", "技巧与观点", "X：Some Creator", 90, "快去试试一个视频转笔记教程"],
    ["cloudflare-agent", "产品发布/更新", "Cloudflare Blog", 62, "Cloudflare 为 AI 智能体推出临时账户"],
    ["deepmind-anthropic", "行业动态", "Google DeepMind Blog", 72, "AlphaFold 负责人加入 Anthropic"],
    ["openai-research", "论文研究", "OpenAI：Alignment 研究博客（RSS）", 64, "强化学习实现持久的有益模型行为"],
    ["github-security", "模型发布/更新", "GitHub Blog", 58, "GitHub 开源安全和 Copilot 模型更新"],
    ["misc-1", "行业动态", "X：Random", 40, "泛泛而谈的 AI 工具集合"],
    ["misc-2", "行业动态", "公众号：Random", 35, "另一个泛泛而谈的 AI 资讯"],
  ].map(([title, section, source, score, summary]) => ({
    title,
    section,
    source,
    score,
    link: `https://example.com/${title}`,
    summary,
  }));

  const merged = mergeAihotItemsIntoNewsContext(juyaContext, candidates);
  const titles = merged.freshNews.entries.map((entry) => entry.title);

  assert.equal(merged.aihot_updates.length, 7);
  assert.equal(merged.freshNews.entries.length, 7);
  assert.ok(titles.includes("cloudflare-agent"));
  assert.ok(titles.includes("deepmind-anthropic"));
  assert.ok(titles.includes("openai-research"));
  assert.ok(titles.includes("github-security"));
  assert.ok(titles.includes("low-x-tip"));
  assert.ok(merged.freshNews.entries.every((entry) => entry.is_secondary));
  assert.deepEqual(
    new Set(selectUnifiedNewsEntries(merged.freshNews.entries).map((entry) => entry.title)),
    new Set(["cloudflare-agent", "deepmind-anthropic", "openai-research", "github-security"]),
  );
});

test("passes every fused candidate to the overview model with stable entry IDs", () => {
  const entries = Array.from({ length: 21 }, (_, index) => ({
    title: `候选新闻 ${index + 1}`,
    summary: `候选摘要 ${index + 1}`,
    source: index % 2 ? "AI HOT source" : "Juya source",
    source_group: index % 2 ? "AIHOT" : "",
    link: `https://example.com/news/${index + 1}`,
  }));

  const compact = compactNewsForOverview({
    issue_title: "今日 AI 新闻",
    entries,
  });

  assert.equal(compact.entries.length, entries.length);
  assert.equal(compact.entries[0].entry_id, "news-001");
  assert.equal(compact.entries[20].entry_id, "news-021");
  assert.equal(compact.entries[1].source, "AI HOT source");
});

test("renders only source-backed model selections in editorial value order", () => {
  const freshNews = {
    entries: [
      { title: "第一条", summary: "第一条原始摘要", section: "模型发布", link: "https://example.com/1" },
      { title: "第二条", summary: "第二条原始摘要", section: "产品应用", link: "https://example.com/2" },
      { title: "第三条", summary: "第三条原始摘要", section: "技术与洞察", link: "https://example.com/3" },
    ],
  };
  const selected = collectRenderableNewsItems({
    items_cn: [
      { entry_id: "news-003", title: "被模型改写的标题", summary_cn: "模型摘要三", tag: "研究突破" },
      { entry_id: "news-999", title: "不存在的新闻", summary_cn: "幻觉摘要", tag: "行业动态" },
      { entry_id: "news-001", title: "第一条", summary_cn: "模型摘要一", tag: "模型发布" },
    ],
  }, freshNews);

  assert.deepEqual(selected.map((item) => item.title), ["第三条", "第一条", "第二条"]);
  assert.equal(selected[0].summary_cn, "模型摘要三");
  assert.ok(selected.every((item) => item.link));
  assert.ok(!selected.some((item) => item.title === "不存在的新闻"));
});

test("groups sources while prioritizing images and preserving model value order", () => {
  const ordered = orderRenderableNewsItemsBySourceAndPriority([
    { title: "Juya 高价值无图", source_group: "" },
    { title: "AIHot 高价值有图", source_group: "AIHOT", is_secondary: true, image_url: "https://example.com/a.jpg" },
    { title: "Juya 有图", source_group: "", image_url: "https://example.com/j.jpg" },
    { title: "AIHot 无图", source_group: "AIHOT", is_secondary: true },
  ]);

  assert.deepEqual(ordered.map((item) => item.title), [
    "AIHot 高价值有图",
    "AIHot 无图",
    "Juya 有图",
    "Juya 高价值无图",
  ]);
});
