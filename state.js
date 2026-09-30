export const SNAPSHOT_KEY = "state:last-snapshot";
export const OBSERVED_SNAPSHOT_KEY = "state:last-observed-snapshot";
export const DELIVERY_HISTORY_KEY = "state:delivery-history";
export const LAST_RESULT_KEY = "digest:last";
export const LAST_ERROR_KEY = "digest:last-error";
export const LAST_TEST_RESULT_KEY = "digest:last-test";
export const RUN_MARKER_PREFIX = "digest:sent:";

const RUN_MARKER_TTL_SECONDS = 60 * 60 * 24 * 8;

export async function getJson(kv, key, fallbackValue) {
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

async function putJson(kv, key, value, options) {
  await kv.put(key, JSON.stringify(value), options);
}

export async function safePutJson(kv, key, value, options) {
  try {
    await putJson(kv, key, value, options);
    return [];
  } catch (error) {
    return [`${key}: ${formatError(error)}`];
  }
}

export async function safeDeleteJson(kv, key) {
  try {
    await kv.delete(key);
    return [];
  } catch (error) {
    return [`${key}: ${formatError(error)}`];
  }
}

export async function persistSuccessfulDeliveryState(kv, state) {
  const warnings = [];
  warnings.push(...await safePutJson(kv, state.runMarkerKey, state.marker, {
    expirationTtl: RUN_MARKER_TTL_SECONDS,
  }));
  warnings.push(...await safePutJson(kv, OBSERVED_SNAPSHOT_KEY, state.observedSnapshot));
  warnings.push(...await safePutJson(kv, SNAPSHOT_KEY, state.snapshot));
  warnings.push(...await safePutJson(kv, DELIVERY_HISTORY_KEY, state.history));
  return warnings;
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message || error.toString();
  }
  return String(error);
}
