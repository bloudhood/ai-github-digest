import test from "node:test";
import assert from "node:assert/strict";

import {
  extractJuyaNewsEntries,
  parseRssItems,
} from "../index.js";

test("parses daily.juya.uk escaped HTML RSS content with h3 entries and images", () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>橘鸦AI早报</title>
    <item>
      <title>2026-06-19</title>
      <link>https://daily.juya.uk/issues/2026-06-19/</link>
      <pubDate>Fri, 19 Jun 2026 01:12:00 GMT</pubDate>
      <description>DeepSeek 正式上线识图模式 ↗ #1</description>
      <content:encoded>&lt;div&gt;
&lt;h1&gt;AI 早报 2026-06-19&lt;/h1&gt;
&lt;p&gt;&lt;img src="https://assets.juya.uk/cover.png" alt=""&gt;&lt;/p&gt;
&lt;h2&gt;概览&lt;/h2&gt;
&lt;h3&gt;要闻&lt;/h3&gt;
&lt;ul&gt;&lt;li&gt;DeepSeek 正式上线识图模式 &lt;a href="https://x.com/deepseek/status/1"&gt;↗&lt;/a&gt; &lt;code&gt;#1&lt;/code&gt;&lt;/li&gt;&lt;/ul&gt;
&lt;h2&gt;要闻&lt;/h2&gt;
&lt;h3&gt;&lt;a href="https://x.com/deepseek/status/1"&gt;DeepSeek 正式上线识图模式&lt;/a&gt; &lt;code&gt;#1&lt;/code&gt;&lt;/h3&gt;
&lt;blockquote&gt;&lt;p&gt;DeepSeek 发布识图模式。&lt;/p&gt;&lt;/blockquote&gt;
&lt;p&gt;&lt;img src='https://assets.juya.uk/item.png' alt=''&gt;&lt;/p&gt;
&lt;p&gt;来源：&lt;a href="https://example.com/source"&gt;详情&lt;/a&gt;&lt;/p&gt;
&lt;/div&gt;</content:encoded>
    </item>
  </channel>
</rss>`;

  const items = parseRssItems(rss, 30000);

  assert.equal(items.length, 1);
  assert.equal(items[0].link, "https://daily.juya.uk/issues/2026-06-19/");
  assert.match(items[0].content_html, /^<div>/);
  assert.ok(!items[0].content_text.includes("&lt;div"));
  assert.ok(items[0].content_text.includes("AI 早报 2026-06-19"));

  assert.equal(items[0].entries.length, 1);
  assert.deepEqual(items[0].entries[0], {
    title: "DeepSeek 正式上线识图模式",
    link: "https://x.com/deepseek/status/1",
    summary: "DeepSeek 发布识图模式。",
    section: "要闻",
    image_url: "https://assets.juya.uk/item.png",
    image_urls: ["https://assets.juya.uk/item.png"],
    source_links: [
      {
        href: "https://example.com/source",
        label: "详情",
      },
    ],
  });
});

test("keeps parsing the old Juya h2 entry structure", () => {
  const html = `
<h2>概览</h2>
<h3>模型发布</h3>
<ul><li>Claude Code 推出 Artifacts 功能 <code>#3</code></li></ul>
<h2><a href="https://claude.com/blog/artifacts-in-claude-code">Claude Code 推出 Artifacts 功能</a> <code>#3</code></h2>
<blockquote><p>Claude Code 新增 Artifacts。</p></blockquote>
<p><img src="https://example.com/artifacts.png" alt=""></p>`;

  const entries = extractJuyaNewsEntries(html);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Claude Code 推出 Artifacts 功能");
  assert.equal(entries[0].section, "模型发布");
  assert.equal(entries[0].image_url, "https://example.com/artifacts.png");
});
