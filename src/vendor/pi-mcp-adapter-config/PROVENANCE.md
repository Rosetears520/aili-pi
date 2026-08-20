# Vendored from pi-mcp-adapter@2.23.0 (MIT)

Byte-exact copies of `config.ts`, `types.ts`, `utils.ts`, `agent-dir.ts`, and
`agent-plugin-loader.ts`, `ui-stream-types.ts`, and `ui-tool-visibility.ts` vendored 2026-08-20 so the web MCP panel can use the
adapter's own config layer (single-config-authority contract). The package's
exports map blocks `./config`, and its raw TypeScript cannot enter the Next
webpack graph from node_modules (transpilePackages does not apply to the deep
path); in-repo vendoring compiles normally. Mutual imports stay relative and
unchanged. External deps (smol-toml, strip-json-comments) resolve from the
hoisted root node_modules.

Upstream: https://www.npmjs.com/package/pi-mcp-adapter — re-vendor
deliberately on adapter upgrades and diff against these files.
