import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ProviderIcon } = await jiti.import("./ProviderIcon.tsx");
const render = (id) => renderToStaticMarkup(React.createElement(ProviderIcon, { id, size: 20 }));

test("uses the package-local sprite for known providers", () => {
  assert.match(render("openai-codex"), /href="\/provider-icons\.svg#openai"/);
  assert.match(render("google"), /href="\/provider-icons\.svg#google"/);
});

test("uses an initial fallback for custom providers", () => {
  const html = render("my-provider");
  assert.match(html, />MP<\/span>/);
  assert.doesNotMatch(html, /provider-icons\.svg/);
});
