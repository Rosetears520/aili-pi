import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { POST } = await jiti.import("./route.ts");

// 只覆盖错误路径：成功路径会在宿主机上真的弹出资源管理器窗口，
// 其选择逻辑由 directory-browser.test.mjs 的 launcher 用例覆盖。
test("cwd open rejects a missing or non-string path", async () => {
  const missing = await POST(new Request("http://localhost/api/cwd/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }));
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /path is required/);

  const malformed = await POST(new Request("http://localhost/api/cwd/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: 42 }),
  }));
  assert.equal(malformed.status, 400);
});

test("cwd open fails closed for a nonexistent directory without spawning", async () => {
  const missing = path.join(os.tmpdir(), "pi-web-cwd-open-missing");
  const response = await POST(new Request("http://localhost/api/cwd/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: missing }),
  }));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /ENOENT|does not exist|not a directory/i);
});
