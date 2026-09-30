import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNewsSignals,
  filterRepeatedProjects,
  hasStrongProjectRelevance,
  selectProjectsForDigest,
} from "../index.js";

const NOW = new Date("2026-08-04T04:00:00.000Z");

test("requires strong AI or news relevance and rejects financial automation", () => {
  assert.equal(hasStrongProjectRelevance({ ai_domain_score: 0, topic_relevance_score: 2 }), false);
  assert.equal(hasStrongProjectRelevance({ ai_domain_score: 3, topic_relevance_score: 0 }), true);
  assert.equal(hasStrongProjectRelevance({ ai_domain_score: 6, authenticity_flags: ["financial-automation-risk"] }), false);
});

test("blocks a seven-day heat repeat without a material project update", () => {
  const repo = makeRepo({
    full_name: "example/still-hot-agent",
    stars: 1600,
    star_delta_24h: 180,
    pushed_at: "2026-08-03T04:00:00.000Z",
  });
  const history = makeHistory(repo.full_name, {
    last_sent_at: "2026-07-28T04:00:00.000Z",
    last_stars: 1000,
  });

  assert.deepEqual(filterRepeatedProjects([repo], history, NOW, {}), []);
});

test("allows a repeat after seven days only when a new official release exists", () => {
  const repo = makeRepo({
    full_name: "example/released-agent",
    has_recent_release: true,
    recent_release: {
      name: "v2.0.0",
      published_at: "2026-08-03T04:00:00.000Z",
    },
  });
  const history = makeHistory(repo.full_name, {
    last_sent_at: "2026-07-28T04:00:00.000Z",
    last_stars: 900,
  });

  const selected = filterRepeatedProjects([repo], history, NOW, {});
  assert.equal(selected.length, 1);
  assert.equal(selected[0].repeat_info.reason, "new-release");
});

test("caps repeats against actual section size and keeps at most two per family", () => {
  const families = [
    ["coding", "coding agent for repository tasks"],
    ["runtime", "MCP multi-agent orchestration runtime"],
    ["rag", "RAG retrieval knowledge base toolkit"],
    ["eval", "LLM evaluation benchmark observability"],
    ["model", "LLM inference and quantization engine"],
  ];
  const candidates = families.flatMap(([family, description], familyIndex) => [0, 1].map((itemIndex) => makeRepo({
    full_name: `example/${family}-${itemIndex}`,
    description,
    final_score: 100 - (familyIndex * 2) - itemIndex,
    value_score: 100 - (familyIndex * 2) - itemIndex,
    repeat_info: familyIndex < 2 ? { reason: "new-release" } : null,
  })));

  const selected = selectProjectsForDigest(candidates, { MAX_PROJECTS: "10" });
  const repeatCount = selected.filter((repo) => repo.repeat_info).length;
  assert.ok(repeatCount <= Math.floor(selected.length * 0.3));

  const familyByName = new Map(candidates.map((repo) => [repo.full_name, repo.full_name.split("-")[0].split("/")[1]]));
  const counts = new Map();
  selected.forEach((repo) => {
    const family = familyByName.get(repo.full_name);
    counts.set(family, (counts.get(family) || 0) + 1);
  });
  assert.ok([...counts.values()].every((count) => count <= 2));
});

test("uses a compact editorial news pool for project matching", () => {
  const primary = Array.from({ length: 20 }, (_, index) => ({
    title: `Primary AI item ${index}`,
    summary: `model update ${index}`,
    source_group: "JUYA",
  }));
  const aihot = Array.from({ length: 10 }, (_, index) => ({
    title: `AIHot item ${index}`,
    summary: `agent release ${index}`,
    source_group: "AIHOT",
  }));
  const signals = buildNewsSignals({
    freshNews: { title: "Daily AI", description: "curated", entries: [...primary, ...aihot] },
    social_trending: [{ title: "SOCIAL_ONLY_SENTINEL" }],
    external_signals: [{ title: "EXTERNAL_ONLY_SENTINEL" }],
  });

  assert.deepEqual(signals.source_counts, { primary: 12, aihot: 4, official: 0 });
  assert.equal(signals.normalized.includes("social_only_sentinel"), false);
  assert.equal(signals.normalized.includes("external_only_sentinel"), false);
});

function makeRepo(overrides = {}) {
  return {
    full_name: "example/agent",
    name: "agent",
    description: "AI agent framework",
    topics: ["ai", "agent"],
    stars: 1200,
    forks: 120,
    star_delta_24h: 60,
    pushed_at: "2026-08-03T04:00:00.000Z",
    age_days: 60,
    hours_since_push: 24,
    momentum_score: 70,
    authenticity_score: 20,
    authenticity_flags: [],
    ai_domain_score: 4,
    topic_relevance_score: 4,
    final_score: 80,
    value_score: 80,
    has_recent_release: false,
    recent_release: null,
    ...overrides,
  };
}

function makeHistory(fullName, record) {
  return {
    repos: {
      [fullName]: {
        sent_dates: [record.last_sent_at.slice(0, 10)],
        ...record,
      },
    },
  };
}
