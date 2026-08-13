# License disposition for `@rosetears/aili-pi@0.2.6`

This repository-owner-authorized disposition supports the project primary license change to MIT. It does not rewrite third-party terms.

| Retained path boundary | Ownership / source | Distribution disposition |
|---|---|---|
| `extensions/`, `src/` excluding named adapted boundaries, `scripts/`, `tests/`, `docs/`, `templates/`, `prompts/`, project manifests | `@rosetears/aili-pi` repository-owner work | MIT-authorized first-party source |
| `skills/`, `roles/`, `upstream/aili-workflows-runtime/` | `rose-aili@0.4.7` / AILI Workflows | MIT; exact/adapted boundaries recorded in `manifests/provenance.json` |
| `src/vendor/pi-permission-modes/` | `pi-permission-modes@2.2.0` | MIT; retained license in `licenses/` and exact lock-bound adaptations |
| `upstream/billion-context-pi/` | `billion-context-pi@0.1.34`, commit `558a83a9db695571339d693ab75129c2f13a324c` | MIT; complete tracked source retained, with AILI routing/no-home-mutation patch documented in provenance |
| `upstream/pi-retry-0.31.0/`, `src/runtime/provider-retry.ts` | `@narumitw/pi-retry@0.31.0`, commit `3ad2c94970132353fc869cd2297b017465740791` | MIT; full published source retained and adapted diagnostic boundary documented |
| `upstream/pi-codex-compact-*`, npm dependency | `@narumitw/pi-codex-compact@0.50.0`, commit `c98af43a6c71c5839b2e0671db71ed1cc1fc0c51` | MIT; exact source/license snapshot plus locked dependency |
| `extensions/header/`, `extensions/matrix/`, `extensions/zentui/` if retained in repository history/current tree | `pi-sakura-cyberdeck` adaptation | MIT; not registered or packed as production resources under the single extension entry |
| npm dependencies | Their declared package licenses | Separate third-party terms, listed in SPDX SBOM and `THIRD_PARTY_NOTICES.md`; Playwright MCP remains Apache-2.0 |
| reference-only sources | No copied runtime source | No effect on project license; explicitly reference-only in provenance |
| historical OpenSpec artifacts | Historical decision/evidence text | Preserved as history; not a current runtime license claim |

No retained current production boundary is left `Unverified` by this disposition. Generated notices and SBOM remain evidence of third-party identity, not a grant of relicense authority.
