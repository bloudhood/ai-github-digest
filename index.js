import { EmailMessage } from "cloudflare:email";
import {
  DELIVERY_HISTORY_KEY,
  LAST_ERROR_KEY,
  LAST_RESULT_KEY,
  LAST_TEST_RESULT_KEY,
  OBSERVED_SNAPSHOT_KEY,
  RUN_MARKER_PREFIX,
  SNAPSHOT_KEY,
  getJson,
  persistSuccessfulDeliveryState,
  safeDeleteJson,
  safePutJson,
} from "./state.js";

const GITHUB_API_BASE = "https://api.github.com";
const DEEPSEEK_API_BASE = "https://api.deepseek.com";
const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";
const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";
const DEEPSEEK_THINKING_ENABLED = "enabled";
const DEEPSEEK_EFFORT_HIGH = "high";
const DEEPSEEK_EFFORT_MAX = "max";
const GITHUB_TRENDING_DAILY_URL = "https://github.com/trending?since=daily";
const TRENDSHIFT_HOME_URL = "https://trendshift.io/";
const DEFAULT_TIMEZONE = "Asia/Hong_Kong";
const DEFAULT_MAX_PROJECTS = 10;
const DEFAULT_GITHUB_PAGES = 1;
const README_CHAR_LIMIT = 2500;
const DEFAULT_PROJECT_SUMMARY_BATCH_SIZE = 5;
// Keep GitHub Search bursts modest to stay clear of secondary rate limits.
const SEARCH_PLAN_CONCURRENCY = 3;
const NEWS_TAG_TAXONOMY = ["模型发布", "产品更新", "开源发布", "研究突破", "安全漏洞", "行业动态", "工具发布"];
const DIGEST_QUEUE_NAME = "github-digest-jobs";
const ROOT_MESSAGE = "GitHub Digest Worker";
const DEFAULT_REPEAT_COOLDOWN_DAYS = 5;
const DEFAULT_REPEAT_WINDOW_DAYS = 14;
const DEFAULT_BREAKOUT_STAR_DELTA = 120;
const DEFAULT_JUYA_RSS_URL = "https://daily.juya.uk/rss.xml";
const DEFAULT_JUYA_CONTENT_LIMIT = 30000;
const DEFAULT_AIHOT_ITEMS_URL = "https://aihot.virxact.com/api/public/items?mode=selected";
const DEFAULT_AIHOT_HOME_URL = "https://aihot.virxact.com/feed.xml";
const DEFAULT_AIHOT_ITEMS_TAKE = 30;
const DEFAULT_AIHOT_MERGED_LIMIT = 4;
const DEFAULT_AIHOT_SUMMARY_LIMIT = 220;
const DEFAULT_AIHOT_LOOKBACK_HOURS = 36;
const DEFAULT_AIHOT_TIMEOUT_MS = 4500;
const DEFAULT_PRIMARY_NEWS_RENDER_LIMIT = 12;
const DEFAULT_SECONDARY_NEWS_RENDER_LIMIT = 4;
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
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 55000;
const DEFAULT_GITHUB_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_HTML_SOURCE_TIMEOUT_MS = 10000;
const DEFAULT_JUYA_TIMEOUT_MS = 8000;
const DEFAULT_OFFICIAL_UPDATE_LOOKBACK_HOURS = 120;
const NEWSNOW_API_BASE = "https://newsnow.busiyi.world/api/s";
const NEWSNOW_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_SOCIAL_TIMEOUT_MS = 8000;
const DEFAULT_REDDIT_TIMEOUT_MS = 3500;
const DEFAULT_SOCIAL_ITEM_LIMIT = 50;
const DEFAULT_SOCIAL_AI_ITEM_LIMIT = 8;
const DEFAULT_SOCIAL_PLATFORM_DISPLAY_LIMIT = 4;
const SOCIAL_TRANSLATION_PLATFORM_IDS = new Set(["hacker-news", "reddit-ai"]);
const HACKER_NEWS_FRONT_PAGE_URL = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=16";
const REDDIT_AI_FEEDS = [
  { id: "reddit-ai", label: "Reddit AI", url: "https://old.reddit.com/r/LocalLLaMA+MachineLearning/.rss" },
];
const SOCIAL_PLATFORMS = [
  { id: "zhihu", label: "知乎" },
  { id: "weibo", label: "微博" },
  { id: "bilibili-hot-search", label: "哔哩哔哩" },
  { id: "douyin", label: "抖音" },
];
const SOCIAL_AI_KEYWORDS = [
  "大模型", "人工智能", "语言模型", "生成式", "机器学习", "深度学习", "神经网络",
  "通义", "文心", "混元", "智谱", "kimi", "元宝", "deepseek", "qwen", "mimo",
  "openai", "anthropic", "chatgpt", "claude", "gemini", "copilot", "cursor",
  "ai", "llm", "agent", "gpt", "算法", "模型", "训练",
];
const PROJECT_SUMMARY_README_LIMIT = 1400;
const DEFAULT_RELEASE_CANDIDATE_LIMIT = 0;
const DEFAULT_README_ENRICH_LIMIT = 8;
const DEFAULT_TRENDING_CANDIDATE_LIMIT = 8;
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
const AIHOT_CATEGORY_LABELS = {
  "ai-models": "模型发布/更新",
  "ai-products": "产品发布/更新",
  industry: "行业动态",
  paper: "论文研究",
  tip: "技巧与观点",
};
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

// --- CSS Constants --- //
const COLORS = {
  textDark: "#111827",
  textMediumDark: "#374151",
  textMuted: "#6b7280",
  textLightMuted: "#9ca3af",
  textLightAlt: "#4b5563",
  backgroundLight: "#f3f4f6",
  white: "#ffffff",
  borderColor: "#e5e7eb",
  heroGradientStart: "#0f172a",
  heroGradientMid: "#1e3a8a",
  heroGradientEnd: "#0f766e",
  redLight: "#fee2e2",
  redDark: "#991b1b",
  greenLight: "#dcfce7",
  greenDark: "#166534",
  blueLight: "#dbeafe",
  blueDark: "#1d4ed8",
  purpleLight: "#ede9fe",
  purpleDark: "#5b21b6",
  yellowLight: "#fef9c3",
  yellowDark: "#854d0e",
  orangeLight: "#ffedd5",
  orangeDark: "#9a3412",
  lightBlueLight: "#e0f2fe",
  lightBlueDark: "#075985",
  purpleLightAlt: "#f3e8ff",
  purpleDarkAlt: "#6b21a8",
};

const FONT_SIZES = {
  xs: "12px",
  sm: "13px",
  base: "14px",
  md: "15px",
  lg: "18px",
  xl: "28px",
};

const BORDER_RADIUS = {
  default: "18px",
  card: "18px",
  section: "20px",
  hero: "22px",
  pill: "999px",
  cardImage: "14px",
};

const LINE_HEIGHTS = {
  loose: "1.8",
  normal: "1.7",
  tight: "1.45",
  title: "1.35",
};

const FONT_WEIGHTS = {
  normal: "400",
  medium: "600",
  bold: "700",
  extrabold: "800",
};

const SPACING = {
  micro: "1px",
  xs: "4px",
  sm: "8px",
  md: "10px",
  lg: "12px",
  xl: "14px",
  xxl: "18px",
  xxxl: "20px",
  xxxxl: "24px",
  xxxxxl: "28px",
  xxxxxxl: "40px",
};

// Generic style builder for common properties
function createCssProps(props) {
  return Object.entries(props)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${kebabCase(key)}:${value};`)
    .join("");
}

function kebabCase(str) {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}
// --- End CSS Constants --- //

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

    if (request.method === "GET" && url.pathname === "/last-test") {
      if (!isAuthorized(request, env, url)) {
        return unauthorized();
      }
      const lastTest = await getJson(env.STATE, LAST_TEST_RESULT_KEY, null);
      return jsonResponse({
        ok: true,
        last_test: lastTest,
      });
    }

    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/run") {
      if (!isAuthorized(request, env, url)) {
        return unauthorized();
      }

      const force = isTruthy(url.searchParams.get("force"));
      const dryRun = isTruthy(url.searchParams.get("dry_run"));
      const quickRun = isTruthy(url.searchParams.get("quick"));
      const dailySimulationRun = isTruthy(url.searchParams.get("daily_sim"));
      const directRun = isTruthy(url.searchParams.get("direct"));
      const testTo = normalizeTestRecipient(url.searchParams.get("test_to"), env);
      if (url.searchParams.has("test_to") && !testTo) {
        return jsonResponse({
          ok: false,
          error: "test_to is not allowed",
        }, 403);
      }
      if (directRun && !isTruthy(env.ENABLE_DIRECT_RUN)) {
        return jsonResponse({
          ok: false,
          error: "Direct runs are disabled",
        }, 403);
      }
      const runOptions = {
        now: new Date(),
        trigger: "manual",
        force,
        dryRun,
        testTo,
      };
      if (!dryRun && !directRun) {
        assertQueueBinding(env);
        const queuedPayload = buildDigestJobPayload({
          trigger: "manual",
          now: new Date(),
          force,
          dryRun,
          quickRun,
          dailySimulationRun,
          testTo,
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
          test_to: testTo || null,
          quick: quickRun,
          daily_sim: dailySimulationRun,
          accepted_at: new Date().toISOString(),
        }, 202);
      }

      const runtimeEnv = resolveRuntimeEnv(env, {
        quickRun,
        dailySimulationRun,
        testTo,
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
          testTo: sanitizeLine(payload.testTo || ""),
        });

        if (!result || result.ok) {
          message.ack();
          continue;
        }

        console.warn(`Digest queue job failed: ${result.error || "unknown error"}`);
        message.retry({ delaySeconds: 300 });
      } catch (error) {
        console.warn(`Digest queue processing error: ${formatError(error)}`);
        message.retry({ delaySeconds: 300 });
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
  const testRecipient = sanitizeLine(options.testTo || "");
  const phaseTimings = {};
  const timePhase = async (name, fn) => {
    const phaseStart = Date.now();
    try {
      return await fn();
    } finally {
      phaseTimings[name] = Date.now() - phaseStart;
      console.log(`Digest phase ${name} took ${phaseTimings[name]}ms`);
    }
  };

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
    const juyaContext = await timePhase("news_juya", () => fetchJuyaDigest(env, deliveryHistory, now, force));
    const [aihotResult, officialResult] = await timePhase("news_parallel", () => Promise.allSettled([
      fetchAihotUpdates(env, now, juyaContext),
      isOfficialUpdatesEnabled(env)
        ? fetchOfficialUpdates(env, now, juyaContext)
        : Promise.resolve({ status: "disabled", items: [], sources: [] }),
    ]));
    const aihotContext = aihotResult.status === "fulfilled"
      ? aihotResult.value
      : { status: "fetch_failed", items: [], error: formatError(aihotResult.reason) };
    const officialContext = officialResult.status === "fulfilled"
      ? officialResult.value
      : { status: "fetch_failed", items: [], sources: [] };
    const newsContext = mergeNewsContexts(juyaContext, aihotContext, officialContext, { status: "deferred", items: [], platforms: [] });
    const searchPlans = buildSearchPlans(now);
    const candidates = await timePhase("collect_candidates", () => collectCandidates(env, searchPlans));
    const ranked = rankCandidates(candidates, previousSnapshot, now, newsContext, env);
    const selectedProjects = filterRepeatedProjects(ranked, deliveryHistory, now, env, force);
    const annotatedProjects = await timePhase("release_signals", () => annotateReleaseSignalsForCandidates(env, selectedProjects, now));
    const deliverableProjects = filterDeliverableProjects(annotatedProjects, env);
    const topProjects = selectProjectsForDigest(deliverableProjects, env);
    const snapshotCandidates = ranked.slice(0, 200);

    if (topProjects.length === 0 && !newsContext.freshNews) {
      throw new Error("No deliverable GitHub repositories or fresh AI news were collected.");
    }

    const enrichedProjects = await timePhase("enrich_readmes", () => enrichProjects(env, topProjects));
    const aiDigest = await timePhase("deepseek_summarize", () => summarizeDigest(env, {
      reportDate,
      timezone,
      trigger: options.trigger,
      repositories: enrichedProjects,
      news: buildDigestNewsInput(newsContext),
      news_status: newsContext.status,
    }));
    const finalNewsContext = await timePhase("social_after_summary", () => fetchAndAttachSocialTrends(env, newsContext));
    const emailPayload = buildEmailPayload({
      reportDate,
      timezone,
      trigger: options.trigger,
      repositories: enrichedProjects,
      aiDigest,
      news: finalNewsContext,
      startedAt,
      completedAt: new Date(),
      dryRun,
    });
    if (emailPayload.deliverability && emailPayload.deliverability.rewrites.length) {
      console.warn(`Digest deliverability rewrites applied: ${emailPayload.deliverability.rewrites.map((item) => `${item.full_name}:${item.field}`).join(", ")}`);
    }

    const stateWarnings = [];
    let emailDelivery = null;
    if (!dryRun) {
      emailDelivery = await timePhase("send_email", () => sendEmail(env, emailPayload.subject, emailPayload.textBody, emailPayload.htmlBody));
      if (emailDelivery.failed_count > 0) {
        stateWarnings.push(`email partial failure: ${emailDelivery.failed_recipients.map((item) => `${item.to}: ${item.error}`).join("; ")}`);
      }

      if (!force && !testRecipient) {
        stateWarnings.push(...await persistSuccessfulDeliveryState(env.STATE, {
          runMarkerKey,
          marker: {
            reportDate,
            sent_at: new Date().toISOString(),
            subject: emailPayload.subject,
            email_acceptance_status: emailDelivery.status,
            accepted_recipients: emailDelivery.accepted_recipients,
            failed_recipients: emailDelivery.failed_recipients,
          },
          observedSnapshot: buildSnapshot(snapshotCandidates, reportDate, timezone),
          snapshot: buildSnapshot(snapshotCandidates, reportDate, timezone),
          history: updateDeliveryHistory(deliveryHistory, enrichedProjects, newsContext, now, timezone),
        }));
      }

      if (testRecipient) {
        stateWarnings.push(...await safePutJson(env.STATE, LAST_TEST_RESULT_KEY, {
          ok: true,
          reportDate,
          timezone,
          trigger: options.trigger,
          test_recipient: testRecipient,
          sent: true,
          generated_at: new Date().toISOString(),
          subject: emailPayload.subject,
          email_acceptance_status: emailDelivery.status,
          email_delivery: emailDelivery,
          deliverability: emailPayload.deliverability,
          phase_timings_ms: phaseTimings,
          repositories_count: enrichedProjects.length,
          ai_meta: aiDigest.meta || {},
          news_status: finalNewsContext.status,
          juya_latest_link: finalNewsContext.latest ? finalNewsContext.latest.link : null,
          juya_entries_count: finalNewsContext.freshNews && Array.isArray(finalNewsContext.freshNews.entries)
            ? finalNewsContext.freshNews.entries.length
            : 0,
          state_warnings: stateWarnings,
        }));
      } else {
        stateWarnings.push(...await safeDeleteJson(env.STATE, LAST_ERROR_KEY));
        stateWarnings.push(...await safePutJson(env.STATE, LAST_RESULT_KEY, {
          ok: true,
          reportDate,
          timezone,
          trigger: options.trigger,
          sent: true,
          generated_at: new Date().toISOString(),
          subject: emailPayload.subject,
          email_acceptance_status: emailDelivery.status,
          email_delivery: emailDelivery,
          deliverability: emailPayload.deliverability,
          phase_timings_ms: phaseTimings,
          repositories: enrichedProjects.map(toStoredRepository),
          ai_meta: aiDigest.meta || {},
          news: toStoredNews(finalNewsContext),
          aiDigest,
          state_warnings: stateWarnings,
        }));
      }
    }

    if (stateWarnings.length) {
      console.warn(`Digest sent, but state persistence had warnings: ${stateWarnings.join(" | ")}`);
    }

    return {
      ok: true,
      reportDate,
      timezone,
      trigger: options.trigger,
      dryRun,
      sent: !dryRun,
      subject: emailPayload.subject,
      repositories: enrichedProjects.map(toStoredRepository),
      email_delivery: emailDelivery,
      deliverability: emailPayload.deliverability,
      phase_timings_ms: phaseTimings,
      ai_meta: aiDigest.meta || {},
      state_warnings: stateWarnings,
    };
  } catch (error) {
    const failure = {
      ok: false,
      trigger: options.trigger,
      reportDate,
      dryRun,
      failed_at: new Date().toISOString(),
      error: formatError(error),
      phase_timings_ms: phaseTimings,
    };
    const errorWarnings = await safePutJson(env.STATE, LAST_ERROR_KEY, failure);
    if (errorWarnings.length) {
      console.warn(`Failed to persist digest error state: ${errorWarnings.join(" | ")}`);
    }
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
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY secret");
  }
  if (!env.GITHUB_TOKEN) {
    console.warn("GITHUB_TOKEN is not set; unauthenticated GitHub API rate limit is 10 req/hour, which a single run may exceed.");
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
  let runtimeEnv = env;
  if (options && options.quickRun) {
    runtimeEnv = applyManualQuickOverrides(runtimeEnv);
  } else if (options && options.dailySimulationRun) {
    runtimeEnv = applyManualDailySimulationOverrides(runtimeEnv);
  }
  if (options && options.testTo) {
    runtimeEnv = applyTestRecipientOverride(runtimeEnv, options.testTo);
  }
  return runtimeEnv;
}

function applyManualQuickOverrides(env) {
  const overridden = {
    ...env,
    DEEPSEEK_MODEL: DEEPSEEK_V4_FLASH_MODEL,
    DIGEST_OVERVIEW_MODEL: DEEPSEEK_V4_FLASH_MODEL,
    PROJECT_SUMMARY_MODEL: DEEPSEEK_V4_FLASH_MODEL,
    DEEPSEEK_THINKING: DEEPSEEK_THINKING_ENABLED,
    DIGEST_OVERVIEW_REASONING_EFFORT: DEEPSEEK_EFFORT_HIGH,
    PROJECT_SUMMARY_REASONING_EFFORT: DEEPSEEK_EFFORT_HIGH,
  };
  overridden.STATE = env.STATE;
  overridden.DIGEST_QUEUE = env.DIGEST_QUEUE;
  overridden.EMAIL_OUT = env.EMAIL_OUT;
  return overridden;
}

function applyManualDailySimulationOverrides(env) {
  const overridden = {
    ...env,
    MAX_PROJECTS: "20",
    DEEPSEEK_MODEL: DEEPSEEK_V4_FLASH_MODEL,
    DIGEST_OVERVIEW_MODEL: DEEPSEEK_V4_PRO_MODEL,
    PROJECT_SUMMARY_MODEL: DEEPSEEK_V4_FLASH_MODEL,
    DEEPSEEK_THINKING: DEEPSEEK_THINKING_ENABLED,
    DIGEST_OVERVIEW_REASONING_EFFORT: DEEPSEEK_EFFORT_MAX,
    PROJECT_SUMMARY_REASONING_EFFORT: DEEPSEEK_EFFORT_HIGH,
    JUYA_CONTENT_LIMIT: "30000",
  };
  overridden.STATE = env.STATE;
  overridden.DIGEST_QUEUE = env.DIGEST_QUEUE;
  overridden.EMAIL_OUT = env.EMAIL_OUT;
  return overridden;
}

function applyTestRecipientOverride(env, testTo) {
  const overridden = {
    ...env,
    EMAIL_TO: testTo,
  };
  overridden.STATE = env.STATE;
  overridden.DIGEST_QUEUE = env.DIGEST_QUEUE;
  overridden.EMAIL_OUT = env.EMAIL_OUT;
  return overridden;
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
    testTo: sanitizeLine(input.testTo || ""),
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
    testTo: sanitizeLine(payload.testTo || ""),
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

function getAihotItemsTake(env) {
  return clampInteger(env.AIHOT_ITEMS_TAKE, DEFAULT_AIHOT_ITEMS_TAKE, 1, 50);
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
  // Trending and Search are complementary: Trending carries the canonical daily
  // hot list (with scraped 24h star deltas), Search surfaces newborn repos that
  // have not reached the Trending page yet. Always merge both.
  let trendingCandidates = [];
  try {
    trendingCandidates = await collectTrendingCandidates(env);
  } catch (error) {
    console.warn(`GitHub Trending candidate collection failed: ${formatError(error)}`);
  }

  const searchCandidates = await collectSearchCandidates(env, plans);
  if (!trendingCandidates.length) {
    return searchCandidates;
  }

  // Merge partial trending results with search, trending takes priority by full_name
  const merged = new Map(trendingCandidates.map((repo) => [repo.full_name, repo]));
  for (const repo of searchCandidates) {
    if (!merged.has(repo.full_name)) {
      merged.set(repo.full_name, repo);
    }
  }
  return Array.from(merged.values());
}

async function collectSearchCandidates(env, plans) {
  const seen = new Map();
  const perPage = 50;
  const limit = createConcurrencyLimiter(SEARCH_PLAN_CONCURRENCY);
  const tasks = [];

  for (const plan of plans) {
    for (let page = 1; page <= getGithubPages(env); page += 1) {
      tasks.push(limit(async () => {
        try {
          const items = await githubSearchRepositories(env, plan.query, plan.sort, page, perPage);
          return { plan, items };
        } catch (error) {
          console.warn(`GitHub search failed for plan "${plan.name}" page ${page}: ${formatError(error)}`);
          return { plan, items: [] };
        }
      }));
    }
  }

  const results = await Promise.all(tasks);
  for (const { plan, items } of results) {
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
  const response = await fetchWithTimeout(GITHUB_TRENDING_DAILY_URL, {
    headers: {
      "user-agent": "ai-github-digest-worker",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  }, DEFAULT_HTML_SOURCE_TIMEOUT_MS);

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(`GitHub Trending fetch failed (${response.status}): ${body}`);
  }

  const html = await response.text();
  return parseGithubTrendingHtml(html);
}

async function fetchTrendshiftSeeds() {
  const response = await fetchWithTimeout(TRENDSHIFT_HOME_URL, {
    headers: {
      "user-agent": "ai-github-digest-worker",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  }, DEFAULT_HTML_SOURCE_TIMEOUT_MS);

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
    let starsMatch = block.match(new RegExp(`href="/${escapeRegExp(fullName)}/stargazers"[^>]*>[\\s\\S]*?<span[^>]*>([\\d,]+)<\\/span>`, "i"));
    if (!starsMatch) {
      const fallbackStarsMatch = block.match(/href="\/[^"?#]+\/[^"?#]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/i);
      if (fallbackStarsMatch) {
        console.warn(`GitHub Trending: using fallback star-count regex for ${fullName}`);
        starsMatch = fallbackStarsMatch;
      }
    }
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
  let items;
  try {
    items = JSON.parse(json);
  } catch (error) {
    console.warn(`Trendshift JSON parse failed: ${formatError(error)}`);
    return [];
  }
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
  const response = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${fullName}`, {
    headers: githubHeaders(env),
  }, DEFAULT_GITHUB_FETCH_TIMEOUT_MS);

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

  const response = await fetchWithTimeout(url.toString(), {
    headers: githubHeaders(env),
  }, DEFAULT_GITHUB_FETCH_TIMEOUT_MS);

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
  // Cap at 55 (saturates near +190/day) so mega-viral repos still separate
  // from ordinary hot repos instead of flattening at +100/day.
  const starDeltaScore = Math.min(55, Math.sqrt(Math.max(0, signals.starDelta)) * 4);
  const earlyVelocityScore = signals.previous
    ? 0
    : Math.min(18, (Math.log10(repo.stars + 1) * 6) / Math.sqrt(signals.ageDays));
  const recencyScore = Math.max(0, 48 - signals.hoursSincePush) / 48 * 10;
  const forkHeatScore = Math.min(8, Math.log10(repo.forks + 1) * 2);
  const trendingRank = Number(repo.trending_rank || 0);
  const trendingRankScore = trendingRank > 0 ? (Math.max(0, 26 - trendingRank) / 25) * 6 : 0;
  const crossSourceScore = trendingRank > 0 && Number(repo.trendshift_rank || 0) > 0 ? 3 : 0;
  const score = Number((
    starDeltaScore + earlyVelocityScore + recencyScore + forkHeatScore + trendingRankScore + crossSourceScore
  ).toFixed(2));

  return {
    score,
    details: {
      starDeltaScore: Number(starDeltaScore.toFixed(2)),
      earlyVelocityScore: Number(earlyVelocityScore.toFixed(2)),
      recencyScore: Number(recencyScore.toFixed(2)),
      forkHeatScore: Number(forkHeatScore.toFixed(2)),
      trendingRankScore: Number(trendingRankScore.toFixed(2)),
      crossSourceScore,
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

  const result = [];
  for (const repo of ranked) {
    const record = history.repos[repo.full_name];
    if (!record) {
      result.push(repo);
      continue;
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

    const repeatInfo = {
      last_sent_at: record.last_sent_at || null,
      days_since_last_sent: Number.isFinite(daysSinceLastSent) ? Number(daysSinceLastSent.toFixed(1)) : null,
      sent_count_window: recentDates.length,
      stars_since_last_send: starsSinceLastSend,
      pushed_since_last_send: pushedSinceLastSend,
      meaningful_resurface: meaningfulResurface,
      breakout_override: breakoutOverride,
    };

    let include;
    if (daysSinceLastSent < cooldownDays) {
      include = breakoutOverride && daysSinceLastSent >= DEFAULT_MIN_BREAKOUT_REPEAT_GAP_DAYS;
    } else if (breakoutOverride) {
      include = daysSinceLastSent >= DEFAULT_MIN_BREAKOUT_REPEAT_GAP_DAYS;
    } else if (meaningfulResurface) {
      include = true;
    } else if (recentDates.length >= 1) {
      include = false;
    } else {
      include = true;
    }

    if (include) {
      result.push({ ...repo, repeat_info: repeatInfo });
    }
  }
  return result;
}

async function annotateReleaseSignals(env, repositories, now) {
  const annotated = [];

  for (const repo of repositories) {
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
  const response = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${fullName}/releases?per_page=1`, {
    headers: githubHeaders(env),
  }, DEFAULT_GITHUB_FETCH_TIMEOUT_MS);

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
  const lowDeltaQualityFloor = 30;

  return repositories.filter((repo) => {
    const isRelevant = Number(repo.ai_domain_score || 0) >= minAIDomainScore
      || Number(repo.topic_relevance_score || 0) > 0;
    const hasReleaseSignal = Boolean(repo.has_recent_release)
      && repo.authenticity_score >= authenticityThreshold
      && isRelevant
      && (repo.stars >= 120 || Number(repo.release_signal_score || 0) > 0);

    if (!isRelevant) {
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

export async function enrichProjects(env, projects) {
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
  const isReleaseLead = Boolean(repo.has_recent_release)
    && (Number(repo.topic_relevance_score || 0) >= 2 || Number(repo.ai_domain_score || 0) >= 4);
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

function mergeNewsContexts(juyaContext, aihotContext, officialContext, socialContext) {
  const mergedNewsContext = mergeAihotItemsIntoNewsContext(
    juyaContext,
    aihotContext && Array.isArray(aihotContext.items) ? aihotContext.items : [],
  );
  return {
    ...mergedNewsContext,
    aihot_fetch_status: aihotContext && aihotContext.status ? aihotContext.status : "empty",
    aihot_error: aihotContext && aihotContext.error ? aihotContext.error : null,
    official_status: officialContext && officialContext.status ? officialContext.status : "empty",
    official_updates: officialContext && Array.isArray(officialContext.items) ? officialContext.items : [],
    official_sources: officialContext && Array.isArray(officialContext.sources) ? officialContext.sources : [],
    social_trending: socialContext && Array.isArray(socialContext.items) ? socialContext.items : [],
    social_platforms: socialContext && Array.isArray(socialContext.platforms) ? socialContext.platforms : [],
    social_status: socialContext ? socialContext.status : "disabled",
  };
}

async function fetchAihotUpdates(env, now, juyaContext) {
  const url = buildAihotItemsUrl(env);
  const headers = {
    "user-agent": "ai-github-digest-worker",
    "accept": "application/json",
  };

  try {
    const response = await fetchWithTimeout(url, { headers }, DEFAULT_AIHOT_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`AI HOT fetch failed (${response.status})`);
    }

    const data = await response.json();
    const juyaTitles = collectJuyaTitlesForDedupe(juyaContext);
    const items = normalizeAihotItemsForNews(Array.isArray(data && data.items) ? data.items : [])
      .filter((item) => isRecentEnough(item.published_at, now, DEFAULT_AIHOT_LOOKBACK_HOURS))
      .filter((item) => !hasEquivalentNewsTitle(juyaTitles, item.title));

    return {
      status: items.length ? "ok" : "empty",
      items,
    };
  } catch (error) {
    return {
      status: "fetch_failed",
      items: [],
      error: formatError(error),
    };
  }
}

function buildAihotItemsUrl(env) {
  const base = sanitizeLine(env.AIHOT_ITEMS_URL || DEFAULT_AIHOT_ITEMS_URL);
  const url = new URL(base);
  if (!url.searchParams.has("mode")) {
    url.searchParams.set("mode", "selected");
  }
  url.searchParams.set("take", String(getAihotItemsTake(env)));
  return url.toString();
}

export function normalizeAihotItemsForNews(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const title = sanitizeLine(item && item.title ? item.title : "");
      const link = sanitizeLine(item && (item.url || item.link) ? (item.url || item.link) : "");
      const source = sanitizeLine(item && item.source ? item.source : "AI HOT");
      const summary = truncateText(sanitizeParagraph(item && item.summary ? item.summary : ""), DEFAULT_AIHOT_SUMMARY_LIMIT);
      const publishedAt = sanitizeLine(item && (item.publishedAt || item.published_at) ? (item.publishedAt || item.published_at) : "");
      const category = sanitizeLine(item && item.category ? item.category : "");
      const section = sanitizeLine(item && item.section ? item.section : "")
        || AIHOT_CATEGORY_LABELS[category]
        || "行业动态";
      const score = Number(item && item.score);

      if (!title || !/^https?:\/\//i.test(link)) {
        return null;
      }

      return {
        title,
        link,
        summary: summary || "详见原文",
        section,
        source,
        category,
        score: Number.isFinite(score) ? score : 0,
        source_group: "AIHOT",
        is_secondary: true,
        published_at: publishedAt || null,
        source_links: [
          {
            href: link,
            label: source,
          },
        ],
      };
    })
    .filter(Boolean);
}

export function mergeAihotItemsIntoNewsContext(juyaContext, aihotItems) {
  const base = juyaContext && typeof juyaContext === "object" ? juyaContext : {};
  const normalizedItems = normalizeAihotItemsForNews(aihotItems);
  const existingFreshNews = base.freshNews || null;
  const existingEntries = existingFreshNews && Array.isArray(existingFreshNews.entries)
    ? existingFreshNews.entries
    : [];
  const existingTitles = [
    existingFreshNews && existingFreshNews.title,
    ...existingEntries.map((entry) => entry && entry.title),
  ].filter(Boolean);
  const additions = [];

  normalizedItems.forEach((item) => {
    if (!hasEquivalentNewsTitle(existingTitles, item.title)) {
      existingTitles.push(item.title);
      additions.push(item);
    }
  });
  const selectedAdditions = selectDiverseAihotItems(additions, DEFAULT_AIHOT_MERGED_LIMIT);

  if (!selectedAdditions.length) {
    return {
      ...base,
      aihot_status: normalizedItems.length ? "deduped" : "empty",
      aihot_updates: [],
    };
  }

  if (existingFreshNews) {
    return {
      ...base,
      freshNews: {
        ...existingFreshNews,
        content_text: existingFreshNews.content_text,
        entries: [...existingEntries, ...selectedAdditions],
      },
      aihot_status: "merged",
      aihot_updates: selectedAdditions,
    };
  }

  const syntheticNews = buildAihotFreshNews(selectedAdditions);
  return {
    ...base,
    source: "AI HOT 精选",
    status: "fresh",
    latest: syntheticNews,
    freshNews: syntheticNews,
    aihot_status: "fresh",
    aihot_updates: selectedAdditions,
  };
}

export function selectAihotItemsForDigest(items, limit = DEFAULT_AIHOT_MERGED_LIMIT) {
  return selectDiverseAihotItems(items, limit);
}

function selectDiverseAihotItems(items, limit) {
  const candidates = rankAihotCandidates(Array.isArray(items) ? items : []);
  const max = Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_AIHOT_MERGED_LIMIT);
  if (max === 0 || candidates.length <= max) {
    return candidates.slice(0, max);
  }

  const selected = [];
  const selectedIndexes = new Set();
  const seenSections = new Set();
  const addAt = (item, index) => {
    selected.push(item);
    selectedIndexes.add(index);
  };

  candidates.forEach((item, index) => {
    if (selected.length >= max) {
      return;
    }
    const section = sanitizeLine(item.section || "行业动态");
    if (!seenSections.has(section)) {
      seenSections.add(section);
      addAt(item, index);
    }
  });

  candidates.forEach((item, index) => {
    if (selected.length >= max || selectedIndexes.has(index)) {
      return;
    }
    addAt(item, index);
  });

  return selected;
}

function rankAihotCandidates(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item, index) => ({
      item,
      index,
      rank: scoreAihotCandidate(item),
    }))
    .sort((a, b) => (b.rank - a.rank) || (a.index - b.index))
    .map(({ item }) => item);
}

function scoreAihotCandidate(item) {
  const text = normalizeText(`${item.title || ""} ${item.summary || ""} ${item.source || ""}`);
  const source = normalizeText(item.source || "");
  const category = normalizeText(item.category || item.section || "");
  let score = Number(item.score);
  if (!Number.isFinite(score)) {
    score = 0;
  }

  if (/(openai|anthropic|google|deepmind|cloudflare|microsoft|github|hugging face|nvidia|aws|meta|elastic)/i.test(source)) {
    score += 24;
  }
  if (/(blog|rss|announcements|research|paper|论文|研究|官方|changelog)/i.test(source)) {
    score += 12;
  }
  if (/(模型|agent|智能体|mcp|open source|开源|安全|漏洞|research|paper|cloudflare|deepseek|anthropic|openai|claude|codex|github)/i.test(text)) {
    score += 10;
  }
  if (/^(paper|ai-products|ai-models|模型|产品|论文)/i.test(category)) {
    score += 8;
  }
  if (/(教程|技巧|快去试试|看看我如何|ppt|youtube-notetaker|视频转)/i.test(text)) {
    score -= 12;
  }
  if (/^(x：|twitter|公众号)/i.test(item.source || "")) {
    score -= 4;
  }

  return score;
}

function buildAihotFreshNews(items) {
  const sorted = [...items].sort((a, b) => {
    const aTime = new Date(a.published_at || 0).getTime();
    const bTime = new Date(b.published_at || 0).getTime();
    return bTime - aTime;
  });
  const latest = sorted[0] || {};
  return {
    title: "AI HOT 精选",
    link: DEFAULT_AIHOT_HOME_URL,
    pubDate: latest.published_at || null,
    description: "AI HOT 精选 AI 行业动态。",
    content_text: appendNewsEntryText("", items),
    entries: items,
  };
}

function appendNewsEntryText(existingText, entries) {
  const existing = sanitizeParagraph(existingText || "");
  const addition = (Array.isArray(entries) ? entries : [])
    .map((entry) => `${sanitizeLine(entry.title)}：${sanitizeParagraph(entry.summary || "")}`)
    .filter((line) => line && line !== "：")
    .join("\n");
  return [existing, addition].filter(Boolean).join("\n\n");
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

async function fetchSocialTrends(env) {
  const sources = [
    ...SOCIAL_PLATFORMS.map(({ id, label }) => ({
      id,
      label,
      fetcher: () => fetchSocialFeed(id, label),
    })),
    {
      id: "hacker-news",
      label: "Hacker News",
      fetcher: fetchHackerNewsFeed,
    },
    {
      id: "reddit-ai",
      label: "Reddit AI",
      fetcher: fetchRedditAiFeed,
    },
  ];
  const fetches = sources.map((source) => source.fetcher());
  const results = await Promise.allSettled(fetches);
  const allItems = [];
  const platforms = [];

  results.forEach((result, index) => {
    const { id, label } = sources[index];
    if (result.status === "fulfilled" && result.value.length) {
      allItems.push(...result.value);
      platforms.push({
        id,
        label,
        items: rankSocialItemsForDisplay(result.value).slice(0, DEFAULT_SOCIAL_PLATFORM_DISPLAY_LIMIT),
      });
    }
  });

  const aiItems = filterAISocialItems(allItems);
  return {
    status: platforms.length ? "fresh" : "empty",
    items: aiItems,
    platforms,
  };
}

async function translateSocialPlatformsInNewsContext(env, newsContext) {
  if (!newsContext || !Array.isArray(newsContext.social_platforms) || !newsContext.social_platforms.length) {
    return newsContext;
  }
  const translatedPlatforms = await translateExternalSocialPlatforms(env, newsContext.social_platforms);
  if (translatedPlatforms === newsContext.social_platforms) {
    return newsContext;
  }
  return {
    ...newsContext,
    social_platforms: translatedPlatforms,
  };
}

async function fetchAndAttachSocialTrends(env, newsContext) {
  let socialContext;
  try {
    socialContext = await fetchSocialTrends(env);
  } catch (error) {
    console.warn(`fetchAndAttachSocialTrends skipped: ${formatError(error)}`);
    socialContext = { status: "fetch_failed", items: [], platforms: [] };
  }
  const merged = {
    ...newsContext,
    social_trending: Array.isArray(socialContext.items) ? socialContext.items : [],
    social_platforms: Array.isArray(socialContext.platforms) ? socialContext.platforms : [],
    social_status: socialContext.status || "empty",
  };
  return translateSocialPlatformsInNewsContext(env, merged);
}

export async function translateExternalSocialPlatforms(env, platforms) {
  if (!env || !env.DEEPSEEK_API_KEY || !Array.isArray(platforms) || !platforms.length) {
    return platforms;
  }

  const targets = [];
  platforms.forEach((platform) => {
    if (!shouldTranslateSocialPlatform(platform && platform.id)) {
      return;
    }
    const items = Array.isArray(platform.items) ? platform.items : [];
    items.forEach((item, itemIndex) => {
      const title = sanitizeLine(item && item.title ? item.title : "");
      if (!title || containsCjkText(title)) {
        return;
      }
      targets.push({
        key: `${platform.id}:${itemIndex}`,
        platform: sanitizeLine(platform.label || platform.id || ""),
        title,
      });
    });
  });

  if (!targets.length) {
    return platforms;
  }

  try {
    const data = await callDeepSeekJson(env, {
      modelOverride: env.SOCIAL_TRANSLATION_MODEL || env.DEEPSEEK_MODEL || DEEPSEEK_V4_FLASH_MODEL,
      reasoningEffort: DEEPSEEK_EFFORT_HIGH,
      maxTokens: 1200,
      payload: { items: targets },
      systemLines: [
        "你是邮件热榜标题翻译器。把 Hacker News 和 Reddit 的英文标题翻译成自然、简洁、完整的中文。",
        "保留产品名、项目名、公司名、论文名、版本号、数字和常见技术缩写；不要添加事实、评价或解释。",
        "不要省略关键主体、动作和结果；不要截断标题；不要输出 Markdown。",
        "只返回 JSON：{\"items\":[{\"key\":\"原 key\",\"title_cn\":\"中文标题\"}]}",
      ],
    });
    const rawItems = Array.isArray(data && data.items)
      ? data.items
      : Array.isArray(data && data.translations)
        ? data.translations
        : [];
    const translationMap = new Map();
    rawItems.forEach((item) => {
      const key = sanitizeLine(item && item.key ? item.key : "");
      const title = sanitizeLine(item && (item.title_cn || item.title) ? (item.title_cn || item.title) : "");
      if (key && title) {
        translationMap.set(key, title);
      }
    });

    if (!translationMap.size) {
      return platforms;
    }

    return platforms.map((platform) => {
      if (!shouldTranslateSocialPlatform(platform && platform.id)) {
        return platform;
      }
      const items = Array.isArray(platform.items) ? platform.items : [];
      return {
        ...platform,
        items: items.map((item, itemIndex) => {
          const translatedTitle = translationMap.get(`${platform.id}:${itemIndex}`);
          if (!translatedTitle) {
            return item;
          }
          return {
            ...item,
            title_original: sanitizeLine(item.title || ""),
            title: translatedTitle,
          };
        }),
      };
    });
  } catch (error) {
    console.warn(`translateExternalSocialPlatforms skipped: ${formatError(error)}`);
    return applyLocalExternalSocialTitleFallback(platforms);
  }
}

function applyLocalExternalSocialTitleFallback(platforms) {
  return (Array.isArray(platforms) ? platforms : []).map((platform) => {
    if (!shouldTranslateSocialPlatform(platform && platform.id)) {
      return platform;
    }
    const items = Array.isArray(platform.items) ? platform.items : [];
    return {
      ...platform,
      items: items.map((item) => {
        const title = sanitizeLine(item && item.title ? item.title : "");
        if (!title || containsCjkText(title)) {
          return item;
        }
        return {
          ...item,
          title_original: title,
          title: localizeExternalSocialTitle(title),
        };
      }),
    };
  });
}

function localizeExternalSocialTitle(title) {
  let text = sanitizeLine(title);
  const replacements = [
    [/Zero[- ]Touch OAuth for MCP/ig, "MCP 的零接触 OAuth"],
    [/Project Valhalla, Explained: How a Decade of Work Arrives in JDK 28/ig, "Project Valhalla 详解：十年成果如何进入 JDK 28"],
    [/The AirPods Effect/ig, "AirPods 效应"],
    [/Hyundai buys Boston Dynamics/ig, "现代汽车收购 Boston Dynamics"],
    [/What's more impressive, GLM 5\.1 -> 5\.2 or Qwen 3\.5 -> 3\.6\?/ig, "哪个更有看点：GLM 5.1 到 5.2，还是 Qwen 3.5 到 3.6？"],
    [/Researchers trained a Deep Research agent with 32 H100s and open-sourced everything/ig, "研究人员用 32 块 H100 训练深度研究智能体并全部开源"],
    [/GLM-5\.2 is the new leading open weights model on the Artificial Analysis Intelligence Index/ig, "GLM-5.2 成为 Artificial Analysis 智能指数领先开源权重模型"],
    [/New Agentic Benchmark Out: Claude Fable and GLM 5\.2 Top Their Cohorts/ig, "新智能体基准发布：Claude Fable 和 GLM 5.2 分别领先"],
  ];
  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  if (containsCjkText(text)) {
    return text;
  }
  return `社区热议：${text}`;
}

function shouldTranslateSocialPlatform(platformId) {
  return SOCIAL_TRANSLATION_PLATFORM_IDS.has(String(platformId || ""));
}

function containsCjkText(text) {
  return /[\u3400-\u9fff]/.test(String(text || ""));
}

async function fetchSocialFeed(platformId, platformLabel) {
  const url = `${NEWSNOW_API_BASE}?id=${platformId}&latest`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "user-agent": NEWSNOW_UA },
    }, DEFAULT_SOCIAL_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.status !== "success" && data.status !== "cache") {
      throw new Error(`unexpected status: ${data.status}`);
    }
    const items = Array.isArray(data.items) ? data.items.slice(0, DEFAULT_SOCIAL_ITEM_LIMIT) : [];
    return items
      .map((item) => ({
        title: sanitizeLine(item.title || ""),
        url: sanitizeLine(item.url || item.mobileUrl || ""),
        platform: platformId,
        platform_label: platformLabel,
        meta: sanitizeLine(item.hot || item.hotValue || item.hot_value || item.desc || ""),
      }))
      .filter((item) => item.title);
  } catch (error) {
    console.error(`fetchSocialFeed(${platformId}) failed: ${formatError(error)}`);
    return [];
  }
}

async function fetchHackerNewsFeed() {
  try {
    const response = await fetchWithTimeout(HACKER_NEWS_FRONT_PAGE_URL, {
      headers: {
        "user-agent": NEWSNOW_UA,
        "accept": "application/json",
      },
    }, DEFAULT_SOCIAL_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const hits = Array.isArray(data && data.hits) ? data.hits : [];
    return hits
      .map((item) => {
        const title = sanitizeLine(item.title || item.story_title || "");
        const objectId = sanitizeLine(item.objectID || "");
        const url = sanitizeLine(item.url || item.story_url || (objectId ? `https://news.ycombinator.com/item?id=${objectId}` : ""));
        const points = Number(item.points);
        return {
          title,
          url,
          platform: "hacker-news",
          platform_label: "Hacker News",
          meta: Number.isFinite(points) ? `${points} points` : "",
          score: Number.isFinite(points) ? points : 0,
        };
      })
      .filter((item) => item.title);
  } catch (error) {
    console.warn(`fetchHackerNewsFeed skipped: ${formatError(error)}`);
    return [];
  }
}

async function fetchRedditAiFeed() {
  const results = await Promise.allSettled(REDDIT_AI_FEEDS.map(fetchRedditAtomFeed));
  const items = [];
  results.forEach((result) => {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      items.push(...result.value);
    }
  });
  return dedupeSocialItems(items);
}

async function fetchRedditAtomFeed(feed) {
  try {
    const response = await fetchWithTimeout(feed.url, {
      headers: {
        "user-agent": "github-digest-worker/1.0",
        "accept": "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
      },
    }, DEFAULT_REDDIT_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const xml = await response.text();
    return parseAtomFeedItems(xml)
      .map((item) => ({
        title: sanitizeLine(item.title || ""),
        url: sanitizeLine(item.link || ""),
        platform: feed.id,
        platform_label: feed.label,
        meta: feed.label,
        published_at: item.published_at || null,
      }))
      .filter((item) => item.title);
  } catch (error) {
    console.warn(`fetchRedditAtomFeed(${feed.id}) skipped: ${formatError(error)}`);
    return [];
  }
}

function filterAISocialItems(items) {
  const allKeywords = new Set([
    ...AI_DOMAIN_TERMS,
    ...SOCIAL_AI_KEYWORDS,
  ]);
  return items
    .filter((item) => {
      const text = normalizeText(item.title);
      return [...allKeywords].some((kw) => text.includes(normalizeText(kw)));
    })
    .slice(0, DEFAULT_SOCIAL_AI_ITEM_LIMIT);
}

function rankSocialItemsForDisplay(items) {
  return dedupeSocialItems(items)
    .map((item, index) => ({
      item,
      index,
      score: scoreSocialItem(item, index),
    }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(({ item }) => item);
}

function dedupeSocialItems(items) {
  const result = [];
  const seen = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const title = sanitizeLine(item && item.title ? item.title : "");
    if (!title || hasEquivalentNewsTitle(seen, title)) {
      return;
    }
    seen.push(title);
    result.push({ ...item, title });
  });
  return result;
}

function scoreSocialItem(item, index) {
  const text = normalizeText(`${item && item.title ? item.title : ""} ${item && item.meta ? item.meta : ""}`);
  const platform = sanitizeLine(item && item.platform ? item.platform : "");
  let score = Math.max(0, 100 - index);
  if ([...new Set([...AI_DOMAIN_TERMS, ...SOCIAL_AI_KEYWORDS])].some((kw) => text.includes(normalizeText(kw)))) {
    score += 80;
  }
  if (/(github|openai|anthropic|claude|deepseek|glm|qwen|agent|mcp|llm|模型|智能体|开源|漏洞|编译器|linux|python|javascript)/i.test(text)) {
    score += 30;
  }
  if (platform === "hacker-news" || platform.startsWith("reddit-")) {
    score += 15;
  }
  if (Number.isFinite(Number(item && item.score))) {
    score += Math.min(40, Number(item.score) / 25);
  }
  return score;
}

async function fetchJuyaDigest(env, history, now, force) {
  const rssUrl = String(env.JUYA_RSS_URL || DEFAULT_JUYA_RSS_URL);
  const headers = {
    "user-agent": "ai-github-digest-worker",
    "accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  };

  try {
    const response = await fetchWithTimeout(rssUrl, { headers }, DEFAULT_JUYA_TIMEOUT_MS);
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

export function parseRssItems(xml, contentLimit) {
  const items = [];
  const source = String(xml || "");
  const matches = source.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of matches) {
    const block = match[1];
    const title = decodeHtmlEntities(extractXmlField(block, "title"));
    const link = decodeHtmlEntities(extractXmlField(block, "link"));
    const description = decodeHtmlEntities(extractXmlField(block, "description"));
    const contentHtml = normalizeRssHtmlContent(extractXmlField(block, "content:encoded", true));
    const pubDate = decodeHtmlEntities(extractXmlField(block, "pubDate"));

    if (!title || !link) {
      continue;
    }

    const rawText = decodeHtmlEntities(sanitizeHtml(contentHtml || description));
    items.push({
      title,
      link,
      pubDate,
      description,
      content_html: contentHtml,
      content_text: contentLimit ? rawText.slice(0, contentLimit) : rawText,
      entries: extractJuyaNewsEntries(contentHtml),
    });
  }
  return items;
}

function normalizeRssHtmlContent(content) {
  const raw = stripCdata(content).trim();
  return raw ? decodeHtmlEntities(raw) : "";
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
    return false;
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
    const itemTime = new Date(item.pubDate || 0);
    if (!Number.isNaN(itemTime.getTime()) && itemTime.getTime() <= now.getTime() + (12 * 60 * 60 * 1000)) {
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
    source: news ? (newsContext.source || "AI 新闻") : "official-updates",
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
    project_type_hint: inferProjectType(repo),
    topic_hint: inferRepositoryTopic(repo),
    capability_hint: inferProjectCapability(repo),
    stack_hint: inferProjectStack(repo),
    readme_lead: extractLeadSentence(repo.readme_excerpt || ""),
    use_case_hint: buildFallbackUseCase(repo),
    signal_hint: buildFallbackSignalAnalysis(repo),
    caveat_hint: buildFallbackCaveat(repo),
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
  const socialItems = newsContext && Array.isArray(newsContext.social_trending)
    ? newsContext.social_trending : [];
  const socialText = socialItems.map((item) => item.title).join(" ");
  const entryItems = article && Array.isArray(article.entries) ? article.entries : [];
  const entryText = entryItems
    .filter((item) => !isSecondaryNewsEntry(item))
    .slice(0, DEFAULT_PRIMARY_NEWS_RENDER_LIMIT)
    .map((item) => `${item.title || ""} ${item.summary || ""}`)
    .join(" ");
  const aihotItems = newsContext && Array.isArray(newsContext.aihot_updates)
    ? newsContext.aihot_updates
    : [];
  const aihotText = aihotItems
    .slice(0, DEFAULT_SECONDARY_NEWS_RENDER_LIMIT)
    .map((item) => `${item.title || ""} ${item.summary || ""}`)
    .join(" ");
  const summaryParts = [];
  if (article) {
    summaryParts.push(article.title, article.description);
  }
  if (entryText) {
    summaryParts.push(entryText);
  }
  if (aihotText) {
    summaryParts.push(aihotText);
  }
  if (officialText) {
    summaryParts.push(officialText);
  }
  if (socialText) {
    summaryParts.push(socialText);
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
  // Token-boundary matching: a bare substring test lets short terms like "ai"
  // match inside "main", "email", "training" and inflates the score.
  const tokens = new Set(corpus.split(/[^a-z0-9]+/).filter(Boolean));
  let score = 0;

  for (const term of AI_DOMAIN_TERMS) {
    const matched = term.length >= 6 ? corpus.includes(term) : tokens.has(term);
    if (matched) {
      score += term.length >= 6 ? 2 : 1;
    }
  }

  return Math.min(12, score);
}

async function fetchReadme(env, fullName) {
  const response = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${fullName}/readme`, {
    headers: githubHeaders(env),
  }, DEFAULT_GITHUB_FETCH_TIMEOUT_MS);

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
      reasoningEffort: getDigestOverviewReasoningEffort(env),
      maxTokens: 2500,
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
        "When news.entries are provided, curate a dense news_section.items_cn instead of listing everything.",
        `Use at most ${DEFAULT_PRIMARY_NEWS_RENDER_LIMIT} primary Juya entries plus at most ${DEFAULT_SECONDARY_NEWS_RENDER_LIMIT} source_group=AIHOT supplemental entries.`,
        "Prefer high-signal product, model, research, security, developer-platform, and open-source items; skip repetitive, tutorial-only, or low-context social snippets.",
        "For each selected news item, include title plus a one-sentence summary_cn and a tag from the taxonomy when possible.",
        "bridge_cn must be grounded in today's Juya news entries and selected repositories, and should explicitly explain the shared theme in one sentence.",
        "Do not repeat the same news item twice with different wording.",
        "Do not use emoji inside opening, bridge, or overall summary.",
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
        '        "summary_cn": string,',
        `        "tag": one of ${JSON.stringify(NEWS_TAG_TAXONOMY)}`,
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
    let batchError = "";

    try {
      batchResults = await summarizeProjectBatch(env, {
        reportDate: payload.reportDate,
        timezone: payload.timezone,
        trigger: payload.trigger,
        repositories: batch,
        news: buildProjectSummaryNewsHint(payload.news),
      });
    } catch (error) {
      batchError = formatError(error);
      batchResults = await summarizeProjectBatchAfterFailure(env, {
        reportDate: payload.reportDate,
        timezone: payload.timezone,
        trigger: payload.trigger,
        news: buildProjectSummaryNewsHint(payload.news),
      }, batch, batchError);
    }

    const retryRepos = batchError
      ? []
      : batchResults
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

async function summarizeProjectBatchAfterFailure(env, basePayload, repositories, firstError) {
  const retryBatchSize = Math.max(1, Math.floor(repositories.length / 2));
  const results = [];

  for (const retryBatch of chunkArray(repositories, retryBatchSize)) {
    try {
      const retried = await summarizeProjectBatch(env, {
        ...basePayload,
        repositories: retryBatch,
      });
      results.push(...retried);
    } catch (error) {
      const retryError = formatError(error);
      results.push(...retryBatch.map((repo) => buildFallbackProjectSummary(
        repo,
        `project-batch-error: ${firstError}; retry-error: ${retryError}`,
      )));
    }
  }

  return results;
}

async function summarizeProjectBatch(env, payload) {
  const requested = Array.isArray(payload.repositories) ? payload.repositories : [];
  if (!requested.length) {
    return [];
  }

  const requestedMap = new Map(requested.map((repo) => [repo.full_name, repo]));
  const data = await callDeepSeekJson(env, {
    modelOverride: getProjectSummaryModel(env),
    reasoningEffort: getProjectSummaryReasoningEffort(env),
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
      "Write concise, analytical Chinese for email.",
      "Every human-facing field ending in _cn must be written in Chinese. Keep repository names, product names, code identifiers, and programming language names as-is, but do not write English prose.",
      "Each positioning_cn must help a reader quickly decide what the project is and why it matters.",
      "Use this compact structure inside positioning_cn: 定位：...。价值：...。看点：...。注意：...。",
      "定位 should name the concrete category or product shape, not repeat stars, language, or freshness.",
      "价值 should explain the practical use case, target user, or differentiator in one short sentence.",
      "看点 should use star_delta_24h, age, update/release, forks, topic match, readme_lead, or signal_hint to explain why it is worth opening today.",
      "注意 should mention the main adoption caveat from input, or say 适合先看 README/示例/维护节奏。",
      "Do not simply translate, lightly paraphrase, or restate the GitHub description/README.",
      "Do not write generic phrases like 当前公开信息显示, 重点提供, 围绕某主题, 值得关注, or 快速上升 unless tied to a concrete value.",
      "Project body should stay within 4 compact Chinese clauses/sentences total.",
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
  const requestedModel = String(options.modelOverride || env.DEEPSEEK_MODEL || DEEPSEEK_V4_FLASH_MODEL);
  const attempts = buildDeepSeekAttempts(requestedModel);
  const errors = [];

  for (const attempt of attempts) {
    try {
      return await executeDeepSeekAttempt(env, options, attempt);
    } catch (error) {
      errors.push(`${attempt.label}: ${formatError(error)}`);
      console.warn(`DeepSeek attempt failed (${attempt.label}): ${formatError(error)}`);
    }
  }

  throw new Error(`DeepSeek retries exhausted: ${errors.join(" | ")}`);
}

function getDigestOverviewModel(env) {
  return String(env.DIGEST_OVERVIEW_MODEL || DEEPSEEK_V4_PRO_MODEL);
}

function getProjectSummaryModel(env) {
  return String(env.PROJECT_SUMMARY_MODEL || DEEPSEEK_V4_FLASH_MODEL);
}

function getDigestOverviewReasoningEffort(env) {
  return normalizeReasoningEffort(
    env.DIGEST_OVERVIEW_REASONING_EFFORT || env.DEEPSEEK_REASONING_EFFORT,
    DEEPSEEK_EFFORT_MAX,
  );
}

function getProjectSummaryReasoningEffort(env) {
  return normalizeReasoningEffort(
    env.PROJECT_SUMMARY_REASONING_EFFORT || env.DEEPSEEK_REASONING_EFFORT,
    DEEPSEEK_EFFORT_HIGH,
  );
}

function normalizeOverviewDigest(raw, fallback) {
  const rawItems = raw && raw.news_section && Array.isArray(raw.news_section.items_cn)
    ? raw.news_section.items_cn
    : [];
  const newsItems = rawItems
    .map((item) => ({
      title: sanitizeLine(item && item.title ? item.title : ""),
      summary_cn: sanitizeParagraph(item && item.summary_cn ? item.summary_cn : ""),
      tag: validateNewsTag(item && item.tag ? item.tag : ""),
    }))
    .filter((item) => item.title);
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
      ? selectNewsEntriesForOverview(news.entries).map((entry) => ({
          title: sanitizeLine(entry && entry.title ? entry.title : ""),
          summary: sanitizeParagraph(entry && entry.summary ? entry.summary : ""),
          section: sanitizeLine(entry && entry.section ? entry.section : ""),
          source_group: sanitizeLine(entry && entry.source_group ? entry.source_group : ""),
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

function selectNewsEntriesForOverview(entries) {
  const primary = [];
  const secondary = [];
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (isSecondaryNewsEntry(entry)) {
      secondary.push(entry);
    } else {
      primary.push(entry);
    }
  });
  return [
    ...primary.slice(0, DEFAULT_PRIMARY_NEWS_RENDER_LIMIT),
    ...secondary.slice(0, DEFAULT_SECONDARY_NEWS_RENDER_LIMIT),
  ];
}

function isChineseProjectCopy(text) {
  const cleaned = sanitizeParagraph(text);
  if (!cleaned) {
    return false;
  }

  const chineseCount = (cleaned.match(/[\u3400-\u9fff]/g) || []).length;
  if (chineseCount === 0) {
    return false;
  }

  const latinWords = cleaned.match(/[A-Za-z][A-Za-z0-9+.#-]*/g) || [];
  return chineseCount >= 6 || latinWords.length < 3;
}

export function normalizeProjectSummaryItem(repo, item) {
  const fallback = buildFallbackProjectSummary(repo, "incomplete-model-entry");
  const rawPositioning = sanitizeParagraph(item && item.positioning_cn ? item.positioning_cn : "");
  const positioning = isChineseProjectCopy(rawPositioning) ? rawPositioning : "";
  const rawRisk = sanitizeParagraph(item && item.risk_cn ? item.risk_cn : "");
  const risk = isMeaningfulRisk(rawRisk) && isChineseProjectCopy(rawRisk) ? rawRisk : "";
  const usedFallback = !positioning;

  return {
    full_name: repo.full_name,
    positioning_cn: positioning || fallback.positioning_cn,
    why_today_cn: "",
    action_cn: "",
    risk_cn: risk || fallback.risk_cn,
    __fallback: usedFallback,
    __fallback_reason: usedFallback
      ? (rawPositioning ? "non-chinese-model-entry" : "incomplete-model-entry")
      : "",
  };
}

export function buildFallbackProjectSummary(repo, reason = "") {
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
  const topic = inferRepositoryTopic(repo);
  const capability = inferProjectCapability(repo);
  const stack = inferProjectStack(repo);
  const sourceDetail = extractPrimaryProjectSignal(repo);
  const facts = buildFallbackFactSignals(repo);
  const category = buildProjectCategoryLabel(topic, projectType, stack);
  const value = buildFallbackValueAnalysis(repo, capability, sourceDetail);
  const signal = buildFallbackSignalAnalysis(repo);
  const caveat = buildFallbackCaveat(repo);

  return [
    `定位：${category}。`,
    `价值：${value}`,
    `看点：${signal}`,
    `注意：${caveat}${facts ? `（${facts}）` : ""}。`,
  ].join("");
}

function buildFallbackFactSignals(repo) {
  const facts = [];
  if (Number(repo.star_delta_24h || 0) > 0) {
    facts.push(`过去24小时新增 ${repo.star_delta_24h} 星`);
  }
  if (Number.isFinite(Number(repo.age_days)) && Number(repo.age_days) <= 14) {
    facts.push(`创建约 ${Math.max(0, Math.round(Number(repo.age_days)))} 天`);
  }
  if (repo.language) {
    facts.push(`GitHub 标记语言为 ${sanitizeLine(repo.language)}`);
  }
  return facts.slice(0, 3).join("，");
}

function buildProjectCategoryLabel(topic, projectType, stack) {
  const parts = [topic, projectType].filter(Boolean);
  const category = parts.length ? parts.join(" / ") : "近期热度上升项目";
  return stack ? `${category}，${stack}` : category;
}

function buildFallbackValueAnalysis(repo, capability, sourceDetail) {
  const useCase = buildFallbackUseCase(repo);
  if (capability) {
    return `${capability}，${useCase}`;
  }
  if (sourceDetail) {
    return `公开描述指向“${sourceDetail}”，${useCase}`;
  }
  if (Number(repo.star_delta_24h || 0) >= 100) {
    return `短时间关注度上升明显，${useCase}`;
  }
  return `当前信号主要来自热度和主题相关性，${useCase}`;
}

function buildFallbackUseCase(repo) {
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    repo.readme_excerpt,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  if (/agent|harness|workflow|orchestration|multi-agent|multi agent/.test(corpus)) {
    return "适合评估能否改善智能体编排、任务执行或上下文交接。";
  }
  if (/codex|claude code|copilot|cursor|coding|cli|command line/.test(corpus)) {
    return "适合评估能否提升编码代理、命令行开发或自动化修复效率。";
  }
  if (/model|llm|inference|training|glm|qwen|deepseek|generative/.test(corpus)) {
    return "适合评估模型能力、推理链路或生成式应用集成价值。";
  }
  if (/design|ui|react|component|frontend|web/.test(corpus)) {
    return "适合评估前端产品化、界面生成或设计到代码流程。";
  }
  if (/awesome|guide|book|course|docs|tutorial|skills/.test(corpus)) {
    return "适合快速建立资料索引、技能库或学习路线。";
  }
  return "适合先打开仓库核对 README、示例和维护者背景。";
}

function buildFallbackSignalAnalysis(repo) {
  const signals = [];
  if (Number(repo.star_delta_24h || 0) >= 100) {
    signals.push(`24h 新增 ${repo.star_delta_24h} 星`);
  } else if (Number(repo.star_delta_24h || 0) > 0) {
    signals.push(`今天仍有 +${repo.star_delta_24h} 星`);
  }
  if (Number.isFinite(Number(repo.age_days)) && Number(repo.age_days) <= 14) {
    signals.push(`创建约 ${Math.max(0, Math.round(Number(repo.age_days)))} 天`);
  }
  if (Number.isFinite(Number(repo.hours_since_push)) && Number(repo.hours_since_push) <= 24) {
    signals.push(`近 ${Math.max(1, Math.round(Number(repo.hours_since_push)))} 小时有更新`);
  }
  if (Number(repo.forks || 0) >= 100) {
    signals.push(`${repo.forks} 个 fork 说明开发者在试用或复用`);
  }
  if (Array.isArray(repo.topic_matches) && repo.topic_matches.length) {
    signals.push(`与今日 ${repo.topic_matches.slice(0, 2).join("、")} 主题相关`);
  }
  if (repo.has_recent_release) {
    signals.push("近期有正式 release");
  }
  return signals.length
    ? `${signals.slice(0, 3).join("，")}。`
    : "入选主要来自综合热度和主题相关性，适合先看仓库结构和示例。";
}

function buildFallbackCaveat(repo) {
  if (!repo.readme_excerpt) {
    return "本次输入缺少可用 README 摘要，结论只按 GitHub 元数据和热度信号判断";
  }
  if (Number(repo.authenticity_score || 0) < 10) {
    return "真实性或维护信号偏弱，依赖前需要核对代码来源和 issue 活跃度";
  }
  if (repo.age_days <= 14) {
    return "项目很新，长期维护和真实采用还需要继续观察";
  }
  return "投入使用前仍需确认安装路径、许可证和近期维护质量";
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
  const strongDesignCorpus = normalizeText([
    repo.full_name,
    repo.description,
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
  if (/design md|design-md|design-system|open-design/.test(strongDesignCorpus)) {
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
  const primaryLanguage = sanitizeLine(repo.language || "");
  if (primaryLanguage) {
    return primaryLanguage;
  }
  const corpus = normalizeText([
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
    is_fallback: Boolean(item.__fallback),
  };
}

function buildDeliverabilityPlan(repositories, aiByRepo) {
  const rewrites = [];
  const deliverability = { rewrites };

  for (const repo of Array.isArray(repositories) ? repositories : []) {
    const ai = aiByRepo instanceof Map ? aiByRepo.get(repo.full_name) || {} : {};
    const fallbackAi = buildFallbackProjectSummary(repo);
    getDeliverableProjectCopy(repo, ai, fallbackAi, deliverability);
  }

  return deliverability;
}

function getDeliverableProjectCopy(repo, ai, fallbackAi, deliverability) {
  const aiPositioning = sanitizeParagraph(ai.positioning_cn || ai.tagline_cn || "");
  const rawPositioning = isChineseProjectCopy(aiPositioning)
    ? aiPositioning
    : sanitizeParagraph(fallbackAi.positioning_cn);
  const rawRisk = extractRiskText(ai) || fallbackAi.risk_cn;
  const onRewrite = (field) => (rewrite) => {
    appendDeliverabilityRewrite(deliverability, repo.full_name, field, rewrite);
  };

  return {
    positioning: rewriteDeliverabilityText(rawPositioning, {
      onRewrite: onRewrite("positioning_cn"),
    }).text,
    risk: rewriteDeliverabilityText(rawRisk, {
      onRewrite: onRewrite("risk_cn"),
    }).text,
  };
}

function appendDeliverabilityRewrite(deliverability, fullName, field, rewrite) {
  if (!deliverability || !Array.isArray(deliverability.rewrites)) {
    return;
  }
  const exists = deliverability.rewrites.some((item) =>
    item.full_name === fullName
    && item.field === field
    && item.from === rewrite.from
    && item.to === rewrite.to
  );
  if (!exists) {
    deliverability.rewrites.push({ full_name: fullName, field, ...rewrite });
  }
}

export function rewriteDeliverabilityText(text, options = {}) {
  let output = sanitizeParagraph(text);
  const rewrites = [];
  if (!output) {
    return { text: "", rewrites };
  }

  const rules = [
    [/自动移除语言模型的安全对齐（审查）/g, "研究语言模型行为边界"],
    [/移除语言模型的安全对齐/g, "研究语言模型行为边界"],
    [/高质量去审查/g, "输出风格调整"],
    [/去审查/g, "风格调整"],
    [/安全对齐（审查）/g, "行为边界"],
    [/安全对齐/g, "行为边界"],
  ];

  for (const [pattern, replacement] of rules) {
    output = output.replace(pattern, (match) => {
      const rewrite = { from: match, to: replacement };
      rewrites.push(rewrite);
      if (typeof options.onRewrite === "function") {
        options.onRewrite(rewrite);
      }
      return replacement;
    });
  }

  return { text: output, rewrites };
}

function buildEmailPayload(input) {
  const aiByRepo = new Map(
    Array.isArray(input.aiDigest && input.aiDigest.projects)
      ? input.aiDigest.projects.map((item) => [item.full_name, item])
      : [],
  );
  const deliverability = buildDeliverabilityPlan(input.repositories, aiByRepo);

  const lines = [];
  const aiNews = input.aiDigest && input.aiDigest.news_section ? input.aiDigest.news_section : null;
  const opening = getOpeningLine(input.aiDigest);
  const newsItems = input.news && input.news.freshNews ? collectRenderableNewsItems(aiNews, input.news.freshNews) : [];

  lines.push(`${input.reportDate} GitHub + AI 日报`);
  lines.push("");
  lines.push("今日一句话");
  lines.push(opening);
  lines.push("");

  const officialUpdatesText = input.news && Array.isArray(input.news.official_updates) ? input.news.official_updates : [];
  if (input.news && input.news.freshNews) {
    lines.push("📰 今日 AI 动态");
    if (newsItems.length) {
      newsItems.forEach((item) => {
        lines.push(`- [${item.tag || "行业动态"}] ${sanitizeLine(item.title)}`);
        lines.push(`  ${sanitizeLine(item.summary_cn)}`);
      });
    } else {
      lines.push(`- ${sanitizeLine(input.news.freshNews.description || "详见原文")}`);
    }
    if (input.news.freshNews.link) {
      lines.push(`原文: ${input.news.freshNews.link}`);
    }
    lines.push("");
  } else if (officialUpdatesText.length) {
    lines.push("📰 今日官方动态");
    officialUpdatesText.forEach((item) => {
      lines.push(`- [${sanitizeLine(item.source || "")}] ${sanitizeLine(item.title || "")}`);
      if (item.summary) lines.push(`  ${sanitizeLine(item.summary)}`);
    });
    lines.push("");
  }

  const socialPlatformsText = input.news && Array.isArray(input.news.social_platforms) ? input.news.social_platforms : [];
  if (socialPlatformsText.length) {
    lines.push("📊 社媒与社区热榜");
    socialPlatformsText.forEach(({ id, label, items }) => {
      lines.push(`${label}`);
      items.slice(0, DEFAULT_SOCIAL_PLATFORM_DISPLAY_LIMIT).forEach((item, i) => {
        const meta = sanitizeLine(item.meta || "");
        const platformId = item && item.platform ? item.platform : id;
        const url = shouldTranslateSocialPlatform(platformId) ? sanitizeLine(item.url || "") : "";
        lines.push(`${i + 1}. ${sanitizeLine(item.title)}${meta ? ` (${meta})` : ""}${url ? ` - ${url}` : ""}`);
      });
      lines.push("");
    });
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
      const copy = getDeliverableProjectCopy(repo, ai, fallbackAi, deliverability);
      lines.push(`${index + 1}. ${repo.full_name}`);
      lines.push(`${renderLanguageLabel(repo.language)} · ⭐ ${formatCompactNumber(repo.stars)} · 📈 +${repo.star_delta_24h}`);
      lines.push(copy.positioning);
      lines.push("");
      lines.push(`今日信号：${buildProjectSignalLine(repo)}`);
      if (copy.risk) {
        lines.push("");
        lines.push(`⚠️ ${copy.risk}`);
      }
      lines.push(`链接: ${repo.html_url}`);
      lines.push("");
    });
  }

  lines.push("本邮件由 DeepSeek 自动生成。");
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
      deliverability,
    }),
    deliverability,
  };
}

async function sendEmail(env, subject, textBody, htmlBody) {
  const recipients = String(env.EMAIL_TO).split(",").map((s) => s.trim()).filter(Boolean);
  const accepted = [];
  const failed = [];
  for (const to of recipients) {
    try {
      const raw = buildRawEmail({ from: env.EMAIL_FROM, to, subject, textBody, htmlBody });
      const message = new EmailMessage(env.EMAIL_FROM, to, raw);
      await env.EMAIL_OUT.send(message);
      accepted.push(to);
      console.log(`Email Service accepted message for ${to}`);
    } catch (err) {
      const error = formatError(err);
      console.error(`Email Service rejected message for ${to}: ${error}`);
      failed.push({ to, error });
    }
  }
  if (failed.length === recipients.length) {
    throw new Error(`All email recipients failed: ${failed.map((item) => `${item.to}: ${item.error}`).join(", ")}`);
  }
  const result = {
    status: failed.length ? "partial_acceptance" : "accepted",
    accepted_count: accepted.length,
    failed_count: failed.length,
    accepted_recipients: accepted,
    failed_recipients: failed,
    checked_at: new Date().toISOString(),
    note: "accepted means Email Service accepted the message; final delivery must be checked in Cloudflare Email Service analytics",
  };
  console.log(`Email Service acceptance summary: status=${result.status}, accepted=${accepted.length}, failed=${failed.length}`);
  return result;
}

function buildRawEmail(input) {
  const boundary = `cf-alt-${crypto.randomUUID().replace(/-/g, "")}`;
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

function buildHtmlEmail(input, context) {
  const aiByRepo = context.aiByRepo;
  const deliverability = context.deliverability || { rewrites: [] };
  const newsItems = Array.isArray(context.newsItems) ? context.newsItems : [];
  const rawNewsEntries = Array.isArray(context.rawNewsEntries) ? context.rawNewsEntries : [];
  const bridge = sanitizeParagraph(input.aiDigest && input.aiDigest.bridge_cn ? input.aiDigest.bridge_cn : "");

  const officialUpdates = input.news && Array.isArray(input.news.official_updates) ? input.news.official_updates : [];
  const socialPlatforms = input.news && Array.isArray(input.news.social_platforms) ? input.news.social_platforms : [];
  const newsHtml = (input.news && input.news.freshNews)
    ? buildHtmlNewsCards(rawNewsEntries, newsItems)
    : officialUpdates.length
      ? officialUpdates.map(renderOfficialUpdateCard).join("")
      : `<div style="${cardStyle()}"><div style="${mutedTextStyle()}">今日没有可展示的 AI 新闻卡片。</div></div>`;

  const projectHtml = input.repositories.length
    ? input.repositories.map((repo, index) => {
      const ai = aiByRepo.get(repo.full_name) || {};
      const isFallback = Boolean(ai.is_fallback);
      return renderProjectCard(repo, { ...ai, __fallback: isFallback }, index, deliverability);
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
      ? `<div style="margin-top:14px;"><a href="${escapeAttribute(input.news.freshNews.link)}" style="${buttonStyle("#111827", "#ffffff")}">查看新闻源</a></div>`
      : "",
    "</section>",
    bridge
      ? `<section style="${sectionStyle()}"><div style="${sectionTitleStyle()}">🔗 今日主线关联</div><div style="${paragraphStyle()}">${escapeHtml(bridge)}</div></section>`
      : "",
    `<section style="${sectionStyle()}">`,
    `<div style="${sectionTitleStyle()}">🔥 今日热门项目</div>`,
    projectHtml,
    "</section>",
    socialPlatforms.length ? buildDomesticTrendingSection(socialPlatforms) : "",
    `<div style="${footerStyle()}">本邮件由 DeepSeek 自动生成。图片与外链来自原始新闻源，邮箱客户端可能默认折叠远程图片。</div>`,
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

function renderNewsCard(item) {
  const imageHtml = renderNewsImages(item);
  const sourceLabel = getPrimarySourceLabel(item);
  const primaryLink = item.link || (Array.isArray(item.source_links) && item.source_links[0] ? item.source_links[0].href : "");

  return [
    `<div style="${cardStyle({ padding: item.image_url ? "0 0 16px 0" : "18px" })}">`,
    imageHtml,
    `<div style="${item.image_url ? "padding:16px 18px 0 18px;" : ""}">`,
    renderNewsTagBadge(item.tag || "行业动态"),
    `<div style="${cardTitleStyle()}">${escapeHtml(item.title)}</div>`,
    `<div style="${paragraphStyle()}">${escapeHtml(item.summary_cn || "详见原文")}</div>`,
    `<div style="margin-top:12px;">${primaryLink ? `<a href="${escapeAttribute(primaryLink)}" style="${buttonStyle("#111827", "#ffffff")}">查看条目</a>` : ""}<span style="${sourceBadgeStyle()}">来源：${escapeHtml(sourceLabel)}</span></div>`,
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

export function buildDomesticTrendingSection(platforms) {
  const renderCol = ({ id, label, items }) => {
    const rows = items.slice(0, DEFAULT_SOCIAL_PLATFORM_DISPLAY_LIMIT).map((item, i) => {
      const fullTitle = shouldRenderFullSocialTitle(item, id);
      const title = fullTitle ? sanitizeLine(item.title) : truncateText(sanitizeLine(item.title), 30);
      const meta = truncateText(sanitizeLine(item.meta || ""), 22);
      const rankStyle = "display:inline-block;width:18px;text-align:right;margin-right:8px;color:#d1d5db;font-size:13px;font-weight:700;";
      const titleStyle = `font-size:14px;line-height:1.5;color:${i < 3 ? "#111827" : "#374151"};font-weight:${i < 3 ? "600" : "400"};word-break:break-word;overflow-wrap:anywhere;`;
      const metaStyle = "margin-left:26px;margin-top:2px;color:#9ca3af;font-size:12px;line-height:1.35;";
      const rowStyle = "padding:7px 0;border-bottom:1px solid #f3f4f6;word-break:break-word;overflow-wrap:anywhere;";
      const inner = `<span style="${rankStyle}">${i + 1}</span><span style="${titleStyle}">${escapeHtml(title)}</span>${meta ? `<div style="${metaStyle}">${escapeHtml(meta)}</div>` : ""}`;
      return `<div style="${rowStyle}">${item.url ? `<a href="${escapeAttribute(item.url)}" style="display:block;text-decoration:none;word-break:break-word;overflow-wrap:anywhere;">${inner}</a>` : inner}</div>`;
    }).join("");
    return `<td style="width:50%;vertical-align:top;padding:0 8px;">
      <div style="font-size:12px;font-weight:800;color:#9ca3af;letter-spacing:0.05em;margin-bottom:8px;">${escapeHtml(label)}</div>
      ${rows}
    </td>`;
  };

  const divider = '<td style="width:1px;padding:0 1px;background:#f3f4f6;"></td>';
  const emptyCol = '<td style="width:50%;vertical-align:top;padding:0 8px;"></td>';
  const rows = [];
  for (let i = 0; i < platforms.length; i += 2) {
    const pair = platforms.slice(i, i + 2);
    const tds = pair.length === 2
      ? pair.map(renderCol).join(divider)
      : renderCol(pair[0]) + divider + emptyCol;
    const gap = i > 0 ? '<tr><td colspan="3" style="height:16px;"></td></tr>' : "";
    rows.push(`${gap}<tr>${tds}</tr>`);
  }

  return [
    `<section style="${sectionStyle()}">`,
    `<div style="${sectionTitleStyle()}">📊 社媒与社区热榜</div>`,
    `<table width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`,
    `</section>`,
  ].join("");
}

function shouldRenderFullSocialTitle(item, platformId) {
  return shouldTranslateSocialPlatform(item && item.platform ? item.platform : platformId);
}

function buildHtmlNewsCards(rawEntries, aiItems) {
  const summaryMap = new Map();
  const tagMap = new Map();
  (aiItems || []).forEach((item) => {
    const key = canonicalNewsKey(item.title);
    if (key && !summaryMap.has(key)) {
      summaryMap.set(key, sanitizeParagraph(item.summary_cn || ""));
      tagMap.set(key, validateNewsTag(item.tag || ""));
    }
  });

  const cards = [];
  const seen = [];

  selectRenderableRawEntries(rawEntries || []).forEach((entry) => {
    const title = sanitizeLine(entry && entry.title ? entry.title : "");
    if (!title || hasEquivalentNewsTitle(seen, title)) {
      return;
    }
    seen.push(title);
    const key = canonicalNewsKey(title);
    cards.push(renderNewsCard({
      title,
      summary_cn: truncateText(summaryMap.get(key) || sanitizeParagraph(entry.summary || "") || "详见原文", 180),
      tag: entry.section || tagMap.get(key) || "行业动态",
      link: entry.link || "",
      image_url: entry.image_url || "",
      image_urls: Array.isArray(entry.image_urls) ? entry.image_urls : [],
      source_links: Array.isArray(entry.source_links) ? entry.source_links : [],
      source: entry.source || "",
      is_secondary: Boolean(entry.is_secondary),
    }));
  });

  if (!cards.length) {
    (aiItems || []).forEach((item) => {
      cards.push(renderNewsCard(item));
    });
  }

  if (!cards.length) {
    return `<div style="${cardStyle()}"><div style="${mutedTextStyle()}">今日没有可展示的 AI 新闻卡片。</div></div>`;
  }

  return cards.join("");
}

function selectRenderableRawEntries(entries) {
  const primary = [];
  const secondary = [];
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (isSecondaryNewsEntry(entry)) {
      secondary.push(entry);
    } else {
      primary.push(entry);
    }
  });
  return [
    ...primary.slice(0, DEFAULT_PRIMARY_NEWS_RENDER_LIMIT),
    ...secondary.slice(0, DEFAULT_SECONDARY_NEWS_RENDER_LIMIT),
  ];
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

function renderProjectCard(repo, ai, index, deliverability = { rewrites: [] }) {
  const fallbackAi = buildFallbackProjectSummary(repo);
  const copy = getDeliverableProjectCopy(repo, ai, fallbackAi, deliverability);
  const isFallback = Boolean(ai && ai.__fallback);
  const riskHtml = copy.risk
    ? `<div style="margin-top:12px;padding:12px 14px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:14px;line-height:1.6;">⚠️ ${escapeHtml(copy.risk)}</div>`
    : "";
  const fallbackNote = isFallback
    ? `<div style="margin-top:6px;font-size:11px;color:#9ca3af;">（本地兜底摘要）</div>`
    : "";
  const signalLine = buildProjectSignalLine(repo);

  return [
    `<div style="${cardStyle()}">`,
    `<div style="${cardTitleStyle()}">${index + 1}. ${escapeHtml(repo.full_name)}</div>`,
    `<div style="${metaRowStyle()}">${escapeHtml(renderLanguageLabel(repo.language))} <span style="margin-left:10px;">⭐ ${escapeHtml(formatCompactNumber(repo.stars))}</span> <span style="margin-left:10px;">📈 +${escapeHtml(String(repo.star_delta_24h))}</span></div>`,
    `<div style="${paragraphStyle()}">${escapeHtml(copy.positioning)}</div>`,
    fallbackNote,
    `<div style="${metaRowStyle()}">今日信号：${escapeHtml(signalLine)}</div>`,
    riskHtml,
    `<div style="margin-top:14px;"><a href="${escapeAttribute(repo.html_url)}" style="${buttonStyle("#111827", "#ffffff")}">打开 GitHub</a></div>`,
    "</div>",
  ].join("");
}

function getPrimarySourceLabel(item) {
  if (item.source) {
    return sanitizeLine(item.source);
  }
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
    aihot_status: newsContext.aihot_status || "empty",
    aihot_fetch_status: newsContext.aihot_fetch_status || "empty",
    aihot_updates: Array.isArray(newsContext.aihot_updates)
      ? newsContext.aihot_updates.map((item) => ({
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
  const headerSecret = request.headers.get("x-run-secret");
  const testExpected = String(env.TEST_RUN_SECRET || "").trim();
  if (testExpected && safeSecretEqual(headerSecret, testExpected)) {
    return true;
  }
  if (!expected) {
    return false;
  }

  if (safeSecretEqual(headerSecret, expected)) {
    return true;
  }
  if (!isTruthy(env.ALLOW_QUERY_RUN_SECRET)) {
    return false;
  }

  return safeSecretEqual(url.searchParams.get("secret"), expected);
}

function normalizeTestRecipient(value, env) {
  const raw = String(value || "").trim();
  if (!raw || !isTruthy(env.ALLOW_TEST_RECIPIENT_OVERRIDE)) {
    return "";
  }
  const recipients = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (recipients.length !== 1) {
    return "";
  }
  const [recipient] = recipients;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ? recipient : "";
}

function safeSecretEqual(actual, expected) {
  const actualText = String(actual || "");
  const expectedText = String(expected || "");
  if (!actualText || !expectedText || actualText.length !== expectedText.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < expectedText.length; index += 1) {
    mismatch |= actualText.charCodeAt(index) ^ expectedText.charCodeAt(index);
  }
  return mismatch === 0;
}

function unauthorized() {
  return jsonResponse({
    ok: false,
    error: "Unauthorized",
  }, 401);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
    },
  });
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

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }

  throw new Error("No JSON object found in model output");
}

function createConcurrencyLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (!queue.length || active >= max) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active -= 1; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

function validateNewsTag(tag) {
  const cleaned = sanitizeLine(tag || "");
  return cleaned || "行业动态";
}

function getTagStyle(tag) {
  const styles = {
    "模型发布": { bg: "#dbeafe", color: "#1d4ed8" },
    "产品更新": { bg: "#d1fae5", color: "#065f46" },
    "开源发布": { bg: "#ede9fe", color: "#5b21b6" },
    "研究突破": { bg: "#e0e7ff", color: "#3730a3" },
    "安全漏洞": { bg: "#fee2e2", color: "#991b1b" },
    "行业动态": { bg: "#f3f4f6", color: "#374151" },
    "工具发布": { bg: "#ffedd5", color: "#9a3412" },
    "要闻": { bg: "#fef9c3", color: "#854d0e" },
    "开发生态": { bg: "#dcfce7", color: "#166534" },
    "产品应用": { bg: "#f3e8ff", color: "#6b21a8" },
    "技术与洞察": { bg: "#e0e7ff", color: "#3730a3" },
    "前瞻与传闻": { bg: "#fce7f3", color: "#9d174d" },
  };
  return styles[tag] || styles["行业动态"];
}

function renderNewsTagBadge(tag) {
  const validated = validateNewsTag(tag);
  const { bg, color } = getTagStyle(validated);
  return `<div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:800;margin-bottom:10px;">${escapeHtml(validated)}</div>`;
}

function buildDeepSeekAttempts(requestedModel) {
  const normalized = String(requestedModel || DEEPSEEK_V4_FLASH_MODEL);
  return [{ model: normalized, useResponseFormat: true, label: `${normalized}/json-thinking` }];
}

async function executeDeepSeekAttempt(env, options, attempt) {
  const thinkingEnabled = getDeepSeekThinkingMode(env) === DEEPSEEK_THINKING_ENABLED;
  const body = {
    model: attempt.model,
    max_tokens: Number(options.maxTokens || 1800),
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
  if (thinkingEnabled) {
    body.thinking = { type: DEEPSEEK_THINKING_ENABLED };
    body.reasoning_effort = normalizeReasoningEffort(options.reasoningEffort, DEEPSEEK_EFFORT_HIGH);
  } else {
    body.temperature = 0.2;
  }

  const response = await fetchWithTimeout(
    `${String(env.DEEPSEEK_BASE_URL || DEEPSEEK_API_BASE)}/chat/completions`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    DEFAULT_DEEPSEEK_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorText = await safeText(response);
    throw new Error(`DeepSeek failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = extractDeepSeekContent(data);
  if (!content) {
    throw new Error("DeepSeek returned an empty response.");
  }
  return parseDeepSeekJson(content);
}

function getDeepSeekThinkingMode(env) {
  const raw = String(env.DEEPSEEK_THINKING || DEEPSEEK_THINKING_ENABLED).trim().toLowerCase();
  return raw === "disabled" ? "disabled" : DEEPSEEK_THINKING_ENABLED;
}

function normalizeReasoningEffort(value, fallback) {
  const raw = String(value || fallback || DEEPSEEK_EFFORT_HIGH).trim().toLowerCase();
  if (raw === "max" || raw === "xhigh") {
    return DEEPSEEK_EFFORT_MAX;
  }
  return DEEPSEEK_EFFORT_HIGH;
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

function buildJuyaSectionMap(contentHtml) {
  const map = new Map();
  const source = String(contentHtml || "");
  const overviewMatch = source.match(/<h2>\s*概览\s*<\/h2>([\s\S]*?)(?=<h2\b[^>]*>|$)/i);
  if (!overviewMatch) return map;
  const overview = overviewMatch[1];
  const sectionPattern = /<h3>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|$)/gi;
  let sectionMatch;
  while ((sectionMatch = sectionPattern.exec(overview)) !== null) {
    const sectionName = sanitizeLine(stripCdata(sectionMatch[1]));
    const sectionBody = sectionMatch[2];
    const codePattern = /<code>#(\d+)<\/code>/g;
    let codeMatch;
    while ((codeMatch = codePattern.exec(sectionBody)) !== null) {
      map.set(Number(codeMatch[1]), sectionName);
    }
  }
  return map;
}

export function extractJuyaNewsEntries(contentHtml) {
  const entries = [];
  const sectionMap = buildJuyaSectionMap(contentHtml);
  // Old Juya pages used h2 entry headings; daily.juya.uk now uses h3.
  const pattern = /<h([23])\b[^>]*>\s*(?:<a\s+href=(["'])(.*?)\2[^>]*>([\s\S]*?)<\/a>|((?:(?!<code>)[\s\S])*?))\s*<code>#(\d+)<\/code>\s*<\/h\1>([\s\S]*?)(?=<hr\b[^>]*>|<h[23]\b[^>]*>[\s\S]*?<code>#\d+<\/code>|<h2\b[^>]*>|$)/gi;
  let match;

  while ((match = pattern.exec(String(contentHtml || ""))) !== null) {
    const link = decodeHtmlEntities(match[3] || "");
    const title = sanitizeLine(decodeHtmlEntities(match[4] || match[5] || ""));
    const entryNum = Number(match[6]);
    const body = match[7];
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
      section: sectionMap.get(entryNum) || "",
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
  const selectedRawEntries = selectRenderableRawEntries(rawEntries);

  const aiItems = aiNews && Array.isArray(aiNews.items_cn) ? aiNews.items_cn : [];
  aiItems.slice(0, DEFAULT_PRIMARY_NEWS_RENDER_LIMIT + DEFAULT_SECONDARY_NEWS_RENDER_LIMIT).forEach((item) => {
    const title = sanitizeLine(item && item.title ? item.title : "");
    if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
      return;
    }
    seenTitles.push(title);
    const matchedRaw = findMatchingRawEntry(selectedRawEntries, title);
    const summary = (matchedRaw && matchedRaw.summary)
      ? sanitizeParagraph(matchedRaw.summary)
      : sanitizeParagraph(item && item.summary_cn ? item.summary_cn : "");
    const tag = (matchedRaw && matchedRaw.section)
      ? matchedRaw.section
      : validateNewsTag(item && item.tag ? item.tag : "");
    items.push({
      title,
      summary_cn: truncateText(sanitizeParagraph(item && item.summary_cn ? item.summary_cn : "") || summary || "详见原文", 180),
      tag,
      link: matchedRaw && matchedRaw.link ? matchedRaw.link : "",
      image_url: matchedRaw && matchedRaw.image_url ? matchedRaw.image_url : "",
      image_urls: matchedRaw && Array.isArray(matchedRaw.image_urls) ? matchedRaw.image_urls : [],
      source_links: matchedRaw && Array.isArray(matchedRaw.source_links) ? matchedRaw.source_links : [],
      source: matchedRaw && matchedRaw.source ? matchedRaw.source : "",
      is_secondary: Boolean(matchedRaw && matchedRaw.is_secondary),
    });
  });

  selectedRawEntries.forEach((entry) => {
    const title = sanitizeLine(entry && entry.title ? entry.title : "");
    if (!title || hasEquivalentNewsTitle(seenTitles, title)) {
      return;
    }
    seenTitles.push(title);
    items.push({
      title,
      summary_cn: truncateText(sanitizeParagraph(entry.summary || "") || "详见原文", 180),
      tag: entry.section || "行业动态",
      link: entry.link || "",
      image_url: entry.image_url || "",
      image_urls: Array.isArray(entry.image_urls) ? entry.image_urls : [],
      source_links: Array.isArray(entry.source_links) ? entry.source_links : [],
      source: entry.source || "",
      is_secondary: Boolean(entry.is_secondary),
    });
  });

  return items;
}

function isSecondaryNewsEntry(entry) {
  return Boolean(entry && (entry.is_secondary || sanitizeLine(entry.source_group || "").toUpperCase() === "AIHOT"));
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
  const regex = /<img[^>]+src=(["'])(.*?)\1/gi;
  let match;
  while ((match = regex.exec(String(html || ""))) !== null) {
    const url = decodeHtmlEntities(match[2]);
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function extractAnchorLinks(html) {
  const links = [];
  const regex = /<a[^>]+href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html || ""))) !== null) {
    const href = decodeHtmlEntities(match[2]);
    if (!href || href.startsWith("#") || !/^https?:\/\//i.test(href)) {
      continue;
    }
    const rawLabel = sanitizeLine(decodeHtmlEntities(sanitizeHtml(match[3]))) || "";
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
  return createCssProps({
    margin: 0,
    padding: 0,
    background: COLORS.backgroundLight,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    color: COLORS.textDark,
  });
}

function containerStyle() {
  return createCssProps({
    maxWidth: "720px",
    margin: "0 auto",
    padding: `${SPACING.xxxxl} ${SPACING.lg} ${SPACING.xxxxxxl} ${SPACING.lg}`,
  });
}

function heroStyle() {
  return createCssProps({
    background: `linear-gradient(135deg,${COLORS.heroGradientStart} 0%,${COLORS.heroGradientMid} 55%,${COLORS.heroGradientEnd} 100%)`,
    padding: `${SPACING.xxxxxl} ${SPACING.xxxxl}`,
    borderRadius: BORDER_RADIUS.hero,
    color: COLORS.white,
    boxShadow: "0 14px 40px rgba(15,23,42,.18)",
  });
}

function eyebrowStyle() {
  return createCssProps({
    fontSize: FONT_SIZES.xs,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    opacity: ".78",
    marginBottom: SPACING.md,
  });
}

function titleStyle() {
  return createCssProps({
    margin: 0,
    fontSize: FONT_SIZES.xl,
    lineHeight: LINE_HEIGHTS.title,
    fontWeight: FONT_WEIGHTS.extrabold,
  });
}

function metaStyle() {
  return createCssProps({
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.sm,
    opacity: ".8",
  });
}

function sectionStyle() {
  return createCssProps({
    marginTop: SPACING.xxl,
    background: COLORS.white,
    borderRadius: BORDER_RADIUS.section,
    padding: SPACING.xxxl,
    boxShadow: "0 10px 28px rgba(15,23,42,.08)",
  });
}

function sectionTitleStyle() {
  return createCssProps({
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.textDark,
    marginBottom: SPACING.xl,
  });
}

function cardStyle(options = {}) {
  const padding = options.padding || SPACING.xxl;
  return createCssProps({
    background: "#f8fafc", // A slightly lighter background for cards
    border: `${SPACING.micro} solid ${COLORS.borderColor}`,
    borderRadius: BORDER_RADIUS.card,
    padding: padding,
    marginTop: SPACING.xl,
    overflow: "hidden",
  });
}

function mutedTextStyle() {
  return createCssProps({
    fontSize: FONT_SIZES.base,
    color: COLORS.textMuted,
    lineHeight: LINE_HEIGHTS.normal,
  });
}

function cardTitleStyle() {
  return createCssProps({
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.textDark,
    lineHeight: LINE_HEIGHTS.tight,
    margin: `0 0 ${SPACING.md} 0`,
  });
}

function paragraphStyle() {
  return createCssProps({
    fontSize: FONT_SIZES.md,
    lineHeight: LINE_HEIGHTS.loose,
    color: COLORS.textMediumDark,
    marginTop: SPACING.sm,
  });
}

function metaRowStyle() {
  return createCssProps({
    fontSize: FONT_SIZES.base,
    color: COLORS.textLightAlt,
    fontWeight: FONT_WEIGHTS.medium,
    marginTop: SPACING.xs,
  });
}

function buttonStyle(bg, color) {
  return createCssProps({
    display: "inline-block",
    padding: `${SPACING.md} ${SPACING.xl}`,
    borderRadius: BORDER_RADIUS.pill,
    background: bg,
    color: color,
    textDecoration: "none",
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  });
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
  if (isMeaningfulRisk(direct) && isChineseProjectCopy(direct)) {
    return direct;
  }

  const risks = Array.isArray(ai && ai.risks_cn) ? ai.risks_cn : [];
  for (const risk of risks) {
    const cleaned = sanitizeParagraph(risk);
    if (isMeaningfulRisk(cleaned) && isChineseProjectCopy(cleaned)) {
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
    if (existingKey.length >= 16 && candidateKey.includes(existingKey)) {
      return true;
    }
    if (candidateKey.length >= 16 && existingKey.includes(candidateKey)) {
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
    .replace(/[^a-z0-9.+#\-\s\u4e00-\u9fff\u3400-\u4dbf]/g, " ")
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
  const bytes = new TextEncoder().encode(String(value || ""));
  const parts = [];
  for (let i = 0; i < bytes.length; i += 45) {
    const chunk = bytes.slice(i, i + 45);
    let binary = "";
    chunk.forEach((b) => { binary += String.fromCharCode(b); });
    parts.push(`=?UTF-8?B?${btoa(binary)}?=`);
  }
  return parts.join("\r\n ");
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
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&hellip;/g, "\u2026");
}

function stripCdata(text) {
  return String(text || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
