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
const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";
const DEEPSEEK_THINKING_ENABLED = "enabled";
const DEEPSEEK_EFFORT_HIGH = "high";
const DEEPSEEK_EFFORT_MAX = "max";
const GITHUB_TRENDING_DAILY_URL = "https://github.com/trending?since=daily";
const TRENDSHIFT_HOME_URL = "https://trendshift.io/";
// Reserved first-path-segments on github.com that are NOT repo owners. Trending
// rows contain links like /sponsors/<x> that must not be mistaken for repos.
const GITHUB_RESERVED_OWNERS = new Set([
  "sponsors", "topics", "collections", "marketplace", "features", "about",
  "login", "join", "explore", "trending", "settings", "notifications",
  "orgs", "users", "search", "apps", "contact", "site", "readme", "new",
  "pulls", "issues", "codespaces", "stars", "dashboard",
]);
const DEFAULT_TIMEZONE = "Asia/Hong_Kong";
const DEFAULT_MAX_PROJECTS = 10;
const DEFAULT_GITHUB_PAGES = 1;
const README_CHAR_LIMIT = 2500;
const DEFAULT_PROJECT_SUMMARY_BATCH_SIZE = 5;
// Keep GitHub Search bursts modest by default; server deployments can raise this via env.
const NEWS_TAG_TAXONOMY = ["模型发布", "产品更新", "开源发布", "研究突破", "安全漏洞", "行业动态", "工具发布"];
const DIGEST_QUEUE_NAME = "github-digest-jobs";
const ROOT_MESSAGE = "GitHub Digest Worker";
const DEFAULT_REPEAT_COOLDOWN_DAYS = 30;
const DEFAULT_REPEAT_WINDOW_DAYS = 30;
const DEFAULT_BREAKOUT_STAR_DELTA = 120;
const DEFAULT_JUYA_RSS_URL = "https://daily.juya.uk/rss.xml";
const DEFAULT_JUYA_CONTENT_LIMIT = 30000;
const DEFAULT_AIHOT_FEED_URL = "https://aihot.virxact.com/feed.xml";
const DEFAULT_AIHOT_HOME_URL = "https://aihot.virxact.com/feed.xml";
const DEFAULT_AIHOT_ITEMS_TAKE = 50;
const DEFAULT_AIHOT_CANDIDATE_LIMIT = 50;
const DEFAULT_AIHOT_SUMMARY_LIMIT = 220;
const DEFAULT_AIHOT_LOOKBACK_HOURS = 36;
const DEFAULT_AIHOT_TIMEOUT_MS = 4500;
const DEFAULT_AIHOT_IMAGE_TIMEOUT_MS = 10000;
const DEFAULT_PRIMARY_NEWS_RENDER_LIMIT = 12;
const DEFAULT_SECONDARY_NEWS_RENDER_LIMIT = 4;
const DEFAULT_AUTHENTICITY_THRESHOLD = 12;
const DEFAULT_TOPIC_RELEVANCE_MAX = 15;
const DEFAULT_RELEASE_LOOKBACK_HOURS = 72;
const DEFAULT_MIN_DELIVERABLE_STAR_DELTA = 5;
const DEFAULT_MIN_TOPIC_RELEVANCE_FOR_LOW_DELTA = 3;
const DEFAULT_MIN_RESURFACE_STAR_GAIN = 60;
const DEFAULT_MIN_RESURFACE_DAYS = 21;
const DEFAULT_MIN_BREAKOUT_REPEAT_GAP_DAYS = 14;
const DEFAULT_MIN_RELEASE_REPEAT_GAP_DAYS = 7;
const DEFAULT_MAX_REPEAT_PERCENT = 30;
const DEFAULT_OFFICIAL_UPDATE_LIMIT = 6;
const DEFAULT_OFFICIAL_UPDATE_TIMEOUT_MS = 4500;
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 180000;
const DEFAULT_DEEPSEEK_DEADLINE_RESERVE_MS = 12000;
const DEFAULT_DEEPSEEK_MIN_CALL_BUDGET_MS = 15000;
const DEFAULT_GITHUB_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_HTML_SOURCE_TIMEOUT_MS = 10000;
const DEFAULT_JUYA_TIMEOUT_MS = 8000;
const DEFAULT_OFFICIAL_UPDATE_LOOKBACK_HOURS = 120;
const NEWSNOW_API_BASE = "https://newsnow.busiyi.world/api/s";
const NEWSNOW_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_SOCIAL_TIMEOUT_MS = 8000;
const DEFAULT_REDDIT_TIMEOUT_MS = 6000;
const DEFAULT_SOCIAL_ITEM_LIMIT = 50;
const DEFAULT_SOCIAL_AI_ITEM_LIMIT = 8;
const DEFAULT_SOCIAL_PLATFORM_DISPLAY_LIMIT = 4;
const SOCIAL_TRANSLATION_PLATFORM_IDS = new Set(["hacker-news", "reddit-ai"]);
const HACKER_NEWS_FRONT_PAGE_URL = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=16";
const HACKER_NEWS_FIREBASE_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const DEFAULT_60S_API_BASE = "https://60s.viki.moe/v2";
const DEFAULT_60S_TIMEOUT_MS = 4500;
const DEFAULT_60S_SIGNAL_LIMIT = 8;
const DEFAULT_60S_HACKER_NEWS_LIMIT = 10;
const DEFAULT_60S_IT_RANK_TYPE = "day";
const REDDIT_AI_FEEDS = [
  {
    id: "reddit-ai",
    label: "Reddit AI",
    // Both are Atom RSS (parsed identically). The OCI datacenter IP gets 403 on
    // every Reddit .json endpoint and intermittent 429 on old.reddit, so we try
    // the healthier www host first and fall back to old.reddit on a different
    // rate-limit budget.
    urls: [
      "https://www.reddit.com/r/LocalLLaMA+MachineLearning/.rss",
      "https://old.reddit.com/r/LocalLLaMA+MachineLearning/.rss",
    ],
  },
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
const PROJECT_SUMMARY_README_LIMIT = 2400;
const PROJECT_POSITIONING_CHAR_LIMIT = 280;
const DEFAULT_RELEASE_CANDIDATE_LIMIT = 20;
const DEFAULT_README_ENRICH_LIMIT = 8;
const DEFAULT_TRENDING_CANDIDATE_LIMIT = 8;
const DEFAULT_SEARCH_PLAN_CONCURRENCY = 3;
const DEFAULT_LOW_DELTA_QUALITY_FLOOR = 30;
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
  "AI 模型": "模型发布/更新",
  "AI 产品": "产品发布/更新",
  "行业动态": "行业动态",
  "论文": "论文研究",
  "技巧观点": "技巧与观点",
};
const AIHOT_CATEGORY_KEYS = {
  "AI 模型": "ai-models",
  "AI 产品": "ai-products",
  "行业动态": "industry",
  "论文": "paper",
  "技巧观点": "tip",
};
const AI_DOMAIN_TERMS = [
  "ai", "agent", "agents", "llm", "llms", "model", "models", "prompt", "prompts", "rag",
  "mcp", "codex", "claude", "chatgpt", "gpt", "openai", "anthropic", "gemini", "deepseek",
  "ollama", "copilot", "assistant", "inference", "reasoning", "token", "embedding", "workflow",
];
const EXTERNAL_SIGNAL_KEYWORDS = [
  ...AI_DOMAIN_TERMS,
  ...SOCIAL_AI_KEYWORDS,
  "github", "developer", "developers", "coding", "programming", "open source", "security",
  "vulnerability", "api", "sdk", "mcp", "cloudflare", "worker", "node", "python", "javascript",
  "typescript", "rust", "linux", "开源", "开发者", "编程", "代码", "安全", "漏洞", "工具",
  "应用", "智能体", "模型", "大模型", "云服务", "服务器",
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
  brandAccent: "#0f766e",
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

export async function runDigest(env, options) {
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
    const [aihotResult, officialResult, externalSignalsResult] = await timePhase("news_parallel", () => Promise.allSettled([
      fetchAihotUpdates(env, now),
      isOfficialUpdatesEnabled(env)
        ? fetchOfficialUpdates(env, now, juyaContext)
        : Promise.resolve({ status: "disabled", items: [], sources: [] }),
      isSixtySecondSignalsEnabled(env)
        ? fetchSixtySecondSignals(env)
        : Promise.resolve({ status: "disabled", items: [], sources: [] }),
    ]));
    const aihotContext = aihotResult.status === "fulfilled"
      ? aihotResult.value
      : { status: "fetch_failed", items: [], error: formatError(aihotResult.reason) };
    const officialContext = officialResult.status === "fulfilled"
      ? officialResult.value
      : { status: "fetch_failed", items: [], sources: [] };
    const externalSignalsContext = externalSignalsResult.status === "fulfilled"
      ? externalSignalsResult.value
      : { status: "fetch_failed", items: [], sources: [], error: formatError(externalSignalsResult.reason) };
    const newsContext = await timePhase("news_merge", () => mergeNewsContexts(
      env,
      juyaContext,
      aihotContext,
      officialContext,
      { status: "deferred", items: [], platforms: [] },
      externalSignalsContext,
    ));
    const searchPlans = buildSearchPlans(now);
    const candidates = await timePhase("collect_candidates", () => collectCandidates(env, searchPlans));
    const ranked = rankCandidates(candidates, previousSnapshot, now, newsContext, env);
    const annotatedProjects = await timePhase("release_signals", () => annotateReleaseSignalsForCandidates(env, ranked, now));
    const repeatFilteredProjects = filterRepeatedProjects(annotatedProjects, deliveryHistory, now, env, force);
    const deliverableProjects = filterDeliverableProjects(repeatFilteredProjects, env);
    const topProjects = selectProjectsForDigest(deliverableProjects, env);
    const selectedFamilies = Array.from(new Set(topProjects.map((repo) => inferQualificationFamilyToken(repo))));
    console.log(`Project recommendation funnel: candidates=${candidates.length}, relevant_ranked=${ranked.filter(hasStrongProjectRelevance).length}, repeat_safe=${repeatFilteredProjects.length}, deliverable=${deliverableProjects.length}, selected=${topProjects.length}, repeats=${topProjects.filter((repo) => repo.repeat_info).length}, families=${selectedFamilies.join(",") || "none"}`);
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
      news: toStoredNews(finalNewsContext),
      news_selection: toStoredNewsSelection(emailPayload.newsItems),
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

export function resolveRuntimeEnv(env, options) {
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
    DIGEST_OVERVIEW_THINKING: "enabled",
    PROJECT_SUMMARY_THINKING: "enabled",
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
    DIGEST_OVERVIEW_MODEL: DEEPSEEK_V4_FLASH_MODEL,
    PROJECT_SUMMARY_MODEL: DEEPSEEK_V4_FLASH_MODEL,
    DEEPSEEK_THINKING: DEEPSEEK_THINKING_ENABLED,
    DIGEST_OVERVIEW_THINKING: "enabled",
    PROJECT_SUMMARY_THINKING: "enabled",
    DIGEST_OVERVIEW_REASONING_EFFORT: DEEPSEEK_EFFORT_HIGH,
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

function getSearchPlanConcurrency(env) {
  return clampInteger(env.SEARCH_PLAN_CONCURRENCY, DEFAULT_SEARCH_PLAN_CONCURRENCY, 1, 8);
}

function getTrendingCandidateLimit(env) {
  return clampInteger(env.TRENDING_CANDIDATE_LIMIT, DEFAULT_TRENDING_CANDIDATE_LIMIT, 1, 40);
}

function getLowDeltaQualityFloor(env) {
  return clampInteger(env.LOW_DELTA_QUALITY_FLOOR, DEFAULT_LOW_DELTA_QUALITY_FLOOR, 1, 80);
}

function getRepeatCooldownDays(env) {
  return clampInteger(env.PROJECT_REPEAT_COOLDOWN_DAYS, DEFAULT_REPEAT_COOLDOWN_DAYS, 14, 45);
}

function getRepeatWindowDays(env) {
  return clampInteger(env.PROJECT_REPEAT_WINDOW_DAYS, DEFAULT_REPEAT_WINDOW_DAYS, 14, 60);
}

function getBreakoutStarDelta(env) {
  return clampInteger(env.BREAKOUT_STAR_DELTA, DEFAULT_BREAKOUT_STAR_DELTA, 20, 1000);
}

function getMinBreakoutRepeatGapDays(env) {
  return clampInteger(env.MIN_BREAKOUT_REPEAT_GAP_DAYS, DEFAULT_MIN_BREAKOUT_REPEAT_GAP_DAYS, 7, 30);
}

function getMinReleaseRepeatGapDays(env) {
  return clampInteger(env.MIN_RELEASE_REPEAT_GAP_DAYS, DEFAULT_MIN_RELEASE_REPEAT_GAP_DAYS, 3, 30);
}

function getMaxRepeatPercent(env) {
  return clampInteger(env.MAX_REPEAT_PERCENT, DEFAULT_MAX_REPEAT_PERCENT, 0, 50);
}

function getProcessingDeadlineMs(env) {
  const value = String(env.DIGEST_PROCESSING_DEADLINE_UTC || "").trim();
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const wallTime = /^(?:([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)$/.exec(value);
  if (wallTime) {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(Number(wallTime[1]), Number(wallTime[2]), Number(wallTime[3] || "0"), 0);
    return target.getTime();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid DIGEST_PROCESSING_DEADLINE_UTC value: ${value}`);
  }
  return parsed;
}

function getDeepSeekAttemptTimeout(env, deadlineAtMs) {
  const configuredTimeout = getDeepSeekTimeout(env);
  if (!Number.isFinite(deadlineAtMs)) {
    return configuredTimeout;
  }
  const remainingMs = deadlineAtMs - Date.now() - DEFAULT_DEEPSEEK_DEADLINE_RESERVE_MS;
  if (remainingMs < DEFAULT_DEEPSEEK_MIN_CALL_BUDGET_MS) {
    throw new Error(`DeepSeek skipped: processing deadline has only ${Math.max(0, Math.round(remainingMs / 1000))}s remaining`);
  }
  return Math.min(configuredTimeout, remainingMs);
}

// Generous so v4-pro at max reasoning effort has time to finish — the prior 55s
// cap was aborting mid-stream and truncating the overview JSON (looked like an
// "empty/invalid response", but DeepSeek itself is stable).
function getDeepSeekTimeout(env) {
  return clampInteger(env.DEEPSEEK_TIMEOUT_MS, DEFAULT_DEEPSEEK_TIMEOUT_MS, 20000, 300000);
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

function isSixtySecondSignalsEnabled(env) {
  return isTruthy(env.ENABLE_60S_SIGNALS);
}

function getSixtySecondTimeoutMs(env) {
  return clampInteger(env.SIXTY_SECONDS_TIMEOUT_MS, DEFAULT_60S_TIMEOUT_MS, 1000, 12000);
}

function getSixtySecondSignalLimit(env) {
  return clampInteger(env.SIXTY_SECONDS_SIGNAL_LIMIT, DEFAULT_60S_SIGNAL_LIMIT, 1, 20);
}

function getSixtySecondHackerNewsLimit(env) {
  return clampInteger(env.SIXTY_SECONDS_HACKER_NEWS_LIMIT, DEFAULT_60S_HACKER_NEWS_LIMIT, 1, 30);
}

function getSixtySecondRankType(env) {
  const value = sanitizeLine(env.SIXTY_SECONDS_IT_RANK_TYPE || DEFAULT_60S_IT_RANK_TYPE).toLowerCase();
  return ["day", "week", "month"].includes(value) ? value : DEFAULT_60S_IT_RANK_TYPE;
}

function getSixtySecondApiBase(env) {
  const value = sanitizeLine(env.SIXTY_SECONDS_API_BASE || DEFAULT_60S_API_BASE);
  return value.replace(/\/+$/, "") || DEFAULT_60S_API_BASE;
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
      query: `${base} stars:>=15 created:>=${dateDaysAgo(now, 10)} (agent OR model OR inference)`,
    },
    {
      name: "agent-systems",
      sort: "updated",
      query: `${base} stars:>=40 pushed:>=${dateDaysAgo(now, 7)} (agent OR mcp OR orchestration)`,
    },
    {
      name: "devtools-and-coding",
      sort: "updated",
      query: `${base} stars:>=40 pushed:>=${dateDaysAgo(now, 7)} (codex OR copilot OR coding-agent)`,
    },
    {
      name: "knowledge-and-evaluation",
      sort: "updated",
      query: `${base} stars:>=40 pushed:>=${dateDaysAgo(now, 10)} (rag OR retrieval OR evaluation)`,
    },
    {
      name: "models-multimodal-and-infra",
      sort: "updated",
      query: `${base} stars:>=150 pushed:>=${dateDaysAgo(now, 14)} (inference OR vision OR voice OR embedding)`,
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
  const limit = createConcurrencyLimiter(getSearchPlanConcurrency(env));
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
  const limitedSeeds = seeds.slice(0, getTrendingCandidateLimit(env));
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
    // Pick the first href that is exactly owner/repo (two segments, no extra
    // slash) AND whose owner is not a reserved GitHub path like /sponsors/.
    const hrefRe = /href="\/([^"?#/]+\/[^"?#/]+)"/gi;
    let fullName = "";
    let hrefMatch;
    while ((hrefMatch = hrefRe.exec(block)) !== null) {
      const candidate = decodeHtmlEntities(hrefMatch[1]).trim();
      const owner = candidate.split("/")[0].toLowerCase();
      if (candidate && !GITHUB_RESERVED_OWNERS.has(owner)) {
        fullName = candidate;
        break;
      }
    }
    if (!fullName) {
      continue;
    }

    rank += 1;
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
      // Hotness is useful discovery signal, but it must not dominate repository
      // quality, AI-domain fit and concrete linkage to today's news.
      const momentumContribution = Math.min(50, momentum.score * 0.7);
      const domainContribution = Math.min(10, aiDomainScore * 1.5);
      const finalScore = Number((momentumContribution + (authenticity.score * 1.35) + domainContribution + topic.score).toFixed(2));

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

  if (/\b(mev|arbitrage|crypto(?:currency)?[- ]?trading|trading[- ]?bot|sniper[- ]?bot|front[- ]?running|wallet[- ]?drainer|airdrop[- ]?farm(?:ing)?)\b/i.test(combinedText)) {
    score -= 18;
    flags.push("financial-automation-risk");
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

export function filterRepeatedProjects(ranked, history, now, env, force = false) {
  if (force) {
    return ranked;
  }

  const cooldownDays = getRepeatCooldownDays(env);
  const repeatWindowDays = getRepeatWindowDays(env);
  const breakoutStarDelta = getBreakoutStarDelta(env);
  const breakoutRepeatGapDays = getMinBreakoutRepeatGapDays(env);
  const releaseRepeatGapDays = getMinReleaseRepeatGapDays(env);
  const minResurfaceStarGain = getMinResurfaceStarGain(env);
  const minResurfaceDays = getMinResurfaceDays(env);

  const result = [];
  for (const repo of ranked) {
    const record = history && history.repos ? history.repos[repo.full_name] : null;
    if (!record) {
      result.push(repo);
      continue;
    }

    const dates = Array.isArray(record.sent_dates) ? record.sent_dates : [];
    const recentDates = dates.filter((value) => diffDays(value, now) < repeatWindowDays);
    const daysSinceLastSent = record.last_sent_at ? diffDays(record.last_sent_at, now) : Number.POSITIVE_INFINITY;
    const lastSentStars = Number(record.last_stars || 0);
    const starsSinceLastSend = Math.max(0, repo.stars - lastSentStars);
    const pushedSinceLastSend = hasMeaningfulPushAfter(repo.pushed_at, record.last_sent_at);
    const releasePublishedAt = repo.recent_release && repo.recent_release.published_at
      ? new Date(repo.recent_release.published_at).getTime()
      : 0;
    const lastSentAt = record.last_sent_at ? new Date(record.last_sent_at).getTime() : 0;
    const hasNewRelease = Boolean(repo.has_recent_release && releasePublishedAt > lastSentAt);
    const majorBreakout = daysSinceLastSent >= breakoutRepeatGapDays
      && pushedSinceLastSend
      && Number(repo.star_delta_24h || 0) >= breakoutStarDelta * 2
      && starsSinceLastSend >= breakoutStarDelta * 3;
    const meaningfulResurface = daysSinceLastSent >= Math.max(cooldownDays, minResurfaceDays)
      && starsSinceLastSend >= minResurfaceStarGain
      && (pushedSinceLastSend || hasNewRelease);

    let repeatReason = "";
    if (hasNewRelease && daysSinceLastSent >= releaseRepeatGapDays) {
      repeatReason = "new-release";
    } else if (majorBreakout) {
      repeatReason = "major-breakout";
    } else if (meaningfulResurface) {
      repeatReason = "meaningful-resurface";
    }

    if (!repeatReason) {
      continue;
    }

    result.push({
      ...repo,
      repeat_info: {
        last_sent_at: record.last_sent_at || null,
        days_since_last_sent: Number.isFinite(daysSinceLastSent) ? Number(daysSinceLastSent.toFixed(1)) : null,
        sent_count_window: recentDates.length,
        stars_since_last_send: starsSinceLastSend,
        pushed_since_last_send: pushedSinceLastSend,
        has_new_release: hasNewRelease,
        meaningful_resurface: meaningfulResurface,
        major_breakout: majorBreakout,
        reason: repeatReason,
      },
    });
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
  // Annotate the top candidates by score (no longer only star_delta<=0), so the
  // repos that actually get shown can surface a "released vX today" badge, while
  // still letting a strong release rescue a repo with modest star momentum.
  return (repositories || [])
    .filter((repo) => Number(repo.authenticity_score || 0) >= authenticityThreshold)
    .filter(hasStrongProjectRelevance)
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

export function hasStrongProjectRelevance(repo) {
  const flags = Array.isArray(repo.authenticity_flags) ? repo.authenticity_flags : [];
  if (flags.includes("financial-automation-risk")) {
    return false;
  }
  return Number(repo.ai_domain_score || 0) >= 2
    || Number(repo.topic_relevance_score || 0) >= 4;
}

export function filterDeliverableProjects(repositories, env) {
  const minDelta = getMinDeliverableStarDelta(env);
  const authenticityThreshold = getAuthenticityThreshold(env);
  const lowDeltaQualityFloor = getLowDeltaQualityFloor(env);

  return repositories.filter((repo) => {
    const isRelevant = hasStrongProjectRelevance(repo);
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

export function selectProjectsForDigest(repositories, env) {
  const hardCap = getMaxProjects(env);
  const maxRepeatPercent = getMaxRepeatPercent(env);
  const repeatCap = Math.floor(hardCap * maxRepeatPercent / 100);
  let repeatCount = 0;
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
    if (repo.repeat_info && repeatCount >= repeatCap) {
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
    if (repo.repeat_info) {
      repeatCount += 1;
    }
    bucketCounts[profile.bucket] += 1;
    familyStates.set(profile.family_key, updateFamilySelectionState(profile, familyState));
  }

  const finalRepeatCap = Math.floor(selected.length * maxRepeatPercent / 100);
  let keptRepeats = 0;
  const repeatBalanced = selected.filter((repo) => {
    if (!repo.repeat_info) return true;
    keptRepeats += 1;
    return keptRepeats <= finalRepeatCap;
  });

  return repeatBalanced.map((repo) => {
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
  return inferQualificationFamilyToken(repo);
}

function inferQualificationFamilyToken(repo) {
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  const families = [
    ["coding-agents", /claude code|codex|copilot|cursor|coding[- ]agent|code[- ]agent|developer[- ]agent/],
    ["agent-runtime", /\bmcp\b|multi[- ]agent|agent harness|agentic|orchestrat|autonomous agent|browser agent/],
    ["rag-memory-data", /\brag\b|retrieval|vector database|knowledge base|embedding|agent memory|semantic search/],
    ["evaluation-observability", /\beval(?:uation)?\b|benchmark|observability|tracing|monitoring|guardrail/],
    ["models-inference", /\bllm\b|language model|model serving|inference|transformer|diffusion|quantization/],
    ["multimodal-media", /multimodal|computer vision|image generation|video generation|speech|voice|audio|ocr/],
    ["training-data", /fine[- ]tun|training|dataset|synthetic data|annotation|labeling/],
    ["safety-security", /security|safety|red team|vulnerability|privacy|sandbox/],
    ["ai-applications", /chatbot|assistant|automation|workflow|platform|dashboard/],
    ["research-learning", /awesome|course|tutorial|guide|paper|research|book|documentation/],
  ];
  for (const [family, pattern] of families) {
    if (pattern.test(corpus)) {
      return family;
    }
  }
  return "general";
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

async function mergeNewsContexts(env, juyaContext, aihotContext, officialContext, socialContext, externalSignalsContext) {
  const mergedNewsContext = mergeAihotItemsIntoNewsContext(
    juyaContext,
    aihotContext && Array.isArray(aihotContext.items) ? aihotContext.items : [],
  );
  const imageEnrichedNewsContext = await enrichAihotImagesInNewsContext(env, mergedNewsContext);
  const externalSignals = externalSignalsContext && Array.isArray(externalSignalsContext.items)
    ? externalSignalsContext.items
    : [];
  return {
    ...imageEnrichedNewsContext,
    aihot_fetch_status: aihotContext && aihotContext.status ? aihotContext.status : "empty",
    aihot_error: aihotContext && aihotContext.error ? aihotContext.error : null,
    aihot_feed_url: aihotContext && aihotContext.feed_url ? aihotContext.feed_url : DEFAULT_AIHOT_FEED_URL,
    aihot_feed_item_count: aihotContext && Number.isFinite(aihotContext.feed_item_count)
      ? aihotContext.feed_item_count
      : 0,
    official_status: officialContext && officialContext.status ? officialContext.status : "empty",
    official_updates: officialContext && Array.isArray(officialContext.items) ? officialContext.items : [],
    official_sources: officialContext && Array.isArray(officialContext.sources) ? officialContext.sources : [],
    social_trending: socialContext && Array.isArray(socialContext.items) ? socialContext.items : [],
    social_platforms: socialContext && Array.isArray(socialContext.platforms) ? socialContext.platforms : [],
    social_status: socialContext ? socialContext.status : "disabled",
    external_signals: externalSignals,
    external_signal_status: externalSignalsContext && externalSignalsContext.status ? externalSignalsContext.status : "disabled",
    external_signal_sources: externalSignalsContext && Array.isArray(externalSignalsContext.sources) ? externalSignalsContext.sources : [],
    external_signal_error: externalSignalsContext && externalSignalsContext.error ? externalSignalsContext.error : null,
  };
}

async function fetchAihotUpdates(env, now) {
  const url = buildAihotFeedUrl(env);
  const headers = {
    "user-agent": "ai-github-digest-worker",
    "accept": "application/rss+xml, application/xml, text/xml;q=0.9, application/json;q=0.5, */*;q=0.1",
  };

  try {
    const response = await fetchWithTimeout(url, { headers }, DEFAULT_AIHOT_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`AI HOT fetch failed (${response.status})`);
    }

    const body = await response.text();
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    let rawItems;
    if (contentType.includes("application/json") || body.trim().startsWith("{")) {
      const data = JSON.parse(body);
      rawItems = Array.isArray(data && data.items) ? data.items : [];
    } else {
      rawItems = parseAihotFeedItems(body);
    }
    const items = normalizeAihotItemsForNews(rawItems)
      .slice(0, getAihotItemsTake(env))
      .filter((item) => isRecentEnough(item.published_at, now, DEFAULT_AIHOT_LOOKBACK_HOURS));

    return {
      status: items.length ? "ok" : "empty",
      items,
      feed_url: url,
      feed_item_count: rawItems.length,
    };
  } catch (error) {
    return {
      status: "fetch_failed",
      items: [],
      feed_url: url,
      feed_item_count: 0,
      error: formatError(error),
    };
  }
}

function buildAihotFeedUrl(env) {
  const base = sanitizeLine(env.AIHOT_FEED_URL || env.AIHOT_ITEMS_URL || DEFAULT_AIHOT_FEED_URL);
  const url = new URL(base);
  if (/\/api\/public\/items\/?$/i.test(url.pathname)) {
    if (!url.searchParams.has("mode")) {
      url.searchParams.set("mode", "selected");
    }
    url.searchParams.set("take", String(getAihotItemsTake(env)));
  }
  return url.toString();
}

export function parseAihotFeedItems(xml) {
  const items = [];
  const matches = String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of matches) {
    const block = match[1];
    const title = sanitizeLine(decodeHtmlEntities(stripCdata(extractXmlField(block, "title", true))));
    const permalink = sanitizeLine(decodeHtmlEntities(stripCdata(extractXmlField(block, "link", true))));
    const description = decodeHtmlEntities(stripCdata(extractXmlField(block, "description", true)));
    const contentHtml = normalizeRssHtmlContent(extractXmlField(block, "content:encoded", true));
    const categoryLabel = sanitizeLine(decodeHtmlEntities(stripCdata(extractXmlField(block, "category", true))));
    const category = AIHOT_CATEGORY_KEYS[categoryLabel] || categoryLabel;
    const publishedAt = sanitizeLine(decodeHtmlEntities(stripCdata(extractXmlField(block, "pubDate", true))));
    const guid = sanitizeLine(decodeHtmlEntities(stripCdata(extractXmlField(block, "guid", true))));
    const author = sanitizeLine(decodeHtmlEntities(stripCdata(extractXmlField(block, "author", true))));
    const authorMatch = author.match(/\((.+)\)\s*$/);
    const source = sanitizeLine(authorMatch ? authorMatch[1] : author) || "AI HOT";
    const originalUrl = extractAihotOriginalUrl(description) || permalink;
    const imageUrls = extractAihotPageImageUrls(contentHtml, permalink).slice(0, 1);

    if (!title || !/^https?:\/\//i.test(originalUrl)) {
      continue;
    }

    items.push({
      id: guid || permalink,
      title,
      url: originalUrl,
      permalink,
      source,
      publishedAt,
      summary: stripAihotDescriptionMetadata(description),
      category,
      section: AIHOT_CATEGORY_LABELS[category] || AIHOT_CATEGORY_LABELS[categoryLabel] || categoryLabel,
      score: 0,
      content_html: contentHtml,
      redistributable_content: Boolean(contentHtml),
      image_urls: imageUrls,
    });
  }
  return items;
}

function extractAihotOriginalUrl(description) {
  const match = String(description || "").match(/(?:🔗\s*)?阅读原文\s*[：:]\s*(https?:\/\/[^\s<]+)/i);
  return match ? sanitizeLine(decodeHtmlEntities(match[1]).replace(/[，。；;]+$/u, "")) : "";
}

function stripAihotDescriptionMetadata(description) {
  return sanitizeParagraph(
    String(description || "")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:🔗\s*)?阅读原文\s*[：:]/i.test(line))
      .filter((line) => !/^\s*via\s+AI\s*HOT\b/i.test(line))
      .join("\n"),
  );
}

export function normalizeAihotItemsForNews(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const title = sanitizeLine(item && item.title ? item.title : "");
      const permalink = sanitizeLine(item && (item.permalink || item.aihot_permalink)
        ? (item.permalink || item.aihot_permalink)
        : "");
      const link = sanitizeLine(item && (item.url || item.original_url || item.link)
        ? (item.url || item.original_url || item.link)
        : permalink);
      const source = sanitizeLine(item && item.source ? item.source : "AI HOT");
      const summary = truncateText(sanitizeParagraph(item && (item.summary || item.description)
        ? (item.summary || item.description)
        : ""), DEFAULT_AIHOT_SUMMARY_LIMIT);
      const publishedAt = sanitizeLine(item && (item.publishedAt || item.published_at) ? (item.publishedAt || item.published_at) : "");
      const rawCategory = sanitizeLine(item && item.category ? item.category : "");
      const category = AIHOT_CATEGORY_KEYS[rawCategory] || rawCategory;
      const section = sanitizeLine(item && item.section ? item.section : "")
        || AIHOT_CATEGORY_LABELS[category]
        || "行业动态";
      const score = Number(item && item.score);
      const imageUrls = normalizeAihotImageCandidates([
        item && item.image_url ? item.image_url : "",
        ...(item && Array.isArray(item.image_urls) ? item.image_urls : []),
      ], permalink || link).slice(0, 1);
      const sourceLinks = dedupeNewsSourceLinks([
        ...(item && Array.isArray(item.source_links) ? item.source_links : []),
        { href: link, label: source },
        permalink && permalink !== link ? { href: permalink, label: "AI HOT" } : null,
      ]);

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
        source_links: sourceLinks,
        aihot_permalink: permalink || null,
        aihot_can_enrich_image: Boolean(item && (item.redistributable_content || item.aihot_can_enrich_image)),
        image_url: imageUrls[0] || "",
        image_urls: imageUrls,
        image_layout: imageUrls.length ? "full" : sanitizeLine(item && item.image_layout ? item.image_layout : ""),
      };
    })
    .filter(Boolean);
}

export function mergeAihotItemsIntoNewsContext(juyaContext, aihotItems) {
  const base = juyaContext && typeof juyaContext === "object" ? juyaContext : {};
  const normalizedItems = normalizeAihotItemsForNews(aihotItems);
  const existingFreshNews = base.freshNews || null;
  if (!existingFreshNews) {
    const selectedAdditions = selectDiverseAihotItems(normalizedItems, DEFAULT_AIHOT_CANDIDATE_LIMIT);
    if (!selectedAdditions.length) {
      return {
        ...base,
        aihot_status: normalizedItems.length ? "deduped" : "empty",
        aihot_updates: [],
        aihot_fused_updates: [],
        aihot_inserted_count: 0,
        aihot_fused_count: 0,
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
      aihot_fused_updates: [],
      aihot_inserted_count: selectedAdditions.length,
      aihot_fused_count: 0,
    };
  }

  const mergedEntries = Array.isArray(existingFreshNews.entries)
    ? existingFreshNews.entries.map((entry) => ({ ...entry }))
    : [];
  const additions = [];
  const fusedUpdates = [];
  let issueDuplicateCount = 0;

  normalizedItems.forEach((item) => {
    const existingIndex = findEquivalentNewsEntryIndex(mergedEntries, item);
    if (existingIndex >= 0) {
      mergedEntries[existingIndex] = mergeEquivalentNewsEntries(mergedEntries[existingIndex], item);
      fusedUpdates.push(item);
      return;
    }
    if (existingFreshNews.title && isDuplicateNewsTitle([existingFreshNews.title], item.title)) {
      issueDuplicateCount += 1;
      return;
    }
    const additionIndex = findEquivalentNewsEntryIndex(additions, item);
    if (additionIndex >= 0) {
      additions[additionIndex] = mergeEquivalentNewsEntries(additions[additionIndex], item);
      return;
    }
    additions.push(item);
  });

  const selectedAdditions = selectDiverseAihotItems(additions, DEFAULT_AIHOT_CANDIDATE_LIMIT);
  const integrated = integrateAihotItemsByTopic(mergedEntries, selectedAdditions);
  const hasInserted = integrated.additions.length > 0;
  const hasFused = fusedUpdates.length > 0;
  const status = hasInserted && hasFused
    ? "fused_and_merged"
    : hasInserted
      ? "merged"
      : hasFused
        ? "fused"
        : normalizedItems.length
          ? "deduped"
          : "empty";

  return {
    ...base,
    freshNews: {
      ...existingFreshNews,
      content_text: existingFreshNews.content_text,
      entries: integrated.entries,
    },
    aihot_status: status,
    aihot_updates: integrated.additions,
    aihot_fused_updates: fusedUpdates,
    aihot_inserted_count: integrated.additions.length,
    aihot_fused_count: fusedUpdates.length,
    aihot_issue_duplicate_count: issueDuplicateCount,
  };
}

export function integrateAihotItemsByTopic(existingEntries, additions) {
  const entries = (Array.isArray(existingEntries) ? existingEntries : []).map((entry) => ({ ...entry }));
  const inserted = [];

  (Array.isArray(additions) ? additions : []).forEach((item) => {
    const topic = inferNewsTopic(item);
    let lastTopicIndex = -1;
    entries.forEach((entry, index) => {
      if (inferNewsTopic(entry) === topic) {
        lastTopicIndex = index;
      }
    });

    const alignedItem = {
      ...item,
      source_section: item.source_section || item.section || "",
      section: lastTopicIndex >= 0 && entries[lastTopicIndex].section
        ? entries[lastTopicIndex].section
        : item.section,
      placement_topic: topic,
    };
    const insertionIndex = lastTopicIndex >= 0
      ? lastTopicIndex + 1
      : entries.findIndex((entry) => newsTopicPriority(inferNewsTopic(entry)) > newsTopicPriority(topic));
    const targetIndex = insertionIndex >= 0 ? insertionIndex : entries.length;
    entries.splice(targetIndex, 0, alignedItem);
    inserted.push(alignedItem);
  });

  return { entries, additions: inserted };
}

export function inferNewsTopic(entry) {
  const section = normalizeText(entry && (entry.section || entry.category) ? (entry.section || entry.category) : "");
  const text = normalizeText(`${entry && entry.title ? entry.title : ""} ${entry && entry.summary ? entry.summary : ""}`);
  if (/(要闻|headline)/i.test(section)) return "headline";
  if (/(模型|ai-models|model)/i.test(section)) return "model";
  if (/(开发生态|开源|安全|漏洞|developer|security)/i.test(section)) return "developer";
  if (/(产品|工具|应用|ai-products|product|tool)/i.test(section)) return "product";
  if (/(论文|研究|技术|洞察|观点|技巧|paper|research|tip)/i.test(section)) return "insight";
  if (/(前瞻|传闻|rumor|outlook)/i.test(section)) return "outlook";
  if (/(行业|industry)/i.test(section)) return "industry";
  if (/(开源|安全|漏洞|github|developer)/i.test(text)) return "developer";
  if (/(模型|llm|gpt|claude|gemini|deepseek)/i.test(text)) return "model";
  if (/(产品|工具|应用|agent|智能体)/i.test(text)) return "product";
  if (/(论文|研究|基准|方法|评测)/i.test(text)) return "insight";
  return "industry";
}

function newsTopicPriority(topic) {
  return {
    headline: 0,
    model: 10,
    developer: 20,
    product: 30,
    insight: 40,
    industry: 50,
    outlook: 60,
  }[topic] ?? 60;
}

function findEquivalentNewsEntryIndex(entries, candidate) {
  const candidateUrls = collectNewsEntryUrls(candidate);
  return (Array.isArray(entries) ? entries : []).findIndex((entry) => {
    const entryUrls = collectNewsEntryUrls(entry);
    if (candidateUrls.some((url) => entryUrls.includes(url))) {
      return true;
    }
    return isDuplicateNewsTitle([entry && entry.title ? entry.title : ""], candidate && candidate.title ? candidate.title : "");
  });
}

function collectNewsEntryUrls(entry) {
  return Array.from(new Set([
    entry && entry.link ? entry.link : "",
    entry && entry.aihot_permalink ? entry.aihot_permalink : "",
    ...(entry && Array.isArray(entry.source_links) ? entry.source_links.map((item) => item && item.href) : []),
  ].map(canonicalNewsUrl).filter(Boolean)));
}

function canonicalNewsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/i.test(url.protocol)) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^twitter\.com$/, "x.com");
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const kept = [];
    url.searchParams.forEach((itemValue, key) => {
      if (!/^utm_/i.test(key) && !/^(ref|source|campaign|tracking)$/i.test(key)) {
        kept.push([key, itemValue]);
      }
    });
    kept.sort(([a], [b]) => a.localeCompare(b));
    const query = kept.length ? `?${new URLSearchParams(kept).toString()}` : "";
    return `${host}${pathname}${query}`;
  } catch {
    return "";
  }
}

function mergeEquivalentNewsEntries(primary, supplemental) {
  const primaryImages = normalizeAihotImageCandidates([
    primary && primary.image_url ? primary.image_url : "",
    ...(primary && Array.isArray(primary.image_urls) ? primary.image_urls : []),
  ], primary && primary.link ? primary.link : "");
  const supplementalImages = normalizeAihotImageCandidates([
    supplemental && supplemental.image_url ? supplemental.image_url : "",
    ...(supplemental && Array.isArray(supplemental.image_urls) ? supplemental.image_urls : []),
  ], supplemental && (supplemental.aihot_permalink || supplemental.link)
    ? (supplemental.aihot_permalink || supplemental.link)
    : "");
  const useSupplementalImage = primaryImages.length === 0 && supplementalImages.length > 0;
  const images = useSupplementalImage ? supplementalImages.slice(0, 1) : primaryImages;
  const primarySummary = sanitizeParagraph(primary && primary.summary ? primary.summary : "");
  const supplementalSummary = sanitizeParagraph(supplemental && supplemental.summary ? supplemental.summary : "");
  const useSupplementalSummary = !primarySummary
    || primarySummary === "详见原文"
    || (primarySummary.length < 40 && supplementalSummary.length > primarySummary.length * 1.5);
  const sourceLinks = dedupeNewsSourceLinks([
    primary && primary.link ? {
      href: primary.link,
      label: primary.source || formatSourceLinkLabel(primary.link, "", 0),
    } : null,
    ...(primary && Array.isArray(primary.source_links) ? primary.source_links : []),
    ...(supplemental && Array.isArray(supplemental.source_links) ? supplemental.source_links : []),
  ]);

  return {
    ...primary,
    summary: useSupplementalSummary ? supplementalSummary : primarySummary,
    source: primary.source || supplemental.source || "",
    source_links: sourceLinks,
    image_url: images[0] || "",
    image_urls: images,
    image_layout: useSupplementalImage ? "full" : (primary.image_layout || ""),
    image_from_aihot: Boolean(primary.image_from_aihot || useSupplementalImage),
    aihot_fused: true,
    aihot_permalink: primary.aihot_permalink || supplemental.aihot_permalink || null,
    aihot_can_enrich_image: Boolean(primary.aihot_can_enrich_image || supplemental.aihot_can_enrich_image),
  };
}

function dedupeNewsSourceLinks(items) {
  const links = [];
  (Array.isArray(items) ? items : []).filter(Boolean).forEach((item) => {
    const href = sanitizeLine(item && item.href ? item.href : "");
    if (!/^https?:\/\//i.test(href)) return;
    const key = canonicalNewsUrl(href) || href;
    if (links.some((existing) => existing.key === key)) return;
    links.push({
      key,
      href,
      label: sanitizeLine(item && item.label ? item.label : "") || formatSourceLinkLabel(href, "", links.length),
    });
  });
  return links.map(({ href, label }) => ({ href, label }));
}

export function selectAihotItemsForDigest(items, limit = DEFAULT_AIHOT_CANDIDATE_LIMIT) {
  return selectDiverseAihotItems(items, limit);
}

function selectDiverseAihotItems(items, limit) {
  const candidates = rankAihotCandidates(Array.isArray(items) ? items : []);
  const max = Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_AIHOT_CANDIDATE_LIMIT);
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

async function enrichAihotImagesInNewsContext(env, newsContext) {
  const freshNews = newsContext && newsContext.freshNews ? newsContext.freshNews : null;
  if (!freshNews || !Array.isArray(freshNews.entries)) {
    return {
      ...newsContext,
      aihot_image_enriched_count: 0,
    };
  }

  const entries = freshNews.entries.map((entry) => ({ ...entry }));
  const candidates = entries
    .filter((entry) => entry.aihot_permalink && entry.aihot_can_enrich_image)
    .filter((entry) => !hasNewsEntryImage(entry));
  const imagePairs = await Promise.all(candidates.map(async (entry) => {
    const imageUrl = await fetchAihotContentImage(entry.aihot_permalink);
    return imageUrl ? [entry.aihot_permalink, imageUrl] : null;
  }));
  const imageByPermalink = new Map(imagePairs.filter(Boolean));
  const applyImage = (entry) => {
    const imageUrl = entry && entry.aihot_permalink
      ? imageByPermalink.get(entry.aihot_permalink)
      : "";
    if (!imageUrl || hasNewsEntryImage(entry)) return entry;
    return {
      ...entry,
      image_url: imageUrl,
      image_urls: [imageUrl],
      image_layout: "full",
      image_from_aihot: true,
    };
  };
  const updatedEntries = entries.map(applyImage);
  const updatedAihotItems = Array.isArray(newsContext.aihot_updates)
    ? newsContext.aihot_updates.map(applyImage)
    : [];

  return {
    ...newsContext,
    freshNews: {
      ...freshNews,
      entries: updatedEntries,
    },
    aihot_updates: updatedAihotItems,
    aihot_image_enriched_count: imageByPermalink.size,
    aihot_image_count: updatedEntries
      .filter((entry) => entry.image_from_aihot && hasNewsEntryImage(entry)).length,
  };
}

async function fetchAihotContentImage(permalink) {
  try {
    const response = await fetchWithTimeout(permalink, {
      headers: {
        "user-agent": "ai-github-digest-worker",
        "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    }, DEFAULT_AIHOT_IMAGE_TIMEOUT_MS);
    if (!response.ok) return "";
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("text/html")) return "";
    const html = await response.text();
    return extractAihotPageImageUrls(html, permalink)[0] || "";
  } catch {
    return "";
  }
}

function hasNewsEntryImage(entry) {
  return Boolean(entry && (
    sanitizeLine(entry.image_url || "")
    || (Array.isArray(entry.image_urls) && entry.image_urls.some(Boolean))
  ));
}

export function extractAihotPageImageUrls(html, pageUrl) {
  return normalizeAihotImageCandidates(extractImageUrls(html), pageUrl);
}

function normalizeAihotImageCandidates(values, pageUrl) {
  const images = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeAihotImageUrl(value, pageUrl);
    if (normalized && !images.includes(normalized)) {
      images.push(normalized);
    }
  });
  return images;
}

function normalizeAihotImageUrl(value, pageUrl) {
  const cleaned = decodeHtmlEntities(String(value || ""))
    .replace(/\\u0026(?:amp;)?/gi, "&")
    .trim();
  if (!cleaned || /^data:|^blob:/i.test(cleaned)) return "";

  try {
    let url = new URL(cleaned, pageUrl || DEFAULT_AIHOT_HOME_URL);
    if (/\/api\/img-proxy$/i.test(url.pathname)) {
      if (String(url.searchParams.get("mode") || "").toLowerCase() === "avatar") return "";
      const original = url.searchParams.get("u");
      if (original) {
        url = new URL(original);
      }
    }
    if (!/^https?:$/i.test(url.protocol)) return "";
    if (/(?:\/|_)(?:avatar|profile|favicon)(?:[\/_\-.]|$)|profile_images\/.*_normal\./i.test(url.pathname)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
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

async function fetchSixtySecondSignals(env) {
  const sources = [
    {
      id: "60s-it-rank",
      source: "60s IT News",
      url: buildSixtySecondItRankUrl(env),
      normalizer: normalizeSixtySecondItRankItems,
    },
    {
      id: "60s-hacker-news",
      source: "60s Hacker News",
      url: buildSixtySecondHackerNewsUrl(env),
      normalizer: normalizeSixtySecondHackerNewsItems,
    },
  ];
  const results = await Promise.allSettled(sources.map((source) => fetchSixtySecondSource(env, source)));
  const items = [];
  const statuses = [];

  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === "fulfilled") {
      const sourceItems = Array.isArray(result.value) ? result.value : [];
      items.push(...sourceItems);
      statuses.push({
        id: source.id,
        source: source.source,
        status: "ok",
        count: sourceItems.length,
      });
      return;
    }

    statuses.push({
      id: source.id,
      source: source.source,
      status: "error",
      count: 0,
      error: formatError(result.reason),
    });
  });

  const limit = getSixtySecondSignalLimit(env);
  const selected = rankExternalSignals(dedupeExternalSignals(items)).slice(0, limit);
  const okCount = statuses.filter((item) => item.status === "ok").length;
  return {
    status: selected.length
      ? (okCount === statuses.length ? "ok" : "partial")
      : (okCount > 0 ? "empty" : "fetch_failed"),
    items: selected,
    sources: statuses,
  };
}

async function fetchSixtySecondSource(env, source) {
  const response = await fetchWithTimeout(source.url, {
    headers: {
      "user-agent": "ai-github-digest-worker",
      "accept": "application/json",
    },
  }, getSixtySecondTimeoutMs(env));
  if (!response.ok) {
    throw new Error(`${source.source} fetch failed (${response.status})`);
  }

  const payload = await response.json();
  const data = Array.isArray(payload && payload.data) ? payload.data : [];
  return source.normalizer(data, source);
}

function buildSixtySecondItRankUrl(env) {
  const url = new URL(`${getSixtySecondApiBase(env)}/it-news/rank`);
  url.searchParams.set("type", getSixtySecondRankType(env));
  return url.toString();
}

function buildSixtySecondHackerNewsUrl(env) {
  const url = new URL(`${getSixtySecondApiBase(env)}/hacker-news/top`);
  url.searchParams.set("limit", String(getSixtySecondHackerNewsLimit(env)));
  return url.toString();
}

export function normalizeSixtySecondSignalItems(items, source = {}) {
  return source.id === "60s-hacker-news"
    ? normalizeSixtySecondHackerNewsItems(items, source)
    : normalizeSixtySecondItRankItems(items, source);
}

function normalizeSixtySecondItRankItems(items, source) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const title = sanitizeLine(item && item.title ? item.title : "");
      const link = sanitizeLine(item && item.link ? item.link : "");
      if (!title || !/^https?:\/\//i.test(link)) {
        return null;
      }
      return {
        title,
        link,
        source: source.source || "60s IT News",
        source_group: "60s",
        kind: "it_rank",
        rank: index + 1,
        score: Math.max(0, 100 - index),
      };
    })
    .filter(Boolean)
    .filter(isRelevantExternalSignal);
}

function normalizeSixtySecondHackerNewsItems(items, source) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const title = sanitizeLine(item && item.title ? item.title : "");
      const rawLink = sanitizeLine(item && item.link ? item.link : "");
      const id = sanitizeLine(item && item.id ? item.id : "");
      const link = rawLink || (id ? `https://news.ycombinator.com/item?id=${id}` : "");
      const score = Number(item && item.score);
      if (!title || !/^https?:\/\//i.test(link)) {
        return null;
      }
      return {
        title,
        link,
        source: source.source || "60s Hacker News",
        source_group: "60s",
        kind: "hacker_news",
        rank: index + 1,
        score: Number.isFinite(score) ? score : Math.max(0, 100 - index),
        author: sanitizeLine(item && item.author ? item.author : ""),
        published_at: normalizeExternalTimestamp(item && (item.created_at || item.created)),
      };
    })
    .filter(Boolean)
    .filter(isRelevantExternalSignal);
}

function isRelevantExternalSignal(item) {
  const text = normalizeText(`${item && item.title ? item.title : ""} ${item && item.source ? item.source : ""}`);
  if (!text) {
    return false;
  }
  return EXTERNAL_SIGNAL_KEYWORDS.some((keyword) => matchesExternalSignalKeyword(text, keyword));
}

function dedupeExternalSignals(items) {
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

function rankExternalSignals(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      item,
      index,
      score: scoreExternalSignal(item, index),
    }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(({ item }) => item);
}

function scoreExternalSignal(item, index) {
  const text = normalizeText(`${item && item.title ? item.title : ""} ${item && item.source ? item.source : ""}`);
  let score = Math.max(0, 100 - index);
  if ([...new Set([...AI_DOMAIN_TERMS, ...SOCIAL_AI_KEYWORDS])].some((kw) => matchesExternalSignalKeyword(text, kw))) {
    score += 80;
  }
  if (/(github|openai|anthropic|claude|deepseek|kimi|glm|qwen|agent|mcp|llm|模型|智能体|开源|漏洞|开发者|编程|代码)/i.test(text)) {
    score += 30;
  }
  if ((item && item.kind) === "hacker_news") {
    score += 15;
  }
  if (Number.isFinite(Number(item && item.score))) {
    score += Math.min(40, Number(item.score) / 25);
  }
  return score;
}

function matchesExternalSignalKeyword(normalizedText, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return false;
  }
  if (/^[a-z0-9.+#-]+$/.test(normalizedKeyword) && normalizedKeyword.length <= 3) {
    return new Set(normalizedText.split(/[^a-z0-9.+#-]+/).filter(Boolean)).has(normalizedKeyword);
  }
  return normalizedText.includes(normalizedKeyword);
}

function normalizeExternalTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value > 1000000000000 ? value : value * 1000).toISOString();
  }
  const text = sanitizeLine(value || "");
  if (!text) {
    return null;
  }
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T")).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
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
      purpose: "social_translation",
      modelOverride: env.SOCIAL_TRANSLATION_MODEL || env.DEEPSEEK_MODEL || DEEPSEEK_V4_FLASH_MODEL,
      reasoningEffort: DEEPSEEK_EFFORT_HIGH,
      thinkingEnabled: false,
      maxAttempts: 1,
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
    const response = await fetchWithRetry(url, {
      headers: { "user-agent": NEWSNOW_UA },
    }, DEFAULT_SOCIAL_TIMEOUT_MS, { retries: 2, backoffMs: 700 });
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
    const response = await fetchWithRetry(HACKER_NEWS_FRONT_PAGE_URL, {
      headers: {
        "user-agent": NEWSNOW_UA,
        "accept": "application/json",
      },
    }, DEFAULT_SOCIAL_TIMEOUT_MS, { retries: 2, backoffMs: 500 });
    const data = await response.json();
    const hits = Array.isArray(data && data.hits) ? data.hits : [];
    const items = hits
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
    if (items.length) {
      return items;
    }
    throw new Error("empty algolia result");
  } catch (error) {
    console.warn(`fetchHackerNewsFeed algolia failed: ${formatError(error)}`);
  }
  try {
    return await fetchHackerNewsViaFirebase();
  } catch (error) {
    console.warn(`fetchHackerNewsFeed firebase fallback failed: ${formatError(error)}`);
    return [];
  }
}

async function fetchHackerNewsViaFirebase() {
  const topResponse = await fetchWithRetry(HACKER_NEWS_FIREBASE_TOP_URL, {
    headers: {
      "user-agent": NEWSNOW_UA,
      "accept": "application/json",
    },
  }, DEFAULT_SOCIAL_TIMEOUT_MS, { retries: 1, backoffMs: 500 });
  const ids = await topResponse.json();
  const topIds = Array.isArray(ids) ? ids.slice(0, 16) : [];
  const stories = await Promise.allSettled(topIds.map((id) =>
    fetchWithRetry(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
      headers: {
        "user-agent": NEWSNOW_UA,
        "accept": "application/json",
      },
    }, DEFAULT_SOCIAL_TIMEOUT_MS, { retries: 1, backoffMs: 400 }).then((response) => response.json())));
  const items = [];
  stories.forEach((result) => {
    if (result.status !== "fulfilled" || !result.value) {
      return;
    }
    const story = result.value;
    const title = sanitizeLine(story.title || "");
    if (!title) {
      return;
    }
    const points = Number(story.score);
    items.push({
      title,
      url: sanitizeLine(story.url || `https://news.ycombinator.com/item?id=${story.id}`),
      platform: "hacker-news",
      platform_label: "Hacker News",
      meta: Number.isFinite(points) ? `${points} points` : "",
      score: Number.isFinite(points) ? points : 0,
    });
  });
  return items;
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
  const urls = Array.isArray(feed.urls) ? feed.urls : [feed.url].filter(Boolean);
  for (const url of urls) {
    try {
      const response = await fetchWithRetry(url, {
        headers: {
          "user-agent": NEWSNOW_UA,
          "accept": "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        },
      }, DEFAULT_REDDIT_TIMEOUT_MS, { retries: 1, backoffMs: 2500 });
      const xml = await response.text();
      const items = parseAtomFeedItems(xml)
        .map((item) => ({
          title: sanitizeLine(item.title || ""),
          url: sanitizeLine(item.link || ""),
          platform: feed.id,
          platform_label: feed.label,
          meta: feed.label,
          published_at: item.published_at || null,
        }))
        .filter((item) => item.title);
      if (items.length) {
        return items;
      }
    } catch (error) {
      console.warn(`fetchRedditAtomFeed(${feed.id}) ${url} failed: ${formatError(error)}`);
    }
  }
  return [];
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
  if (repo.repeat_info && repo.repeat_info.reason === "new-release") {
    context.push(`这是复推项目，本次因新版本 ${repo.recent_release && repo.recent_release.name ? repo.recent_release.name : "发布"} 入选，摘要应突出新增变化`);
  } else if (repo.repeat_info && repo.repeat_info.reason === "major-breakout") {
    context.push("这是复推项目，本次因重大二次增长入选，摘要应解释新的增长或使用信号");
  } else if (repo.repeat_info) {
    context.push("这是长期后重新入选的项目，摘要应突出近期实质更新而非重复基础介绍");
  }
  if (Array.isArray(repo.topic_matches) && repo.topic_matches.length) {
    context.push(`与今日新闻主题相关：${repo.topic_matches.join("、")}`);
  }
  if (repo.authenticity_score < 10) {
    context.push("真实性或合规性信号偏弱");
  }

  return context;
}

export function buildNewsSignals(newsContext) {
  const article = newsContext && (newsContext.freshNews || newsContext.latest);
  const entryItems = article && Array.isArray(article.entries) ? article.entries : [];
  const primaryEntries = entryItems
    .filter((item) => !isSecondaryNewsEntry(item))
    .slice(0, DEFAULT_PRIMARY_NEWS_RENDER_LIMIT);
  const embeddedAihotEntries = entryItems
    .filter(isSecondaryNewsEntry)
    .slice(0, DEFAULT_SECONDARY_NEWS_RENDER_LIMIT);
  const fallbackAihotEntries = newsContext && Array.isArray(newsContext.aihot_updates)
    ? newsContext.aihot_updates.slice(0, DEFAULT_SECONDARY_NEWS_RENDER_LIMIT)
    : [];
  const aihotEntries = embeddedAihotEntries.length ? embeddedAihotEntries : fallbackAihotEntries;
  const officialUpdates = newsContext && Array.isArray(newsContext.official_updates)
    ? newsContext.official_updates.slice(0, DEFAULT_OFFICIAL_UPDATE_LIMIT)
    : [];

  // The email can display a broad integrated feed, but project matching only
  // uses a compact editorial subset. Low-context social/60s headlines are kept
  // out of this pool so a single incidental keyword cannot rescue an unrelated
  // repository.
  const summaryParts = [
    article ? `${article.title || ""} ${article.description || ""}` : "",
    ...primaryEntries.map((item) => `${item.title || ""} ${item.summary || ""}`),
    ...aihotEntries.map((item) => `${item.title || ""} ${item.summary || ""}`),
    ...officialUpdates.map((item) => `${item.title || ""} ${item.summary || ""}`),
  ].filter(Boolean);
  if (!summaryParts.length) {
    return null;
  }

  const summaryText = normalizeText(summaryParts.join(" "));
  return {
    normalized: summaryText,
    tokens: new Set(tokenizeMeaningful(summaryText)),
    phrases: Array.from(new Set(extractNewsPhrases(summaryText))),
    source_counts: {
      primary: primaryEntries.length,
      aihot: aihotEntries.length,
      official: officialUpdates.length,
    },
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
  // Overview and project summaries are independent. Running them together cuts
  // wall-clock latency without increasing request count.
  const [overview, projectDigest] = await Promise.all([
    summarizeDigestOverview(env, payload),
    summarizeProjectDigests(env, payload),
  ]);

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
      purpose: "digest_overview",
      modelOverride: getDigestOverviewModel(env),
      reasoningEffort: getDigestOverviewReasoningEffort(env),
      thinkingEnabled: isTruthy(env.DIGEST_OVERVIEW_THINKING),
      maxAttempts: 2,
      maxTokens: 12000,
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
        `Treat every news.entries item as one source-neutral candidate set. Select 8-${DEFAULT_PRIMARY_NEWS_RENDER_LIMIT + DEFAULT_SECONDARY_NEWS_RENDER_LIMIT} items when enough worthwhile news exists, with at most ${DEFAULT_PRIMARY_NEWS_RENDER_LIMIT} non-AIHOT items and at most ${DEFAULT_SECONDARY_NEWS_RENDER_LIMIT} source_group=AIHOT items.`,
        "Choose by factual importance, source authority, novelty, recency, practical impact, and relevance to today's overall story.",
        "Prefer high-signal product, model, research, security, developer-platform, and open-source items regardless of source; skip semantically repetitive facts, tutorial-only posts, promotional claims, and low-context social snippets.",
        "Order items_cn by descending editorial value. Source grouping and image-first presentation are applied deterministically after selection.",
        "For each selected news item, copy its entry_id exactly, keep the supplied factual title, and write a one-sentence summary_cn plus a tag from the taxonomy when possible. Never output an item that is absent from news.entries.",
        "bridge_cn must be grounded in today's integrated news entries and selected repositories, and should explicitly explain the shared theme in one sentence.",
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
        '        "entry_id": string copied exactly from news.entries,',
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
      batchResults = batch.map((repo) => buildFallbackProjectSummary(repo, `project-batch-error: ${batchError}`));
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
      purpose: "project_summary",
      modelOverride: getProjectSummaryModel(env),
    reasoningEffort: getProjectSummaryReasoningEffort(env),
    thinkingEnabled: isTruthy(env.PROJECT_SUMMARY_THINKING),
    maxAttempts: 1,
    maxTokens: 5000,
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
      "Each positioning_cn must help a reader quickly understand what the repository is.",
      "Write natural prose, not a labeled template. Do not use section labels such as 定位、价值、看点、注意、今日信号.",
      "Use a compact paragraph of 1-2 natural Chinese sentences. Explain the concrete project shape, capability and likely use when useful, but vary the information order and sentence rhythm across projects.",
      "Do not force every item into a category-capability-use-case template, and do not repeatedly use scaffolding such as 面向、核心是、适合评估、值得关注 or 可用于 at the same sentence positions.",
      "Prefer concrete actions, components or workflows grounded in the description and README over abstract category labels.",
      "Mention freshness, star_delta_24h, release, forks, or topic match only when it helps explain why a reader should open the project.",
      "When selection_context says a project is repeated, foreground what changed since its prior appearance instead of repeating a generic introduction.",
      "Do not simply translate, lightly paraphrase, or restate the GitHub description/README.",
      "Do not write generic phrases like 当前公开信息显示, 重点提供, 围绕某主题, 值得关注, or 快速上升 unless tied to a concrete value.",
      "Do not put adoption caveats inside positioning_cn unless they are needed to understand the project. Put concrete risk only in risk_cn.",
      `positioning_cn should usually stay under ${PROJECT_POSITIONING_CHAR_LIMIT} Chinese characters.`,
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
  const attempts = buildDeepSeekAttempts(requestedModel, options.maxAttempts);
  const deadlineAtMs = getProcessingDeadlineMs(env);
  const errors = [];

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    try {
      const timeoutMs = getDeepSeekAttemptTimeout(env, deadlineAtMs);
      return await executeDeepSeekAttempt(env, options, attempt, timeoutMs);
    } catch (error) {
      errors.push(`${attempt.label}: ${formatError(error)}`);
      console.warn(`DeepSeek attempt failed (${attempt.label}): ${formatError(error)}`);
      if (i < attempts.length - 1) {
        try {
          getDeepSeekAttemptTimeout(env, deadlineAtMs);
        } catch {
          break;
        }
        await sleep(800 * (i + 1) + Math.floor(Math.random() * 300));
      }
    }
  }

  throw new Error(`DeepSeek retries exhausted: ${errors.join(" | ")}`);
}

function getDigestOverviewModel(env) {
  return String(env.DIGEST_OVERVIEW_MODEL || DEEPSEEK_V4_FLASH_MODEL);
}

function getProjectSummaryModel(env) {
  return String(env.PROJECT_SUMMARY_MODEL || DEEPSEEK_V4_FLASH_MODEL);
}

function getDigestOverviewReasoningEffort(env) {
  return normalizeReasoningEffort(
    env.DIGEST_OVERVIEW_REASONING_EFFORT || env.DEEPSEEK_REASONING_EFFORT,
    DEEPSEEK_EFFORT_HIGH,
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
      entry_id: sanitizeLine(item && item.entry_id ? item.entry_id : ""),
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

export function compactNewsForOverview(news) {
  if (!news) {
    return null;
  }

  return {
    issue_title: news.issue_title,
    link: news.link,
    published_at: news.published_at || null,
    content_excerpt: sanitizeParagraph(news.content_excerpt || ""),
    entries: Array.isArray(news.entries)
      ? news.entries.map((entry, index) => ({
          entry_id: buildNewsEntryId(index),
          title: sanitizeLine(entry && entry.title ? entry.title : ""),
          summary: sanitizeParagraph(entry && entry.summary ? entry.summary : ""),
          section: sanitizeLine(entry && entry.section ? entry.section : ""),
          source: sanitizeLine(entry && entry.source ? entry.source : ""),
          link: sanitizeLine(entry && entry.link ? entry.link : ""),
          published_at: entry && entry.published_at ? entry.published_at : null,
          source_group: sanitizeLine(entry && entry.source_group ? entry.source_group : ""),
          has_image: hasNewsEntryImage(entry),
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

function buildNewsEntryId(index) {
  return `news-${String(index + 1).padStart(3, "0")}`;
}

export function selectUnifiedNewsEntries(entries) {
  const allEntries = Array.isArray(entries) ? entries : [];
  const selectedAihot = new Set(
    rankAihotCandidates(allEntries.filter(isSecondaryNewsEntry))
      .slice(0, DEFAULT_SECONDARY_NEWS_RENDER_LIMIT),
  );
  const selected = [];
  let primaryCount = 0;
  let aihotCount = 0;
  allEntries.forEach((entry) => {
    if (isSecondaryNewsEntry(entry)) {
      if (!selectedAihot.has(entry) || aihotCount >= DEFAULT_SECONDARY_NEWS_RENDER_LIMIT) return;
      aihotCount += 1;
    } else {
      if (primaryCount >= DEFAULT_PRIMARY_NEWS_RENDER_LIMIT) return;
      primaryCount += 1;
    }
    selected.push(entry);
  });
  return selected;
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
  const positioning = isChineseProjectCopy(rawPositioning) ? normalizeProjectPositioningCopy(rawPositioning) : "";
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
  const sourceDetail = extractPrimaryProjectSignal(repo);
  const opening = sourceDetail && isChineseProjectCopy(sourceDetail)
    ? `${sourceDetail.replace(/[。；;\s]+$/, "")}。`
    : buildFallbackArchetypeSentence(repo);
  return normalizeProjectPositioningCopy(`${opening}${buildFallbackEvidenceSentence(repo)}`);
}

function inferFallbackProjectArchetype(repo) {
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  if (/video|image|multimodal|audio|voice|speech|vision|animation/.test(corpus)) return "multimodal";
  if (/\brag\b|retrieval|search|knowledge|ontology|vector|embedding|memory/.test(corpus)) return "knowledge";
  if (/evaluation|\beval\b|benchmark|observability|tracing|monitoring|experiment tracking/.test(corpus)) return "evaluation";
  if (/coding[- ]agent|code[- ]agent|codex|claude code|copilot|cursor|developer[- ]agent|code review/.test(corpus)) return "coding";
  if (/agent|harness|workflow|orchestration|multi[- ]agent|\bmcp\b/.test(corpus)) return "agent";
  if (/\bllm\b|language model|inference|model serving|training|fine[- ]tun|quantization|transformer/.test(corpus)) return "model";
  if (/design|frontend|react|component|\bui\b|web app/.test(corpus)) return "frontend";
  if (/awesome|guide|book|course|docs|tutorial|learning|paper/.test(corpus)) return "learning";
  return "general";
}

function buildFallbackArchetypeSentence(repo) {
  const name = sanitizeLine(repo.name || String(repo.full_name || "").split("/")[1] || "这个项目");
  const stack = inferProjectStack(repo);
  const stackSuffix = stack ? `，主要语言为 ${stack}` : "";
  switch (inferFallbackProjectArchetype(repo)) {
    case "multimodal":
      return `${name} 围绕视频、图像或音频的生成与处理工作流展开${stackSuffix}。`;
    case "knowledge":
      return `${name} 帮助 AI 应用组织检索、记忆或知识上下文，让外部信息更容易被模型调用${stackSuffix}。`;
    case "evaluation":
      return `${name} 关注模型或智能体的追踪、评测与运行观测${stackSuffix}。`;
    case "coding":
      return `${name} 把编码智能体能力落到代码任务、命令行协作或开发流程自动化上${stackSuffix}。`;
    case "agent":
      return `${name} 处理智能体的工具接入、任务执行或多智能体协作${stackSuffix}。`;
    case "model":
      return `${name} 聚焦模型训练、推理或部署链路${stackSuffix}。`;
    case "frontend":
      return `${name} 服务于界面生成、组件开发或设计到代码流程${stackSuffix}。`;
    case "learning":
      return `${name} 汇集相关资料、示例或学习路径，便于快速建立主题索引。`;
    default: {
      const projectType = inferProjectType(repo);
      const stackLabel = stack ? `${stack} ` : "";
      return `${name} 是近期保持活跃的${stackLabel}${projectType}，具体能力以仓库示例和文档为准。`;
    }
  }
}

function buildFallbackEvidenceSentence(repo) {
  const releaseName = repo.recent_release && sanitizeLine(repo.recent_release.name || "");
  if (repo.repeat_info && repo.repeat_info.reason === "new-release") {
    return releaseName
      ? `这次重新入选是因为发布了 ${releaseName}，可直接查看 release note 中的变化。`
      : "这次重新入选来自新的正式版本，可优先查看 release note。";
  }

  const facts = [];
  if (Number.isFinite(Number(repo.age_days)) && Number(repo.age_days) <= 14) {
    facts.push(`项目创建约 ${Math.max(1, Math.round(Number(repo.age_days)))} 天`);
  }
  if (Number(repo.star_delta_24h || 0) >= 20) {
    facts.push(`过去 24 小时新增 ${repo.star_delta_24h} 星`);
  }
  if (Number.isFinite(Number(repo.hours_since_push)) && Number(repo.hours_since_push) <= 24) {
    facts.push("近期仍有代码更新");
  }
  if (repo.has_recent_release && releaseName) {
    facts.push(`刚发布 ${releaseName}`);
  }

  if (facts.length >= 2) {
    return `${facts.slice(0, 3).join("，")}。`;
  }
  if (facts.length === 1) {
    return `${facts[0]}，是否适合实际接入还需结合示例和近期 issue 判断。`;
  }
  return "现有公开信息有限，建议先查看 README、示例和近期 issue。";
}

function buildFallbackUseCase(repo) {
  switch (inferFallbackProjectArchetype(repo)) {
    case "multimodal": return "可重点查看它如何接入生成式媒体生产流程。";
    case "knowledge": return "可重点查看检索质量、数据接入和上下文组织方式。";
    case "evaluation": return "可重点查看评测指标、追踪粒度和生产环境接入方式。";
    case "coding": return "可重点查看代码任务覆盖范围和现有开发工具的集成方式。";
    case "agent": return "可重点查看任务编排、工具调用和上下文交接的实现。";
    case "model": return "可重点查看模型支持范围、资源需求和部署路径。";
    case "frontend": return "可重点查看组件质量和设计到代码的实际工作流。";
    case "learning": return "可以作为资料索引或学习路径入口。";
    default: return "功能边界仍应以仓库 README、示例和近期维护记录为准。";
  }
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
  const strongCorpus = normalizeText([
    repo.full_name,
    repo.description,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  const corpus = normalizeText([
    repo.full_name,
    repo.description,
    repo.readme_excerpt,
    Array.isArray(repo.topics) ? repo.topics.join(" ") : "",
  ].join(" "));
  if (/(cms|app|platform|dashboard)/i.test(strongCorpus)) {
    return "应用型项目";
  }
  if (/(cli|command line|terminal)/i.test(strongCorpus)) {
    return "命令行工具";
  }
  if (/(plugin|extension|integration)/i.test(strongCorpus)) {
    return "插件型工具";
  }
  if (/(sdk|framework|library|package|toolkit)/i.test(strongCorpus)) {
    return "开发框架";
  }
  if (/(book|guide|tutorial|course|learn|docs|documentation|manual)/i.test(strongCorpus)) {
    return "资料型项目";
  }
  if (/(awesome|collection|curated|design md|design-md|examples|template)/i.test(strongCorpus)) {
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
  if (/book|guide|tutorial|docs/.test(strongDesignCorpus)) {
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
    ? normalizeProjectPositioningCopy(aiPositioning)
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

function normalizeProjectPositioningCopy(text) {
  let output = sanitizeParagraph(text)
    .replace(/(?:^|[。；\s])定位[:：]\s*/g, "")
    .replace(/[。；\s]价值[:：]\s*/g, "。")
    .replace(/[。；\s]看点[:：]\s*/g, "。")
    .replace(/[。；\s]注意[:：]\s*/g, "。")
    .replace(/[。；\s]今日信号[:：]\s*[^。！？；]*(?:[。！？；]|$)/g, "。")
    .replace(/。{2,}/g, "。")
    .replace(/\s+/g, " ")
    .trim();

  output = output.replace(/^(这是一个|该项目是一个)/, "");
  const sentences = output.match(/[^。！？]+[。！？]?/g) || [];
  if (sentences.length > 2) {
    output = sentences.slice(0, 2).join("").trim();
  }
  return truncateText(output, PROJECT_POSITIONING_CHAR_LIMIT);
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
  const newsItems = input.news && input.news.freshNews ? collectRenderableNewsItems(aiNews, input.news.freshNews) : [];
  const headline = (newsItems[0] && sanitizeLine(newsItems[0].title)) || "";

  lines.push(`${input.reportDate} GitHub + AI 日报`);
  lines.push("");
  if (headline) {
    lines.push("今日头条");
    lines.push(headline);
    lines.push("");
  }

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
      if (copy.risk) {
        lines.push(`⚠️ ${copy.risk}`);
        lines.push("");
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
      headline,
      newsItems,
      rawNewsEntries: input.news && input.news.freshNews && Array.isArray(input.news.freshNews.entries)
        ? input.news.freshNews.entries
        : [],
      aiByRepo,
      deliverability,
    }),
    deliverability,
    newsItems,
  };
}

async function waitUntilUtcSendTime(env) {
  const value = String(env.DIGEST_SEND_AT_UTC || "").trim();
  if (!value) {
    return;
  }
  const match = /^(?:([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid DIGEST_SEND_AT_UTC value: ${value}; expected HH:mm or HH:mm:ss`);
  }

  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(Number(match[1]), Number(match[2]), Number(match[3] || "0"), 0);
  if (target <= now) {
    return;
  }

  const waitMs = target.getTime() - now.getTime();
  console.log(`Digest generated; waiting until ${target.toISOString()} to send email (${Math.round(waitMs / 1000)}s)`);
  await sleep(waitMs);
}

async function sendEmail(env, subject, textBody, htmlBody) {
  await waitUntilUtcSendTime(env);
  const recipients = String(env.EMAIL_TO).split(",").map((s) => s.trim()).filter(Boolean);
  const startedAt = new Date();
  const accepted = [];
  const failed = [];
  const attempts = [];
  for (const to of recipients) {
    const attemptedAt = new Date();
    try {
      const message = {
        to,
        from: env.EMAIL_FROM,
        subject,
        text: textBody,
        html: htmlBody,
      };
      await env.EMAIL_OUT.send(message);
      accepted.push(to);
      const acceptedAt = new Date();
      attempts.push({
        to,
        status: "accepted",
        attempted_at: attemptedAt.toISOString(),
        accepted_at: acceptedAt.toISOString(),
        duration_ms: acceptedAt.getTime() - attemptedAt.getTime(),
      });
      console.log(`Email Service accepted message for ${to} at ${acceptedAt.toISOString()}`);
    } catch (err) {
      const error = formatError(err);
      const failedAt = new Date();
      console.error(`Email Service rejected message for ${to} at ${failedAt.toISOString()}: ${error}`);
      attempts.push({
        to,
        status: "failed",
        attempted_at: attemptedAt.toISOString(),
        failed_at: failedAt.toISOString(),
        duration_ms: failedAt.getTime() - attemptedAt.getTime(),
        error,
      });
      failed.push({ to, error });
    }
  }
  if (failed.length === recipients.length) {
    throw new Error(`All email recipients failed: ${failed.map((item) => `${item.to}: ${item.error}`).join(", ")}`);
  }
  const finishedAt = new Date();
  const result = {
    status: failed.length ? "partial_acceptance" : "accepted",
    accepted_count: accepted.length,
    failed_count: failed.length,
    accepted_recipients: accepted,
    failed_recipients: failed,
    attempts,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    checked_at: finishedAt.toISOString(),
    note: "accepted means Email Service accepted the message; final delivery must be checked in Cloudflare Email Service analytics",
  };
  console.log(`Email Service acceptance summary at ${result.checked_at}: status=${result.status}, accepted=${accepted.length}, failed=${failed.length}`);
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
    renderDigestHeader({
      reportDate: input.reportDate,
      newsCount: newsItems.length,
      projectCount: input.repositories.length,
    }),
    `<section style="${sectionStyle()}">`,
    `<div style="${sectionTitleStyle()}">📰 今日 AI 动态</div>`,
    newsHtml,
    input.news && input.news.freshNews && input.news.freshNews.link
      ? `<div style="margin-top:14px;"><a href="${escapeAttribute(input.news.freshNews.link)}" style="${buttonStyle("#111827", "#ffffff")}">查看新闻源</a></div>`
      : "",
    "</section>",
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

export function renderDigestHeader({ reportDate, newsCount = 0, projectCount = 0 }) {
  const normalizedNewsCount = Math.max(0, Math.trunc(Number(newsCount) || 0));
  const normalizedProjectCount = Math.max(0, Math.trunc(Number(projectCount) || 0));
  const summary = [
    sanitizeLine(reportDate),
    `${normalizedNewsCount} 条 AI 动态`,
    `${normalizedProjectCount} 个热门项目`,
  ].filter(Boolean).join(" · ");

  return [
    `<div style="${heroStyle()}">`,
    `<h1 style="${titleStyle()}">GitHub + AI 日报</h1>`,
    `<div style="${metaStyle()}">${escapeHtml(summary)}</div>`,
    "</div>",
  ].join("");
}

export function renderNewsCard(item) {
  const imageHtml = renderNewsImages(item);
  const sourceLabel = getPrimarySourceLabel(item);
  const primaryLink = item.link || (Array.isArray(item.source_links) && item.source_links[0] ? item.source_links[0].href : "");
  const bodyHtml = [
    renderNewsTagBadge(item.tag || "行业动态"),
    `<div style="${cardTitleStyle()}">${escapeHtml(item.title)}</div>`,
    `<div style="${paragraphStyle()}">${escapeHtml(item.summary_cn || "详见原文")}</div>`,
    `<div style="margin-top:12px;">${primaryLink ? `<a href="${escapeAttribute(primaryLink)}" style="${buttonStyle("#111827", "#ffffff")}">查看条目</a>` : ""}<span style="${sourceBadgeStyle()}">来源：${escapeHtml(sourceLabel)}</span></div>`,
  ].join("");

  return [
    `<div style="${cardStyle({ padding: item.image_url ? "0 0 16px 0" : "18px" })}">`,
    imageHtml,
    `<div style="${item.image_url ? "padding:16px 18px 0 18px;" : ""}">`,
    bodyHtml,
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
  const cards = [];
  const seen = [];
  const selectedItems = Array.isArray(aiItems) && aiItems.length
    ? aiItems
    : selectRenderableRawEntries(rawEntries || []).map((entry) => ({
        title: sanitizeLine(entry && entry.title ? entry.title : ""),
        summary_cn: truncateText(sanitizeParagraph(entry && entry.summary ? entry.summary : "") || "详见原文", 180),
        tag: entry && entry.section ? entry.section : "行业动态",
        link: entry && entry.link ? entry.link : "",
        image_url: entry && entry.image_url ? entry.image_url : "",
        image_urls: entry && Array.isArray(entry.image_urls) ? entry.image_urls : [],
        source_links: entry && Array.isArray(entry.source_links) ? entry.source_links : [],
        source: entry && entry.source ? entry.source : "",
        is_secondary: isSecondaryNewsEntry(entry),
        image_layout: entry && entry.image_layout ? entry.image_layout : "",
      }));

  selectedItems.forEach((item) => {
    const title = sanitizeLine(item && item.title ? item.title : "");
    if (!title || isDuplicateNewsTitle(seen, title)) {
      return;
    }
    seen.push(title);
    cards.push(renderNewsCard({ ...item, title }));
  });

  if (!cards.length) {
    return `<div style="${cardStyle()}"><div style="${mutedTextStyle()}">今日没有可展示的 AI 新闻卡片。</div></div>`;
  }

  return cards.join("");
}

function selectRenderableRawEntries(entries) {
  return selectUnifiedNewsEntries(entries);
}

function renderNewsImages(item) {
  const imageLimit = item.image_layout === "full" || item.image_layout === "compact" ? 1 : 6;
  const images = Array.from(new Set(
    [
      item.image_url || "",
      ...(Array.isArray(item.image_urls) ? item.image_urls : []),
    ].filter(Boolean),
  )).slice(0, imageLimit);

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
  // Square GitHub owner avatar as a light top-right accent — text-forward layout
  // (the summary/meta carry the information; the icon is just a visual anchor).
  const owner = sanitizeLine(String(repo.full_name || "").split("/")[0]);
  const avatar = `https://github.com/${encodeURIComponent(owner)}.png?size=120`;
  const releaseBadge = repo.has_recent_release
    ? ` <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:800;white-space:nowrap;">🎉 ${escapeHtml(truncateText(sanitizeLine((repo.recent_release && repo.recent_release.name) || "今日发布"), 28))}</span>`
    : "";
  // Lightweight emoji actions instead of a heavy button: ⭐ opens the repo (one
  // tap to star there — GitHub has no link-based star for CSRF reasons), 🔗 opens
  // the star-history growth chart, which fits a "what's trending" digest.
  const starHistoryUrl = `https://star-history.com/#${repo.full_name}&Date`;

  return [
    `<div style="${cardStyle({ padding: "16px 18px" })}">`,
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>`,
    `<td valign="top" style="padding-right:12px;">`,
    `<div style="${cardTitleStyle()}">${index + 1}. ${escapeHtml(repo.full_name)}</div>`,
    `<div style="${metaRowStyle()}">${escapeHtml(renderLanguageLabel(repo.language))} <span style="margin-left:10px;">⭐ ${escapeHtml(formatCompactNumber(repo.stars))}</span> <span style="margin-left:10px;">📈 +${escapeHtml(String(repo.star_delta_24h))}</span>${releaseBadge}</div>`,
    `</td>`,
    `<td width="52" valign="top" align="right"><a href="${escapeAttribute(repo.html_url)}" style="display:block;text-decoration:none;"><img src="${escapeAttribute(avatar)}" alt="${escapeAttribute(owner)}" width="48" height="48" style="display:block;border-radius:12px;background:#0d1117;border:0;" /></a></td>`,
    `</tr></table>`,
    `<div style="${paragraphStyle()}">${escapeHtml(copy.positioning)}</div>`,
    fallbackNote,
    riskHtml,
    `<div style="margin-top:12px;font-size:13px;font-weight:700;"><a href="${escapeAttribute(repo.html_url)}" style="text-decoration:none;color:#6b7280;margin-right:16px;">⭐ Star</a><a href="${escapeAttribute(starHistoryUrl)}" style="text-decoration:none;color:#6b7280;">🔗 Star 趋势</a></div>`,
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
      last_release_name: repo.recent_release && repo.recent_release.name ? repo.recent_release.name : "",
      last_release_published_at: repo.recent_release && repo.recent_release.published_at ? repo.recent_release.published_at : null,
      last_family: inferQualificationFamilyToken(repo),
      last_repeat_reason: repo.repeat_info && repo.repeat_info.reason ? repo.repeat_info.reason : null,
    };
  });

  // Prune repos with no in-window sent_dates that also haven't been sent in a
  // long time, so delivery-history doesn't grow unbounded by unique repo count.
  // sent_dates are already capped at `cutoffDays`, so repeat suppression (which
  // can only look back that far) loses nothing; a long-dormant repo is treated
  // as fresh again, which is the desired behavior anyway.
  const pruneCutoffDays = Math.max(cutoffDays * 2, 60);
  for (const [name, record] of Object.entries(next.repos)) {
    const recordDates = Array.isArray(record && record.sent_dates) ? record.sent_dates : [];
    const hasRecent = recordDates.some((value) => diffDays(value, now) < cutoffDays);
    const lastSentDays = record && record.last_sent_at ? diffDays(record.last_sent_at, now) : Number.POSITIVE_INFINITY;
    if (!hasRecent && lastSentDays >= pruneCutoffDays) {
      delete next.repos[name];
    }
  }

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
    repeat_info: repo.repeat_info || null,
    recommendation_family: inferQualificationFamilyToken(repo),
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
    aihot_feed_url: newsContext.aihot_feed_url || DEFAULT_AIHOT_FEED_URL,
    aihot_feed_item_count: Number(newsContext.aihot_feed_item_count || 0),
    aihot_inserted_count: Number(newsContext.aihot_inserted_count || 0),
    aihot_fused_count: Number(newsContext.aihot_fused_count || 0),
    aihot_image_count: Number(newsContext.aihot_image_count || 0),
    aihot_image_enriched_count: Number(newsContext.aihot_image_enriched_count || 0),
    aihot_updates: Array.isArray(newsContext.aihot_updates)
      ? newsContext.aihot_updates.map((item) => ({
          source: item.source,
          title: item.title,
          link: item.link,
          section: item.section || "",
          placement_topic: item.placement_topic || "",
          has_image: hasNewsEntryImage(item),
          published_at: item.published_at || null,
        }))
      : [],
    aihot_placements: newsContext.freshNews && Array.isArray(newsContext.freshNews.entries)
      ? newsContext.freshNews.entries
          .map((item, index) => ({ item, position: index + 1 }))
          .filter(({ item }) => item && item.aihot_permalink)
          .map(({ item, position }) => ({
            position,
            title: item.title,
            section: item.section || "",
            fused: Boolean(item.aihot_fused),
            has_image: hasNewsEntryImage(item),
          }))
      : [],
    external_signal_status: newsContext.external_signal_status || "disabled",
    external_signal_sources: Array.isArray(newsContext.external_signal_sources)
      ? newsContext.external_signal_sources.map((item) => ({
          id: item.id,
          source: item.source,
          status: item.status,
          count: item.count,
          error: item.error || null,
        }))
      : [],
    external_signals: Array.isArray(newsContext.external_signals)
      ? newsContext.external_signals.map((item) => ({
          source: item.source,
          title: item.title,
          link: item.link,
          kind: item.kind || "",
          score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
          published_at: item.published_at || null,
        }))
      : [],
  };
}

function toStoredNewsSelection(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    position: index + 1,
    entry_id: item.entry_id || "",
    title: item.title || "",
    summary: item.summary_cn || "",
    link: item.link || "",
    source: item.source || "",
    source_group: item.source_group || "",
    topic: item.placement_topic || "",
    tag: item.tag || "",
    has_image: hasNewsEntryImage(item),
    image_url: item.image_url || "",
  }));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

// fetchWithTimeout + exponential backoff retry. Throws on non-2xx or timeout
// so transient 403/500/network blips (HN, Reddit, social aggregators) get a
// few attempts before a source is dropped from the digest.
async function fetchWithRetry(url, options = {}, timeoutMs = DEFAULT_SOCIAL_TIMEOUT_MS, retryOptions = {}) {
  const retries = Number.isFinite(retryOptions.retries) ? retryOptions.retries : 2;
  const backoffMs = Number.isFinite(retryOptions.backoffMs) ? retryOptions.backoffMs : 600;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(backoffMs * (attempt + 1) + Math.floor(Math.random() * 250));
      }
    }
  }
  throw lastError || new Error(`fetch failed: ${url}`);
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

export function parseDeepSeekJson(content) {
  const raw = String(content || "").trim();
  if (!raw) {
    throw new Error("Empty model output");
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const candidates = Array.from(new Set([
    candidate,
    start >= 0 && end > start ? candidate.slice(start, end + 1) : "",
  ].filter(Boolean)));
  let lastError = null;

  for (const source of candidates) {
    try {
      return JSON.parse(source);
    } catch (error) {
      lastError = error;
    }

    const repaired = repairCommonModelJson(source);
    if (repaired !== source) {
      try {
        const parsed = JSON.parse(repaired);
        console.warn("DeepSeek JSON had a missing or trailing comma; repaired locally without another API call.");
        return parsed;
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError || new Error("No JSON object found in model output");
}

function repairCommonModelJson(source) {
  const text = String(source || "");
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < text.length && /\s/.test(text[nextIndex])) {
      nextIndex += 1;
    }
    const next = text[nextIndex] || "";

    if (char === "," && (next === "}" || next === "]")) {
      continue;
    }

    output += char;
    if ((char === "}" || char === "]") && (next === "{" || next === "[" || next === '"')) {
      output += ",";
    }
  }

  return output;
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

function buildDeepSeekAttempts(requestedModel, maxAttempts) {
  const normalized = String(requestedModel || DEEPSEEK_V4_FLASH_MODEL);
  let attempts;
  if (normalized !== DEEPSEEK_V4_FLASH_MODEL) {
    attempts = [
      { model: normalized, useResponseFormat: true, label: `${normalized}/json#1` },
      { model: DEEPSEEK_V4_FLASH_MODEL, useResponseFormat: true, label: `${DEEPSEEK_V4_FLASH_MODEL}/json#fallback` },
    ];
  } else {
    attempts = [
      { model: normalized, useResponseFormat: true, label: `${normalized}/json#1` },
      { model: normalized, useResponseFormat: true, label: `${normalized}/json#2` },
    ];
  }

  const requestedLimit = Number(maxAttempts);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(attempts.length, Math.trunc(requestedLimit)))
    : attempts.length;
  return attempts.slice(0, limit);
}

async function executeDeepSeekAttempt(env, options, attempt, timeoutMs) {
  const thinkingEnabled = options.thinkingEnabled !== false
    && getDeepSeekThinkingMode(env) === DEEPSEEK_THINKING_ENABLED;
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
    body.thinking = { type: "disabled" };
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
    timeoutMs,
  );

  if (!response.ok) {
    const errorText = await safeText(response);
    throw new Error(`DeepSeek failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  logDeepSeekUsage(data, options.purpose, attempt.model);
  const content = extractDeepSeekContent(data);
  if (!content) {
    throw new Error("DeepSeek returned an empty response.");
  }
  return parseDeepSeekJson(content);
}

function logDeepSeekUsage(data, purpose, model) {
  const usage = data && data.usage;
  if (!usage || typeof usage !== "object") {
    return;
  }

  const tokenFields = [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "prompt_cache_hit_tokens",
    "prompt_cache_miss_tokens",
  ];
  const metrics = tokenFields
    .filter((field) => Number.isFinite(Number(usage[field])))
    .map((field) => `${field}=${Math.max(0, Math.trunc(Number(usage[field])))}`);
  const reasoningTokens = Number(usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens);
  if (Number.isFinite(reasoningTokens)) {
    metrics.push(`reasoning_tokens=${Math.max(0, Math.trunc(reasoningTokens))}`);
  }
  if (!metrics.length) {
    return;
  }

  const safePurpose = sanitizeLine(purpose || "unspecified").replace(/\s+/g, "_");
  const safeModel = sanitizeLine(model || "unknown").replace(/\s+/g, "_");
  console.log(`DeepSeek usage: purpose=${safePurpose} model=${safeModel} ${metrics.join(" ")}`);
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

export function collectRenderableNewsItems(aiNews, freshNews) {
  const items = [];
  const seenTitles = [];
  const rawEntries = freshNews && Array.isArray(freshNews.entries) ? freshNews.entries : [];
  const descriptors = rawEntries.map((entry, index) => ({
    entry,
    entry_id: buildNewsEntryId(index),
  }));
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.entry_id, descriptor]));
  let primaryCount = 0;
  let aihotCount = 0;

  const appendEntry = (descriptor, modelItem = null) => {
    if (!descriptor || !descriptor.entry || items.length >= DEFAULT_PRIMARY_NEWS_RENDER_LIMIT + DEFAULT_SECONDARY_NEWS_RENDER_LIMIT) {
      return false;
    }
    const entry = descriptor.entry;
    const title = sanitizeLine(entry.title || "");
    if (!title || isDuplicateNewsTitle(seenTitles, title)) {
      return false;
    }
    const secondary = isSecondaryNewsEntry(entry);
    if (secondary) {
      if (aihotCount >= DEFAULT_SECONDARY_NEWS_RENDER_LIMIT) return false;
    } else if (primaryCount >= DEFAULT_PRIMARY_NEWS_RENDER_LIMIT) {
      return false;
    }

    const modelSummary = sanitizeParagraph(modelItem && modelItem.summary_cn ? modelItem.summary_cn : "");
    const modelTag = validateNewsTag(modelItem && modelItem.tag ? modelItem.tag : "");
    const rawSummary = sanitizeParagraph(entry.summary || "");
    seenTitles.push(title);
    if (secondary) aihotCount += 1;
    else primaryCount += 1;
    items.push({
      entry_id: descriptor.entry_id,
      title,
      summary_cn: truncateText(modelSummary || rawSummary || "详见原文", 180),
      tag: modelItem && modelItem.tag ? modelTag : (entry.section || "行业动态"),
      link: entry.link || "",
      image_url: entry.image_url || "",
      image_urls: Array.isArray(entry.image_urls) ? entry.image_urls : [],
      source_links: Array.isArray(entry.source_links) ? entry.source_links : [],
      source: entry.source || "",
      source_group: entry.source_group || "",
      is_secondary: secondary,
      image_layout: entry.image_layout || "",
      placement_topic: entry.placement_topic || inferNewsTopic(entry),
    });
    return true;
  };

  const aiItems = aiNews && Array.isArray(aiNews.items_cn) ? aiNews.items_cn : [];
  aiItems.forEach((item) => {
    const requestedId = sanitizeLine(item && item.entry_id ? item.entry_id : "");
    const title = sanitizeLine(item && item.title ? item.title : "");
    let descriptor = requestedId ? descriptorById.get(requestedId) : null;
    if (!requestedId && title) {
      const matchedRaw = findMatchingRawEntry(rawEntries, title);
      const matchedIndex = matchedRaw ? rawEntries.indexOf(matchedRaw) : -1;
      descriptor = matchedIndex >= 0 ? descriptors[matchedIndex] : null;
    }
    appendEntry(descriptor, item);
  });

  const fallbackEntries = selectRenderableRawEntries(rawEntries);
  const minimumItemCount = Math.min(8, fallbackEntries.length);
  if (items.length < minimumItemCount) {
    fallbackEntries.forEach((entry) => {
      if (items.length >= minimumItemCount) return;
      const rawIndex = rawEntries.indexOf(entry);
      if (rawIndex >= 0) appendEntry(descriptors[rawIndex]);
    });
  }

  return orderRenderableNewsItemsBySourceAndPriority(items);
}

export function orderRenderableNewsItemsBySourceAndPriority(items) {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item, editorialRank) => {
    const sourceGroup = isSecondaryNewsEntry(item) ? "AIHOT" : "JUYA";
    if (!groups.has(sourceGroup)) groups.set(sourceGroup, []);
    groups.get(sourceGroup).push({
      item,
      editorialRank,
      hasImage: hasNewsEntryImage(item),
    });
  });

  const comparePriority = (a, b) => {
    if (a.hasImage !== b.hasImage) return a.hasImage ? -1 : 1;
    return a.editorialRank - b.editorialRank;
  };
  const orderedGroups = Array.from(groups.values())
    .map((group) => group.sort(comparePriority))
    .sort((a, b) => comparePriority(a[0], b[0]));
  return orderedGroups.flat().map(({ item }) => item);
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
    padding: `${SPACING.micro} 0 ${SPACING.micro} ${SPACING.xl}`,
    borderLeft: `4px solid ${COLORS.brandAccent}`,
    color: COLORS.textDark,
  });
}

function titleStyle() {
  return createCssProps({
    margin: 0,
    fontSize: "24px",
    lineHeight: LINE_HEIGHTS.title,
    fontWeight: FONT_WEIGHTS.extrabold,
    letterSpacing: 0,
  });
}

function metaStyle() {
  return createCssProps({
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    lineHeight: LINE_HEIGHTS.normal,
    color: COLORS.textMuted,
    letterSpacing: 0,
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

function charBigramSet(text) {
  const value = String(text || "");
  const set = new Set();
  if (value.length <= 1) {
    if (value) set.add(value);
    return set;
  }
  for (let index = 0; index < value.length - 1; index += 1) {
    set.add(value.slice(index, index + 2));
  }
  return set;
}

function setIntersectionSize(setA, setB) {
  let intersection = 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  small.forEach((value) => {
    if (large.has(value)) {
      intersection += 1;
    }
  });
  return intersection;
}

// Overlap coefficient = |A∩B| / min(|A|,|B|). More forgiving than Jaccard for
// paraphrases of different length (common when juya and AI HOT retell the same
// story), where the shorter headline is largely contained in the longer one.
function overlapCoefficient(setA, setB) {
  if (!setA.size || !setB.size) {
    return 0;
  }
  return setIntersectionSize(setA, setB) / Math.min(setA.size, setB.size);
}

// Distinctive Latin/number runs (entity & version signals: openai, codex,
// deepseek, grok, 4.5, v4 ...). Matched by regex over the raw title so an
// entity glued to CJK without a space ("VibeThinker推理") is still extracted.
function extractNewsEntities(title) {
  const matches = sanitizeLine(title).toLowerCase().match(/[a-z0-9][a-z0-9.+#]*/g) || [];
  return new Set(matches.filter((token) => token.length >= 2 && !isWeakTopicToken(token)));
}

// Char bigrams of the CJK-only content. Measures how much of the Chinese
// narrative two headlines share, independent of entity-name characters (which
// would otherwise inflate similarity for short titles that merely name the
// same company).
function cjkBigramSet(title) {
  const cjk = sanitizeLine(title).replace(/[^㐀-鿿]/g, "");
  return charBigramSet(cjk);
}

// Catches the same story told with different wording across the primary (juya)
// and secondary (AI HOT) sources — which plain canonical-key/substring matching
// misses. Conservative thresholds: prefer a rare duplicate over dropping a
// genuinely distinct headline.
function isLikelySameNewsStory(titleA, titleB) {
  const keyA = canonicalNewsKey(titleA);
  const keyB = canonicalNewsKey(titleB);
  if (!keyA || !keyB) {
    return false;
  }
  if (keyA === keyB) {
    return true;
  }
  // Too short to score reliably — defer to the substring matcher only.
  if (keyA.length < 8 || keyB.length < 8) {
    return false;
  }
  const overlap = overlapCoefficient(cjkBigramSet(titleA), cjkBigramSet(titleB));
  const sharedEntities = setIntersectionSize(extractNewsEntities(titleA), extractNewsEntities(titleB));

  // Tiered: more shared distinctive entities (named actors, versions) lowers the
  // Chinese-narrative-overlap bar, since two specific entities co-occurring on
  // the same day rarely belong to different stories. No shared entity needs
  // strong character overlap (a near-verbatim paraphrase). Tuned to favor
  // precision — dropping a distinct headline is worse than an occasional dup.
  if (sharedEntities >= 2 && overlap >= 0.22) {
    return true;
  }
  if (sharedEntities >= 1 && overlap >= 0.30) {
    return true;
  }
  if (overlap >= 0.55) {
    return true;
  }
  return false;
}

function isDuplicateNewsTitle(existingTitles, candidateTitle) {
  if (hasEquivalentNewsTitle(existingTitles, candidateTitle)) {
    return true;
  }
  return (Array.isArray(existingTitles) ? existingTitles : []).some(
    (title) => isLikelySameNewsStory(title, candidateTitle),
  );
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
  const escapedTag = escapeRegExp(tagName);
  const openTag = `<${escapedTag}\\b[^>]*>`;
  const closeTag = `<\\/${escapedTag}>`;
  const cdataRe = new RegExp(`${openTag}\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*${closeTag}`, "i");
  const plainRe = new RegExp(`${openTag}([\\s\\S]*?)${closeTag}`, "i");

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
