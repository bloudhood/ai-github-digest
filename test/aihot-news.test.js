import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeAihotItemsIntoNewsContext,
  normalizeAihotItemsForNews,
} from "../index.js";

test("normalizes AI HOT API items into current news entry shape", () => {
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
    },
  ]);
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
  assert.equal(merged.aihot_status, "merged");
  assert.equal(merged.aihot_updates.length, 1);
});

test("limits AI HOT additions to four and prefers high-signal sources", () => {
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

  assert.equal(merged.aihot_updates.length, 4);
  assert.equal(merged.freshNews.entries.length, 4);
  assert.ok(titles.includes("cloudflare-agent"));
  assert.ok(titles.includes("deepmind-anthropic"));
  assert.ok(titles.includes("openai-research"));
  assert.ok(titles.includes("github-security"));
  assert.ok(!titles.includes("low-x-tip"));
  assert.ok(merged.freshNews.entries.every((entry) => entry.is_secondary));
});
