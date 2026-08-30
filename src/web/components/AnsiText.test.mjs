import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { AnsiText } = await jiti.import("./AnsiText.tsx");
const render = (text) => renderToStaticMarkup(React.createElement(AnsiText, { text }));

test("renders shared 24-bit, 256-color, and decoration SGR output", () => {
  const html = render("\x1b[38;2;21;24;29mtrue\x1b[0m \x1b[38;5;196mred\x1b[0m \x1b[9mcut\x1b[29m");
  assert.match(html, /color:rgb\(21, 24, 29\)/);
  assert.match(html, /color:rgb\(255, 0, 0\)/);
  assert.match(html, /text-decoration:line-through/);
  assert.doesNotMatch(html, /\x1b/);
});

test("escapes extension output and preserves line breaks", () => {
  const html = render("<script>alert(1)</script>\nnext");
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /\nnext/);
});
