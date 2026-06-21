#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";

import { resolveRuntimeEnv, runDigest } from "../../../index.js";
import { createCloudflareEmailClient } from "./cloudflare-email-rest.mjs";
import { FileKV } from "./file-kv.mjs";

const VARIANT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROOT = resolve(VARIANT_ROOT, "../..");

async function main() {
  await loadEnvFile(resolve(APP_ROOT, "..", ".env"));
  await loadEnvFile(resolve(APP_ROOT, ".env"));

  const args = parseArgs(process.argv.slice(2));
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid --now value: ${args.now}`);
  }

  const dryRun = Boolean(args.dryRun || !args.send);
  const logDir = resolvePath(process.env.DIGEST_LOG_DIR, resolve(APP_ROOT, "logs"));
  const stateFile = resolvePath(process.env.DIGEST_STATE_FILE, resolve(APP_ROOT, "data", "state.json"));
  const logger = createRunLogger(logDir, now);
  patchConsole(logger);

  logger.event("info", "run_start", {
    trigger: args.scheduled ? "scheduled" : "manual",
    dry_run: dryRun,
    force: Boolean(args.force),
    quick_run: Boolean(args.quick),
    daily_simulation_run: Boolean(args.dailySim),
    state_file: stateFile,
    max_projects: process.env.MAX_PROJECTS || null,
    github_search_pages: process.env.GITHUB_SEARCH_PAGES || null,
    trending_candidate_limit: process.env.TRENDING_CANDIDATE_LIMIT || null,
    low_delta_quality_floor: process.env.LOW_DELTA_QUALITY_FLOOR || null,
  });

  const state = await FileKV.open(stateFile);
  const runOptions = {
    trigger: args.scheduled ? "scheduled" : "manual",
    now,
    force: Boolean(args.force),
    dryRun,
    quickRun: Boolean(args.quick),
    dailySimulationRun: Boolean(args.dailySim),
    testTo: args.testTo || "",
  };
  const env = resolveRuntimeEnv({
    ...process.env,
    STATE: state,
    EMAIL_OUT: createCloudflareEmailClient(process.env, logger),
  }, runOptions);

  let result;
  try {
    result = await runDigest(env, runOptions);
    logger.event(result.ok ? "info" : "error", "run_finish", summarizeResult(result));
  } catch (error) {
    logger.event("error", "run_throw", { error: formatError(error) });
    throw error;
  } finally {
    restoreConsole();
  }

  writeLatestRun(logDir, {
    run_id: logger.runId,
    checked_at: new Date().toISOString(),
    result,
  });

  if (!result || result.ok === false) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const parsed = {
    send: false,
    dryRun: false,
    force: false,
    quick: false,
    dailySim: false,
    scheduled: false,
    testTo: "",
    now: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--send") parsed.send = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--quick") parsed.quick = true;
    else if (arg === "--daily-sim") parsed.dailySim = true;
    else if (arg === "--scheduled") parsed.scheduled = true;
    else if (arg === "--test-to") parsed.testTo = argv[++index] || "";
    else if (arg.startsWith("--test-to=")) parsed.testTo = arg.slice("--test-to=".length);
    else if (arg === "--now") parsed.now = argv[++index] || "";
    else if (arg.startsWith("--now=")) parsed.now = arg.slice("--now=".length);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.send && parsed.dryRun) {
    throw new Error("--send and --dry-run cannot be used together");
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node variants/net2-server/scripts/run-node.mjs [options]

Options:
  --send              Actually send email. Without this flag the runner is a dry run.
  --dry-run           Generate the digest without sending email.
  --scheduled         Mark the trigger as scheduled.
  --force             Skip the daily sent marker and repeat cooldown checks.
  --quick             Use quick-run model overrides.
  --daily-sim         Use daily simulation overrides.
  --test-to <email>   Override EMAIL_TO for this run.
  --now <iso>         Use a fixed timestamp for testing.
`);
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const text = await readFile(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals <= 0) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolvePath(value, fallback) {
  return value ? resolve(value) : fallback;
}

function createRunLogger(logDir, now) {
  mkdirSync(logDir, { recursive: true });
  const runId = `${formatDate(now)}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
  const filePath = resolve(logDir, `digest-${formatDate(now)}.jsonl`);
  const event = (level, name, data = {}) => {
    appendFileSync(filePath, `${JSON.stringify({
      ts: new Date().toISOString(),
      run_id: runId,
      level,
      event: name,
      ...data,
    })}\n`, "utf8");
  };
  return { runId, filePath, event };
}

let originalConsole = null;

function patchConsole(logger) {
  originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args) => {
    originalConsole.log(...args);
    logger.event("info", "console", { message: formatArgs(args) });
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    logger.event("warn", "console", { message: formatArgs(args) });
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    logger.event("error", "console", { message: formatArgs(args) });
  };
}

function restoreConsole() {
  if (!originalConsole) {
    return;
  }
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  originalConsole = null;
}

function writeLatestRun(logDir, payload) {
  mkdirSync(logDir, { recursive: true });
  writeFileSync(resolve(logDir, "latest-run.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function summarizeResult(result) {
  if (!result || typeof result !== "object") {
    return { result };
  }
  const repositories = Array.isArray(result.repositories) ? result.repositories : [];
  return {
    ok: result.ok,
    skipped: Boolean(result.skipped),
    reason: result.reason || null,
    report_date: result.reportDate || result.report_date || null,
    repository_count: repositories.length || result.repositories_count || result.repository_count || 0,
    news_count: result.news_count || 0,
    email_acceptance_status: result.email_acceptance_status || null,
    email_delivery: result.email_delivery || null,
    phase_timings_ms: result.phase_timings_ms || null,
    generated_at: result.generated_at || null,
  };
}

function formatArgs(args) {
  return args.map((item) => typeof item === "string" ? item : inspect(item, { depth: 4, breakLength: 140 })).join(" ");
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message || error.toString();
  }
  return String(error);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

main().catch((error) => {
  restoreConsole();
  console.error(formatError(error));
  process.exitCode = 1;
});
