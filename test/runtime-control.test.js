import test from "node:test";
import assert from "node:assert/strict";

import worker from "../index.js";
import { persistSuccessfulDeliveryState } from "../state.js";

class FakeKV {
  constructor(options = {}) {
    this.failPutKeys = new Set(options.failPutKeys || []);
    this.records = new Map(Object.entries(options.records || {}));
    this.puts = [];
    this.deletes = [];
  }

  async get(key) {
    const value = this.records.get(key);
    return value === undefined ? null : JSON.stringify(value);
  }

  async put(key, value, options) {
    if (this.failPutKeys.has(key)) {
      throw new Error(`put failed for ${key}`);
    }
    this.puts.push({ key, value: JSON.parse(value), options });
  }

  async delete(key) {
    this.deletes.push(key);
  }
}

test("queues manual digest jobs with normalized payloads", async () => {
  const sent = [];
  const env = {
    RUN_SECRET: "secret-value",
    DIGEST_QUEUE: {
      async send(payload) {
        sent.push(payload);
      },
    },
  };
  const request = new Request("https://digest.example.com/run?force=1&quick=1", {
    headers: { "x-run-secret": "secret-value" },
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.queued, true);
  assert.equal(sent.length, 1);
  assert.equal(Number.isNaN(Date.parse(sent[0].now)), false);
  assert.deepEqual({ ...sent[0], now: "<iso>" }, {
    version: 1,
    trigger: "manual",
    now: "<iso>",
    force: true,
    dryRun: false,
    quickRun: true,
    dailySimulationRun: false,
    testTo: "",
  });
});

test("queues manual digest jobs with an explicitly allowed test recipient", async () => {
  const sent = [];
  const env = {
    RUN_SECRET: "secret-value",
    ALLOW_TEST_RECIPIENT_OVERRIDE: "true",
    DIGEST_QUEUE: {
      async send(payload) {
        sent.push(payload);
      },
    },
  };
  const request = new Request("https://digest.example.com/run?force=1&test_to=test-recipient%40example.com", {
    headers: { "x-run-secret": "secret-value" },
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.test_to, "test-recipient@example.com");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].testTo, "test-recipient@example.com");
});

test("rejects test recipient overrides unless explicitly enabled", async () => {
  const request = new Request("https://digest.example.com/run?test_to=test-recipient%40example.com", {
    headers: { "x-run-secret": "secret-value" },
  });

  const response = await worker.fetch(request, { RUN_SECRET: "secret-value" });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "test_to is not allowed");
});

test("authorizes with temporary test secret only via header", async () => {
  const sent = [];
  const env = {
    RUN_SECRET: "regular-secret",
    TEST_RUN_SECRET: "temporary-secret",
    ALLOW_TEST_RECIPIENT_OVERRIDE: "true",
    DIGEST_QUEUE: {
      async send(payload) {
        sent.push(payload);
      },
    },
  };
  const headerRequest = new Request("https://digest.example.com/run?test_to=test-recipient%40example.com", {
    headers: { "x-run-secret": "temporary-secret" },
  });
  const queryRequest = new Request("https://digest.example.com/run?secret=temporary-secret&test_to=test-recipient%40example.com");

  const headerResponse = await worker.fetch(headerRequest, env);
  assert.equal(headerResponse.status, 202);
  assert.equal(sent[0].testTo, "test-recipient@example.com");

  const queryResponse = await worker.fetch(queryRequest, env);
  assert.equal(queryResponse.status, 401);
});

test("returns the last test delivery result separately", async () => {
  const state = new FakeKV({
    records: {
      "digest:last-test": {
        ok: true,
        test_recipient: "test-recipient@example.com",
        email_acceptance_status: "accepted",
      },
    },
  });
  const request = new Request("https://digest.example.com/last-test", {
    headers: { "x-run-secret": "secret-value" },
  });

  const response = await worker.fetch(request, {
    RUN_SECRET: "secret-value",
    STATE: state,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.last_test.test_recipient, "test-recipient@example.com");
  assert.equal(body.last_test.email_acceptance_status, "accepted");
});

test("authorizes run endpoints with header first and gates query secrets", async () => {
  const env = { RUN_SECRET: "secret-value" };
  const state = new FakeKV({ records: { "digest:last": { ok: true } } });
  const headerRequest = new Request("https://digest.example.com/last", {
    headers: { "x-run-secret": "secret-value" },
  });
  const queryRequest = new Request("https://digest.example.com/last?secret=secret-value");

  const headerResponse = await worker.fetch(headerRequest, { ...env, STATE: state });
  assert.equal(headerResponse.status, 200);
  assert.deepEqual(await headerResponse.json(), { ok: true, last: { ok: true } });

  const disabledQueryResponse = await worker.fetch(queryRequest, { ...env, STATE: state });
  assert.equal(disabledQueryResponse.status, 401);

  const enabledQueryResponse = await worker.fetch(queryRequest, {
    ...env,
    ALLOW_QUERY_RUN_SECRET: "true",
    STATE: state,
  });
  assert.equal(enabledQueryResponse.status, 200);
});

test("rejects direct runs unless the direct-run flag is enabled", async () => {
  const request = new Request("https://digest.example.com/run?direct=1", {
    headers: { "x-run-secret": "secret-value" },
  });
  const response = await worker.fetch(request, { RUN_SECRET: "secret-value" });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "Direct runs are disabled");
});

test("persists successful delivery state with a sent marker TTL", async () => {
  const kv = new FakeKV();
  const warnings = await persistSuccessfulDeliveryState(kv, {
    runMarkerKey: "digest:sent:2026-05-23",
    marker: { reportDate: "2026-05-23", subject: "AI 早报" },
    observedSnapshot: { repositories: ["observed"] },
    snapshot: { repositories: ["delivered"] },
    history: { deliveries: [] },
  });

  assert.deepEqual(warnings, []);
  assert.deepEqual(
    kv.puts.map((entry) => entry.key),
    [
      "digest:sent:2026-05-23",
      "state:last-observed-snapshot",
      "state:last-snapshot",
      "state:delivery-history",
    ],
  );
  assert.equal(kv.puts[0].options.expirationTtl, 60 * 60 * 24 * 8);
});

test("reports state persistence warnings without throwing", async () => {
  const kv = new FakeKV({ failPutKeys: ["state:last-snapshot"] });
  const warnings = await persistSuccessfulDeliveryState(kv, {
    runMarkerKey: "digest:sent:2026-05-23",
    marker: { reportDate: "2026-05-23" },
    observedSnapshot: {},
    snapshot: {},
    history: {},
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /state:last-snapshot: put failed/);
  assert.deepEqual(
    kv.puts.map((entry) => entry.key),
    [
      "digest:sent:2026-05-23",
      "state:last-observed-snapshot",
      "state:delivery-history",
    ],
  );
});
