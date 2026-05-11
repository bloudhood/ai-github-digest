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

test("limits AI HOT additions to eight while preserving category diversity", () => {
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
    ["industry-1", "行业动态"],
    ["industry-2", "行业动态"],
    ["industry-3", "行业动态"],
    ["industry-4", "行业动态"],
    ["industry-5", "行业动态"],
    ["model-1", "模型发布/更新"],
    ["product-1", "产品发布/更新"],
    ["paper-1", "论文研究"],
    ["tip-1", "技巧与观点"],
    ["product-2", "产品发布/更新"],
    ["model-2", "模型发布/更新"],
    ["paper-2", "论文研究"],
  ].map(([title, section]) => ({
    title,
    section,
    link: `https://example.com/${title}`,
    summary: `${title} summary`,
  }));

  const merged = mergeAihotItemsIntoNewsContext(juyaContext, candidates);
  const titles = merged.freshNews.entries.map((entry) => entry.title);

  assert.equal(merged.aihot_updates.length, 8);
  assert.equal(merged.freshNews.entries.length, 8);
  assert.ok(titles.includes("tip-1"));
  assert.ok(titles.includes("paper-1"));
  assert.ok(!titles.includes("industry-5"));
});
