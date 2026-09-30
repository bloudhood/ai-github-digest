import test from "node:test";
import assert from "node:assert/strict";

import { parseDeepSeekJson } from "../index.js";

test("repairs missing commas between project objects without another model call", () => {
  const parsed = parseDeepSeekJson(`{
    "projects": [
      {"full_name":"owner/one","positioning_cn":"第一个项目","risk_cn":""}
      {"full_name":"owner/two","positioning_cn":"第二个项目","risk_cn":""}
    ]
  }`);

  assert.deepEqual(parsed.projects.map((item) => item.full_name), ["owner/one", "owner/two"]);
});

test("repairs trailing commas in fenced DeepSeek JSON", () => {
  const parsed = parseDeepSeekJson(`\`\`\`json
  {"projects":[{"full_name":"owner/one","positioning_cn":"自然文案","risk_cn":""},],}
  \`\`\``);

  assert.equal(parsed.projects[0].positioning_cn, "自然文案");
});

test("still rejects truncated JSON that cannot be repaired safely", () => {
  assert.throws(
    () => parseDeepSeekJson('{"projects":[{"full_name":"owner/one"}'),
    /JSON|position|end/i,
  );
});
