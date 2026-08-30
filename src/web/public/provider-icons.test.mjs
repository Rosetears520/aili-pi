import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sprite = await readFile(new URL("./provider-icons.svg", import.meta.url), "utf8");
const required = ["anthropic", "openai", "google", "deepseek", "mistral", "openrouter", "githubcopilot", "aws", "azure", "kimi", "qwen", "zhipu", "nvidia", "opencode", "xiaomimimo", "zai"];

test("ships the provider icon sprite required by ProviderIcon", () => {
  for (const id of required) assert.match(sprite, new RegExp(`<symbol id="${id}"`));
  assert.match(sprite, /@lobehub\/icons/);
  assert.match(sprite, /MIT License/);
});
