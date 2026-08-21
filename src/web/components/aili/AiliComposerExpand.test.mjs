import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

register(new URL("../aicss/module-css-stub.mjs", import.meta.url));

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { AiliComposerExpand } = await jiti.import("./AiliComposerExpand.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderExpand(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(AiliComposerExpand, {
        value: "hello draft",
        onChange() {},
        onSend() {},
        onClose() {},
        ...props,
      }),
    ),
  );
}

test("renders nothing while closed", () => {
  assert.equal(renderExpand({ open: false }), "");
});

test("open editor renders source textarea plus source/preview/minimize/send controls", () => {
  const html = renderExpand({ open: true });

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aili-composer-expand-overlay/);
  assert.match(html, /<textarea[^>]*aili-composer-expand-textarea/);
  assert.match(html, /aria-pressed="true"[^>]*>Source</);
  assert.match(html, /aria-pressed="false"[^>]*>Preview</);
  assert.match(html, /aria-label="Minimize"/);
  assert.match(html, /aili-composer-expand-send/);
  assert.match(html, /Enter inserts a newline and never sends/);
  // The editor only sends via the button; no keyboard shortcut markup is needed,
  // Enter behavior is covered by manual browser verification.
});

test("send button reflects the disabled state", () => {
  const html = renderExpand({ open: true, sendDisabled: true });
  assert.match(html, /aili-composer-expand-send[^>]*disabled=""/);
});

test("renders attachment chips with remove controls", () => {
  const html = renderExpand({
    open: true,
    attachments: [{ previewUrl: "data:image/png;base64,AAA" }],
    onRemoveAttachment() {},
  });

  assert.match(html, /aili-composer-expand-chips/);
  assert.match(html, /src="data:image\/png;base64,AAA"/);
  assert.match(html, /aria-label="Remove attachment"/);
});

test("shows the character and line count of the draft", () => {
  const html = renderExpand({ open: true, value: "one\ntwo\nthree" });
  assert.match(html, /aria-hidden[^>]*>13 \/ 3</);
});
