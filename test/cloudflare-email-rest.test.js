import test from "node:test";
import assert from "node:assert/strict";

import { createCloudflareEmailClient } from "../scripts/cloudflare-email-rest.mjs";

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

test("retries one transient Cloudflare 5xx and succeeds", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const events = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return calls.length === 1
      ? response(500, { success: false, errors: [{ message: "internal" }] })
      : response(200, { success: true, result: { message_id: "retry-ok" } });
  };

  try {
    const result = await createCloudflareEmailClient(
      { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_EMAIL_API_TOKEN: "token" },
      { event: (level, name, data) => events.push({ level, name, data }) },
    ).send({ to: "user@example.com", from: "digest@example.com", subject: "Test", text: "Body" });

    assert.equal(result.message_id, "retry-ok");
    assert.equal(calls.length, 2);
    assert.equal(events.filter((item) => item.name === "email_rest_retry").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a non-transient 4xx response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response(400, { success: false, errors: [{ message: "invalid" }] });
  };

  try {
    await assert.rejects(
      () => createCloudflareEmailClient(
        { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_EMAIL_API_TOKEN: "token" },
      ).send({ to: "user@example.com", from: "digest@example.com", subject: "Test", text: "Body" }),
      /Cloudflare Email REST send failed \(400\): invalid/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
