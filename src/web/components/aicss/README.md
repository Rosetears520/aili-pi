# Vendored AIcss components

Components vendored verbatim from [AIcss](https://www.aicss.dev/) (author:
[@kvnkld](https://x.com/kvnkld)), retrieved 2026-08-18, under the project
owner's explicit 2026-08-18 authorization to copy the published component
source as-is. The site publishes copy-paste components without a public
license statement; this directory records the provenance instead of one.

| File | Source page |
|---|---|
| `ApprovalCard.tsx` / `ApprovalCard.module.css` | https://www.aicss.dev/components/approval-card |
| `Orb.tsx` / `Orb.module.css` | https://www.aicss.dev/components/orbs |
| `TodoList.tsx` / `TodoList.module.css` | https://www.aicss.dev/components/task-list |
| `StreamingText.tsx` / `StreamingText.module.css` | https://www.aicss.dev/components/streaming-text |

Free/locked audit (2026-08-18, per each page's `isAccessibleForFree` metadata
and the pricing FAQ): every component vendored here is one of AIcss's ten
free components, which the FAQ permits "in personal and commercial projects
without a license". The four locked components (inline-citations,
image-generation, comparison-table, file-diff) must NOT be vendored — an
earlier InlineCitations vendoring was removed the same day and replaced by
the AILI-owned `.aili-cite-*` implementation in `app/globals.css`, and the
markdown-table/diff CSS values were re-derived onto theme variables.

Deliberate deviations from the published source, kept as small as possible:

- Every `@media (prefers-color-scheme: dark)` block in the CSS modules was
  mechanically rewritten to `:global(html.dark)` selector prefixes because
  this app themes via a `html.dark` class toggle, not the OS preference.
- `TodoList.tsx` gained an optional props interface (`items`, `current`,
  `title`, `defaultCollapsed`) so real task data can be rendered; with no
  props it still runs the original self-playing demo unchanged.
- `ApprovalCard.tsx` depends on `lucide-react` (MIT), added to `package.json`.

The earlier AIcss adaptations in `app/globals.css` (composer, code block,
thinking) predate this directory and remain re-implementations of the free
components' visual language; this directory is the verbatim tier.
