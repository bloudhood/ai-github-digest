import { EmailMessage } from "cloudflare:email";

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_LLM_API_BASE = "https://api.openai.com/v1";
const GITHUB_TRENDING_DAILY_URL = "https://github.com/trending?since=daily";
const TRENDSHIFT_HOME_URL = "https://trendshift.io/";
const DEFAULT_TIMEZONE = "Asia/Hong_Kong";
const DEFAULT_MAX_PROJECTS = 15;
const DEFAULT_GITHUB_PAGES = 2;
const README_CHAR_LIMIT = 2500;
const DEFAULT_PROJECT_SUMMARY_BATCH_SIZE = 5;
const SNAPSHOT_KEY = "state:last-snapshot";
const OBSERVED_SNAPSHOT_KEY = "state:last-observed-snapshot";
const DELIVERY_HISTORY_KEY = "state:delivery-history";
const LAST_RESULT_KEY = "digest:last";
const LAST_ERROR_KEY = "digest:last-error";
const RUN_MARKER_PREFIX = "digest:sent:";
const RATE_LIMIT_KEY_PREFIX = "rate-limit:run:";
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 10;
const DIGEST_QUEUE_NAME = "github-digest-jobs";
const ROOT_MESSAGE = "AI GitHub Digest Worker";
const DEFAULT_REPEAT_COOLDOWN_DAYS = 5;
const DEFAULT_REPEAT_WINDOW_DAYS = 14;
const DEFAULT_BREAKOUT_STAR_DELTA = 120;
const DEFAULT_JUYA_RSS_URL = "https://imjuya.github.io/juya-ai-daily/rss.xml";
const DEFAULT_JUYA_CONTENT_LIMIT = 30000;
const DEFAULT_AUTHENTICITY_THRESHOLD = 12;
const DEFAULT_TOPIC_RELEVANCE_MAX = 15;
const DEFAULT_RELEASE_LOOKBACK_HOURS = 72;
const DEFAULT_MIN_DELIVERABLE_STAR_DELTA = 5;
const DEFAULT_MIN_TOPIC_RELEVANCE_FOR_LOW_DELTA = 3;
const DEFAULT_MIN_RESURFACE_STAR_GAIN = 60;
const DEFAULT_MIN_RESURFACE_DAYS = 21;
const DEFAULT_MIN_BREAKOUT_REPEAT_GAP_DAYS = 3;
const DEFAULT_OFFICIAL_UPDATE_LIMIT = 6;
const DEFAULT_OFFICIAL_UPDATE_TIMEOUT_MS = 4500;
const DEFAULT_OFFICIAL_UPDATE_LOOKBACK_HOURS = 120;
const PROJECT_SUMMARY_README_LIMIT = 1400;
const DEFAULT_RELEASE_CANDIDATE_LIMIT = 2;
const DEFAULT_README_ENRICH_LIMIT = 12;
const DEFAULT_TRENDING_CANDIDATE_LIMIT = 20;
const QUALIFICATION_BUCKET_PRIORITY = {
  core: 0,
  reference: 1,
  clone: 2,
  risk_watch: 3,
};
const HOTNESS_TIER_PRIORITY = {
  breakout: 0,
  surging: 1,
  emerging: 2,
  watch: 3,
  release: 4,
  cold: 9,
};
const OFFICIAL_UPDATE_FEEDS = [
  {
    id: "openai-news",
    source: "OpenAI 官方动态",
    url: "https://openai.com/news/rss.xml",
    maxItems: 2,
    maxAgeHours: 168,
    keywordHints: ["gpt", "model", "api", "developer", "codex", "agent", "tool", "chatgpt", "reasoning"],
  },
  {
    id: "github-changelog",
    source: "GitHub Changelog",
    url: "https://github.blog/changelog/feed/",
    maxItems: 2,
    maxAgeHours: 120,
    keywordHints: ["copilot", "models", "api", "actions", "security", "codespaces", "runner", "agent"],
  },
  {
    id: "cloudflare-workers",
    source: "Cloudflare Workers",
    url: "https://developers.cloudflare.com/changelog/rss/workers.xml",
    maxItems: 1,
    maxAgeHours: 168,
    keywordHints: ["worker", "wrangler", "kv", "cron", "queue", "durable", "workflow", "ai", "email"],
  },
  {
    id: "cloudflare-workers-ai",
    source: "Cloudflare Workers AI",
    url: "https://developers.cloudflare.com/changelog/rss/workers-ai.xml",
    maxItems: 1,
    maxAgeHours: 168,
    keywordHints: ["model", "llm", "embedding", "inference", "ai", "gpu"],
  },
  {
    id: "cloudflare-agents",
    source: "Cloudflare Agents",
    url: "https://developers.cloudflare.com/changelog/rss/agents.xml",
    maxItems: 1,
    maxAgeHours: 168,
    keywordHints: ["agent", "workflow", "tool", "sdk"],
  },
];
const AI_DOMAIN_TERMS = [
  "ai", "agent", "agents", "llm", "llms", "model", "models", "prompt", "prompts", "rag",
  "mcp", "codex", "claude", "chatgpt", "gpt", "openai", "anthropic", "gemini", "deepseek",
  "ollama", "copilot", "assistant", "inference", "reasoning", "token", "embedding", "workflow",
];
const WEAK_TOPIC_TOKENS = new Set([
  "ai", "code", "tool", "tools", "agent", "agents", "app", "apps", "model", "models",
  "open", "source", "new", "fast", "lite", "api", "sdk", "using", "with", "from",
  "the", "and", "for", "into", "daily", "news", "project", "projects", "github", "worker",
  "workers", "china", "release", "released", "launch", "launched", "top", "best", "update",
  "typescript", "javascript", "python", "rust", "java", "golang", "framework", "frameworks",
  "library", "libraries", "multi", "system", "systems", "platform", "platforms",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: ROOT_MESSAGE,
        timezone: getTimezone(env),
        now: new Date().toISOString(),
      });
    }

    if (request.method === "GET" && url.pathname === "/last") {
      if (!isAuthorized(request, env, url)) {
        return unauthorized();
      }
      const last = await getJson(env.STATE, LAST_RESULT_KEY, null);
      return jsonResponse({
        ok: true,
        last,
      });
    }

    if (request.method === "GET" && url.pathname === "/last-error") {
      if (!isAuthorized(request, env, url)) {
        return unauthorized();
      }
      const lastError = await getJson(env.STATE, LAST_ERROR_KEY, null);
      return jsonResponse({
        ok: true,
        last_error: lastError,
      });
    }

    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/run") {
      if (!isAuthorized(request, env, url)) {
        return unauthorized();
      }

      // Check rate limit for manual runs
      const rateLimitCheck = await checkRateLimit(env);
      if (!rateLimitCheck.allowed) {
        return rateLimitExceeded(rateLimitCheck.count, rateLimitCheck.limit);
      }

      const force = isTruthy(url.searchParams.get("force"));
      const dryRun = isTruthy(url.searchParams.get("dry_run"));
      const quickRun = isTruthy(url.searchParams.get("quick"));
      const dailySimulationRun = isTruthy(url.searchParams.get("daily_sim"));
      const runOptions = {
        now: new Date(),
        trigger: "manual",
        force,
        dryRun,
      };
      const runAsync = isTruthy(url.searchParams.get("async"));

      if (!dryRun) {
        assertQueueBinding(env);
        const queuedPayload = buildDigestJobPayload({
          trigger: "manual",
          now: new Date(),
          force,
          dryRun,
          quickRun,
          dailySimulationRun,
        });
        const sendPromise = env.DIGEST_QUEUE.send(queuedPayload);
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(sendPromise);
        } else {
          await sendPromise;
        }
        return jsonResponse({
          ok: true,
          queued: true,
          trigger: "manual",
          dryRun,
          force,
          quick: quickRun,
          daily_sim: dailySimulationRun,
          accepted_at: new Date().toISOString(),
        }, 202);
      }

      const runtimeEnv = resolveRuntimeEnv(env, {
        quickRun,
        dailySimulationRun,
      });
      const result = await runDigest(runtimeEnv, {
        ...runOptions,
      });

      return jsonResponse(result, result.ok ? 200 : 500);
    }

    return new Response(ROOT_MESSAGE, {
      status: 200,
      headers: { "content-type": "text/plain; charset=UTF-8" },
    });
  },

  async scheduled(controller, env, ctx) {
    const now = getScheduledDate(controller);
    assertQueueBinding(env);
    ctx.waitUntil(env.DIGEST_QUEUE.send(buildDigestJobPayload({
      trigger: "scheduled",
      now,
      force: false,
      dryRun: false,
      quickRun: false,
      dailySimulationRun: false,
    })));
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        const payload = normalizeDigestJobPayload(message.body);
        if (!payload) {
          message.ack();
          continue;
        }

        const runtimeEnv = resolveRuntimeEnv(env, payload);
        const result = await runDigest(runtimeEnv, {
          now: payload.now ? new Date(payload.now) : new Date(),
          trigger: payload.trigger || "manual",
          force: Boolean(payload.force),
          dryRun: Boolean(payload.dryRun),
        });

        if (!result || result.ok) {
          message.ack();
          continue;
        }

        console.warn(`Digest queue job failed: ${result.error || "unknown error"}`);
        message.retry();
      } catch (error) {
        console.warn(`Digest queue processing error: ${formatError(error)}`);
        message.retry();
      }
    }
  },
};

async function runDigest(env, options) {
  const startedAt = new Date();
  const now = options.now || new Date();
  const timezone = getTimezone(env);
  const reportDate = formatDateInTimeZone(now, timezone);
  const runMarkerKey = `${RUN_MARKER_PREFIX}${reportDate}`;
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);

  try {
    assertRequiredBindings(env);

    if (!force && !dryRun) {
      const existingRun = await env.STATE.get(runMarkerKey);
      if (existingRun) {
        return {
          ok: true,
          skipped: true,
          reason: `Digest already sent for ${reportDate}`,
          reportDate,
          trigger: options.trigger,
        };
      }
    }

    const deliveredSnapshot = await getJson(env.STATE, SNAPSHOT_KEY, null);
    const previousSnapshot = await getJson(env.STATE, OBSERVED_SNAPSHOT_KEY, deliveredSnapshot);
    const deliveryHistory = normalizeDeliveryHistory(await getJson(env.STATE, DELIVERY_HISTORY_KEY, null));
    const juyaContext = await fetchJuyaDigest(env, deliveryHistory, now, force);
    const officialContext = isOfficialUpdatesEnabled(env)
      ? await fetchOfficialUpdates(env, now, juyaContext)
      : { status: "disabled", items: [], sources: [] };
    const newsContext = mergeNewsContexts(juyaContext, officialContext);
    const searchPlans = buildSearchPlans(now);
    const candidates = await collectCandidates(env, searchPlans);
    const ranked = rankCandidates(candidates, previousSnapshot, now, newsContext, env);
    const selectedProjects = filterRepeatedProjects(ranked, deliveryHistory, now, env, force);
    const annotatedProjects = await annotateReleaseSignalsForCandidates(env, selectedProjects, now);
    const deliverableProjects = filterDeliverableProjects(annotatedProjects, env);
    const topProjects = selectProjectsForDigest(deliverableProjects, env);
    const snapshotCandidates = ranked.slice(0, 200);

    if (!dryRun && !force) {
      await putJson(env.STATE, OBSERVED_SNAPSHOT_KEY, buildSnapshot(snapshotCandidates, reportDate, timezone));
    }

    if (topProjects.length === 0 && !newsContext.freshNews) {
      throw new Error("No deliverable GitHub repositories or fresh AI news were collected.");
    }

    const enrichedProjects = await enrichProjects(env, topProjects);
    const aiDigest = await summarizeDigest(env, {
      reportDate,
      timezone,
      trigger: options.trigger,
      repositories: enrichedProjects,
      news: buildDigestNewsInput(newsContext),
      news_status: newsContext.status,
    });
    const emailPayload = buildEmailPayload({
      reportDate,
      timezone,
      trigger: options.trigger,
      repositories: enrichedProjects,
      aiDigest,
      news: newsContext,
      startedAt,
      completedAt: new Date(),
      dryRun,
    });

    if (!dryRun) {
      await sendEmail(env, emailPayload.subject, emailPayload.textBody, emailPayload.htmlBody);
      if (!force) {
        await env.STATE.put(runMarkerKey, JSON.stringify({
          reportDate,
          sent_at: new Date().toISOString(),
          subject: emailPayload.subject,
        }), {
          expirationTtl: 60 * 60 * 24 * 8,
        });
      }
      if (!force) {
        await putJson(env.STATE, SNAPSHOT_KEY, buildSnapshot(snapshotCandidates, reportDate, timezone));
        await putJson(env.STATE, DELIVERY_HISTORY_KEY, updateDeliveryHistory(deliveryHistory, enrichedProjects, newsContext, now, timezone));
      }
    }

    await putJson(env.STATE, LAST_RESULT_KEY, {
      ok: true,
      reportDate,
      timezone,
      trigger: options.trigger,
      sent: !dryRun,
      dryRun,
      generated_at: new Date().toISOString(),
      subject: emailPayload.subject,
      repositories: enrichedProjects.map(toStoredRepository),
      news: toStoredNews(newsContext),
      aiDigest,
    });

    return {
      ok: true,
      reportDate,
      timezone,
      trigger: options.trigger,
      dryRun,
      sent: !dryRun,
      subject: emailPayload.subject,
      repositories: enrichedProjects.map(toStoredRepository),
    };
  } catch (error) {
    const failure = {
      ok: false,
      trigger: options.trigger,
      reportDate,
      dryRun,
      failed_at: new Date().toISOString(),
      error: formatError(error),
    };
    await putJson(env.STATE, LAST_ERROR_KEY, failure);
    return failure;
  }
}

function assertRequiredBindings(env) {
  if (!env.STATE) {
    throw new Error("Missing KV binding: STATE");
  }
  if (!env.EMAIL_OUT || typeof env.EMAIL_OUT.send !== "function") {
    throw new Error("Missing send_email binding: EMAIL_OUT");
  }
  if (!env.EMAIL_FROM) {
    throw new Error("Missing EMAIL_FROM variable");
  }
  if (!env.EMAIL_TO) {
    throw new Error("Missing EMAIL_TO variable");
  }
  if (!env.LLM_API_KEY) {
    throw new Error("Missing LLM_API_KEY secret");
  }
}

function assertQueueBinding(env) {
  if (!env.DIGEST_QUEUE || typeof env.DIGEST_QUEUE.send !== "function") {
    throw new Error("Missing queue binding: DIGEST_QUEUE");
  }
}

function getTimezone(env) {
  return String(env.REPORT_TIMEZONE || DEFAULT_TIMEZONE);
}

function resolveRuntimeEnv(env, options) {
  return options && options.quickRun
    ? applyManualQuickOverrides(env)
    : options && options.dailySimulationRun
      ? applyManualDailySimulationOverrides(env)
      : env;
}

function applyManualQuickOverrides(env) {
  return {
    ...env,
    LLM_MODEL: "gpt-4.1-mini",
    DIGEST_OVERVIEW_MODEL: "gpt-4.1-mini",
    PROJECT_SUMMARY_MODEL: "gpt-4.1-mini",
  };
}

function applyManualDailySimulationOverrides(env) {
  return {
    ...env,
    MAX_PROJECTS: "20",
    LLM_MODEL: "gpt-4.1-mini",
    DIGEST_OVERVIEW_MODEL: "gpt-4.1-mini",
    PROJECT_SUMMARY_MODEL: "gpt-4.1-mini",
    JUYA_CONTENT_LIMIT: "30000",
  };
}

function buildDigestJobPayload(input) {
  return {
    version: 1,
    trigger: input.trigger || "manual",
    now: input.now instanceof Date ? input.now.toISOString() : new Date().toISOString(),
    force: Boolean(input.force),
    dryRun: Boolean(input.dryRun),
    quickRun: Boolean(input.quickRun),
    dailySimulationRun: Boolean(input.dailySimulationRun),
  };
}

function normalizeDigestJobPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return {
    trigger: payload.trigger === "scheduled" ? "scheduled" : "manual",
    now: payload.now || null,
    force: Boolean(payload.force),
    dryRun: Boolean(payload.dryRun),
    quickRun: Boolean(payload.quickRun),
    dailySimulationRun: Boolean(payload.dailySimulationRun),
  };
}

function getMaxProjects(env) {
  return clampInteger(env.MAX_PROJECTS, DEFAULT_MAX_PROJECTS, 1, 50);
}

function getGithubPages(env) {
  return clampInteger(env.GITHUB_SEARCH_PAGES, DEFAULT_GITHUB_PAGES, 1, 3);
}

function getRepeatCooldownDays(env) {
  return clampInteger(env.REPEAT_COOLDOWN_DAYS, DEFAULT_REPEAT_COOLDOWN_DAYS, 1, 14);
}

function getRepeatWindowDays(env) {
  return clampInteger(env.REPEAT_WINDOW_DAYS, DEFAULT_REPEAT_WINDOW_DAYS, 3, 30);
}

function getBreakoutStarDelta(env) {
  return clampInteger(env.BREAKOUT_STAR_DELTA, DEFAULT_BREAKOUT_STAR_DELTA, 20, 1000);
}

function getJuyaContentLimit(env) {
  return clampInteger(env.JUYA_CONTENT_LIMIT, DEFAULT_JUYA_CONTENT_LIMIT, 2000, 30000);
}

function getAuthenticityThreshold(env) {
  return clampInteger(env.AUTHENTICITY_THRESHOLD, DEFAULT_AUTHENTICITY_THRESHOLD, 1, 25);
}

function getReleaseLookbackHours(env) {
  return clampInteger(env.RELEASE_LOOKBACK_HOURS, DEFAULT_RELEASE_LOOKBACK_HOURS, 12, 168);
}

function getMinDeliverableStarDelta(env) {
  return clampInteger(env.MIN_DELIVERABLE_STAR_DELTA, DEFAULT_MIN_DELIVERABLE_STAR_DELTA, 1, 50);
}

function getMinResurfaceStarGain(env) {
  return clampInteger(env.MIN_RESURFACE_STAR_GAIN, DEFAULT_MIN_RESURFACE_STAR_GAIN, 20, 1000);
}

function getMinResurfaceDays(env) {
  return clampInteger(env.MIN_RESURFACE_DAYS, DEFAULT_MIN_RESURFACE_DAYS, 7, 90);
}

function isOfficialUpdatesEnabled(env) {
  return isTruthy(env.ENABLE_OFFICIAL_UPDATES);
}

function getScheduledDate(controller) {
  const raw = Number(controller && controller.scheduledTime);
  if (!Number.isFinite(raw) || raw <= 0) {
    return new Date();
  }
  const millis = raw > 1e12 ? raw : raw * 1000;
  return new Date(millis);
}

function buildSearchPlans(now) {
  const base = "fork:false archived:false template:false";
  return [
    {
      name: "new-ai-breakout",
      sort: "stars",
      query: `${base} stars:>=15 created:>=${dateDaysAgo(now, 10)} (agent OR model OR workflow)`,
    },
    {
      name: "agent-workflows",
      sort: "updated",
      query: `${base} stars:>=40 pushed:>=${dateDaysAgo(now, 7)} (agent OR harness OR orchestration)`,
    },
    {
      name: "devtools-and-coding",
      sort: "updated",
      query: `${base} stars:>=40 pushed:>=${dateDaysAgo(now, 7)} (codex OR copilot OR cli)`,
    },
    {
      name: "multimodal-and-infra",
      sort: "updated",
      query: `${base} stars:>=40 pushed:>=${dateDaysAgo(now, 10)} (vision OR voice OR embedding)`,
    },
    {
      name: "established-projects-with-fresh-momentum",
      sort: "updated",
      query: `${base} stars:>=250 pushed:>=${dateDaysAgo(now, 14)} (agent OR browser OR automation)`,
    },
  ];
}

async function collectCandidates(env, plans) {
  try {
    const trendingCandidates = await collectTrendingCandidates(env);
    if (trendingCandidates.length >= 6) {
      return trendingCandidates;
    }
  } catch (error) {
    console.warn(`GitHub Trending candidate collection failed: ${formatError(error)}`);
  }

  return collectSearchCandidates(env, plans);
}

async function collectSearchCandidates(env, plans) {
  const seen = new Map();
  const perPage = 50;

  for (const plan of plans) {
    for (let page = 1; page <= getGithubPages(env); page += 1) {
      const items = await githubSearchRepositories(env, plan.query, plan.sort, page, perPage);
      for (const item of items) {
        const normalized = normalizeRepository(item, plan.name);
        if (!normalized) {
          continue;
        }

        const existing = seen.get(normalized.full_name);
        if (!existing) {
          seen.set(normalized.full_name, normalized);
          continue;
        }

        existing.search_sources = Array.from(new Set([...existing.search_sources, ...normalized.search_sources]));
        existing.query_rank = Math.min(existing.query_rank, normalized.query_rank);
      }
    }
  }

  return Array.from(seen.values());
}

async function collectTrendingCandidates(env) {
  const [githubTrendingResult, trendshiftResult] = await Promise.allSettled([
    fetchGithubTrendingSeeds(),
    fetchTrendshiftSeeds(),
  ]);

  const githubTrendingSeeds = githubTrendingResult.status === "fulfilled" ? githubTrendingResult.value : [];
  const trendshiftSeeds = trendshiftResult.status === "fulfilled" ? trendshiftResult.value : [];

  if (githubTrendingResult.status !== "fulfilled") {
    console.warn(`GitHub Trending seed fetch failed: ${formatError(githubTrendingResult.reason)}`);
  }
  if (trendshiftResult.status !== "fulfilled") {
    console.warn(`Trendshift seed fetch failed: ${formatError(trendshiftResult.reason)}`);
  }

  const seeds = mergeDiscoverySeeds(githubTrendingSeeds, trendshiftSeeds);
  const limitedSeeds = seeds.slice(0, DEFAULT_TRENDING_CANDIDATE_LIMIT);
  const repositories = await Promise.all(limitedSeeds.map(async (seed) => {
    try {
      const item = await githubGetRepository(env, seed.full_name);
      return mergeTrendingSeedWithRepository(seed, item);
    } catch (error) {
      console.warn(`GitHub repo detail fetch failed for ${seed.full_name}: ${formatError(error)}`);
      return null;
    }
  }));

  return repositories.filter(Boolean);
}

function mergeDiscoverySeeds(...seedGroups) {
  const seen = new Map();
  seedGroups.flat().forEach((seed) => {
    if (!seed || !seed.full_name) {
      return;
    }
    const existing = seen.get(seed.full_name);
    if (!existing) {
      seen.set(seed.full_name, { ...seed });
      return;
    }
    seen.set(seed.full_name, {
      ...existing,
      ...seed,
      source_name: Array.from(new Set([existing.source_name, seed.source_name].filter(Boolean))).join("+"),
      stars_today: Math.max(Number(existing.stars_today || 0), Number(seed.stars_today || 0)),
      trendshift_rank: Math.min(
        Number.isFinite(Number(existing.trendshift_rank)) ? Number(existing.trendshift_rank) : Number.POSITIVE_INFINITY,
        Number.isFinite(Number(seed.trendshift_rank)) ? Number(seed.trendshift_rank) : Number.POSITIVE_INFINITY,
      ),
      trendshift_score: Math.max(Number(existing.trendshift_score || 0), Number(seed.trendshift_score || 0)),
    });
  });

  return Array.from(seen.values()).sort((a, b) => {
    if (Number(b.stars_today || 0) !== Number(a.stars_today || 0)) {
      return Number(b.stars_today || 0) - Number(a.stars_today || 0);
    }
    if (Number(a.trendshift_rank || 9999) !== Number(b.trendshift_rank || 9999)) {
      return Number(a.trendshift_rank || 9999) - Number(b.trendshift_rank || 9999);
    }
    return Number(b.trendshift_score || 0) - Number(a.trendshift_score || 0);
  });
}

async function fetchGithubTrendingSeeds() {
  const response = await fetch(GITHUB_TRENDING_DAILY_URL, {
    headers: {
      "user-agent": "ai-github-digest-worker",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(`GitHub Trending fetch failed (${response.status}): ${body}`);
  }

  const html = await response.text();
  return parseGithubTrendingHtml(html);
}

async function fetchTrendshiftSeeds() {
  const response = await fetch(TRENDSHIFT_HOME_URL, {
    headers: {
      "user-agent": "ai-github-digest-worker",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(`Trendshift fetch failed (${response.status}): ${body}`);
  }

  const html = await response.text();
  return parseTrendshiftHtml(html);
}

function parseGithubTrendingHtml(html) {
  const seeds = [];
  const source = String(html || "");
  const articleRe = /<article[\s\S]*?class="[^"]*Box-row[^"]*"[\s\S]*?<\/article>/gi;
  let match;
  let rank = 0;

  while ((match = articleRe.exec(source)) !== null) {
    const block = match[0];
    const repoMatch = block.match(/href="\/([^"?#]+\/[^"?#]+)"/i);
    if (!repoMatch) {
      continue;
    }

    rank += 1;
    const fullName = decodeHtmlEntities(repoMatch[1]).trim();
    const descriptionMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const languageMatch = block.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/i);
    const starsTodayMatch = sanitizeHtml(block).match(/([\d,]+)\s+stars?\s+today/i);
    const starsMatch = block.match(new RegExp(`href="/${escapeRegExp(fullName)}/stargazers"[^>]*>[\\s\\S]*?<span[^>]*>([\\d,]+)<\\/span>`, "i"))
      || block.match(/href="\/[^"?#]+\/[^"?#]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/i);
    const forksMatch = block.match(new RegExp(`href="/${escapeRegExp(fullName)}/forks"[^>]*>[\\s\\S]*?<span[^>]*>([\\d,]+)<\\/span>`, "i"))
      || block.match(/href="\/[^"?#]+\/[^"?#]+\/forks"[^>]*>([\s\S]*?)<\/a>/i);

    seeds.push({
      full_name: fullName,
      html_url: `https://github.com/${fullName}`,
      description: sanitizeParagraph(descriptionMatch ? sanitizeHtml(descriptionMatch[1]) : ""),
      language: sanitizeLine(languageMatch ? sanitizeHtml(languageMatch[1]) : ""),
      stars: extractFirstNumber(starsMatch ? sanitizeHtml(starsMatch[1]) : ""),
      forks: extractFirstNumber(forksMatch ? sanitizeHtml(forksMatch[1]) : ""),
      stars_today: extractFirstNumber(starsTodayMatch ? starsTodayMatch[1] : ""),
      trending_rank: rank,
      source_name: "github-trending-daily",
    });
  }

  return seeds
    .filter((seed) => seed.full_name)
    .sort((a, b) => {
      if (Number(b.stars_today || 0) !== Number(a.stars_today || 0)) {
        return Number(b.stars_today || 0) - Number(a.stars_today || 0);
      }
      return Number(a.trending_rank || 999) - Number(b.trending_rank || 999);
    });
}

function parseTrendshiftHtml(html) {
  const source = String(html || "");
  const match = source.match(/\\"initialData\\":(\[[\s\S]*?\])(?:,\\"showStars\\")/);
  if (!match) {
    return [];
  }

  const json = match[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  const items = JSON.parse(json);
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      full_name: sanitizeLine(item && item.full_name ? item.full_name : ""),
      html_url: item && item.full_name ? `https://github.com/${item.full_name}` : "",
      description: sanitizeParagraph(item && item.repository_description ? item.repository_description : ""),
      language: sanitizeLine(item && item.repository_language ? item.repository_language : ""),
      stars: Number(item && item.repository_stars ? item.repository_stars : 0),
      forks: Number(item && item.repository_forks ? item.repository_forks : 0),
      trendshift_rank: Number(item && item.rank ? item.rank : 0),
      trendshift_score: Number(item && item.score ? item.score : 0),
      source_name: "trendshift-rising",
    }))
    .filter((item) => item.full_name);
}

async function githubGetRepository(env, fullName) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}`, {
    headers: githubHeaders(env),
  });

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(`GitHub repo fetch failed (${response.status}) for ${fullName}: ${body}`);
  }

  return response.json();
}

function mergeTrendingSeedWithRepository(seed, item) {
  const normalized = normalizeRepository(item, seed.source_name || "github-trending-daily");
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    html_url: seed.html_url || normalized.html_url,
    description: normalized.description || seed.description || "",
    language: normalized.language || seed.language || "",
    stars: normalized.stars || seed.stars || 0,
    forks: normalized.forks || seed.forks || 0,
    scraped_star_delta_24h: Number(seed.stars_today || 0),
    trending_rank: Number(seed.trending_rank || 0),
    trendshift_rank: Number(seed.trendshift_rank || 0),
    trendshift_score: Number(seed.trendshift_score || 0),
  };
}

async function githubSearchRepositories(env, query, sort, page, perPage) {
  const url = new URL(`${GITHUB_API_BASE}/search/repositories`);
  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString(), {
    headers: githubHeaders(env),
  });

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(`GitHub search failed (${response.status}) for query "${query}": ${body}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

function normalizeRepository(item, sourceName) {
  if (!item || !item.full_name || item.fork || item.archived) {
    return null;
  }

  return {
    id: item.id,
    name: item.name,
    full_name: item.full_name,
    html_url: item.html_url,
    description: item.description || "",
    language: item.language || "",
    stars: Number(item.stargazers_count || 0),
    forks: Number(item.forks_count || 0),
    watchers: Number(item.watchers_count || 0),
    open_issues: Number(item.open_issues_count || 0),
    created_at: item.created_at,
    updated_at: item.updated_at,
    pushed_at: item.pushed_at,
    homepage: item.homepage || "",
    default_branch: item.default_branch || "main",
    topics: Array.isArray(item.topics) ? item.topics : [],
    owner_login: item.owner && item.owner.login ? item.owner.login : "",
    search_sources: [sourceName],
    query_rank: Number(item.score || 0),
  };
}

function rankCandidates(candidates, previousSnapshot, now, newsContext, env) {
  const previousMap = new Map(
    Array.isArray(previousSnapshot && previousSnapshot.repositories)
      ? previousSnapshot.repositories.map((repo) => [repo.full_name, repo])
      : [],
  );
  const newsSignals = buildNewsSignals(newsContext);

  return candidates
    .map((repo) => {
      const previous = previousMap.get(repo.full_name) || null;
      const ageDays = Math.max(1, diffDays(repo.created_at, now));
      const hoursSincePush = Math.max(0, diffHours(repo.pushed_at, now));
      const starDelta = Number.isFinite(Number(repo.scraped_star_delta_24h))
        && Number(repo.scraped_star_delta_24h) > 0
        ? Number(repo.scraped_star_delta_24h)
        : previous
          ? Math.max(0, repo.stars - Number(previous.stars || 0))
          : 0;
      const momentum = computeMomentumScore(repo, {
        previous,
        ageDays,
        hoursSincePush,
        starDelta,
      });
      const authenticity = computeAuthenticityScore(repo, {
        ageDays,
      });
      const topic = computeTopicRelevanceScore(repo, newsSignals, authenticity.score, env);
      const aiDomainScore = estimateAIDomainScore(repo);
      const finalScore = Number((momentum.score + authenticity.score + topic.score).toFixed(2));

      return {
        ...repo,
        previous_stars: previous ? Number(previous.stars || 0) : null,
        star_delta_24h: starDelta,
        age_days: ageDays,
        hours_since_push: Number(hoursSincePush.toFixed(1)),
        momentum_score: momentum.score,
        authenticity_score: authenticity.score,
        topic_relevance_score: topic.score,
        ai_domain_score: aiDomainScore,
        final_score: finalScore,
        value_score: finalScore,
        topic_matches: topic.matches,
        authenticity_flags: authenticity.flags,
        reasons: buildReasons(repo, {
          starDelta,
          ageDays,
          hoursSincePush,
          topicMatches: topic.matches,
          authenticityFlags: authenticity.flags,
        }),
      };
    })
    .sort((a, b) => {
      if (b.final_score !== a.final_score) {
        return b.final_score - a.final_score;
      }
      if (b.star_delta_24h !== a.star_delta_24h) {
        return b.star_delta_24h - a.star_delta_24h;
      }
      return b.stars - a.stars;
    });
}

function buildReasons(repo, signals) {
  const reasons = [];

  if (signals.starDelta > 0) {
    reasons.push(`24h stars +${signals.starDelta}`);
  }
  if (signals.ageDays <= 14) {
    reasons.push(`new repo (${signals.ageDays}d old)`);
  }
  if (signals.hoursSincePush <= 24) {
    reasons.push(`pushed ${Math.max(1, Math.round(signals.hoursSincePush))}h ago`);
  }
  if (repo.forks >= 100) {
    reasons.push(`developer interest via ${repo.forks} forks`);
  }
  if (Array.isArray(signals.topicMatches) && signals.topicMatches.length) {
    reasons.push(`news-linked: ${signals.topicMatches.slice(0, 2).join(", ")}`);
  }
  if (Array.isArray(signals.authenticityFlags) && signals.authenticityFlags.length) {
    reasons.push(...signals.authenticityFlags.slice(0, 2));
  }
  if (!reasons.length) {
    reasons.push("selected by composite score");
  }

  return reasons;
}

function computeMomentumScore(repo, signals) {
  const starDeltaScore = Math.min(40, Math.sqrt(Math.max(0, signals.starDelta)) * 4);
  const earlyVelocityScore = signals.previous
    ? 0
    : Math.min(18, (Math.log10(repo.stars + 1) * 6) / Math.sqrt(signals.ageDays));
  const recencyScore = Math.max(0, 48 - signals.hoursSincePush) / 48 * 10;
  const forkHeatScore = Math.min(8, Math.log10(repo.forks + 1) * 2);
  const score = Number((starDeltaScore + earlyVelocityScore + recencyScore + forkHeatScore).toFixed(2));

  return {
    score,
    details: {
      starDeltaScore: Number(starDeltaScore.toFixed(2)),
      earlyVelocityScore: Number(earlyVelocityScore.toFixed(2)),
      recencyScore: Number(recencyScore.toFixed(2)),
      forkHeatScore: Number(forkHeatScore.toFixed(2)),
    },
  };
}

function computeAuthenticityScore(repo, signals) {
  let score = 8;
  const flags = [];
  const combinedText = `${repo.name} ${repo.description}`.toLowerCase();

  if (repo.description) score += 4;
  if (repo.homepage) score += 2;
  if (repo.language) score += 1.5;
  if (Array.isArray(repo.topics) && repo.topics.length > 0) score += 1.5;
  if (repo.open_issues > 0) score += 1;
  if (repo.forks > 0) score += 1;
  if (Array.isArray(repo.search_sources) && repo.search_sources.length > 1) score += 1;
  if (signals.ageDays >= 2) score += 1;

  if (/\b(mirror|fork of|unofficial|backup|archive|reupload|sourcemap|source map|reverse[- ]engineer|reimplementation)\b|搬运|转载/i.test(combinedText)) {
    score -= 12;
    flags.push("mirror-risk");
  }

  if (/^(awesome-|list-|collection-)/i.test(repo.name || "")) {
    score -= 5;
    flags.push("list-like");
  }

  if (signals.ageDays < 14 && repo.stars >= 200 && repo.forks > repo.stars * 0.55) {
    score -= 8;
    flags.push("fork-heavy");
  }

  if (signals.ageDays < 5 && repo.stars >= 1000 && !repo.homepage && repo.open_issues === 0) {
    score -= 4;
    flags.push("thin-footprint");
  }

  score = Number(Math.max(0, Math.min(25, score)).toFixed(2));
  return { score, flags };
}

function normalizeDeliveryHistory(history) {
  const safe = history && typeof history === "object" ? history : {};
  return {
    saved_at: safe.saved_at || null,
    repos: safe.repos && typeof safe.repos === "object" ? safe.repos : {},
    news: safe.news && typeof safe.news === "object" ? safe.news : {},
  };
}

function filterRepeatedProjects(ranked, history, now, env, force = false) {
  if (force) {
    return ranked;
  }

  const cooldownDays = getRepeatCooldownDays(env);
  const repeatWindowDays = getRepeatWindowDays(env);
  const breakoutStarDelta = getBreakoutStarDelta(env);
  const minResurfaceStarGain = getMinResurfaceStarGain(env);
  const minResurfaceDays = getMinResurfaceDays(env);

  return ranked.filter((repo) => {
    const record = history.repos[repo.full_name];
    if (!record) {
      return true;
    }

    const dates = Array.isArray(record.sent_dates) ? record.sent_dates : [];
    const recentDates = dates.filter((value) => diffDays(value, now) < repeatWindowDays);
    const daysSinceLastSent = record.last_sent_at ? diffDays(record.last_sent_at, now) : Number.POSITIVE_INFINITY;
    const lastMomentumScore = Number(record.last_momentum_score);
    const lastSentStars = Number(record.last_stars || 0);
    const starsSinceLastSend = Math.max(0, repo.stars - lastSentStars);
    const pushedSinceLastSend = hasMeaningfulPushAfter(repo.pushed_at, record.last_sent_at);
    const breakoutOverride = repo.star_delta_24h >= breakoutStarDelta
      || starsSinceLastSend >= breakoutStarDelta
      || (Number.isFinite(lastMomentumScore) && repo.momentum_score >= lastMomentumScore + 12 && pushedSinceLastSend);
    const meaningfulResurface = starsSinceLastSend >= minResurfaceStarGain
      && daysSinceLastSent >= minResurfaceDays
      && (pushedSinceLastSend || repo.star_delta_24h >= Math.max(10, Math.floor(minResurfaceStarGain / 4)));

    repo.repeat_info = {
      last_sent_at: record.last_sent_at || null,
      days_since_last_sent: Number.isFinite(daysSinceLastSent) ? Number(daysSinceLastSent.toFixed(1)) : null,
      sent_count_window: recentDates.length,
      stars_since_last_send: starsSinceLastSend,
      pushed_since_last_send: pushedSinceLastSend,
      meaningful_resurface: meaningfulResurface,
      breakout_override: breakoutOverride,
    };

    if (daysSinceLastSent < cooldownDays) {
      return breakoutOverride && daysSinceLastSent >= DEFAULT_MIN_BREAKOUT_REPEAT_GAP_DAYS;
    }

    if (recentDates.length >= 1 && !breakoutOverride) {
      return false;
    }

    if (breakoutOverride) {
      return daysSinceLastSent >= DEFAULT_MIN_BREAKOUT_REPEAT_GAP_DAYS;
    }

    return meaningfulResurface;
  });
}

async function annotateReleaseSignals(env, repositories, now) {
  const annotated = [];

  for (const repo of repositories) {
    if (repo.star_delta_24h > 0) {
      annotated.push({
        ...repo,
        has_recent_release: false,
        recent_release: null,
        release_signal_score: 0,
      });
      continue;
    }

    let releaseInfo = null;
    try {
      releaseInfo = await fetchLatestReleaseInfo(env, repo.full_name, now);
    } catch (error) {
      releaseInfo = {
        ok: false,
        has_recent_release: false,
        error: formatError(error),
      };
    }

    const hasRecentRelease = Boolean(releaseInfo && releaseInfo.has_recent_release);
    const releaseSignalScore = hasRecentRelease ? 6 : 0;
    const releaseName = releaseInfo && releaseInfo.release && releaseInfo.release.name
      ? releaseInfo.release.name
      : "recent release";
    const reasons = hasRecentRelease
      ? Array.from(new Set([...(Array.isArray(repo.reasons) ? repo.reasons : []), `official release: ${releaseName}`]))
      : repo.reasons;
    const boostedFinalScore = Number((Number(repo.final_score || 0) + releaseSignalScore).toFixed(2));

    annotated.push({
      ...repo,
      has_recent_release: hasRecentRelease,
      recent_release: releaseInfo && releaseInfo.release ? releaseInfo.release : null,
      release_signal_score: releaseSignalScore,
      final_score: boostedFinalScore,
      value_score: boostedFinalScore,
      reasons,
    });
  }

  return annotated.sort((a, b) => {
    if (Number(b.final_score || 0) !== Number(a.final_score || 0)) {
      return Number(b.final_score || 0) - Number(a.final_score || 0);
    }
    if (Number(b.star_delta_24h || 0) !== Number(a.star_delta_24h || 0)) {
      return Number(b.star_delta_24h || 0) - Number(a.star_delta_24h || 0);
    }
    return Number(b.stars || 0) - Number(a.stars || 0);
  });
}

async function annotateReleaseSignalsForCandidates(env, repositories, now) {
  const releaseCandidates = selectReleaseCandidatesForAnnotation(repositories, env);
  const annotatedCandidates = await annotateReleaseSignals(env, releaseCandidates, now);
  const annotatedMap = new Map(annotatedCandidates.map((repo) => [repo.full_name, repo]));

  return (repositories || []).map((repo) => annotatedMap.get(repo.full_name) || {
    ...repo,
    has_recent_release: false,
    recent_release: null,
    release_signal_score: 0,
  });
}

function selectReleaseCandidatesForAnnotation(repositories, env) {
  const authenticityThreshold = getAuthenticityThreshold(env);
  return (repositories || [])
    .filter((repo) => Number(repo.star_delta_24h || 0) <= 0)
    .filter((repo) => Number(repo.authenticity_score || 0) >= authenticityThreshold)
    .filter((repo) => Number(repo.ai_domain_score || 0) >= 2 || Number(repo.topic_relevance_score || 0) > 0)
    .sort((a, b) => Number(b.final_score || 0) - Number(a.final_score || 0))
    .slice(0, DEFAULT_RELEASE_CANDIDATE_LIMIT);
}

async function fetchLatestReleaseInfo(env, fullName, now) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}/releases?per_page=1`, {
    headers: githubHeaders(env),
  });

  if (response.status === 404) {
    return { ok: true, has_recent_release: false, release: null };
  }

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(`GitHub releases fetch failed (${response.status}) for ${fullName}: ${body}`);
  }

  const payload = await response.json();
  const latest = Array.isArray(payload) && payload.length ? payload[0] : null;
  if (!latest || latest.draft || latest.prerelease) {
    return { ok: true, has_recent_release: false, release: null };
  }

  const publishedAt = latest.published_at || latest.created_at || null;
  const hasRecentRelease = publishedAt
    ? diffHours(publishedAt, now) <= getReleaseLookbackHours(env)
    : false;

  return {
    ok: true,
    has_recent_release: hasRecentRelease,
    release: {
      name: latest.name || latest.tag_name || "",
      url: latest.html_url || "",
      published_at: publishedAt,
    },
  };
}

function filterDeliverableProjects(repositories, env) {
  const minDelta = getMinDeliverableStarDelta(env);
  const authenticityThreshold = getAuthenticityThreshold(env);
  const minAIDomainScore = 2;
  const breakoutDelta = 100;
  const breakoutForks = 1000;
  const lowDeltaQualityFloor = 30;

  return repositories.filter((repo) => {
    const isBreakout = repo.star_delta_24h >= breakoutDelta || (repo.star_delta_24h >= 20 && repo.forks >= breakoutForks);
    const hasReleaseSignal = Boolean(repo.has_recent_release)
      && repo.authenticity_score >= authenticityThreshold
      && repo.ai_domain_score >= minAIDomainScore
      && (repo.stars >= 120 || Number(repo.release_signal_score || 0) > 0);
    const isRelevant = repo.ai_domain_score >= minAIDomainScore || repo.topic_relevance_score > 0;
    if (!isRelevant && !isBreakout && !hasReleaseSignal) {
      return false;
    }

    if (!passesBaselineQualification(repo)) {
      return false;
    }

    if (repo.star_delta_24h >= minDelta) {
      return true;
    }

    if (
      repo.star_delta_24h > 0
      && repo.authenticity_score >= authenticityThreshold
      && Number(repo.final_score || 0) >= lowDeltaQualityFloor
    ) {
      return true;
    }

    if (hasReleaseSignal) {
      return true;
    }

    return false;
  });
}

function selectProjectsForDigest(repositories, env) {
  const hardCap = getMaxProjects(env);
  const profiled = (repositories || [])
    .map((repo) => ({
      ...repo,
      qualification_profile: buildQualificationProfile(repo),
    }))
    .sort((a, b) => {
      if (a.qualification_profile.hotness_priority !== b.qualification_profile.hotness_priority) {
        return a.qualification_profile.hotness_priority - b.qualification_profile.hotness_priority;
      }
      const aPriority = getBucketPriority(a.qualification_profile.bucket);
      const bPriority = getBucketPriority(b.qualification_profile.bucket);
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      if (b.qualification_profile.adjusted_score !== a.qualification_profile.adjusted_score) {
        return b.qualification_profile.adjusted_score - a.qualification_profile.adjusted_score;
      }
      if (Number(b.final_score || 0) !== Number(a.final_score || 0)) {
        return Number(b.final_score || 0) - Number(a.final_score || 0);
      }
      return Number(b.star_delta_24h || 0) - Number(a.star_delta_24h || 0);
    });

  const bucketCaps = {
    core: hardCap,
    reference: Math.min(2, Math.max(1, Math.floor(hardCap / 8))),
    clone: Math.min(2, Math.max(1, Math.floor(hardCap / 8))),
    risk_watch: 1,
  };
  const bucketCounts = {
    core: 0,
    reference: 0,
    clone: 0,
    risk_watch: 0,
  };
  const familyStates = new Map();
  const selected = [];

  for (const repo of profiled) {
    if (selected.length >= hardCap) {
      break;
    }

    const profile = repo.qualification_profile;
    if (profile.adjusted_score < profile.minimum_score) {
      continue;
    }
    if ((bucketCounts[profile.bucket] || 0) >= (bucketCaps[profile.bucket] || 0)) {
      continue;
    }
    const familyState = familyStates.get(profile.family_key) || null;
    if (!canSelectFamilyRepresentative(profile, familyState)) {
      continue;
    }

    selected.push(repo);
    bucketCounts[profile.bucket] += 1;
    familyStates.set(profile.family_key, updateFamilySelectionState(profile, familyState));
  }

  return selected.map((repo) => {
    const { qualification_profile, ...rest } = repo;
    return rest;
  });
}

async function enrichProjects(env, projects) {
  const limit = Math.min(DEFAULT_README_ENRICH_LIMIT, Array.isArray(projects) ? projects.length : 0);
  return Promise.all((projects || []).map(async (repo, index) => {
    if (index >= limit) {
      return {
        ...repo,
        readme_excerpt: "",
      };
    }
    let readme = "";
    try {
      readme = await fetchReadme(env, repo.full_name);
    } catch (error) {
      readme = "";
      console.warn(`README fetch failed for ${repo.full_name}: ${formatError(error)}`);
    }

    return {
      ...repo,
      readme_excerpt: readme,
    };
  }));
}

function passesBaselineQualification(repo) {
  const profile = buildQualificationProfile(repo);
  if (profile.hotness_tier === "cold") {
    return false;
  }
  if (profile.bucket === "risk_watch") {
    return profile.hotness_tier === "breakout";
  }
  if (profile.bucket === "clone") {
    return profile.hotness_tier === "breakout" || profile.hotness_tier === "surging";
  }
  if (profile.bucket === "reference") {
    return (profile.hotness_tier === "breakout" || profile.hotness_tier === "surging" || profile.hotness_tier === "emerging")
      && Number(repo.final_score || 0) >= 34;
  }
  return profile.hotness_tier !== "cold";
}

function buildQualificationProfile(repo) {
  const projectType = inferProjectType(repo);
  const riskText = inferProjectRisk(repo);
  const legalRisk = hasLegalOrLeakRisk(riskText);
  const cloneSignals = hasCloneSignals(repo);
  const isReference = projectType === "资料型项目" || projectType === "资料集合";
  const isCollection = projectType === "资料集合";
  const authenticity = Number(repo.authenticity_score || 0);
  const hotness = buildHotnessProfile(repo);
  let bucket = "core";
  let adjustedScore = Number(repo.final_score || 0);
  let minimumScore = 32;
  let familyCap = 2;

  if (isReference) {
    bucket = "reference";
    adjustedScore -= isCollection ? 10 : 6;
    minimumScore = isCollection ? 42 : 36;
    familyCap = 2;
  }

  if (cloneSignals) {
    bucket = legalRisk ? "risk_watch" : "clone";
    adjustedScore -= legalRisk ? 14 : 7;
    minimumScore = legalRisk ? 44 : 38;
    familyCap = 1;
  }

  if (authenticity < 10 && bucket === "core") {
    bucket = "risk_watch";
    adjustedScore -= 8;
    minimumScore = 42;
    familyCap = 1;
  }

  if (Number(repo.star_delta_24h || 0) < 5 && !repo.has_recent_release) {
    adjustedScore -= 4;
  }
  adjustedScore += hotness.bonus;

  return {
    bucket,
    project_type: projectType,
    type_key: `${bucket}:${projectType}`,
    hotness_tier: hotness.tier,
    hotness_priority: hotness.priority,
    adjusted_score: Number(adjustedScore.toFixed(2)),
    minimum_score: minimumScore,
    family_key: deriveQualificationFamilyKey(repo, projectType, bucket),
    family_cap: familyCap,
  };
}

function buildHotnessProfile(repo) {
  const delta = Number(repo.star_delta_24h || 0);
  const isReleaseLead = Boolean(repo.has_recent_release) && Number(repo.topic_relevance_score || 0) >= 2;
  const trendshiftRank = Number(repo.trendshift_rank || 0);
  const trendshiftScore = Number(repo.trendshift_score || 0);
  if (delta >= 120 || (delta >= 80 && Number(repo.forks || 0) >= 500)) {
    return { tier: "breakout", priority: HOTNESS_TIER_PRIORITY.breakout, bonus: 12 };
  }
  if (delta >= 50) {
    return { tier: "surging", priority: HOTNESS_TIER_PRIORITY.surging, bonus: 8 };
  }
  if (delta >= 20) {
    return { tier: "emerging", priority: HOTNESS_TIER_PRIORITY.emerging, bonus: 4 };
  }
  if (delta >= 8) {
    return { tier: "watch", priority: HOTNESS_TIER_PRIORITY.watch, bonus: 1 };
  }
  if (trendshiftRank > 0 && trendshiftRank <= 5 && trendshiftScore >= 3500) {
    return { tier: "emerging", priority: HOTNESS_TIER_PRIORITY.emerging, bonus: 3 };
  }
  if (trendshiftRank > 0 && trendshiftRank <= 15 && trendshiftScore >= 2500) {
    return { tier: "watch", priority: HOTNESS_TIER_PRIORITY.watch, bonus: 1 };
  }
  if (isReleaseLead) {
    return { tier: "release", priority: HOTNESS_TIER_PRIORITY.release, bonus: 2 };
  }
  return { tier: "cold", priority: HOTNESS_TIER_PRIORITY.cold, bonus: -8 };
}

function deriveQualificationFamilyKey(repo, projectType, bucket) {
  const familyToken = inferQualificationFamilyToken(repo);
  return familyToken === "general"
    ? `${bucket}:${projectType}:general`
    : familyToken;
}

function inferQualificationFamilyToken(repo) {
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  const knownFamilies = [
    "claude code",
    "codex",
    "copilot",
    "cursor",
    "gemini",
    "mcp",
    "agent harness",
    "multi agent",
    "design md",
  ];
  for (const family of knownFamilies) {
    if (corpus.includes(family)) {
      return family.replace(/\s+/g, "-");
    }
  }

  const firstTopic = tokenizeMeaningful([
    inferRepositoryTopic(repo),
    ...(Array.isArray(repo.topics) ? repo.topics : []),
    repo.name,
  ].join(" ")).find(Boolean);
  return firstTopic || "general";
}

function hasCloneSignals(repo) {
  const flags = Array.isArray(repo.authenticity_flags) ? repo.authenticity_flags : [];
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    repo.readme_excerpt,
    Array.isArray(repo.reasons) ? repo.reasons.join(" ") : "",
  ].join(" "));
  return flags.includes("mirror-risk")
    || flags.includes("fork-heavy")
    || /\breimplementation\b|\bunofficial\b|\breverse engineer\b|\bparity\b|\bported from\b|源码|泄漏|source map/.test(corpus);
}

function getBucketPriority(bucket) {
  return Object.prototype.hasOwnProperty.call(QUALIFICATION_BUCKET_PRIORITY, bucket)
    ? QUALIFICATION_BUCKET_PRIORITY[bucket]
    : 99;
}

function canSelectFamilyRepresentative(profile, familyState) {
  if (!familyState) {
    return true;
  }
  if (familyState.count >= profile.family_cap) {
    return false;
  }
  if (profile.bucket === "risk_watch" || familyState.bucket_keys.has("risk_watch")) {
    return false;
  }
  if (familyState.type_keys.has(profile.type_key)) {
    return false;
  }
  if (familyState.bucket_keys.has(profile.bucket)) {
    return false;
  }
  return true;
}

function updateFamilySelectionState(profile, familyState) {
  const next = familyState
    ? {
        count: familyState.count,
        type_keys: new Set(familyState.type_keys),
        bucket_keys: new Set(familyState.bucket_keys),
      }
    : {
        count: 0,
        type_keys: new Set(),
        bucket_keys: new Set(),
      };
  next.count += 1;
  next.type_keys.add(profile.type_key);
  next.bucket_keys.add(profile.bucket);
  return next;
}

function mergeNewsContexts(juyaContext, officialContext) {
  return {
    ...(juyaContext || {}),
    official_status: officialContext && officialContext.status ? officialContext.status : "empty",
    official_updates: officialContext && Array.isArray(officialContext.items) ? officialContext.items : [],
    official_sources: officialContext && Array.isArray(officialContext.sources) ? officialContext.sources : [],
  };
}

async function fetchOfficialUpdates(env, now, juyaContext) {
  const feedFetches = OFFICIAL_UPDATE_FEEDS.map((feed) => fetchOfficialFeed(feed, now));
  const results = await Promise.allSettled(feedFetches);
  const juyaTitles = collectJuyaTitlesForDedupe(juyaContext);
  const items = [];
  const sources = [];

  results.forEach((result, index) => {
    const feed = OFFICIAL_UPDATE_FEEDS[index];
    if (result.status === "fulfilled") {
      const feedItems = Array.isArray(result.value) ? result.value : [];
      sources.push({
        id: feed.id,
        source: feed.source,
        status: "ok",
        count: feedItems.length,
      });
      feedItems.forEach((item) => {
        if (!hasEquivalentNewsTitle(juyaTitles, item.title)) {
          items.push(item);
        }
      });
      return;
    }

    sources.push({
      id: feed.id,
      source: feed.source,
      status: "error",
      count: 0,
      error: formatError(result.reason),
    });
  });

  const deduped = dedupeOfficialUpdates(items).slice(0, DEFAULT_OFFICIAL_UPDATE_LIMIT);
  const okCount = sources.filter((item) => item.status === "ok").length;

  return {
    status: deduped.length
      ? (okCount === sources.length ? "ok" : "partial")
      : (okCount > 0 ? "empty" : "fetch_failed"),
    items: deduped,
    sources,
  };
}

async function fetchOfficialFeed(feed, now) {
  const response = await fetchWithTimeout(feed.url, {
    headers: {
        "user-agent": "ai-github-digest-worker",
      "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  }, DEFAULT_OFFICIAL_UPDATE_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Official feed fetch failed (${response.status}) for ${feed.source}`);
  }

  const xml = await response.text();
  const items = parseOfficialFeedItems(xml, feed);
  return items
    .filter((item) => isRecentEnough(item.published_at, now, feed.maxAgeHours || DEFAULT_OFFICIAL_UPDATE_LOOKBACK_HOURS))
    .filter((item) => matchesOfficialFeedKeywords(item, feed))
    .slice(0, feed.maxItems || 1);
}

async function fetchJuyaDigest(env, history, now, force) {
  const rssUrl = String(env.JUYA_RSS_URL || DEFAULT_JUYA_RSS_URL);
  const headers = {
      "user-agent": "ai-github-digest-worker",
    "accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  };

  try {
    const response = await fetch(rssUrl, { headers });
    if (!response.ok) {
      throw new Error(`RSS fetch failed (${response.status})`);
    }

    const xml = await response.text();
    const items = parseRssItems(xml, getJuyaContentLimit(env));
    if (!items.length) {
      return {
        source: "橘鸦 AI 早报",
        status: "rss_empty",
        latest: null,
        freshNews: null,
      };
    }

    const latest = pickLatestNewsItem(items, now);
    if (!latest) {
      return {
        source: "橘鸦 AI 早报",
        status: "rss_no_matching_item",
        latest: null,
        freshNews: null,
      };
    }

    const lastLink = history.news.last_link || null;
    const isFresh = force || !lastLink || lastLink !== latest.link;
    return {
      source: "橘鸦 AI 早报",
      status: isFresh ? "fresh" : "unchanged",
      latest,
      freshNews: isFresh ? latest : null,
    };
  } catch (error) {
    return {
      source: "橘鸦 AI 早报",
      status: "fetch_failed",
      latest: null,
      freshNews: null,
      error: formatError(error),
    };
  }
}

function parseRssItems(xml, contentLimit) {
  const items = [];
  const matches = String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of matches) {
    const block = match[1];
    const title = decodeHtmlEntities(extractXmlField(block, "title"));
    const link = decodeHtmlEntities(extractXmlField(block, "link"));
    const description = decodeHtmlEntities(extractXmlField(block, "description"));
    const contentHtml = extractXmlField(block, "content:encoded", true);
    const pubDate = decodeHtmlEntities(extractXmlField(block, "pubDate"));

    if (!title || !link) {
      continue;
    }

    items.push({
      title,
      link,
      pubDate,
      description,
      content_html: contentHtml,
      content_text: sanitizeHtml(contentHtml || description),
      entries: extractJuyaNewsEntries(contentHtml),
    });
  }
  return items;
}

function parseOfficialFeedItems(xml, feed) {
  const source = String(xml || "");
  const items = /<entry[\s>]/i.test(source)
    ? parseAtomFeedItems(source)
    : parseGenericRssFeedItems(source);

  return items
    .map((item) => ({
      source: feed.source,
      title: sanitizeLine(stripCdata(item.title || "")),
      link: sanitizeLine(item.link || ""),
      summary: truncateText(sanitizeParagraph(stripCdata(item.summary || item.description || "")), 180),
      published_at: item.published_at || item.pubDate || null,
    }))
    .filter((item) => item.title && item.link)
    .filter((item) => !hasLowSignalOfficialUpdate(item));
}

function parseGenericRssFeedItems(xml) {
  const items = [];
  const matches = String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of matches) {
    const block = match[1];
    items.push({
      title: decodeHtmlEntities(extractXmlField(block, "title")),
      link: decodeHtmlEntities(extractXmlField(block, "link")),
      description: sanitizeHtml(extractXmlField(block, "description", true)),
      summary: sanitizeHtml(extractXmlField(block, "content:encoded", true) || extractXmlField(block, "description", true)),
      pubDate: decodeHtmlEntities(extractXmlField(block, "pubDate")),
      published_at: decodeHtmlEntities(extractXmlField(block, "pubDate")),
    });
  }
  return items;
}

function parseAtomFeedItems(xml) {
  const items = [];
  const matches = String(xml || "").matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi);
  for (const match of matches) {
    const block = match[1];
    items.push({
      title: decodeHtmlEntities(extractXmlField(block, "title", true)),
      link: extractAtomLink(block),
      description: sanitizeHtml(extractXmlField(block, "summary", true)),
      summary: sanitizeHtml(extractXmlField(block, "summary", true) || extractXmlField(block, "content", true)),
      published_at: decodeHtmlEntities(extractXmlField(block, "updated") || extractXmlField(block, "published")),
    });
  }
  return items;
}

function extractAtomLink(block) {
  const preferred = String(block || "").match(/<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/i);
  if (preferred) {
    return decodeHtmlEntities(preferred[1]);
  }
  const href = String(block || "").match(/<link\b[^>]*href="([^"]+)"/i);
  if (href) {
    return decodeHtmlEntities(href[1]);
  }
  return decodeHtmlEntities(extractXmlField(block, "link"));
}

function collectJuyaTitlesForDedupe(newsContext) {
  const titles = [];
  const article = newsContext && (newsContext.freshNews || newsContext.latest);
  if (article && article.title) {
    titles.push(article.title);
  }
  if (article && Array.isArray(article.entries)) {
    article.entries.forEach((entry) => {
      if (entry && entry.title) {
        titles.push(entry.title);
      }
    });
  }
  return titles;
}

function dedupeOfficialUpdates(items) {
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const aTime = new Date(a.published_at || 0).getTime();
    const bTime = new Date(b.published_at || 0).getTime();
    return bTime - aTime;
  });
  const deduped = [];
  const seenTitles = [];
  sorted.forEach((item) => {
    const title = sanitizeLine(item && item.title ? item.title : "");
    if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
      return;
    }
    seenTitles.push(title);
    deduped.push(item);
  });
  return deduped;
}

function matchesOfficialFeedKeywords(item, feed) {
  const hints = Array.isArray(feed && feed.keywordHints) ? feed.keywordHints : [];
  if (!hints.length) {
    return true;
  }

  const corpus = normalizeText(`${item.title || ""} ${item.summary || ""}`);
  return hints.some((hint) => corpus.includes(normalizeText(hint)));
}

function hasLowSignalOfficialUpdate(item) {
  const corpus = normalizeText(`${item && item.source ? item.source : ""} ${item && item.title ? item.title : ""} ${item && item.summary ? item.summary : ""}`);
  if (!corpus) {
    return true;
  }
  return /(customer|customers|bank|case study|success story|company|companies|business|startup|funding|pricing for teams|for teams|gives every)/i.test(corpus);
}

function isRecentEnough(publishedAt, now, maxAgeHours) {
  const value = new Date(publishedAt || "").getTime();
  if (!Number.isFinite(value) || value <= 0) {
    return true;
  }
  return diffHours(new Date(value).toISOString(), now) <= maxAgeHours;
}

function pickLatestNewsItem(items, now) {
  const sorted = [...items].sort((a, b) => {
    const aTime = new Date(a.pubDate || 0).getTime();
    const bTime = new Date(b.pubDate || 0).getTime();
    return bTime - aTime;
  });

  for (const item of sorted) {
    if (!item.pubDate) continue;
    const itemTime = new Date(item.pubDate);
    // Only accept items with valid dates that are not in the future (with 1 hour tolerance)
    if (!Number.isNaN(itemTime.getTime()) && itemTime.getTime() <= now.getTime() + (60 * 60 * 1000)) {
      return item;
    }
  }

  return sorted[0] || null;
}

function buildDigestNewsInput(newsContext) {
  const news = newsContext && newsContext.freshNews ? newsContext.freshNews : null;
  const officialUpdates = newsContext && Array.isArray(newsContext.official_updates)
    ? newsContext.official_updates
    : [];
  if (!news && !officialUpdates.length) {
    return null;
  }

  return {
    source: news ? "橘鸦 AI 早报" : "official-updates",
    issue_title: news ? news.title : "今日官方更新",
    link: news ? news.link : "",
    published_at: news ? (news.pubDate || null) : null,
    description: news ? (news.description || "") : "",
    content_excerpt: news ? (news.content_text || "") : "",
    entries: news && Array.isArray(news.entries) ? news.entries : [],
    official_updates: officialUpdates.map((item) => ({
      source: item.source,
      title: item.title,
      summary: item.summary,
      link: item.link,
      published_at: item.published_at || null,
    })),
  };
}

function buildDeepSeekRepositoryInputs(repositories) {
  return repositories.map((repo) => ({
    full_name: repo.full_name,
    html_url: repo.html_url,
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
  }));
}

function buildRepositorySelectionContext(repo) {
  const context = [];

  if (repo.star_delta_24h >= 20) {
    context.push("过去24小时增长明显");
  } else if (repo.star_delta_24h > 0) {
    context.push("今天仍有增长");
  }
  if (repo.age_days <= 14) {
    context.push("属于新项目");
  }
  if (repo.hours_since_push <= 24) {
    context.push("最近24小时仍在活跃更新");
  }
  if (repo.has_recent_release) {
    context.push("最近有正式发布");
  }
  if (Array.isArray(repo.topic_matches) && repo.topic_matches.length) {
    context.push(`与今日新闻主题相关：${repo.topic_matches.join("、")}`);
  }
  if (repo.authenticity_score < 10) {
    context.push("真实性或合规性信号偏弱");
  }

  return context;
}

function buildNewsSignals(newsContext) {
  const article = newsContext && (newsContext.freshNews || newsContext.latest);
  const officialUpdates = newsContext && Array.isArray(newsContext.official_updates)
    ? newsContext.official_updates
    : [];
  const officialText = officialUpdates
    .slice(0, DEFAULT_OFFICIAL_UPDATE_LIMIT)
    .map((item) => `${item.title} ${item.summary || ""}`)
    .join(" ");
  const summaryParts = [];
  if (article) {
    summaryParts.push(article.title, article.description);
  }
  if (officialText) {
    summaryParts.push(officialText);
  }
  if (!summaryParts.length) {
    return null;
  }
  const summaryText = normalizeText(summaryParts.join(" "));
  const summaryPhrases = extractNewsPhrases(summaryText);

  return {
    normalized: summaryText,
    tokens: new Set(tokenizeMeaningful(summaryText)),
    phrases: Array.from(new Set(summaryPhrases)),
  };
}

function computeTopicRelevanceScore(repo, newsSignals, authenticityScore, env) {
  if (!newsSignals || authenticityScore < getAuthenticityThreshold(env)) {
    return { score: 0, matches: [] };
  }

  const corpus = normalizeText([
    repo.full_name,
    repo.name,
    repo.description,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
    repo.owner_login,
  ].join(" "));
  const matches = [];
  let score = 0;

  const fullName = normalizeText(repo.full_name || "");
  const repoName = normalizeText(repo.name || "");
  if (fullName && newsSignals.normalized.includes(fullName)) {
    score += 8;
    matches.push(repo.full_name);
  } else if (repoName && repoName.length >= 5 && !isWeakTopicToken(repoName) && newsSignals.normalized.includes(repoName)) {
    score += 6;
    matches.push(repo.name);
  }

  const seen = new Set(matches.map((item) => item.toLowerCase()));
  for (const phrase of newsSignals.phrases) {
    if (phrase.length < 4 || seen.has(phrase)) {
      continue;
    }
    if (corpus.includes(phrase)) {
      score += phrase.includes(" ") ? 4 : 2;
      seen.add(phrase);
      matches.push(phrase);
    }
    if (score >= DEFAULT_TOPIC_RELEVANCE_MAX) {
      break;
    }
  }

  for (const topic of Array.isArray(repo.topics) ? repo.topics : []) {
    const normalizedTopic = normalizeText(topic);
    if (!normalizedTopic || normalizedTopic.length < 4 || seen.has(normalizedTopic) || isWeakTopicToken(normalizedTopic)) {
      continue;
    }
    if (newsSignals.normalized.includes(normalizedTopic)) {
      score += 2;
      seen.add(normalizedTopic);
      matches.push(topic);
    }
    if (score >= DEFAULT_TOPIC_RELEVANCE_MAX) {
      break;
    }
  }

  score = Number(Math.max(0, Math.min(DEFAULT_TOPIC_RELEVANCE_MAX, score)).toFixed(2));
  return {
    score,
    matches: matches.slice(0, 4),
  };
}

function estimateAIDomainScore(repo) {
  const corpus = normalizeText([
    repo.full_name,
    repo.name,
    repo.description,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
    repo.owner_login,
  ].join(" "));
  let score = 0;

  for (const term of AI_DOMAIN_TERMS) {
    if (corpus.includes(term)) {
      score += term.length >= 6 ? 2 : 1;
    }
  }

  return Math.min(12, score);
}

async function fetchReadme(env, fullName) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}/readme`, {
    headers: githubHeaders(env),
  });

  if (response.status === 404) {
    return "";
  }

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(`GitHub README fetch failed (${response.status}) for ${fullName}: ${body}`);
  }

  const payload = await response.json();
  if (!payload || payload.encoding !== "base64" || !payload.content) {
    return "";
  }

  const decoded = decodeBase64Utf8(payload.content);
  return sanitizeReadme(decoded).slice(0, README_CHAR_LIMIT);
}

async function summarizeDigest(env, payload) {
  const overview = await summarizeDigestOverview(env, payload);
  const projectDigest = await summarizeProjectDigests(env, payload);

  return {
    email_subject: overview.email_subject,
    opening_cn: overview.opening_cn,
    bridge_cn: overview.bridge_cn,
    overall_summary: overview.overall_summary,
    projects: projectDigest.projects,
    news_section: overview.news_section,
    meta: {
      project_batches: projectDigest.batch_count,
      fallback_projects: projectDigest.fallback_count,
      missing_projects: projectDigest.missing_projects,
      overview_fallback: Boolean(overview.__fallback),
      overview_error: overview.__error || "",
      project_fallback_reasons: projectDigest.fallback_reasons,
    },
  };
}

async function summarizeDigestOverview(env, payload) {
  const fallback = buildFallbackOverviewDigest(payload);

  try {
    const data = await callDeepSeekJson(env, {
      modelOverride: getDigestOverviewModel(env),
      maxTokens: 2200,
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
        "When news.entries are provided, cover 8-12 concrete items in news_section.items_cn.",
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

    return normalizeOverviewDigest(data, fallback);
  } catch (error) {
    return {
      ...fallback,
      __error: formatError(error),
    };
  }
}

async function summarizeProjectDigests(env, payload) {
  const repositories = Array.isArray(payload.repositories) ? payload.repositories : [];
  const batches = chunkArray(repositories, DEFAULT_PROJECT_SUMMARY_BATCH_SIZE);
  const projects = [];
  const missingProjects = [];
  const fallbackReasons = [];
  let fallbackCount = 0;

  for (const batch of batches) {
    let batchResults;

    try {
      batchResults = await summarizeProjectBatch(env, {
        reportDate: payload.reportDate,
        timezone: payload.timezone,
        trigger: payload.trigger,
        repositories: batch,
        news: buildProjectSummaryNewsHint(payload.news),
      });
    } catch (error) {
      batchResults = batch.map((repo) => buildFallbackProjectSummary(repo, `project-batch-error: ${formatError(error)}`));
    }

    const retryRepos = batchResults
      .filter((item) => item.__fallback)
      .map((item) => batch.find((repo) => repo.full_name === item.full_name))
      .filter(Boolean);

    if (retryRepos.length > 0) {
      const retryBatchSize = retryRepos.length === batch.length
        ? Math.max(1, Math.floor(DEFAULT_PROJECT_SUMMARY_BATCH_SIZE / 2))
        : retryRepos.length;
      const retriedMap = new Map();

      for (const retryBatch of chunkArray(retryRepos, retryBatchSize)) {
        try {
          const retried = await summarizeProjectBatch(env, {
            reportDate: payload.reportDate,
            timezone: payload.timezone,
            trigger: payload.trigger,
            repositories: retryBatch,
            news: buildProjectSummaryNewsHint(payload.news),
          });
          retried.forEach((item) => {
            retriedMap.set(item.full_name, item);
          });
        } catch {
          // Keep the first-pass results for this subset.
        }
      }

      batchResults = batchResults.map((item) => retriedMap.get(item.full_name) || item);
    }

    batchResults.forEach((item) => {
      if (item.__fallback) {
        fallbackCount += 1;
        missingProjects.push(item.full_name);
        if (item.__fallback_reason) {
          fallbackReasons.push(`${item.full_name}: ${item.__fallback_reason}`);
        }
      }
      projects.push(stripProjectSummaryDebug(item));
    });
  }

  return {
    projects,
    batch_count: batches.length,
    fallback_count: fallbackCount,
    missing_projects: Array.from(new Set(missingProjects)),
    fallback_reasons: Array.from(new Set(fallbackReasons)).slice(0, 12),
  };
}

async function summarizeProjectBatch(env, payload) {
  const requested = Array.isArray(payload.repositories) ? payload.repositories : [];
  if (!requested.length) {
    return [];
  }

  const requestedMap = new Map(requested.map((repo) => [repo.full_name, repo]));
  const data = await callDeepSeekJson(env, {
    modelOverride: getProjectSummaryModel(env),
    maxTokens: 2600,
    payload: {
      reportDate: payload.reportDate,
      timezone: payload.timezone,
      trigger: payload.trigger,
      news: payload.news,
      repositories: buildDeepSeekRepositoryInputs(requested),
    },
    systemLines: [
      "You generate Chinese project summaries for an email digest.",
      "Return JSON only.",
      "Do not invent facts beyond the provided repository metadata, selection context, and README excerpts.",
      "You must return exactly one project object for every input repository and preserve full_name verbatim.",
      "Never omit a repository and never use an empty string for positioning_cn.",
      "risk_cn may be an empty string only when there is no concrete legal, dependency, integrity, or abnormal-signal risk.",
      "Write concise, readable Chinese for email.",
      "Each project needs one richer positioning block and risk only when real.",
      "positioning_cn should usually contain 2 short sentences: first explain what the project actually does, then explain its likely use case, target user, or differentiator.",
      "Do not simply translate or lightly paraphrase the GitHub description.",
      "Project body should stay within 3 sentences total.",
      "Avoid repetitive openers such as 这是一个 / 该项目是一个; start directly from the concrete category or capability when possible.",
      "If risk_hints is empty, keep risk_cn empty and do not invent new legal, privacy, or compliance risks.",
      "When information is limited, say it was not confirmed from the input instead of leaving fields blank.",
      "Do not use emoji in any field.",
      "Never leak internal phrases like selection context, momentum score, authenticity score, recency, or ranking reasons.",
      "When the project type is uncertain, describe conservatively as 项目 / 工具 / 插件 / 框架.",
      "Output schema:",
      "{",
      '  "projects": [',
      "    {",
      '      "full_name": string,',
      '      "positioning_cn": string,',
      '      "risk_cn": string',
      "    }",
      "  ]",
      "}",
    ],
  });

  const rawProjects = Array.isArray(data && data.projects) ? data.projects : [];
  const resultMap = new Map();

  rawProjects.forEach((item) => {
    const fullName = sanitizeLine(item && item.full_name ? item.full_name : "");
    const repo = requestedMap.get(fullName);
    if (!repo || resultMap.has(fullName)) {
      return;
    }
    resultMap.set(fullName, normalizeProjectSummaryItem(repo, item));
  });

  return requested.map((repo) => resultMap.get(repo.full_name) || buildFallbackProjectSummary(repo, "missing-model-entry"));
}

async function callDeepSeekJson(env, options) {
  const requestedModel = String(options.modelOverride || env.LLM_MODEL || "gpt-4.1-mini");
  const attempts = buildDeepSeekAttempts(requestedModel);
  const errors = [];

  for (const attempt of attempts) {
    try {
      return await executeDeepSeekAttempt(env, options, attempt);
    } catch (error) {
      errors.push(`${attempt.label}: ${formatError(error)}`);
      console.warn(`LLM attempt failed (${attempt.label}): ${formatError(error)}`);
    }
  }

  throw new Error(`LLM retries exhausted: ${errors.join(" | ")}`);
}

function getDigestOverviewModel(env) {
  return String(env.DIGEST_OVERVIEW_MODEL || env.LLM_MODEL || "gpt-4.1-mini");
}

function getProjectSummaryModel(env) {
  return String(env.PROJECT_SUMMARY_MODEL || env.LLM_MODEL || "gpt-4.1-mini");
}

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

function buildFallbackOverviewDigest(payload) {
  const theme = detectProjectTheme(payload.repositories);
  const newsTheme = payload.news ? detectNewsTheme(payload.news) : "AI 编码与智能体生态";

  return {
    email_subject: `${payload.reportDate} GitHub 项目日报`,
    opening_cn: `今天的主线是${newsTheme}持续升温，GitHub 上与${theme}相关的项目明显增多。`,
    bridge_cn: `新闻侧聚焦${newsTheme}，项目侧则集中在${theme}，开发者正在把当天的新能力快速转成可用工具与资料。`,
    overall_summary: `今天入选的项目大多围绕${theme}展开，既有新项目快速起量，也有跟随热点同步扩散的工具、文档和插件。`,
    news_section: {
      items_cn: [],
    },
    __fallback: true,
  };
}

function buildOverviewRepositoryInputs(repositories) {
  return (repositories || []).map((repo) => ({
    full_name: repo.full_name,
    description: repo.description || "",
    language: repo.language || "",
    stars: repo.stars,
    star_delta_24h: repo.star_delta_24h,
    selection_context: buildRepositorySelectionContext(repo),
  }));
}

function compactNewsForOverview(news) {
  if (!news) {
    return null;
  }

  return {
    issue_title: news.issue_title,
    link: news.link,
    published_at: news.published_at || null,
    content_excerpt: sanitizeParagraph(news.content_excerpt || ""),
    entries: Array.isArray(news.entries)
      ? news.entries.map((entry) => ({
          title: sanitizeLine(entry && entry.title ? entry.title : ""),
          summary: sanitizeParagraph(entry && entry.summary ? entry.summary : ""),
        }))
      : [],
    official_updates: Array.isArray(news.official_updates)
      ? news.official_updates.map((item) => ({
          source: sanitizeLine(item && item.source ? item.source : ""),
          title: sanitizeLine(item && item.title ? item.title : ""),
          summary: sanitizeParagraph(item && item.summary ? item.summary : ""),
          link: sanitizeLine(item && item.link ? item.link : ""),
        }))
      : [],
  };
}

function buildProjectSummaryNewsHint(news) {
  if (!news) {
    return null;
  }

  return {
    issue_title: news.issue_title,
    entries: Array.isArray(news.entries)
      ? news.entries.map((entry) => ({
          title: sanitizeLine(entry && entry.title ? entry.title : ""),
          summary: sanitizeParagraph(entry && entry.summary ? entry.summary : ""),
        }))
      : [],
    official_updates: Array.isArray(news.official_updates)
      ? news.official_updates.map((item) => ({
          source: sanitizeLine(item && item.source ? item.source : ""),
          title: sanitizeLine(item && item.title ? item.title : ""),
          summary: sanitizeParagraph(item && item.summary ? item.summary : ""),
        }))
      : [],
  };
}

function normalizeProjectSummaryItem(repo, item) {
  const fallback = buildFallbackProjectSummary(repo, "incomplete-model-entry");
  const positioning = sanitizeParagraph(item && item.positioning_cn ? item.positioning_cn : "");
  const rawRisk = sanitizeParagraph(item && item.risk_cn ? item.risk_cn : "");
  const risk = isMeaningfulRisk(rawRisk) ? rawRisk : "";
  const usedFallback = !positioning;

  return {
    full_name: repo.full_name,
    positioning_cn: positioning || fallback.positioning_cn,
    why_today_cn: "",
    action_cn: "",
    risk_cn: risk || fallback.risk_cn,
    __fallback: usedFallback,
    __fallback_reason: usedFallback ? "incomplete-model-entry" : "",
  };
}

function buildFallbackProjectSummary(repo, reason = "") {
  return {
    full_name: repo.full_name,
    positioning_cn: buildFallbackPositioning(repo),
    why_today_cn: buildFallbackWhyToday(repo),
    action_cn: fallbackActionCn(repo),
    risk_cn: inferProjectRisk(repo),
    __fallback: true,
    __fallback_reason: reason || "local-fallback",
  };
}

function buildFallbackPositioning(repo) {
  const projectType = inferProjectType(repo);
  const capability = inferProjectCapability(repo);
  const topic = inferRepositoryTopic(repo);
  const stack = inferProjectStack(repo);
  const sourceDetail = extractPrimaryProjectSignal(repo);

  if (capability && stack) {
    return `一个围绕${topic}的${projectType}，当前公开信息显示它重点提供${capability}，并主要基于${stack}构建。`;
  }
  if (capability) {
    return `一个围绕${topic}的${projectType}，当前公开信息显示它重点提供${capability}。`;
  }
  if (sourceDetail) {
    return `一个围绕${topic}的${projectType}，当前公开信息主要指向${sourceDetail}。`;
  }
  const inferredTopic = inferRepositoryTopic(repo);
  if (inferredTopic) {
    return `一个围绕${inferredTopic}的${projectType}，但目前公开资料还不足以判断它是否具备长期可用性。`;
  }

  return `一个近期热度上升的${projectType}，但目前公开资料有限，更适合先观察定位和成熟度。`;
}

function buildFallbackWhyToday(repo) {
  const reasons = [];

  if (repo.star_delta_24h > 0) {
    reasons.push(`过去24小时星星增长${repo.star_delta_24h}个`);
  }
  if (repo.age_days <= 14) {
    reasons.push("仍处在新项目快速扩散阶段");
  }
  if (repo.hours_since_push <= 24) {
    reasons.push("最近24小时仍有活跃更新");
  }
  if (Array.isArray(repo.topic_matches) && repo.topic_matches.length > 0) {
    reasons.push(`与今日主线中的${repo.topic_matches.slice(0, 2).join("、")}直接相关`);
  }

  if (reasons.length) {
    return `${reasons.slice(0, 3).join("，")}，因此值得今天关注。`;
  }

  return "它进入榜单主要因为近期关注度和活跃度同时上升，适合今天纳入观察清单。";
}

function inferProjectRisk(repo) {
  const corpus = [
    repo.full_name,
    repo.description,
    repo.readme_excerpt,
    Array.isArray(repo.reasons) ? repo.reasons.join(" ") : "",
  ].join(" ");

  if (/(leak|leaked|源码泄漏|泄漏|sourcemap|source map|source-code|source code|reverse[- ]?engineering|reverse[- ]?engineer|逆向)/i.test(corpus)) {
    return "可能涉及泄漏源码或逆向产物，需关注版权、合规和上游稳定性。";
  }

  if (repo.authenticity_score < 10) {
    return "仓库真实性与长期维护情况未从输入中确认，建议先观察再投入依赖。";
  }

  return "";
}

function inferRepositoryTopic(repo) {
  const match = Array.isArray(repo.topic_matches) && repo.topic_matches.length > 0
    ? sanitizeLine(repo.topic_matches[0])
    : "";
  if (match) {
    return match;
  }

  const topic = (Array.isArray(repo.topics) ? repo.topics : [])
    .map((item) => sanitizeLine(item))
    .find((item) => item && !isWeakTopicToken(normalizeText(item)));
  if (topic) {
    return topic;
  }

  const corpus = `${repo.full_name} ${repo.description}`.toLowerCase();
  if (corpus.includes("claude")) return "Claude Code 相关生态";
  if (corpus.includes("codex")) return "Codex 或编码智能体协作";
  if (corpus.includes("agent")) return "Agent 工作流";
  if (corpus.includes("mcp")) return "MCP 集成";
  return "AI 开发工具";
}

function inferProjectType(repo) {
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    repo.readme_excerpt,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  if (/(book|guide|tutorial|course|learn|docs|documentation|manual)/i.test(corpus)) {
    return "资料型项目";
  }
  if (/(awesome|collection|curated|design md|design-md|examples|template)/i.test(corpus)) {
    return "资料集合";
  }
  if (/(sdk|framework|library|package|toolkit)/i.test(corpus)) {
    return "开发框架";
  }
  if (/(cli|command line|terminal)/i.test(corpus)) {
    return "命令行工具";
  }
  if (/(plugin|extension|integration)/i.test(corpus)) {
    return "插件型工具";
  }
  if (/(cms|app|platform|dashboard)/i.test(corpus)) {
    return "应用型项目";
  }
  return "开发工具";
}

function inferProjectCapability(repo) {
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    repo.readme_excerpt,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  if (/cms|content management|wordpress|astro/.test(corpus)) {
    return "更现代的内容管理与站点构建能力";
  }
  if (/harness|agent harness/.test(corpus)) {
    return "Agent Harness 骨架、执行流程或实验框架";
  }
  if (/multi agent|multi-agent|team/.test(corpus)) {
    return "多智能体任务拆解与协同执行";
  }
  if (/design md|design-md|design system|ui/.test(corpus)) {
    return "设计规范资料，便于 agent 复刻界面风格";
  }
  if (/open-source coding-agent cli|coding-agent|codex|claude code|copilot cli|cli/.test(corpus)) {
    return "编码智能体或命令行协作能力";
  }
  if (/book|guide|tutorial|docs/.test(corpus)) {
    return "系统化文档、教程或知识整理";
  }
  if (/mcp/.test(corpus)) {
    return "MCP 接入或工具编排";
  }
  return "";
}

function inferProjectStack(repo) {
  const corpus = normalizeText([
    repo.language,
    repo.description,
    repo.readme_excerpt,
  ].join(" "));
  if (/astro/.test(corpus)) return "Astro";
  if (/typescript/.test(corpus)) return "TypeScript";
  if (/python/.test(corpus)) return "Python";
  if (/rust/.test(corpus)) return "Rust";
  if (/go\b|golang/.test(corpus)) return "Go";
  if (/javascript/.test(corpus)) return "JavaScript";
  return sanitizeLine(repo.language || "");
}

function extractPrimaryProjectSignal(repo) {
  const readmeLead = extractLeadSentence(repo.readme_excerpt || "");
  const description = sanitizeParagraph(repo.description || "");
  const source = description || readmeLead;
  if (!source) {
    return "";
  }

  const cleaned = source
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,}/g, "")
    .trim();
  if (!cleaned) {
    return "";
  }

  return truncateText(cleaned, 56);
}

function detectProjectTheme(repositories) {
  const corpus = (repositories || [])
    .map((repo) => `${repo.full_name} ${repo.description} ${(repo.topic_matches || []).join(" ")}`)
    .join(" ")
    .toLowerCase();

  if (corpus.includes("claude")) return "Claude Code 相关扩展、复刻与分析项目";
  if (corpus.includes("agent")) return "Agent 编排与工作流工具";
  if (corpus.includes("mcp")) return "MCP 集成与工具接入";
  return "AI 开发工具与配套资料";
}

function detectNewsTheme(news) {
  const corpus = [
    news.issue_title,
    news.content_excerpt,
    ...(Array.isArray(news.entries) ? news.entries.map((entry) => entry.title) : []),
    ...(Array.isArray(news.official_updates) ? news.official_updates.map((entry) => `${entry.source} ${entry.title}`) : []),
  ].join(" ").toLowerCase();

  if (corpus.includes("claude")) return "Claude Code 与相关生态";
  if (corpus.includes("agent")) return "Agent 编排与模型工具更新";
  if (corpus.includes("model") || corpus.includes("模型")) return "模型发布与工具更新";
  return "AI 编码与智能体生态";
}

function extractLeadSentence(text) {
  const cleaned = sanitizeParagraph(String(text || "").slice(0, 220));
  if (!cleaned) {
    return "";
  }

  const match = cleaned.match(/^(.+?[。！？.!?])(?:\s|$)/);
  const sentence = match ? match[1] : cleaned;
  return sanitizeParagraph(sentence);
}

function stripProjectSummaryDebug(item) {
  return {
    full_name: item.full_name,
    positioning_cn: item.positioning_cn,
    risk_cn: item.risk_cn,
  };
}

function buildEmailPayload(input) {
  const aiByRepo = new Map(
    Array.isArray(input.aiDigest && input.aiDigest.projects)
      ? input.aiDigest.projects.map((item) => [item.full_name, item])
      : [],
  );

  const lines = [];
  const aiNews = input.aiDigest && input.aiDigest.news_section ? input.aiDigest.news_section : null;
  const opening = getOpeningLine(input.aiDigest);
  const newsItems = input.news && input.news.freshNews ? collectRenderableNewsItems(aiNews, input.news.freshNews) : [];

  lines.push(`${input.reportDate} GitHub + AI 日报`);
  lines.push("");
  lines.push("今日一句话");
  lines.push(opening);
  lines.push("");

  if (input.news && input.news.freshNews) {
    lines.push("📰 今日 AI 动态");
    if (newsItems.length) {
      newsItems.forEach((item) => {
        lines.push(`- ${renderNewsTitle(item.title, item.signal_cn)}`);
        lines.push(`  ${sanitizeLine(item.signal_cn)}`);
      });
    } else {
      lines.push(`- ${sanitizeLine(aiNews && aiNews.summary_cn ? aiNews.summary_cn : input.news.freshNews.description || "详见原文")}`);
    }
    if (input.news.freshNews.link) {
      lines.push(`原文: ${input.news.freshNews.link}`);
    }
    lines.push("");
  }

  const bridge = sanitizeParagraph(input.aiDigest && input.aiDigest.bridge_cn ? input.aiDigest.bridge_cn : "");
  if (bridge) {
    lines.push("🔗 今日主线关联");
    lines.push(bridge);
    lines.push("");
  }

  lines.push("🔥 今日热门项目");
  lines.push("");
  if (!input.repositories.length) {
    lines.push("今天没有达到阈值且具备新增价值的项目，为避免重复推送旧项目，本期项目区留空。");
    lines.push("");
  } else {
    input.repositories.forEach((repo, index) => {
      const ai = aiByRepo.get(repo.full_name) || {};
      const fallbackAi = buildFallbackProjectSummary(repo);
      const riskText = extractRiskText(ai) || fallbackAi.risk_cn;
      lines.push(`${index + 1}. ${repo.full_name}`);
      lines.push(`${renderLanguageLabel(repo.language)} · ⭐ ${formatCompactNumber(repo.stars)} · 📈 +${repo.star_delta_24h}`);
      lines.push(sanitizeParagraph(ai.positioning_cn || ai.tagline_cn || fallbackAi.positioning_cn));
      lines.push("");
      lines.push(`今日信号：${buildProjectSignalLine(repo)}`);
      if (riskText) {
        lines.push("");
        lines.push(`⚠️ ${riskText}`);
      }
      lines.push(`链接: ${repo.html_url}`);
      lines.push("");
    });
  }

  lines.push("本邮件由 AI 模型自动生成。");
  if (input.dryRun) {
    lines.push("注意: 本次为 dry_run，没有真正发送邮件。");
  }

  return {
    subject: (input.aiDigest && input.aiDigest.email_subject) || `${input.reportDate} GitHub 项目日报`,
    textBody: lines.join("\r\n"),
    htmlBody: buildHtmlEmail(input, {
      opening,
      newsItems,
      rawNewsEntries: input.news && input.news.freshNews && Array.isArray(input.news.freshNews.entries)
        ? input.news.freshNews.entries
        : [],
      aiByRepo,
    }),
  };
}

async function sendEmail(env, subject, textBody, htmlBody) {
  const recipients = parseRecipientList(env.EMAIL_TO);
  if (!recipients.length) {
    throw new Error("No valid EMAIL_TO recipients configured");
  }

  for (const recipient of recipients) {
    const raw = buildRawEmail({
      from: env.EMAIL_FROM,
      to: recipient,
      subject,
      textBody,
      htmlBody,
    });
    const message = new EmailMessage(env.EMAIL_FROM, recipient, raw);
    await env.EMAIL_OUT.send(message);
  }
}

function buildRawEmail(input) {
  const boundary = `cf-alt-${Math.random().toString(36).slice(2, 12)}`;
  const textBase64 = wrapBase64(utf8ToBase64(input.textBody), 76);
  const htmlBase64 = wrapBase64(utf8ToBase64(input.htmlBody), 76);
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeMimeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    textBase64,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlBase64,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function parseRecipientList(value) {
  return Array.from(new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function buildHtmlEmail(input, context) {
  const aiByRepo = context.aiByRepo;
  const newsItems = Array.isArray(context.newsItems) ? context.newsItems : [];
  const rawNewsEntries = Array.isArray(context.rawNewsEntries) ? context.rawNewsEntries : [];
  const bridge = sanitizeParagraph(input.aiDigest && input.aiDigest.bridge_cn ? input.aiDigest.bridge_cn : "");

  const newsHtml = input.news && input.news.freshNews
    ? buildHtmlNewsCards(rawNewsEntries, newsItems)
    : `<div style="${cardStyle()}"><div style="${mutedTextStyle()}">今日没有可展示的 AI 新闻卡片。</div></div>`;

  const projectHtml = input.repositories.length
    ? input.repositories.map((repo, index) => {
      const ai = aiByRepo.get(repo.full_name) || {};
      const fallbackAi = buildFallbackProjectSummary(repo);
      const riskText = extractRiskText(ai) || fallbackAi.risk_cn;
      return renderProjectCard(repo, ai, index, riskText);
    }).join("")
    : `<div style="${cardStyle()}"><div style="${mutedTextStyle()}">今天没有达到阈值且具备新增价值的项目，系统已主动抑制重复推送旧项目。</div></div>`;

  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "</head>",
    `<body style="${pageStyle()}">`,
    `<div style="${containerStyle()}">`,
    `<div style="${heroStyle()}">`,
    `<div style="${eyebrowStyle()}">${escapeHtml(input.reportDate)} GitHub + AI 日报</div>`,
    `<h1 style="${titleStyle()}">${escapeHtml(context.opening || "今日项目与新闻速递")}</h1>`,
    `<div style="${metaStyle()}">每日自动生成，含文字版与富内容版</div>`,
    "</div>",
    `<section style="${sectionStyle()}">`,
    `<div style="${sectionTitleStyle()}">📰 今日 AI 动态</div>`,
    newsHtml,
    input.news && input.news.freshNews && input.news.freshNews.link
      ? `<div style="margin-top:14px;"><a href="${escapeAttribute(input.news.freshNews.link)}" style="${buttonStyle("#111827", "#ffffff")}">查看橘鸦原文</a></div>`
      : "",
    "</section>",
    bridge
      ? `<section style="${sectionStyle()}"><div style="${sectionTitleStyle()}">🔗 今日主线关联</div><div style="${paragraphStyle()}">${escapeHtml(bridge)}</div></section>`
      : "",
    `<section style="${sectionStyle()}">`,
    `<div style="${sectionTitleStyle()}">🔥 今日热门项目</div>`,
    projectHtml,
    "</section>",
    `<div style="${footerStyle()}">本邮件由 AI 模型自动生成。图片与外链来自原始新闻源，邮箱客户端可能默认折叠远程图片。</div>`,
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

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

function renderOfficialUpdateCard(item) {
  return [
    `<div style="${cardStyle()}">`,
    `<div style="${newsChipStyle(item.title, item.summary)}">${escapeHtml(sanitizeLine(item.source || "官方更新"))}</div>`,
    `<div style="${cardTitleStyle()}">${escapeHtml(item.title)}</div>`,
    item.summary ? `<div style="${paragraphStyle()}">${escapeHtml(item.summary)}</div>` : "",
    item.published_at ? `<div style="${metaRowStyle()}">${escapeHtml(formatOfficialUpdateTime(item.published_at))}</div>` : "",
    item.link ? `<div style="margin-top:14px;"><a href="${escapeAttribute(item.link)}" style="${buttonStyle("#111827", "#ffffff")}">查看原文</a></div>` : "",
    "</div>",
  ].join("");
}

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

function renderNewsImages(item) {
  const images = Array.from(new Set(
    [
      item.image_url || "",
      ...(Array.isArray(item.image_urls) ? item.image_urls : []),
    ].filter(Boolean),
  )).slice(0, 6);

  if (!images.length) {
    return "";
  }

  return images.map((url, index) =>
    `<div style="${index === 0 ? "" : "margin-top:8px;"}background:#ffffff;"><img src="${escapeAttribute(url)}" alt="${escapeAttribute(item.title)}" style="display:block;width:100%;height:auto;max-width:100%;border:0;border-radius:${index === 0 ? "14px 14px 0 0" : "0"};" /></div>`
  ).join("");
}

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

function getPrimarySourceLabel(item) {
  if (item.link) {
    return formatSourceLinkLabel(item.link, "", 0);
  }
  if (Array.isArray(item.source_links) && item.source_links.length > 0) {
    return item.source_links[0].label || "原始来源";
  }
  return "原始来源";
}

function buildSnapshot(repositories, reportDate, timezone) {
  return {
    reportDate,
    timezone,
    saved_at: new Date().toISOString(),
    repositories: repositories.map((repo) => ({
      full_name: repo.full_name,
      stars: repo.stars,
      forks: repo.forks,
      pushed_at: repo.pushed_at,
      created_at: repo.created_at,
      value_score: repo.value_score,
      final_score: repo.final_score,
      momentum_score: repo.momentum_score,
      authenticity_score: repo.authenticity_score,
      topic_relevance_score: repo.topic_relevance_score,
    })),
  };
}

function updateDeliveryHistory(history, repositories, newsContext, now, timezone) {
  const next = normalizeDeliveryHistory(history);
  const today = formatDateInTimeZone(now, timezone || DEFAULT_TIMEZONE);
  const cutoffDays = 30;

  repositories.forEach((repo) => {
    const existing = next.repos[repo.full_name] || {
      sent_dates: [],
    };
    const sentDates = Array.isArray(existing.sent_dates) ? existing.sent_dates : [];
    const mergedDates = Array.from(new Set([...sentDates, today]))
      .filter((value) => diffDays(value, now) < cutoffDays)
      .sort();

    next.repos[repo.full_name] = {
      sent_dates: mergedDates,
      last_sent_at: now.toISOString(),
      last_stars: repo.stars,
      last_value_score: repo.value_score,
      last_final_score: repo.final_score,
      last_momentum_score: repo.momentum_score,
      last_authenticity_score: repo.authenticity_score,
    };
  });

  if (newsContext && newsContext.freshNews) {
    next.news = {
      last_link: newsContext.freshNews.link,
      last_title: newsContext.freshNews.title,
      last_sent_at: now.toISOString(),
    };
  }

  next.saved_at = now.toISOString();
  return next;
}

function toStoredRepository(repo) {
  return {
    full_name: repo.full_name,
    html_url: repo.html_url,
    stars: repo.stars,
    star_delta_24h: repo.star_delta_24h,
    forks: repo.forks,
    language: repo.language,
    has_recent_release: Boolean(repo.has_recent_release),
    recent_release: repo.recent_release
      ? {
          name: repo.recent_release.name || "",
          url: repo.recent_release.url || "",
          published_at: repo.recent_release.published_at || null,
        }
      : null,
    value_score: repo.value_score,
    final_score: repo.final_score,
    momentum_score: repo.momentum_score,
    authenticity_score: repo.authenticity_score,
    topic_relevance_score: repo.topic_relevance_score,
    topic_matches: repo.topic_matches,
    reasons: repo.reasons,
  };
}

function toStoredNews(newsContext) {
  if (!newsContext) {
    return null;
  }

  return {
    source: newsContext.source,
    status: newsContext.status,
    latest: newsContext.latest
      ? {
          title: newsContext.latest.title,
          link: newsContext.latest.link,
          pubDate: newsContext.latest.pubDate || null,
        }
      : null,
    official_status: newsContext.official_status || "empty",
    official_updates: Array.isArray(newsContext.official_updates)
      ? newsContext.official_updates.map((item) => ({
          source: item.source,
          title: item.title,
          link: item.link,
          published_at: item.published_at || null,
        }))
      : [],
  };
}

function githubHeaders(env) {
  const headers = {
    "accept": "application/vnd.github+json",
    "user-agent": "ai-github-digest-worker",
    "x-github-api-version": "2022-11-28",
  };

  if (env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  return headers;
}

function isAuthorized(request, env, url) {
  const expected = String(env.RUN_SECRET || "").trim();
  if (!expected) {
    return false;
  }

  const querySecret = url.searchParams.get("secret");
  const headerSecret = request.headers.get("x-run-secret");
  return querySecret === expected || headerSecret === expected;
}

async function checkRateLimit(env) {
  const now = Date.now();
  const hourKey = RATE_LIMIT_KEY_PREFIX + Math.floor(now / RATE_LIMIT_WINDOW_MS);

  const currentCount = await env.STATE.get(hourKey);
  const count = currentCount ? parseInt(currentCount, 10) : 0;

  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, count, limit: RATE_LIMIT_MAX_REQUESTS };
  }

  await env.STATE.put(hourKey, String(count + 1), {
    expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) * 2, // 2 hours TTL
  });

  return { allowed: true, count: count + 1, limit: RATE_LIMIT_MAX_REQUESTS };
}

function unauthorized() {
  return jsonResponse({
    ok: false,
    error: "Unauthorized",
  }, 401);
}

function rateLimitExceeded(count, limit) {
  return jsonResponse({
    ok: false,
    error: "Rate limit exceeded",
    message: `Maximum ${limit} manual runs per hour allowed. Current count: ${count}`,
  }, 429);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
    },
  });
}

async function getJson(kv, key, fallbackValue) {
  const raw = await kv.get(key);
  if (!raw) {
    return fallbackValue;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

async function putJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

function formatDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function dateDaysAgo(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy.toISOString().slice(0, 10);
}

function diffDays(isoDate, now) {
  const value = new Date(isoDate).getTime();
  return (now.getTime() - value) / (1000 * 60 * 60 * 24);
}

function diffHours(isoDate, now) {
  const value = new Date(isoDate).getTime();
  return (now.getTime() - value) / (1000 * 60 * 60);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_OFFICIAL_UPDATE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function hasMeaningfulPushAfter(pushedAt, lastSentAt) {
  const pushedTime = new Date(pushedAt || "").getTime();
  const sentTime = new Date(lastSentAt || "").getTime();
  if (!Number.isFinite(pushedTime) || !Number.isFinite(sentTime)) {
    return false;
  }
  return pushedTime > sentTime + (60 * 60 * 1000);
}

function decodeBase64Utf8(content) {
  const normalized = String(content || "").replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sanitizeReadme(text) {
  return String(text || "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeHtml(text) {
  return String(text || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDeepSeekJson(content) {
  const raw = String(content || "").trim();
  if (!raw) {
    throw new Error("Empty model output");
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    return JSON.parse(candidate);
  } catch {
    // continue to bracket extraction
  }

  // Use stack-based matching to find the first complete JSON object
  const start = candidate.indexOf("{");
  if (start < 0) {
    throw new Error("No JSON object found in model output");
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < candidate.length; i++) {
    const char = candidate[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch (e) {
          throw new Error(`Invalid JSON structure: ${e.message}`);
        }
      }
    }
  }

  throw new Error("No complete JSON object found in model output");
}

function buildDeepSeekAttempts(requestedModel) {
  const normalized = String(requestedModel || "gpt-4.1-mini");
  const useReasoner = /reasoner/i.test(normalized);
  const attempts = [{ model: normalized, useResponseFormat: true, label: `${normalized}/json-mode` }];
  if (useReasoner) {
    attempts.push(
      { model: "gpt-4.1-mini", useResponseFormat: true, label: "gpt-4.1-mini/json-mode" },
    );
  }
  return attempts;
}

async function executeDeepSeekAttempt(env, options, attempt) {
  const useReasoner = /reasoner/i.test(attempt.model);
  const body = {
    model: attempt.model,
    max_tokens: useReasoner ? Math.max(Number(options.maxTokens || 0), 3200) : Number(options.maxTokens || 1800),
    messages: [
      {
        role: "system",
        content: Array.isArray(options.systemLines) ? options.systemLines.join("\n") : String(options.systemLines || ""),
      },
      {
        role: "user",
        content: JSON.stringify(options.payload),
      },
    ],
  };

  if (attempt.useResponseFormat) {
    body.response_format = { type: "json_object" };
  }
  if (!useReasoner) {
    body.temperature = 0.2;
  }

  const response = await fetch(`${String(env.LLM_API_BASE_URL || DEFAULT_LLM_API_BASE)}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.LLM_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await safeText(response);
    throw new Error(`LLM request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = extractDeepSeekContent(data);
  if (!content) {
    throw new Error("LLM provider returned an empty response.");
  }
  return parseDeepSeekJson(content);
}

function extractDeepSeekContent(data) {
  const message = data
    && Array.isArray(data.choices)
    && data.choices[0]
    ? data.choices[0].message
    : null;
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => (item && typeof item.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function extractJuyaNewsEntries(contentHtml) {
  const entries = [];
  const pattern = /<h2>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<code>#\d+<\/code>\s*<\/h2>([\s\S]*?)(?=<hr>|$)/gi;
  let match;

  while ((match = pattern.exec(String(contentHtml || ""))) !== null) {
    const link = decodeHtmlEntities(match[1]);
    const title = sanitizeLine(decodeHtmlEntities(match[2]));
    const body = match[3];
    const quoteMatch = body.match(/<blockquote>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/blockquote>/i);
    const paragraphMatch = body.match(/<p>([\s\S]*?)<\/p>/i);
    const summary = sanitizeParagraph(sanitizeHtml(quoteMatch ? quoteMatch[1] : (paragraphMatch ? paragraphMatch[1] : "")));
    const imageUrls = extractImageUrls(body);
    const sourceLinks = extractAnchorLinks(body)
      .filter((item) => item.href !== link)
      .slice(0, 8);

    if (!title) {
      continue;
    }

    entries.push({
      title,
      link,
      summary,
      image_url: imageUrls[0] || "",
      image_urls: imageUrls,
      source_links: sourceLinks,
    });
  }

  return entries;
}

function collectRenderableNewsItems(aiNews, freshNews) {
  const items = [];
  const seenTitles = [];
  const rawEntries = freshNews && Array.isArray(freshNews.entries) ? freshNews.entries : [];

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

  return items;
}

function collectRenderableOfficialUpdates(newsContext) {
  const items = newsContext && Array.isArray(newsContext.official_updates)
    ? newsContext.official_updates
    : [];
  const selectedRepos = newsContext && Array.isArray(newsContext.selected_repositories)
    ? newsContext.selected_repositories
    : [];
  const seenTitles = [];
  const relevanceKeywords = buildOfficialRelevanceKeywords(selectedRepos);
  return items
    .filter((item) => {
      const title = sanitizeLine(item && item.title ? item.title : "");
      if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
        return false;
      }
      if (!isOfficialUpdateRelevantToSelection(item, relevanceKeywords)) {
        return false;
      }
      seenTitles.push(title);
      return true;
    })
    .slice(0, DEFAULT_OFFICIAL_UPDATE_LIMIT);
}

function buildOfficialRelevanceKeywords(repositories) {
  const keywords = new Set();
  (repositories || []).forEach((repo) => {
    const candidates = [
      repo && repo.name ? repo.name : "",
      repo && repo.full_name ? repo.full_name.split("/").pop() : "",
      inferRepositoryTopic(repo || {}),
      ...(Array.isArray(repo && repo.topics) ? repo.topics : []),
    ];
    candidates.forEach((candidate) => {
      tokenizeMeaningful(candidate).forEach((token) => {
        if (token.length >= 5 && !isWeakTopicToken(token) && !isOfficialVendorToken(token)) {
          keywords.add(token);
        }
      });
    });
  });
  return Array.from(keywords);
}

function isOfficialUpdateRelevantToSelection(item, keywords) {
  if (!Array.isArray(keywords) || !keywords.length) {
    return false;
  }
  const corpus = normalizeText(`${item && item.title ? item.title : ""} ${item && item.summary ? item.summary : ""}`);
  const score = keywords.reduce((total, keyword) => total + (corpus.includes(keyword) ? 1 : 0), 0);
  return score >= 1;
}

function findMatchingRawEntry(entries, title) {
  const candidateKey = canonicalNewsKey(title);
  return (entries || []).find((entry) => {
    const entryKey = canonicalNewsKey(entry && entry.title ? entry.title : "");
    if (!entryKey || !candidateKey) {
      return false;
    }
    return entryKey === candidateKey
      || (entryKey.length >= 8 && candidateKey.includes(entryKey))
      || (candidateKey.length >= 8 && entryKey.includes(candidateKey));
  }) || null;
}

function extractImageUrls(html) {
  const urls = [];
  const regex = /<img[^>]+src="([^"]+)"/gi;
  let match;
  while ((match = regex.exec(String(html || ""))) !== null) {
    const url = decodeHtmlEntities(match[1]);
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function extractAnchorLinks(html) {
  const links = [];
  const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html || ""))) !== null) {
    const href = decodeHtmlEntities(match[1]);
    if (!href || href.startsWith("#") || !/^https?:\/\//i.test(href)) {
      continue;
    }
    const rawLabel = sanitizeLine(sanitizeHtml(match[2])) || "";
    const label = formatSourceLinkLabel(href, rawLabel, links.length);
    if (!links.some((item) => item.href === href)) {
      links.push({ href, label });
    }
  }
  return links;
}

function formatSourceLinkLabel(href, label, index) {
  const cleaned = sanitizeLine(label);
  if (
    cleaned
    && !/^https?:\/\//i.test(cleaned)
    && !looksLikeRawUrl(cleaned)
    && cleaned.length <= 24
  ) {
    return cleaned;
  }

  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./i, "");
    if (host === "x.com" || host === "twitter.com") return "X";
    if (host.includes("github.com")) return "GitHub";
    if (host.includes("huggingface.co")) return "Hugging Face";
    if (host.includes("openai.com")) return "OpenAI";
    if (host.includes("google.com") || host.includes("google.dev")) return "Google";
    if (host.includes("weixin.qq.com")) return "微信文章";
    return host;
  } catch {
    return `来源 ${index + 1}`;
  }
}

function looksLikeRawUrl(text) {
  const value = String(text || "").toLowerCase();
  return value.includes("/")
    || value.includes(".com")
    || value.includes(".ai")
    || value.includes(".dev")
    || value.includes(".co")
    || value.includes(".net")
    || value.includes(".org");
}

function getOpeningLine(aiDigest) {
  const opening = sanitizeLine(aiDigest && aiDigest.opening_cn ? aiDigest.opening_cn : "");
  if (opening) {
    return opening;
  }
  const summary = sanitizeLine(aiDigest && aiDigest.overall_summary ? aiDigest.overall_summary : "");
  if (!summary) {
    return "今天的主线是 AI 编码与智能体工具持续升温。";
  }
  return summary.split(/[。！？]/)[0] || summary;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function pageStyle() {
  return "margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;";
}

function containerStyle() {
  return "max-width:720px;margin:0 auto;padding:24px 12px 40px 12px;";
}

function heroStyle() {
  return "background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#0f766e 100%);padding:28px 24px;border-radius:22px;color:#ffffff;box-shadow:0 14px 40px rgba(15,23,42,.18);";
}

function eyebrowStyle() {
  return "font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.78;margin-bottom:10px;";
}

function titleStyle() {
  return "margin:0;font-size:28px;line-height:1.35;font-weight:800;";
}

function metaStyle() {
  return "margin-top:10px;font-size:13px;opacity:.8;";
}

function sectionStyle() {
  return "margin-top:18px;background:#ffffff;border-radius:20px;padding:20px;box-shadow:0 10px 28px rgba(15,23,42,.08);";
}

function sectionTitleStyle() {
  return "font-size:18px;font-weight:800;color:#111827;margin-bottom:14px;";
}

function cardStyle(options = {}) {
  const padding = options.padding || "18px";
  return `background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:${padding};margin-top:14px;overflow:hidden;`;
}

function mutedTextStyle() {
  return "font-size:14px;color:#6b7280;line-height:1.7;";
}

function cardTitleStyle() {
  return "font-size:18px;font-weight:800;color:#111827;line-height:1.45;margin:0 0 10px 0;";
}

function paragraphStyle() {
  return "font-size:15px;line-height:1.8;color:#374151;margin-top:8px;";
}

function metaRowStyle() {
  return "font-size:14px;color:#4b5563;font-weight:600;margin-top:4px;";
}

function buttonStyle(bg, color) {
  return `display:inline-block;padding:10px 14px;border-radius:999px;background:${bg};color:${color};text-decoration:none;font-size:13px;font-weight:700;`;
}

function pillStyle(actionText) {
  const palette = actionText.startsWith("✅")
    ? { bg: "#dcfce7", color: "#166534" }
    : actionText.startsWith("📌")
      ? { bg: "#e0e7ff", color: "#3730a3" }
      : actionText.startsWith("⏸️")
        ? { bg: "#fef3c7", color: "#92400e" }
        : { bg: "#e0f2fe", color: "#075985" };
  return `display:inline-block;padding:8px 12px;border-radius:999px;background:${palette.bg};color:${palette.color};font-size:13px;font-weight:700;`;
}

function sourceBadgeStyle() {
  return "display:inline-block;padding:10px 12px;border-radius:999px;background:#f3f4f6;color:#374151;font-size:12px;font-weight:700;margin-left:8px;vertical-align:middle;";
}

function footerStyle() {
  return "margin-top:18px;font-size:12px;line-height:1.7;color:#6b7280;text-align:center;";
}

function newsChipStyle(title, signal) {
  return `display:inline-block;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:800;margin-bottom:10px;`;
}

function sanitizeLine(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeParagraph(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s*([。！？；])/g, "$1")
    .trim();
}

function truncateText(text, limit) {
  const cleaned = sanitizeParagraph(text);
  if (!cleaned || cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function extractRiskText(ai) {
  const direct = sanitizeParagraph(ai && ai.risk_cn ? ai.risk_cn : "");
  if (isMeaningfulRisk(direct)) {
    return direct;
  }

  const risks = Array.isArray(ai && ai.risks_cn) ? ai.risks_cn : [];
  for (const risk of risks) {
    const cleaned = sanitizeParagraph(risk);
    if (isMeaningfulRisk(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

function isMeaningfulRisk(text) {
  const cleaned = sanitizeLine(text);
  if (!cleaned) {
    return false;
  }
  if (/^(暂无|无明显|风险较低|需持续观察|仍待观察|有待观察|未从输入中确认|需验证|需进一步验证|请人工复核|官方项目，无额外风险)/.test(cleaned)) {
    return false;
  }
  return true;
}

function normalizeActionText(text, riskText = "") {
  const cleaned = sanitizeParagraph(text);
  const legalRisk = hasLegalOrLeakRisk(riskText);
  const stabilityRisk = hasStabilityRisk(riskText);

  if (!cleaned) {
    if (legalRisk) {
      return "了解即可：存在明确法律或上游不确定性，暂不依赖。";
    }
    return "";
  }

  const labels = ["立即试用", "收藏等稳定", "了解即可", "谨慎观望"];
  let result = "";
  for (const label of labels) {
    if (cleaned.startsWith(label)) {
      result = cleaned;
      break;
    }
  }

  if (!result) {
    result = `了解即可：${cleaned}`;
  }

  if (legalRisk && result.startsWith("立即试用")) {
    return "了解即可：存在明确法律或上游不确定性，暂不依赖。";
  }

  if (stabilityRisk && result.startsWith("立即试用")) {
    return "收藏等稳定：热度很强，但稳定性和完整性还需要再观察。";
  }

  return result;
}

function formatCompactNumber(value) {
  const num = Number(value || 0);
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(num >= 10000000 ? 0 : 1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`;
  }
  return String(num);
}

function extractFirstNumber(text) {
  const match = String(text || "").match(/[\d,]+/);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[0].replace(/,/g, ""), 10) || 0;
}

function formatOfficialUpdateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "最近更新";
  }
  return `${date.toISOString().slice(0, 10)} 官方发布`;
}

function buildProjectSignalLine(repo) {
  const parts = [];
  if (Number(repo.scraped_star_delta_24h || 0) > 0) {
    parts.push("Trending 日榜");
  } else if (Number(repo.trendshift_rank || 0) > 0 && Number(repo.trendshift_rank || 0) <= 15) {
    parts.push(`Trendshift #${Number(repo.trendshift_rank || 0)}`);
  }
  if (Number(repo.hours_since_push || 999) <= 48) {
    parts.push(`${Math.max(1, Math.round(Number(repo.hours_since_push || 0)))}h 内更新`);
  }
  if (Number(repo.age_days || 999) <= 14) {
    parts.push(`创建于 ${Math.max(1, Math.round(Number(repo.age_days || 0)))} 天前`);
  }
  if (repo.has_recent_release && repo.recent_release && repo.recent_release.name) {
    parts.push(`新版本 ${truncateText(repo.recent_release.name, 22)}`);
  }
  if (Array.isArray(repo.topic_matches) && repo.topic_matches.length) {
    parts.push(`新闻相关 ${repo.topic_matches.slice(0, 2).join("、")}`);
  }
  if (repo.repeat_info && repo.repeat_info.breakout_override) {
    parts.push("突破性回归");
  }
  return parts.length ? parts.join(" · ") : "候选池内短期热度领先";
}

function fallbackActionCn(repo) {
  const projectType = inferProjectType(repo);
  if (repo.authenticity_score < 10) {
    return "谨慎观望：热度很高，但真实性或合规性信号偏弱。";
  }
  if (projectType === "资料型项目" || projectType === "资料集合") {
    return "了解即可：更适合用来补资料或理解方向，不属于需要立刻接入的产品能力。";
  }
  if (repo.star_delta_24h >= 100) {
    return "立即试用：今天的社区动量足够强，值得第一时间了解。";
  }
  if (repo.star_delta_24h >= 10) {
    return "收藏等稳定：已经显露趋势，但还需要再看几天稳定性。";
  }
  return "了解即可：保持关注即可，暂不需要立即投入时间。";
}

function renderNewsTitle(title, signal) {
  return `${getNewsEmoji(title, signal)} ${sanitizeLine(title)}`;
}

function getNewsEmoji(title, signal) {
  const corpus = sanitizeLine(`${title} ${signal}`).toLowerCase();
  if (/(融资|估值|收购|商业|营收|super app|超级应用)/i.test(corpus)) {
    return "💰";
  }
  if (/(泄露|攻击|漏洞|供应链|木马|劫持|被黑|中毒|入侵|盗用|dmca)/i.test(corpus)) {
    return "🚨";
  }
  if (/(模型|权重|推理|发布|lite|bonsai|holo|veo)/i.test(corpus)) {
    return "🧠";
  }
  if (/(框架|工具|接入|集成|插件|更新|发布|上线|agent|codex|mlx|copaw|router)/i.test(corpus)) {
    return "🛠️";
  }
  return "🌐";
}

function getNewsCategoryLabel(title, signal) {
  const emoji = getNewsEmoji(title, signal);
  if (emoji === "💰") return "商业融资";
  if (emoji === "🚨") return "安全泄露";
  if (emoji === "🧠") return "模型发布";
  if (emoji === "🛠️") return "工具更新";
  return "开源社区";
}

function renderLanguageLabel(language) {
  const cleaned = sanitizeLine(language || "");
  const lower = cleaned.toLowerCase();
  if (lower === "rust") return "🦀 Rust";
  if (lower === "typescript") return "🟦 TypeScript";
  if (lower === "javascript") return "🟨 JavaScript";
  if (lower === "python") return "🐍 Python";
  if (lower === "go") return "🐹 Go";
  if (!cleaned) return "📦 未知语言";
  return cleaned;
}

function renderActionLabel(actionText) {
  const cleaned = sanitizeParagraph(actionText);
  if (cleaned.startsWith("立即试用")) return `✅ ${cleaned}`;
  if (cleaned.startsWith("收藏等稳定")) return `📌 ${cleaned}`;
  if (cleaned.startsWith("了解即可")) return `👀 ${cleaned}`;
  if (cleaned.startsWith("谨慎观望")) return `⏸️ ${cleaned}`;
  return `👀 ${cleaned}`;
}

function hasEquivalentNewsTitle(existingTitles, candidateTitle) {
  const candidateKey = canonicalNewsKey(candidateTitle);
  if (!candidateKey) {
    return false;
  }

  return existingTitles.some((title) => {
    const existingKey = canonicalNewsKey(title);
    if (!existingKey) {
      return false;
    }
    if (existingKey === candidateKey) {
      return true;
    }
    if (existingKey.length >= 8 && candidateKey.includes(existingKey)) {
      return true;
    }
    if (candidateKey.length >= 8 && existingKey.includes(candidateKey)) {
      return true;
    }
    return false;
  });
}

function canonicalNewsKey(title) {
  return sanitizeLine(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function hasLegalOrLeakRisk(text) {
  return /(法律|版权|合规|dmca|泄露|leak|源码来源|上游不确定)/i.test(String(text || ""));
}

function hasStabilityRisk(text) {
  return /(不稳定|稳定性|较新|很新|需观察|完整性|兼容性|质量|fork 数量异常|异常高)/i.test(String(text || ""));
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[_/]/g, " ")
    .replace(/[^a-z0-9.+#\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMeaningful(text) {
  return Array.from(new Set(
    normalizeText(text)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !isWeakTopicToken(token)),
  ));
}

function extractNewsPhrases(text) {
  const tokens = tokenizeMeaningful(text);
  const phrases = new Set(tokens.filter((token) => token.length >= 4));

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if (isWeakTopicToken(first) && isWeakTopicToken(second)) {
      continue;
    }
    phrases.add(`${first} ${second}`);
  }

  return Array.from(phrases)
    .sort((a, b) => b.length - a.length)
    .slice(0, 24);
}

function isWeakTopicToken(token) {
  return WEAK_TOPIC_TOKENS.has(String(token || ""));
}

function isOfficialVendorToken(token) {
  return new Set(["openai", "github", "cloudflare", "google", "anthropic", "copilot", "workers", "studio"]).has(String(token || ""));
}

function chunkArray(items, size) {
  const chunkSize = Math.max(1, Number(size || 1));
  const source = Array.isArray(items) ? items : [];
  const chunks = [];

  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize));
  }

  return chunks;
}

function clampInteger(value, fallbackValue, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.min(max, Math.max(min, parsed));
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function encodeMimeHeader(value) {
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function wrapBase64(value, width) {
  const parts = [];
  for (let index = 0; index < value.length; index += width) {
    parts.push(value.slice(index, index + width));
  }
  return parts.join("\r\n");
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }
  if (error.stack) {
    return String(error.stack);
  }
  if (error.message) {
    return String(error.message);
  }
  return String(error);
}

function extractXmlField(xml, tagName, preferCdata = false) {
  const source = String(xml || "");
  const cdataRe = new RegExp(`<${escapeRegExp(tagName)}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escapeRegExp(tagName)}>`, "i");
  const plainRe = new RegExp(`<${escapeRegExp(tagName)}>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, "i");

  if (preferCdata) {
    const cdata = source.match(cdataRe);
    if (cdata) {
      return cdata[1];
    }
  }

  const plain = source.match(plainRe);
  if (plain) {
    return plain[1];
  }

  const cdata = source.match(cdataRe);
  return cdata ? cdata[1] : "";
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripCdata(text) {
  return String(text || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
