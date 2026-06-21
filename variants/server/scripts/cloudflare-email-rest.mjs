const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const MAX_EMAIL_PAYLOAD_BYTES = 5 * 1024 * 1024;

export function createCloudflareEmailClient(env, logger) {
  return {
    async send(message) {
      const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID;
      const apiToken = env.CLOUDFLARE_EMAIL_API_TOKEN || env.CF_EMAIL_API_TOKEN;
      if (!accountId) {
        throw new Error("Missing CLOUDFLARE_ACCOUNT_ID for Email Service REST send");
      }
      if (!apiToken) {
        throw new Error("Missing CLOUDFLARE_EMAIL_API_TOKEN for Email Service REST send");
      }

      const payload = normalizeEmailPayload(message);
      const body = JSON.stringify(payload);
      if (Buffer.byteLength(body, "utf8") > MAX_EMAIL_PAYLOAD_BYTES) {
        throw new Error("Email payload exceeds Cloudflare Email Service 5 MiB limit");
      }

      logger?.event("info", "email_rest_request", {
        to: payload.to,
        from: payload.from,
        subject: payload.subject,
      });

      const response = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${accountId}/email/sending/send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body,
      });
      const responseText = await response.text();
      const parsed = parseJson(responseText);

      if (!response.ok || parsed?.success === false) {
        const messageText = Array.isArray(parsed?.errors) && parsed.errors.length
          ? parsed.errors.map((item) => item.message || item.code || JSON.stringify(item)).join("; ")
          : responseText;
        throw new Error(`Cloudflare Email REST send failed (${response.status}): ${messageText}`);
      }

      logger?.event("info", "email_rest_response", {
        to: payload.to,
        status: response.status,
        message_id: parsed?.result?.message_id || parsed?.result?.messageId || null,
      });
      return parsed?.result || parsed;
    },
  };
}

function normalizeEmailPayload(message) {
  if (!message || typeof message !== "object") {
    throw new Error("Email message must be an object");
  }
  const to = normalizeAddress(message.to);
  const from = normalizeAddress(message.from);
  if (!to) {
    throw new Error("Email message missing to");
  }
  if (!from) {
    throw new Error("Email message missing from");
  }
  if (!message.subject) {
    throw new Error("Email message missing subject");
  }
  return {
    to,
    from,
    subject: String(message.subject),
    html: String(message.html || ""),
    text: String(message.text || ""),
  };
}

function normalizeAddress(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object" && value.email) {
    return String(value.email).trim();
  }
  return "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
