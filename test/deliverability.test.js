import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFallbackProjectSummary,
  enrichProjects,
  normalizeProjectSummaryItem,
  rewriteDeliverabilityText,
} from "../index.js";

test("rewrites risky project summary phrases while preserving the project signal", () => {
  const original = "Heretic 能自动移除语言模型的安全对齐（审查），无需昂贵的后训练，通过方向消融和参数优化实现高质量去审查，且支持大多数密集模型和多模态模型。";
  const result = rewriteDeliverabilityText(original);

  assert.equal(
    result.text,
    "Heretic 能研究语言模型行为边界，无需昂贵的后训练，通过方向消融和参数优化实现输出风格调整，且支持大多数密集模型和多模态模型。",
  );
  assert.deepEqual(result.rewrites, [
    { from: "自动移除语言模型的安全对齐（审查）", to: "研究语言模型行为边界" },
    { from: "高质量去审查", to: "输出风格调整" },
  ]);
  assert.match(result.text, /Heretic/);
  assert.doesNotMatch(result.text, /去审查|审查|安全对齐/);
});

test("leaves ordinary project summaries unchanged", () => {
  const original = "一个面向 Agent 工作流的 TypeScript 工具，重点改善任务编排和上下文传递。";
  const result = rewriteDeliverabilityText(original);

  assert.equal(result.text, original);
  assert.deepEqual(result.rewrites, []);
});

test("uses Chinese fallback instead of raw English GitHub descriptions", () => {
  const repo = {
    full_name: "example/agent-kit",
    name: "agent-kit",
    description: "A toolkit for building multi-agent workflows in TypeScript.",
    language: "TypeScript",
    topics: ["agent", "workflow"],
    readme_excerpt: "",
    star_delta_24h: 48,
    age_days: 4,
    hours_since_push: 6,
    authenticity_score: 20,
  };

  const fallback = buildFallbackProjectSummary(repo);

  assert.match(fallback.positioning_cn, /[\u3400-\u9fff]/);
  assert.doesNotMatch(fallback.positioning_cn, /A toolkit for building multi-agent workflows/i);
});

test("rejects English model project summaries and falls back to Chinese copy", () => {
  const repo = {
    full_name: "example/codex-router",
    name: "codex-router",
    description: "A command-line router for coding agents.",
    language: "JavaScript",
    topics: ["codex", "agent", "cli"],
    readme_excerpt: "",
    star_delta_24h: 18,
    age_days: 30,
    hours_since_push: 3,
    authenticity_score: 20,
  };

  const normalized = normalizeProjectSummaryItem(repo, {
    full_name: repo.full_name,
    positioning_cn: "A command-line router for coding agents.",
    risk_cn: "No obvious risk.",
  });

  assert.equal(normalized.__fallback, true);
  assert.equal(normalized.__fallback_reason, "non-chinese-model-entry");
  assert.match(normalized.positioning_cn, /[\u3400-\u9fff]/);
  assert.doesNotMatch(normalized.positioning_cn, /^A command-line router/i);
  assert.equal(normalized.risk_cn, "");
});

test("fallback summaries use factual observation copy instead of vague public-info wording", () => {
  const fallback = buildFallbackProjectSummary({
    full_name: "shadcn/improve",
    name: "improve",
    description: "",
    language: "",
    topics: [],
    readme_excerpt: "",
    star_delta_24h: 129,
    age_days: 9,
    hours_since_push: 72,
    authenticity_score: 20,
  });

  assert.match(fallback.positioning_cn, /定位：/);
  assert.match(fallback.positioning_cn, /价值：/);
  assert.match(fallback.positioning_cn, /看点：/);
  assert.match(fallback.positioning_cn, /注意：/);
  assert.match(fallback.positioning_cn, /24h 新增 129 星/);
  assert.match(fallback.positioning_cn, /核对 README、示例和维护者背景/);
  assert.doesNotMatch(fallback.positioning_cn, /公开资料还不足以判断它是否具备长期可用性/);
  assert.doesNotMatch(fallback.positioning_cn, /当前公开信息显示它重点提供/);
});

test("fallback stack inference trusts GitHub language before README keywords", () => {
  const fallback = buildFallbackProjectSummary({
    full_name: "example/swift-agent",
    name: "swift-agent",
    description: "A Swift app with generated Go examples in docs.",
    language: "Swift",
    topics: ["agent"],
    readme_excerpt: "Install go tools only when exporting examples.",
    star_delta_24h: 20,
    age_days: 20,
    hours_since_push: 3,
    authenticity_score: 20,
  });

  assert.match(fallback.positioning_cn, /Swift/);
  assert.match(fallback.positioning_cn, /GitHub 标记语言为 Swift/);
  assert.match(fallback.positioning_cn, /看点：/);
  assert.doesNotMatch(fallback.positioning_cn, /主要基于Go构建/);
});

test("enriches a bounded project set to preserve Worker subrequest budget", async () => {
  const originalFetch = globalThis.fetch;
  const repos = Array.from({ length: 15 }, (_, index) => ({
    full_name: `owner/repo-${index + 1}`,
    name: `repo-${index + 1}`,
  }));
  globalThis.fetch = async (url) => {
    const repo = String(url).match(/repos\/([^/]+\/[^/]+)\/readme/)[1];
    return new Response(JSON.stringify({
      content: Buffer.from(`# ${repo}\n\nREADME content`).toString("base64"),
      encoding: "base64",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const enriched = await enrichProjects({}, repos);
    assert.equal(enriched.length, 15);
    assert.ok(enriched.slice(0, 8).every((repo) => repo.readme_excerpt.includes("README content")));
    assert.ok(enriched.slice(8).every((repo) => repo.readme_excerpt === ""));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
