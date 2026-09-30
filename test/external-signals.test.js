import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSixtySecondSignalItems,
} from "../index.js";

test("normalizes 60s IT rank items into bounded external signals", () => {
  const items = normalizeSixtySecondSignalItems([
    {
      title: "微信 AI 助手“小微”灰度上线，可通过文字或语音对话操作微信原生功能",
      link: "https://www.ithome.com/0/966/534.htm",
    },
    {
      title: "蔚来 ET9 特别版发布",
      link: "https://www.ithome.com/0/966/616.htm",
    },
    {
      title: "daily travel bookings are rising",
      link: "https://example.com/travel",
    },
  ], {
    id: "60s-it-rank",
    source: "60s IT News",
  });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    title: "微信 AI 助手“小微”灰度上线，可通过文字或语音对话操作微信原生功能",
    link: "https://www.ithome.com/0/966/534.htm",
    source: "60s IT News",
    source_group: "60s",
    kind: "it_rank",
    rank: 1,
    score: 100,
  });
});

test("normalizes 60s Hacker News items while keeping original links and scores", () => {
  const items = normalizeSixtySecondSignalItems([
    {
      id: 48615680,
      title: "Building reliable agentic AI systems",
      link: "https://martinfowler.com/articles/reliable-llm-bayer.html",
      score: 63,
      author: "sarangk90",
      created_at: 1782016119000,
    },
  ], {
    id: "60s-hacker-news",
    source: "60s Hacker News",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Building reliable agentic AI systems");
  assert.equal(items[0].link, "https://martinfowler.com/articles/reliable-llm-bayer.html");
  assert.equal(items[0].source, "60s Hacker News");
  assert.equal(items[0].source_group, "60s");
  assert.equal(items[0].kind, "hacker_news");
  assert.equal(items[0].score, 63);
  assert.equal(items[0].author, "sarangk90");
  assert.equal(items[0].published_at, "2026-06-21T04:28:39.000Z");
});
