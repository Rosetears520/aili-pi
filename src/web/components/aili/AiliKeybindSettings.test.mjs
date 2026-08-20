import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression contract for the invisible keyboard lock (root cause of the
// "terminal renders but no input" reports, 2026-08-20): the keybind capture
// listener exists only while the popover is open AND capturing, every close
// path clears the capture state, and invalid keystrokes are never swallowed
// page-wide.

const source = await readFile(new URL("./AiliKeybindSettings.tsx", import.meta.url), "utf8");

test("capture listener is gated on open AND capturing", () => {
  assert.match(source, /if \(!open \|\| !capturing\) return;/);
  const effectDeps = source.match(/\}, \[open, capturing, commit\]\);/);
  assert.ok(effectDeps, "keydown effect must depend on open and capturing");
});

test("every close path clears the capture state", () => {
  assert.match(source, /const closeSettings = useCallback\(\(\) => \{/);
  assert.match(source, /setOpen\(false\);\s*\n\s*setCapturing\(null\);\s*\n\s*setError\(null\);/);
  // outside-click close and the toolbar toggle both route through it
  assert.match(source, /if \(!target\.closest\("\.aili-keybind-settings"\)\) closeSettings\(\);/);
  assert.match(source, /if \(open\) closeSettings\(\); else setOpen\(true\);/);
});

test("invalid keystrokes are never swallowed page-wide", () => {
  // The validity check must return BEFORE the swallow: plain letters and
  // bare modifiers pass through to whatever actually has focus (xterm,
  // composer) instead of dying in a capture-phase listener. Only a VALID
  // combination (and the explicit Escape exit) is prevented.
  assert.match(
    source,
    /if \(!\/\^\[a-z0-9\]\$\/\.test\(key\) \|\| parts\.length === 0\) return;\s*\n\s*event\.preventDefault\(\);/,
  );
});
