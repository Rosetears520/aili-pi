// Adapted from the exact MIT-licensed Pi Web 0.8.9 baseline.
// Upstream: https://github.com/agegr/pi-web.git
// Revision: 5a53c18ca9328400a3dfb8c48c1e4f343b3e4903
// Copyright (c) 2026 agegr
// AILI changes replace direct AgentSession, RPC, filesystem, Git, provider,
// skill, plugin, and Worktree ownership with the PrivateWebBff/Runtime boundary.

export const PI_WEB_BASELINE = Object.freeze({
  package: "@agegr/pi-web",
  version: "0.8.8",
  revision: "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903",
  sourceRoot: "upstream/pi-web-0.8.9",
  license: "MIT",
  copyright: "Copyright (c) 2026 agegr",
  adaptation: "AILI PrivateWebBff and versioned Runtime contracts",
} as const);

export const PI_WEB_RETAINED_SURFACES = Object.freeze([
  "session-tree",
  "project-grouping",
  "resume",
  "rename",
  "export",
  "safe-delete",
  "branch",
  "fork",
  "model-provider",
  "thinking",
  "commands",
  "skills",
  "plugins",
  "files",
  "git-diff",
  "worktree-navigation",
  "media-preview",
  "i18n",
  "responsive-layout",
  "pwa",
] as const);

export const AILI_WORKBENCH_SURFACES = Object.freeze([
  "timeline",
  "independent-sidebars",
  "persistent-runtime-status",
  "queue-next",
  "steer",
  "persistent-agent-projection",
  "mcp-projection",
  "bounded-browser-media",
] as const);

/** Upstream behaviors intentionally unreachable after the AILI adaptation. */
export const EXCLUDED_UPSTREAM_WEB_BEHAVIORS = Object.freeze([
  "direct-rpc-mutation",
  "direct-agent-session-ownership",
  "direct-filesystem-mutation",
  "force-worktree-removal",
  "worktree-branch-deletion",
  "pi-web-self-update",
] as const);
