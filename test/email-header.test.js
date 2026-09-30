import test from "node:test";
import assert from "node:assert/strict";

import { renderDigestHeader } from "../index.js";

test("renders a compact digest header with live content counts", () => {
  const html = renderDigestHeader({
    reportDate: "2026-07-18",
    newsCount: 16,
    projectCount: 10,
  });

  assert.match(html, />GitHub \+ AI 日报<\/h1>/);
  assert.match(html, />2026-07-18 · 16 条 AI 动态 · 10 个热门项目<\/div>/);
  assert.match(html, /border-left:4px solid #0f766e/);
  assert.doesNotMatch(html, /每日自动生成|富内容版|linear-gradient|box-shadow/i);
});
