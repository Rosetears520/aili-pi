## ADDED Requirements

### Requirement: Complete upstream billion-context-pi is the context runtime
AILI SHALL vendor the complete tracked Git source tree of `billion-context-pi@0.1.34` at commit `558a83a9db695571339d693ab75129c2f13a324c`, including source, tests, scripts, docs, package metadata and MIT license, and SHALL expose its complete production feature surface including `compress`, `decompress`, `search_context`, `acp_status` and `acp_delegate*`. AILI MUST NOT selectively remove upstream files, algorithms or tools; routing/Pi-0.84.1 changes are recorded as patches to retained files.

#### Scenario: Package runtime loads
- **WHEN** Pi loads the installed AILI package
- **THEN** the pinned upstream Extension registers its complete documented tools and commands exactly once

#### Scenario: Upstream delegate tools run
- **WHEN** the model calls an `acp_delegate*` tool
- **THEN** it follows upstream spawned-process, role-tool, cwd, nesting, wait/cancel and result-file semantics and is not represented as an AILI persistent task/hub Agent

### Requirement: Upstream delegation has an explicit non-formal boundary
`acp_delegate*` SHALL remain a separate upstream delegation surface governed by Parent Pi permission interception and upstream guardrails. AILI MUST NOT route formal Agent-owned packages, authorization-sensitive writes, or work requiring persistent Agent audit through it, and MUST NOT claim it inherits persistent task package/write/workspace ceilings.

#### Scenario: Formal package needs a specialized Agent
- **WHEN** an accepted formal package has an exact canonical owner
- **THEN** ROSE uses persistent `task`/`hub`, not `acp_delegate*`

#### Scenario: Delegate attempts a gated side effect
- **WHEN** Parent Pi permission policy denies the underlying tool/operation
- **THEN** the delegate cannot use its separate identity to create AILI authorization or a successful formal result

#### Scenario: Compatibility cannot prove permission interception
- **WHEN** package-local verification cannot show that the selected Pi baseline gates the delegate's spawned work as required
- **THEN** BUILD stops as a material discovery and does not patch, weaken or silently claim the complete upstream surface is safe

### Requirement: The upstream ACP package is the non-OpenAI context owner
AILI SHALL remove AILI Compact production hooks, tools, commands, configuration and runtime claims. `billion-context-pi` SHALL own context rewriting only for providers other than `openai/*` and `openai-codex/*`; provider routing to OpenAI server compaction is governed by `provider-routed-context-runtime`.

#### Scenario: Runtime validation finds AILI Compact registration
- **WHEN** package or extension-load validation detects an AILI Compact context/compaction hook or command
- **THEN** validation fails instead of loading a retired context owner

#### Scenario: Session contains old AILI Compact entries
- **WHEN** a historical session is resumed
- **THEN** entries remain preserved history but no retired AILI Compact projector or mutation runtime is activated

### Requirement: ACP context behavior excludes OpenAI provider families
For non-OpenAI providers, ACP SHALL preserve its upstream compression, decompression, search and context behavior. For `openai/*` and `openai-codex/*`, ACP SHALL not rewrite provider context or cancel the compaction event; the complete OpenAI upstream owns that path. No AILI Compact fallback is permitted.

#### Scenario: OpenAI or Codex model prepares context
- **WHEN** provider routing selects the OpenAI compaction runtime
- **THEN** ACP context mutation and compaction ownership are bypassed while independent ACP delegate tools remain available

### Requirement: Upstream source and license remain complete and traceable
The exact npm version, lockfile integrity, source commit, complete tracked-tree inventory, per-file hashes, MIT license, copyright, local patches and integration boundary SHALL appear in provenance, notices, SBOM and real tarball inventory. The production package SHALL contain the complete retained vendored tree, excluding only `.git` metadata and external submodule contents explicitly absent from the pinned tree; symlinks, generated files and submodule entries MUST have an explicit immutable disposition rather than disappear.

#### Scenario: Tarball omits required upstream runtime code
- **WHEN** real package inventory or clean install cannot load the complete Extension
- **THEN** package validation fails and release readiness is non-pass

#### Scenario: Upstream identity drifts
- **WHEN** dependency resolution differs from the pinned version/integrity or provenance input
- **THEN** generated evidence validation fails before release

## MODIFIED Requirements

### Requirement: Reversible context compression is owned by upstream billion-context-pi
Reversible compression, decompression and compressed-context search SHALL follow the pinned upstream runtime contract. The prior AILI Compact schemas, references, custom entries, emergency checkpoint, cache projection and command namespace are retired and MUST NOT be treated as current production requirements.

#### Scenario: Current runtime surface is inspected
- **WHEN** tools, commands and context handlers are enumerated
- **THEN** only the upstream context runtime is active and retired `aili_*` compact tools and `/aili-compact` are absent
