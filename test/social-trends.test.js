import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDomesticTrendingSection,
  translateExternalSocialPlatforms,
} from "../index.js";

test("translates HN and Reddit titles while preserving clickable URLs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            items: [
              {
                key: "hacker-news:0",
                title_cn: "Claude Code 现已支持长期运行的后台任务和移动通知",
              },
              {
                key: "reddit-ai:0",
                title_cn: "我用本地 LLM 构建了一个可以读完整代码库的代理",
              },
            ],
          }),
        },
      },
    ],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const platforms = await translateExternalSocialPlatforms({
      DEEPSEEK_API_KEY: "test-key",
      DEEPSEEK_THINKING: "disabled",
    }, [
      {
        id: "hacker-news",
        label: "Hacker News",
        items: [
          {
            title: "Claude Code now supports long-running background tasks and mobile notifications",
            url: "https://news.ycombinator.com/item?id=123",
            platform: "hacker-news",
          },
        ],
      },
      {
        id: "reddit-ai",
        label: "Reddit AI",
        items: [
          {
            title: "I built a local LLM agent that can read an entire codebase",
            url: "https://old.reddit.com/r/LocalLLaMA/comments/example",
            platform: "reddit-ai",
          },
        ],
      },
    ]);

    assert.equal(platforms[0].items[0].title, "Claude Code 现已支持长期运行的后台任务和移动通知");
    assert.equal(platforms[0].items[0].title_original, "Claude Code now supports long-running background tasks and mobile notifications");
    assert.equal(platforms[0].items[0].url, "https://news.ycombinator.com/item?id=123");
    assert.equal(platforms[1].items[0].title, "我用本地 LLM 构建了一个可以读完整代码库的代理");

    const html = buildDomesticTrendingSection(platforms);
    assert.match(html, /href="https:\/\/news\.ycombinator\.com\/item\?id=123"/);
    assert.match(html, /href="https:\/\/old\.reddit\.com\/r\/LocalLLaMA\/comments\/example"/);
    assert.match(html, /Claude Code 现已支持长期运行的后台任务和移动通知/);
    assert.doesNotMatch(html, /…/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
