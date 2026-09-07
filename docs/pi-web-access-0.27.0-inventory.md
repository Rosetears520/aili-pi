# pi-web-access 0.27.0 repository-local inventory

## Evidence boundary

This inventory describes the installed npm artifact at `node_modules/pi-web-access` whose `package.json` reports `pi-web-access@0.27.0`, MIT, repository `https://github.com/nicobailon/pi-web-access.git`, and Pi entry `./index.ts`. It was compiled from that artifact's `package.json`, `README.md`, and TypeScript source, especially `index.ts`, `gemini-search.ts`, `extract.ts`, `storage.ts`, and `utils.ts`. The npm `files` declaration publishes `*.ts`, `CHANGELOG.md`, `SECURITY.md`, `banner.png`, and `pi-web-fetch-demo.mp4`; it does **not** declare a `skills/` tree.

Source presence and registration paths are not live-provider validation. No real network, provider, browser-cookie, proxy, GitHub, binary, video, PDF, user-HOME, or curator-browser operation was run for this inventory. Availability, credentials, account quotas, upstream endpoint behavior, optional executables, platform key stores, and extraction quality therefore remain **Unverified**.

## AILI composition boundary

AILI loads the upstream package's default Extension export once from its sole package entry. It does not copy provider implementations, add a provider allowlist, narrow the upstream schemas, or register a second pi-web-access entry. Registration is inert with respect to provider calls: loading registers tools/commands/events and installs the upstream proxy-aware fetch wrapper, but provider credential command sources are explicitly deferred until a selected request. AILI declares no `pi.skills` resource.

## Public surface

### Tools

All four tools are independently controlled by `tools.<camelCase>.enabled`; names may be changed through `toolNames`. `webSearch.enabled: false` is a legacy shorthand for disabling `web_search` and `source_check` when no tool-specific override exists.

- `web_search` (`webSearch`): one `query` or batched `queries`; `numResults` 1–20, `recencyFilter`, include/exclude `domainFilter`, `includeContent`, `workflow`, provider selection, and optional `proxy`. Returns provider-attributed answer/results and stores a response ID.
- `source_check` (`sourceCheck`): checks one claim, optionally with supplied queries, bounded page fetching, domain filtering, recency, provider, and proxy. Produces a machine-readable research artifact with assessment state, passage IDs/offsets, quality hints, hashes, and retained errors.
- `fetch_content` (`fetchContent`): one URL/path or multiple values; readable, exact textual `raw`, or page-grounded `answer` mode; optional answer model, auth profile, force-clone, prompt, timestamp/frames, and proxy. Routes GitHub, YouTube, local video, PDF, images, text, HTML, and RSC pages.
- `get_search_content` (`getSearchContent`): retrieves stored search/fetch/research data by response/query/URL selectors. Supports bounded `offset`/`limit` slices or `findText` with `exact`, `case-insensitive`, or `fuzzy` mode (finder output capped at 20,000 characters).

### Commands and UI

Commands are independently gated by `commands.<name>.enabled` and require restart after registration changes:

- `/websearch`: open the curator, optionally prefilled with comma-separated queries.
- `/curator`: show/toggle `summary-review` versus raw-results behavior and persist `workflow` to `web-search.json`.
- `/search`: browse current-session stored results and response IDs.
- `/google-account`: report the active Gemini Web Google account or sanitized browser/profile failure classification.

The upstream Extension also owns the curator HTTP/SSE service, summary review UI, optional Glimpse/browser opening, `Ctrl+Shift+S` curator shortcut, `Ctrl+Shift+W` activity widget, and lifecycle cleanup on session changes. `curatorRemote` is opt-in; local default is `127.0.0.1`/`localhost`. Remote mode can bind a selected interface or `0.0.0.0`, uses a URL session token over plain HTTP, and increases the default idle timeout from 20 to 60 seconds. `autoOpenBrowser`, shortcut values, and timeout are configurable.

## Search provider identifiers and routing

Accepted provider identifiers are:

`auto`, `all`, `openai`, `brave`, `parallel`, `parallel-mcp`, `tinyfish`, `search1api`, `searchinfinity`, `querit`, `tavily`, `firecrawl`, `jina`, `serpdive`, `kagi`, `bocha`, `ollama`, `anysearch`, `xcrawl`, `valyu`, `xai`, `brightdata`, `serpbase`, `serper`, `searxng`, `duckduckgo`, `exa`, `perplexity`, `gemini`, and `kimi`.

A provider can be one identifier or a non-empty array of resolved identifiers. Arrays run concurrently. `all` concurrently uses eligible available providers (`searxng`, `openai`, `exa`, `brave`, `parallel`, `tinyfish`, `search1api`, `searchinfinity`, `querit`, `tavily`, `firecrawl`, `jina`, `serpdive`, `kagi`, `bocha`, `ollama`, `perplexity`, and API-backed `gemini`) and preserves provider-specific answers/errors while deduplicating URLs/content.

Explicit-only providers excluded from automatic/default fan-out include `parallel-mcp`, `duckduckgo`, `kimi`, `anysearch`, `xcrawl`, `valyu`, `xai`, `brightdata`, `serpbase`, and `serper`. This avoids implicit use of paid, quota-bearing, anonymous, or opt-in routes.

When neither `provider` nor `searchProvider` is configured, `searchRouting.providers` supplies ordered fallback. `fallbackOn` accepts `transient`, `quota`, `network`, `invalid-response`, and `unsupported`; other typed failures stop. `useCurrentModel: true` allows an `openai` route step to use hosted search only for eligible official OpenAI Responses or ChatGPT Codex routes. A tool-level provider or top-level provider remains an explicit override.

Default `auto` prefers configured SearXNG, then Codex-backed OpenAI when the active provider is `openai-codex`; otherwise Exa precedes OpenAI. It then considers Brave, Parallel, TinyFish, Search1API, Searchinfinity, Querit, Tavily, Firecrawl, Jina, SERPdive, Kagi, Bocha, Ollama, Perplexity, Gemini API/Web. Provider availability and filtering semantics vary; some providers implement filters remotely and others locally or as prompt hints.

## Fetch, extraction, and routing

Direct HTTP extraction has three concurrent URL workers and a configurable default 30-second direct/Jina budget. Text/JSON/XML/Markdown is returned directly. HTML uses Mozilla Readability, Next.js RSC extraction, Defuddle, and Turndown/readable Markdown paths, and preserves registered discovery links. `raw` mode returns bounded textual bodies including non-2xx status without readability or hosted fallback. Direct image types are resized through Pi's image helper.

`fetchRouting.providers` accepts `http`, `firecrawl`, `jina`, `tinyfish`, `search1api`, `querit`, `kagi`, `ollama`, `parallel`, `parallel-mcp`, `brightdata`, and `gemini`. The default order omits `parallel-mcp`. For remote HTTP(S) targets, hosted fetch providers are removed unless `fetchRouting.allowRemoteHostedProviders: true`; local safety preflight cannot control a hosted provider's later DNS/redirect/egress. Configured Firecrawl remains the dedicated extraction service and defaults to cache-only (`lockdown`) unless fresh scraping is explicitly enabled. Response bodies are streamed with bounds (normally 5 MiB; PDF uses its configured size bound), redirects are checked, and caller aborts propagate.

## Auth, proxy, domain policy, and SSRF

- `authFetch` defines named browser-cookie profiles. `fetch_content` must explicitly select one (or use `auth: true` only with exactly one profile). Auth fetch is HTTPS-only, limited to configured hosts/subdomains, uses direct local HTTP only, refuses cross-origin redirects, supports cache `session|off`, and never hands cookies/authenticated content to hosted extraction providers.
- Gemini Web browser-cookie access is separately opt-in via `allowBrowserCookies: true` or `PI_ALLOW_BROWSER_COOKIES=1`; `browserCookies.browser/profile` can narrow discovery. Supported presets are Helium, Chrome, Brave, Arc, Chromium, and Edge subject to platform support. Cookie DBs use temporary copies and platform key-store/DPAPI paths; arbitrary profile paths are rejected.
- Every tool accepts `proxy`; omitted means global `proxy`, and `""` forces direct. The upstream wrapper uses `curl` for proxied HTTP(S), strips headers across cross-origin redirects, bypasses localhost and `NO_PROXY`, and redacts proxy credentials in errors. `curl` is therefore optional unless this proxy route is selected.
- `fetchContent.domainPolicy.allow/deny` matches hostnames and subdomains, with deny winning. It applies before local HTTP handling and redirects; local files are outside it.
- SSRF validation blocks private/internal/reserved targets and validates redirects. `ssrf.allowRanges` narrowly exempts configured CIDRs but rejects all-address CIDRs. `ssrf.trustEnvProxy` only skips DNS preflight for hostnames actually using `HTTP_PROXY`, `HTTPS_PROXY`, or `ALL_PROXY`; `NO_PROXY`, localhost, and literal private IPs remain checked/blocked.
- API endpoint overrides require absolute HTTPS URLs without embedded credentials/query/fragment where the relevant resolver enforces that contract, and credential headers are removed on cross-origin API redirects.

## Credential sources

Provider key fields accept literals, `$NAME`/`${NAME}` environment references, or trusted `!absolute-command ...` sources; `$$` and `$!` escape literal prefixes. Command sources run only when that provider is selected, once per request, with a five-second timeout, 16 KiB output limit, minimized environment, one-line non-empty stdout requirement, and redacted command/stderr errors. They are trusted local configuration, not process isolation. Legacy provider environment variables retain precedence where documented.

Credential routes include provider API keys; Pi login auth for eligible OpenAI/Codex, Kimi Code Plan, and xAI models; Gemini API key, Cloudflare AI Gateway token, Google ADC/Vertex project-location, or opt-in Gemini Web cookies; and `gh` authentication for private GitHub repositories. Datalab has key, processing region, mode, and API-base variables. Config defaults to `~/.pi/web-search.json`, or `web-search.json` under `PI_CODING_AGENT_DIR` / `XDG_CONFIG_HOME/pi`.

## Cache and retrieval

Search/research metadata is appended to the Pi session. Full fetched URL content is stored outside session JSONL in `web-search-cache` under the Pi config directory. TTL is one hour; limits are 128 entries and 128 MiB, oldest first. POSIX directories/files are enforced as `0700`/`0600`; writes use exclusive temp files, fsync, rename, symlink/identity checks, and pruning. Metadata remains bounded in session, and expired/missing/invalid cache content returns an explicit unavailable result. An auth profile with `cache: "off"` suppresses fetched-content cache storage.

`maxInlineContentChars` defaults to 30,000 and is capped at 200,000. It controls direct fetch slices and retrieval slice default/maximum; full cache content remains retrievable until expiry.

## GitHub

Repository URLs are cloned to a session cache and represented as local paths/tree/content. Root, tree, blob, and commit SHA routes are specialized. Repositories over the default 350 MiB threshold use a bounded API view unless `forceClone`; `githubClone.enabled`, size, timeout, and clone path are configurable. Clone cache is cleared on session changes.

Pull requests/issues are rendered via `gh pr view`/`gh issue view` first, with an older-`gh` reduced-field retry and bounded unauthenticated REST fallback. PR output can include state/body/checks/reviews/references/files/commits/conversation/review threads; issues include metadata/body/closing PRs/comments. Anchored comments are forced inline. `githubPrIssue.enabled: false` disables only this specialization. Private repository access requires `gh` authentication.

## Images, PDFs, YouTube, and local video

`image.enabled` gates direct images, thumbnails, and frame extraction. YouTube analysis routes Gemini Web (when opted in) to Gemini API to Perplexity text fallback. URL forms include watch, short, live, embed, and `youtu.be`. Local video accepts common formats with Gemini Files API analysis up to the configured 50 MiB default, then Gemini Web fallback. Timestamp/range/whole-video frame sampling is capped at 12 frames.

`ffmpeg` is optional for frames, thumbnails, and local duration; `yt-dlp` is additionally optional for YouTube stream URLs. Analysis can remain available without them, but frame extraction cannot. Browser launching may use `xdg-open`/`open`/`cmd`; cookie fallback may use `sqlite3`, Python stdlib SQLite, Linux `secret-tool`, macOS Keychain, or Windows DPAPI depending on platform/runtime.

PDF engines are `datalab`, `gemini`, and local `unpdf`; `auto` orders available Datalab then Gemini then unpdf. Explicit remote providers generally fall back to unpdf on processing errors but not credential/config/cancellation errors. Defaults include 20 MiB, 100 pages, Datalab balanced mode and 120-second timeout (capped at 300 seconds). Extracted Markdown is saved under temporary `pi-web-pdf`. Datalab/Gemini send PDF bytes to cloud services; Datalab region is configurable.

## Curator, summaries, and source artifacts

Workflows are `none`, `summary-review` (default with UI), and `auto-summary`. Curator review can add/select provider cards and approve/edit a draft. Summary models are selected from Pi's enabled registry, respect `enabledModels`, accept optional thinking suffixes, and use configured/default preferences. One attempt defaults to a 30-second deadline (cap 600 seconds); timeout, unavailable model, or empty result can fall back to deterministic summaries. Headless calls resolve to non-curator behavior.

`source_check` deduplicates/caps search sources at 20 and fetches at most five pages when requested. Its stored artifact records claim status (`supported`, `contradicted`, `unclear`, or `missing-evidence`), confidence/rationale, source quality, exact passage offsets/IDs, SHA-256 hashes, and search/fetch errors.

## Configuration and gates summary

Registration gates: `tools.*.enabled`, legacy `webSearch.enabled`, `commands.*.enabled`; all require restart. Runtime feature gates include `image.enabled`, `pdf.enabled`, `youtube.enabled`, `video.enabled`, `githubClone.enabled`, `githubPrIssue.enabled`, browser-cookie opt-in, authenticated-fetch profile selection, domain policy, SSRF ranges/proxy trust, remote-hosted-fetch opt-in, Firecrawl fresh-scrape opt-in, provider credentials/availability, and explicit-only provider selection. Routing/order, tool names, proxy, fetch/curator/summary timeouts, models, inline limits, clone/PDF/video limits, shortcuts, curator bind/open behavior, and provider endpoints are configurable upstream.

AILI intentionally adds none of these gates and removes none of this 0.27.0 surface.