import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  contextCapacityLabel,
  formatCompactTokens,
  normalizeCodexQuotaText,
} = await jiti.import("./aili-footer.ts");

test("formatCompactTokens keeps the strip's k/M style across locales", () => {
  assert.equal(formatCompactTokens(940), "940");
  assert.equal(formatCompactTokens(82_790), "83k");
  assert.equal(formatCompactTokens(525_118), "525k");
  assert.equal(formatCompactTokens(1_000_000), "1M");
  assert.equal(formatCompactTokens(2_900_000), "2.9M");
  assert.equal(formatCompactTokens(10_000_000), "10M");
});

test("contextCapacityLabel uses locale-independent k/M units", () => {
  assert.equal(contextCapacityLabel(132_000, 1_000_000, 13.2), "132k/1M (13.2%)");
  assert.equal(contextCapacityLabel(82_790, 1_000_000, 8.279), "83k/1M (8.3%)");
  assert.equal(contextCapacityLabel(null, 1_000_000, null), "?/1M");
  assert.equal(contextCapacityLabel(132_000, 0, 13.2), undefined);
});

test("normalizeCodexQuotaText mirrors the TUI codex segment", () => {
  // The adapter's raw reset date is "(day/month)"; the label flips it to month/day.
  assert.equal(
    normalizeCodexQuotaText("5h 42% 03:45PM (22/08) · weekly 88% (16/08)"),
    "codex 42% 08/22 15:45",
  );
  assert.equal(normalizeCodexQuotaText("5h 96% 11:59PM (22/08)"), "codex 96% 08/22 23:59");
  assert.equal(normalizeCodexQuotaText("5h 96% 12:01AM (22/08)"), "codex 96% 08/22 00:01");
  // Non-codex quota text falls through so the chip stays hidden.
  assert.equal(normalizeCodexQuotaText("claude 70% left · reset 2h"), undefined);
  assert.equal(normalizeCodexQuotaText("5h 142% 03:45PM (22/08)"), undefined);
  // A month component above 12 marks the segment as non-codex noise.
  assert.equal(normalizeCodexQuotaText("5h 42% 03:45PM (08/22)"), undefined);
  assert.equal(normalizeCodexQuotaText(""), undefined);
});
