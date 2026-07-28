# Requirements Interview: add-reversible-context-compression

## Interview State

- Mode: `Frontier Batch Mode`
- Round: `6`
- Status: `READY`
- Questions in current frontier: `0`
- Answers received from Round 6: `5/5`
- Confirmed cache contract: deterministic all-request invariants + eligible warm-session average `>=85%` as a blocking performance gate
- Confirmed namespace: `/aili-compact` plus prefixed `aili_*` model tools; no user-facing ACP/DCP name or alias
- Confirmed config: enabled by default; global < project < append-only session state; explicit writes only
- Confirmed search scope: current active branch only, matching Pi provider-context lineage; no cross-tree search scope
- Superseded emergency semantics: historical Pi compactions remain replayable, but new manual/threshold/overflow native compaction is forbidden after exclusive-owner installation
- Confirmed parity/owner/UI: Pi-adapted full parity; AILI Compact is the sole compression/GC owner; three-surface cache UI
- Confirmed precedence rule: Pi owns host/session semantics; pinned prior art informs compression behavior; Pi invariants win every conflict
- Final `test-plan.md` acceptance: stale after 2026-07-27 material delta; renewed acceptance not granted
- Exact HOME operation: user selected automatic bootstrap mutation of `/home/rosetears/.pi/agent/settings.json`; execution remains sequenced after accepted plan, implementation and focused checks
- BUILD / dependency / Git / provider / release permission: not granted by this decision

> Round 6全部关闭，且用户确认总体分层：Session保存、tree/current-branch搜索、native compaction epoch和host lifecycle遵循Pi 0.81.1；compress/decompress/prune、summary/block、protected content、nudge和GC compression policy参考pinned prior art。两者冲突时Pi host invariants优先。Requirements grilling可进入material writeback；这仍不接受旧test plan，也不启动BUILD或修改依赖/lockfile/version。

## Evidence Used

- `context.md` 当前把“全部”解释为 A/B/C 行为集合，并把 external exact parity列为非权威边界。
- `design.md` 当前假定 clean-room、无sidecar、deterministic tool-result cooling及native compaction epoch。
- `test-plan.md` 当前要求用户接受上述边界，但尚未勾选。
- `package.json` 显示当前目标是公开命名的 MIT Package `@rosetears/aili-pi@0.1.9`，存在repository和后续package/release验证面。
- Pi 0.81.1本地源码只能保证插件保留Pi已经持久化的Session entries；built-in tools可能在持久化前截断结果并仅记录`fullOutputPath`。
- Pi `agent-session.js`和`session-manager.js`确认：manual/threshold/overflow都追加`CompactionEntry`；原entries仍在current branch ancestry，active context改为latest summary + `firstKeptEntryId`之后的tail；overflow失败响应最多compact-and-retry一次。
- Pinned source `v1.12.6`确认：一个slash-command namespace包含7个可见subcommands（另有无参数help）；注册5个user/model-facing context tools和1个internal recap tool。
- Pinned source `hooks.ts`/`gc/*`/`decompress.ts`确认：100% GC只截短或合并active summaries，normal decompress通过停用block让host raw messages重新可见；它不接管OpenCode native compaction，host compaction移除anchor后block会被停用且不保证active restore。

## Current Decision Tree

```text
Q1 “全部移植”的parity口径
├─ clean-room A/B/C行为合同 → 可继续询问auto policy、threshold、query、compaction语义
└─ exact/source parity      → 先进入独立外部只读research/license gate，再重算frontier

Q2 “正式版就是测试版”的发行口径
├─ 单一代码线、未来正常版本
└─ 仅本机self-use、不设publish target

Q3 “JSON完整”的数据口径
├─ Pi-persisted Session fidelity → 无sidecar
└─ 全量tool stdout archive       → 后续必须再定义storage、retention、cleanup与security
```

## Frontier Round 1

### Q1 — “全部移植”的验收口径

- **Status:** Needs question
- **Why material:** 它决定当前spec是否可以只以A/B/C行为合同验收，还是必须先核验ACP/DCP/pi-condense的exact revision、功能清单和license；两条路线会改变scope、research、dependency、tasks和test-plan。
- **Affected decisions/artifacts:** `proposal.md` clean-room边界；`context.md` `UV-PRIORART-1`；`design.md` Non-Goals；spec clean-room requirement；`test-plan.md` external-parity claim。
- **Evidence-backed recommendation:** **A**。当前Pi host证据足以定义A/B/C行为，clean-room避免把未核验external plumbing或license带入MIT Package，同时仍完整交付你刚才选择的A/B/C集合。
- **Trade-off:** A不承诺与某个external revision逐项一致；B/C能追求exact parity，但必须先停下做独立external source/license research，且可能触发dependency或license冲突。

请选择：

- **A（推荐）**：`全部` = 当前OpenSpec定义的A/B/C行为级完整实现；clean-room，不声称ACP/DCP exact parity。
- **B**：`全部` = 与指定ACP/DCP/pi-condense revision逐项feature parity；下一步先确定revision并单独申请只读external research，未关闭前不能接受spec。
- **C**：`全部` = source-level移植或改写external实现；这可能与当前MIT/public Package边界冲突，必须先做license和source provenance决定。
- **D**：自定义口径，请写清必须一致的功能、项目和revision。

**Answer:** 用户要求进一步解释；尚未选择，保持 unresolved。

**Classification:** `incomplete`（尚无选项或自定义口径）。

**Write-back targets after confirmation:** `proposal.md`, `context.md`, `design.md`, `specs/reversible-context-compression/spec.md`, `tasks.md`, `test-plan.md`。

### Q2 — “正式版就是测试版，也不用再做一个版本”的发行含义

- **Status:** Needs question
- **Why material:** 当前artifact把它解释为“不维护beta/GA两套实现”，但`package.json`仍是公开命名、有版本和repository的npm Package。若实际意图是local-only，package/release tasks和acceptance claim应删除或降级；若未来仍发布，则不能承诺永远不产生正常的新package version。
- **Affected decisions/artifacts:** `proposal.md` Impact；`context.md` Goal/Boundary；`design.md` Non-Goals/Migration；tasks package/release evidence；`test-plan.md`适用版本和out-of-scope。
- **Evidence-backed recommendation:** **B**更贴合你最新的“只有我自己在用”；它把本change明确为local/self-use，不创建publish target。若你只是不要beta版本而仍可能发布，则选A。
- **Trade-off:** A保留公开分发可能性但未来发布通常需要新的npm version；B最简单但本change不能声称npm发行ready；C对已发布npm版本通常不可行且会混淆provenance。

请选择：

- **A**：只是不做独立beta/测试版；A/B/C进入同一代码线，未来可在单独SHIP/release批准后进入下一个正常package version。
- **B（按你最新表述推荐）**：本change仅供本机/self-use，不设npm publish/release target，保持当前version不动；以后若想公开发布再建独立release决策。
- **C**：要求继续使用当前已存在的package version身份而不新增version并对外发布；请说明目标registry/分发方式，因为标准npm已发布version通常不可覆盖。
- **D**：自定义发行边界。

**Answer:** 用户选择 **C**。

**Classification:** `incomplete`。尚未说明是仅保留本地`package.json`中的`0.1.9`、尝试首次发布未占用的`0.1.9`，还是覆盖已经发布的`0.1.9`；三者的可行性和release contract不同。

**Write-back targets after confirmation:** `proposal.md`, `context.md`, `design.md`, `tasks.md`, `test-plan.md`。

### Q3 — “会话JSON完整”的数据保真口径

- **Status:** Confirmed by user clarification
- **Why material:** Pi可以保证Session JSONL existing entries append-only，但built-in tool可能在message持久化前已截断输出。要求保存所有原始stdout会引入tool override或sidecar、数据保留/清理/隐私和更大的验证面。
- **Affected decisions/artifacts:** `context.md` `D-003`；`design.md` source-of-truth/Non-Goals；spec Session fidelity requirement；tasks fixtures/storage；`test-plan.md` DATA/FI claims。
- **Evidence-backed recommendation:** **A**。它直接满足“压缩不破坏会话JSON”的核心目标，并可由byte-prefix测试证明；B/C是全量输出归档产品，不只是context projection。
- **Trade-off:** A不恢复Pi写入前已截断的字节；B保留全量输出但需要sidecar lifecycle；C让JSONL自身膨胀并要求覆盖/替换built-in tools，风险最高。

请选择：

- **A（推荐）**：完整 = 插件不修改/删除任何Pi已持久化JSONL line，只追加事务；Pi写入前的built-in truncation不在保证内，不建sidecar。
- **B**：完整 = 每个tool的完整原始输出都必须可恢复；允许sidecar/CAS，JSONL保存稳定引用。下一轮再定义retention、cleanup、missing-sidecar和敏感数据策略。
- **C**：完整 = 即使超过Pi截断限制，也必须把全部输出直接嵌入同一JSONL；接受tool override、文件快速增长和更大scope。
- **D**：自定义数据保真口径。

**Answer:** 用户澄清：打开Pi会话文件或通过tree搜索时，整个会话仍完整；只有发送给模型供应商的上下文是压缩投影。

**Classification:** `confirmed`，对应选项 **A**。

**Delta class:** `covered`。当前`context.md` `D-003`、`design.md` `D2`及spec/test-plan已按该口径定义；无需重复修改。保证边界是Pi已经持久化的Session entries，不能反向找回Pi持久化前已经截断的额外stdout。

**Write-back targets after confirmation:** 已由当前`context.md`, `design.md`, `specs/reversible-context-compression/spec.md`, `test-plan.md`覆盖。

## Round 1 Ingestion Result

- `Q1`: unresolved；用户要求更详细解释。
- `Q2`: incomplete；已选择C，但“保持当前version”对应的实际分发动作仍有三种不同含义。
- `Q3`: confirmed / covered；Session file和tree保持Pi-persisted原始记录，provider-time projection可以压缩。
- Requirements-grilling state仍为`BLOCKED_FOR_CLARIFICATION`。

## Frontier Round 2

### R2-Q1 — “行为完整”“逐项兼容”“源码移植”到底差在哪里

这三个选项都能让AILI拥有压缩能力，但验收对象完全不同。

| 口径 | 我们以什么为source of truth | 举例：若external项目threshold与当前spec不同 | 是否读取/复用external源码 | 最终能声称什么 |
|---|---|---|---|---|
| **A 行为级完整** | 你确认的A/B/C目标 + 本OpenSpec | 按本spec中接受的threshold实现 | 不需要；clean-room | “A/B/C全部能力已实现” |
| **B exact feature parity** | 指定external项目及精确revision | 必须按该revision的threshold/config/edge cases实现 | 必须先只读核验；实现仍可clean-room | “与指定revision逐项功能兼容” |
| **C source-level port** | external源码、prompt、schema和license | 直接采用或改写其实现 | 是；必须做license/provenance审查 | “基于某external源码移植” |

- **为什么当前推荐A：** 你的核心目标是Pi会话原文完整、provider payload压缩、可query/decompress，并未提出要兼容某个external插件的command、config、state schema或fixture。A会完整实现这些能力，但允许我们根据Pi 0.81.1采用更安全的append-only/projector设计。
- **什么时候选B：** 你需要已有external插件用户无差别迁移，或要求相同command/config/default/error behavior。此时必须先指定项目和revision；当前没有这些external事实，不能直接接受现有spec。
- **什么时候选C：** 你明确要求拿某项目代码来改，而不只是获得相同能力。它可能引入license、attribution、dependency和公开MIT Package兼容问题。
- **重要边界：** 选择B或C只改变需求方向，不自动授权联网、读取external source或复制代码；这些需后续单独批准。

请选择：

- **A（推荐）**：功能全部具备，但由本OpenSpec定义行为，clean-room实现。
- **B**：必须与指定external project/revision逐项功能兼容；请同时写出项目名和revision。
- **C**：必须复用/改写指定external source；请同时写出项目名和revision。
- **D**：hybrid/custom，例如“仅commands和user-visible behavior exact parity，内部实现clean-room”；请列出必须兼容的surface。

**Answer:** 用户要求准确口径为 **A+B+C**：在Pi agent内做一个具备`opencode-acp`功能的插件，并去掉Pi原生压缩，换成ACP式压缩。

**Classification:** `contradictory` + `material-question`。能力完整和指定revision的行为兼容可以组合，但clean-room与直接复用同一AGPL source不能同时成立；还需确认exact repository、revision和license route。native compaction的threshold/manual/overflow替换边界依赖该选择，暂不能写成已接受行为。

**Write-back targets:** `proposal.md`, `context.md`, `design.md`, spec, `tasks.md`, `test-plan.md`。

### R2-Q2 — 你选择的“2C”具体是哪一种version/distribution状态

当前只知道repository内`package.json`写着`0.1.9`；本轮没有联网核验registry中`0.1.9`是否已经发布。标准npm不能覆盖一个已经发布的同名同version包。因此需要把“继续使用当前version身份”落成一个可执行口径。

请选择：

- **A（推荐，符合self-use）**：本地源码继续保持`0.1.9`，只在本机/path安装或直接运行；本change不做registry publish。
- **B**：若registry中`0.1.9`从未发布，未来希望以`0.1.9`首次发布；届时另行批准registry只读核验和release。
- **C**：希望覆盖registry中已发布的`0.1.9`；标准npm不可行，需要改用新version或明确可覆盖的custom registry。
- **D**：通过Git URL、tarball或custom registry分发但仍显示`0.1.9`；请说明具体渠道。

**Answer:** 用户澄清：后续发布一个新version，但任何version/release动作必须先由用户明确同意。

**Classification:** `confirmed`。

**Delta class:** `covered`。这对应最初的“单一代码线、未来正常新version”口径；当前artifacts已经禁止本DEFINE自动修改version或发布。后续SHIP仍需单独、精确批准。

**Write-back targets:** 当前`proposal.md`, `context.md`, `design.md`, `tasks.md`, `test-plan.md`已有operation gate；最终revision时统一消除旧的local-only歧义。

## Round 2 Ingestion Result

- **Release:** confirmed。未来可发布新version，但version bump、publish和release均需用户单独明确批准。
- **Session/provider boundary:** reconfirmed。Pi Session JSONL/tree中的persisted entries保持完整；只在provider request前投影压缩上下文。
- **ACP scope:** material delta。用户要求ACP式完整能力，并替换Pi native compaction；当前设计只取消部分threshold compaction，因此`design.md`/spec/tasks/test-plan已经stale。
- **Cache scope:** material delta。用户要求保持ACP式cache friendliness，并在可行时加入参考`Hotakus/opencode-visual-cache`的命中显示。
- **Acceptance impact:** 旧`test-plan.md`从final candidate降为stale candidate；未接受，也不能在这些delta写回前接受。

## Targeted External and Local Evidence

- Web evidence把未加scope的`opencode-acp`映射到 [`ranxianglei/opencode-acp`](https://github.com/ranxianglei/opencode-acp)。观察到的最新stable tag是[`v1.12.6`](https://github.com/ranxianglei/opencode-acp/releases/tag/v1.12.6)（2026-07-14）；`v1.12.7-dev.1`是pre-release。
- 该项目README公开的核心surface是model-driven `compress`、`decompress`、`acp_status`、`search_context`，并在100% context时保留GC fallback；这意味着“替换native compaction”仍需定义emergency fallback，而不是无兜底。
- npm metadata将`opencode-acp`标为`AGPL-3.0-or-later`。直接复制/改写其host/plugin源码会给当前MIT Package带来material license conflict，不能当作普通clean-room实现。
- **证据修正：** 先前web摘要提到master上的MIT `context-compress-algorithms`抽取，但pinned `v1.12.6`的`package.json`并不包含该dependency，README也仍声明是DCP fork。它不能作为`v1.12.6`直接复用依据；若未来考虑更晚revision，必须重新pin和核验。
- [`Hotakus/opencode-visual-cache`](https://github.com/Hotakus/opencode-visual-cache)展示实时cache hit rate、read/write/miss/output、cost/savings、progress/trend和可折叠TUI panel；本轮只研究pattern，未复制其code/assets。
- 当前仓库其实已经有两层cache observability：`extensions/zentui/format.ts`从assistant usage计算latest hit rate并在token label显示；bundled `pi-cache-optimizer@2.6.18`还提供persisted provider/model footer stats和`/cache-optimizer stats`。因此新增需求应定义为“增强现有显示”还是“新增完整panel”，不能假装从零开始。
- `pi-cache-optimizer`明确声明provider-side caching是best-effort，proxy/routing/provider行为可能隐藏或破坏命中。AILI可以保证projection prefix确定且稳定、如实显示observed `cacheRead/cacheWrite`，但不能无条件保证provider实际命中。

## Frontier Round 3 — Exact Source Identity and License Route

目前搜索到两个不同ACP项目；未加scope的`opencode-acp`最可能指`ranxianglei/opencode-acp`。这个identity/source问题必须先单独确认，之后才能批量询问native fallback、cache guarantee和cache UI。

请选择：

- **A（推荐，能力+行为兼容）**：pin [`ranxianglei/opencode-acp@v1.12.6`](https://github.com/ranxianglei/opencode-acp/releases/tag/v1.12.6)作为user-visible行为参考；Pi host adapter/replay/projection采用clean-room实现，不复制AGPL plugin source。最终声称“ACP-equivalent Pi capability”，不声称source parity。
- **B（历史选项，已被后续pinned inspection纠正）**：当时根据master/web摘要提出“复用MIT `context-compress-algorithms`”；pinned `v1.12.6`并无该dependency，因此不能作为本revision路线。
- **C（直接source port）**：直接复制/改写`ranxianglei/opencode-acp@v1.12.6`的AGPL源码。该路线与当前MIT-only Package假设冲突，必须先决定是否接受AGPL obligations及Package licensing变化；在此之前formal spec保持blocked。
- **D**：你指的是另一个ACP project/revision，或要跟踪`master`/pre-release；请给exact URL和tag/commit。

**Why this blocks:** 同一句“A+B+C”无法同时证明clean-room和source-level derivation；license、dependency、parity claim、native compaction semantics及test fixtures都会随选择改变。

**Answer:** 用户确认exact URL为`https://github.com/ranxianglei/opencode-acp`；允许为可用性和性能采用dependency、直接复制或对照源码改造，并认为双方都是开源项目。

**Classification:** source identity与工程优先级`confirmed`；“都是开源所以无需考虑license”与pinned source的AGPL条款`evidence-conflicting`。用户尚未明确授权把当前MIT Package改为AGPL或承担对应distribution/source-notice义务，因此direct source port仍不能写成accepted route。

**Write-back targets after confirmation:** source identity已记录；license/public-contract route待Round 4确认后再写`proposal.md`, `design.md`, spec, tasks, test plan及必要license/provenance artifacts。

## Round 3 Source Inspection Result

在用户给定URL上只读clone并pin了stable `v1.12.6`：

- Exact revision: `v1.12.6` / commit `f1a33d9f4ce55af808eb4e050717c914ed16084b`。
- `LICENSE`和`package.json`均声明`AGPL-3.0-or-later`；LICENSE section 5(c)要求分发derived work时whole work按AGPL许可。这里不是法律意见，但足以构成release/license gate。
- Runtime直接使用`@opencode-ai/plugin`、`@opencode-ai/sdk`、OpenCode message transforms/config/events，并依赖Anthropic tokenizer、Zod和jsonc-parser；把`opencode-acp`直接列为Pi runtime dependency不能自动获得可运行的Pi插件，反而引入不需要的OpenCode host和依赖成本。
- 可移植的行为surface已确认：range/message compress、decompress、prune、search、status、recap protocol、message IDs、protected tools/files、dedupe、purge-error、state persistence/rebuild、manual/compress/decompress/recompress/sweep/stats commands、adaptive nudges和100% GC fallback。
- ACP明确要求关闭OpenCode native auto-compaction；对Pi应映射为“ACP projector接管常规threshold path，同时保留一个明确的emergency overflow owner”，而不是无兜底删除。
- 工程结论：为Pi直接重写host adapter/replay/projection比安装整个OpenCode package更可用、依赖更少、性能边界更可控；是否可以复制AGPL实现细节仍取决于Round 4 license选择。
- 临时clone仅用于证据检查，不是dependency、vendored source或BUILD产物。

## Frontier Round 4 — License and Distribution Route

双方都是open source不代表许可证可以互换。当前AILI是MIT，而pinned ACP是AGPL。请选择最终public-contract路线：

- **A（推荐）— 保持AILI MIT：** pin `opencode-acp@v1.12.6`作为功能/测试行为参考；针对Pi clean-room重写host integration和算法，不复制其AGPL源码/prompt/schema/fixture。允许后续选用经过核验的MIT/Apache/BSD dependency，但每个exact package/version及lockfile mutation仍在BUILD前单独列明批准。
- **B — 接受AGPL derived-work路线：** 允许复制/改写`v1.12.6` AGPL源码，并准备将受影响的distributed work按AGPL-3.0-or-later发布、保留copyright/license/notices、提供对应源码及交互式legal notice。由于当前是单Package，这很可能意味着改变整个`@rosetears/aili-pi`许可，需明确接受。
- **C — 暂时只本机private source port、未来发布前再解决：** 技术上可做private copy，但与已确认的未来新version目标形成release blocker，并容易在公开repository中混入不可按MIT发布的derived source；不推荐作为formal BUILD路线。
- **D — 自定义双许可/版权所有者授权方案：** 需要提供可验证的additional permission或dual-license证据，不能仅以“开源”替代。

**Recommended answer:** `4A`。它仍以ACP全部功能和性能为目标，只是不把AGPL源码复制进MIT Package；Pi host差异本来也要求大部分重写。

**Answer:** 用户选择 **C**：先按private/local source port推进，未来发布前再解决license。

**Classification:** `confirmed`，并保留显式release blocker。当前MIT metadata不变；任何AGPL-derived code只能留在未发布的local BUILD surface。commit/push/publish/release仍未授权，未来新version不得在license gate关闭前SHIP。

**Delta class:** `material-delta`。最终spec/tasks/test plan必须区分“private BUILD acceptance”和“public release readiness”，记录source provenance，并让release validation在license未解决时明确non-pass而非false PASS。

**Write-back targets:** `proposal.md`, `context.md`, `design.md`, spec, `tasks.md`, `test-plan.md`; future license/notices depend on the pre-SHIP resolution。

## Round 4 Ingestion Result

- Source route: private/local adaptation of `ranxianglei/opencode-acp@v1.12.6` is accepted.
- License disposition: deferred, not cleared. This allows local implementation after BUILD approval but blocks public commit/push/publish/release of AGPL-derived work until separately resolved.
- Dependency disposition: dependencies are allowed in principle for functionality/performance; each exact package/version and lockfile mutation still requires an operation-specific approval before execution.
- Current Package license remains MIT; no source, dependency, lockfile or version mutation has occurred.

## Frontier Round 5

### R5-Q1 — “完整ACP功能”采用哪种Pi parity边界

Pinned `v1.12.6`包含核心context runtime，也包含OpenCode-specific installer/update/migration/auth plumbing。后者原样移植到Pi既不能直接运行，也会增加无用依赖。

请选择：

- **A（推荐）— Pi-adapted full functional parity：** 完整实现range/message compress、decompress、prune、search、status、recap protocol、protected tools/files、dedupe、purge-error、state persistence/rebuild、manual/recompress/sweep/stats、adaptive nudges、Pi路径下的custom prompt/config overrides、subagent gating和100% GC；使用`/acp`及ACP tool names。排除OpenCode SDK wiring、self-auto-update、DCP/OpenCode storage migration和OpenCode auth等host-only plumbing。
- **B — Exact user-visible v1.12.6 parity：** 连OpenCode/DCP兼容aliases、config migration、custom prompt filesystem、self-auto-update和subagent experiment都尽量复制；复杂度和side effects更高。
- **C — Core only：** 只做compress/decompress/search/status/GC，省略prune、strategies、完整commands/config；与“完整”目标不一致。
- **D — 自定义：** 列出A中要删除或B中必须保留的surface。

**Why material:** 决定public tools/commands/config、持久化schema、tasks和test matrix。

**Answer:** 用户选择 **A**，并新增canonical product name：`aili-compact`，不使用ACP/DCP作为产品名。

**Classification:** `confirmed`。Pi-adapted full functional parity纳入全部可移植runtime、commands/config/custom prompts/subagent gating和GC；OpenCode-only installer/update/migration/auth plumbing排除。

**Delta class:** `material-delta`。旧`compress_context`/`context-compression` public naming和四工具合同需替换为AILI Compact namespace及完整surface。

**Write-back targets:** `proposal.md`, `design.md`, spec, `tasks.md`, `test-plan.md`, Language。

### R5-Q2 — Pi native compaction如何被ACP接管

Pi不需要被fork或删除源码；Extension可以拦截compaction events。需要分别定义threshold、manual和overflow owner。

请选择：

- **A：** 关闭Pi threshold auto-compaction；保留原生`/compact` manual和overflow recovery。最保守，但manual仍可能打断ACP state。
- **B（推荐，最符合“换成ACP”）：** ACP接管threshold；Pi manual `/compact`被取消并明确引导到`/acp compress|sweep`等ACP manual surface；到100%先运行ACP major GC。只有projector/GC失败或仍overflow时才放行Pi overflow recovery，并建立不可伪装decompress的新epoch。
- **C：** threshold、manual、overflow全部取消，ACP 100% GC是唯一owner。最接近完全移除native，但模型/投影/GC故障时可能无法从context overflow恢复。
- **D：** 自定义三类reason的owner和失败行为。

**Why material:** 决定overflow safety、true decompression、epoch模型和fault-injection acceptance。

**Answer:** 用户选择 **B**。

**Classification:** `confirmed`。AILI Compact接管threshold；Pi manual `/compact`取消并引导到AILI Compact manual commands；100%先运行AILI major GC；只有projector/GC失败或仍overflow时放行Pi emergency recovery并建立新epoch。

**Delta class:** `material-delta`。旧manual-native contract及相关tests必须重写。

**Write-back targets:** `design.md`, spec compaction requirements, tasks, test plan。

### R5-Q3 — “保证缓存命中”的可测试合同

Provider cache由provider/proxy/router最终控制。AILI能严格控制provider payload稳定性并读取reported telemetry，但不能制造provider未返回的cache hit。

请选择：

- **A（release-truthful默认）：** 强保证同一branch/state重复projection为byte/canonical-stable prefix；如实显示`cacheRead/cacheWrite`和hit rate，不承诺数字SLA。
- **B（性能优先，推荐给你的目标）：** A + 在一个后续单独批准的named provider/model self-use probe中，以ACP公开指标为目标，warm-up后session平均hit rate目标`>=85%`；低于目标则performance acceptance不通过并显示WARN，但不谎报数据或破坏Session正确性。
- **C：** 所有provider/每次请求都必须`>=85%`。受外部系统控制，当前无法形成真实可执行保证。
- **D：** 自定义metric、阈值、provider/model和failure policy。

**Why material:** 决定cache requirement是determinism invariant、live performance gate还是不可验证承诺。

**Answer:** 用户选择 **C**：所有provider、每次请求都必须`>=85%`。

**Classification:** `untestable` + `evidence-conflicting`。首次请求没有warm cache；显式compression/state/prefix变化会合法产生miss；部分provider/proxy不提供cache telemetry或不支持prompt cache。AILI不能通过本地代码强制这些external facts，因此该绝对合同不能写成可验收requirement。

**Delta class:** `material-question`。Round 6必须定义eligible request、warm-up、supported-provider和failure policy，或明确保留为`UNVERIFIED`且阻塞性能claim。

**Write-back targets:** `design.md`, cache requirements, performance tasks, test plan, Unverified/live gate。

### R5-Q4 — Cache命中显示采用哪种Pi UI

本地Zentui footer已经显示latest hit rate，`pi-cache-optimizer`也有persisted stats。Pi 0.81.1还原生支持responsive right-side overlay、non-capturing panel、widget和custom footer。

请选择：

- **A：** 只增强现有footer：latest/session hit rate、cache read/write/miss，最轻量。
- **B：** footer + 按需`/acp cache`右侧overlay；显示progress/trend、read/write/miss/output、compression ratio、cost/savings（有定价时）。
- **C（最接近`opencode-visual-cache`，推荐）：** B + 可切换的persistent responsive non-capturing side panel；窄终端自动隐藏，render结果缓存，只在usage/state变化时刷新，并持久化显示偏好。
- **D：** 自定义placement和字段。

所有选项都只显示numeric telemetry/IDs，不显示prompt、tool正文或secret。

**Why material:** 决定UI ownership、性能、配置、accessibility和测试类别；不是简单新增一行文本。

**Answer:** 用户选择 **C**。

**Classification:** `confirmed`。保留/增强footer，提供按需详情overlay，并增加可切换、responsive、non-capturing persistent side panel；窄终端自动隐藏，render缓存且只随numeric usage/compression state变化刷新。

**Delta class:** `material-delta`。

**Write-back targets:** `proposal.md`, `design.md`, UI spec, tasks, test plan, Zentui integration contract。

## Round 5 Ingestion Result

- Pi parity: confirmed as adapted full functional parity.
- Native compaction: confirmed as AILI Compact primary owner with Pi overflow emergency fallback only.
- Cache UI: confirmed as compact footer + on-demand overlay + optional persistent responsive side panel.
- Naming: confirmed as `aili-compact`; ACP/DCP remain provenance/source terms only and must not appear as user-facing product/command aliases.
- Cache SLA: unresolved because an every-provider/every-request 85% floor is not under extension control and cannot pass on cold start.
- Acceptance impact: existing proposal/design/spec/tasks/test-plan remain stale until Round 6 closes and material writeback is complete.

## Frontier Round 6

### R6-Q1 — 把“每次都>=85%”改成哪种可执行缓存合同

已知不可控边界：cold start没有可读cache；compression或branch/state变化会改变prefix；有些provider不支持或不报告cache字段。请选择：

- **A（最接近你的85%目标，推荐）：** 所有request都必须满足deterministic cacheability invariants；对“同provider/model/session、warm-up后、branch/state未变、provider明确报告cache telemetry”的eligible repeated requests，rolling session平均hit rate目标`>=85%`。cold start、明确state transition和missing telemetry不计入分母但必须单独显示；低于目标标记ERROR并阻塞performance acceptance，不伪造hit。
- **B：** 与A相同，但`>=85%`只产生WARN，不阻塞private BUILD acceptance。
- **C：** 继续要求所有provider、每次请求`>=85%`；该项将保持`UNVERIFIED/BLOCKED`，无法形成完成claim。
- **D：** 自定义eligible条件、metric、窗口、阈值和failure policy。

**Answer:** 用户选择 **A**。

**Classification:** `confirmed`。所有request执行deterministic cacheability invariants；eligible warm repeated requests使用rolling session平均`>=85%` blocking gate。cold start、明确state transition及missing telemetry不计入分母但必须单列；不得伪造hit。

**Write-back targets:** cache requirement, design invariants, live test gate, cache UI states, test plan。

### R6-Q2 — `aili-compact`的command/tool namespace

用户已确认不叫ACP/DCP。本地peer pattern使用hyphenated AILI commands和underscored model tools。

请选择：

- **A（推荐）：** command统一为`/aili-compact <subcommand>`；model tools为`aili_compact`、`aili_decompress`、`aili_prune`、`aili_search_context`、`aili_compact_status`，internal recap为`aili_context_recap`；不注册`/acp`、`/dcp`或`acp_*`aliases。
- **B：** 只把command改为`/aili-compact`，model tools继续使用generic `compress|decompress|prune|search_context`；无ACP/DCP字样但更容易与其他extension冲突。
- **D：** 自定义exact names。

**Answer:** 用户选择 **A**。

**Classification:** `confirmed`。Exact namespace为`/aili-compact <subcommand>`、`aili_compact`、`aili_decompress`、`aili_prune`、`aili_search_context`、`aili_compact_status`及internal-only `aili_context_recap`；不注册ACP/DCP aliases。

**Prior-art count clarification:** pinned source并不是“很多独立slash commands”，而是一个namespace、7个subcommands（`context|stats|sweep|manual|compress|decompress|recompress`）和无参数help；另有6个registered tools，其中5个是context tools、1个是protocol recap。AILI Compact是1:1 namespaced adaptation，没有因改名新增工具数量。

**Write-back targets:** Language, spec public interface, design, tasks, tests, docs。

### R6-Q3 — 原文搜索scope

Session JSONL/tree是完整source，但默认跨branch搜索可能把无关或敏感分支内容送回当前模型。

通俗解释：Pi session不是单线聊天。执行fork或在`/tree`切换后，可能形成：

```text
root -> A -> B   (当前branch)
          └─ C -> D   (另一个/放弃的branch)
```

`current_branch`只搜索`root/A/B`；`session_tree`还会搜索`C/D`。这只决定`aili_search_context`去哪里找，不删除JSONL，也不会自动把其他branch切成当前branch。

请选择：

- **A（推荐）：** 默认`current_branch`；显式scope才能搜索`session_tree`，结果必须标注branch/source IDs且只返回bounded excerpts，不激活其他branch state。
- **B：** 永远只允许current branch。
- **C：** 默认搜索整个session tree。
- **D：** 自定义scope/limit。

**Answer:** 用户要求“按照Pi agent现在的做法，不搞创新”。根据已安装0.81.1源码，该选择映射为 **B**。

**Classification:** `confirmed by evidence`。Pi发给provider的context始终从current leaf沿parent chain构造；`/tree`是显式UI导航，并可选择把离开的branch摘要附到新位置。Pi没有model-facing cross-tree content search。因此`aili_search_context`只搜索current branch；其他branch必须由用户显式`/tree`切换，不提供`session_tree`scope。

**Write-back targets:** search tool contract, privacy/bounds scenarios, test plan。

### R6-Q4 — 默认启用与配置优先级

请选择：

- **A（推荐）：** runtime默认enabled；global `~/.pi/agent/aili-compact.jsonc` < project `.pi/aili-compact.jsonc` < append-only per-session command state。custom prompts使用对应global/project `aili-compact-prompts/`；不自动创建/修改配置文件，只有显式命令才写。
- **B：** global config only，默认enabled。
- **C：** 每个session必须显式opt-in，默认disabled。
- **D：** 自定义路径、precedence或write policy。

**Answer:** 用户选择 **A**。

**Classification:** `confirmed`。Runtime默认enabled；global `~/.pi/agent/aili-compact.jsonc` < project `.pi/aili-compact.jsonc` < append-only per-session command state；custom prompts使用对应global/project目录；只在显式写命令下创建或修改文件。

**Write-back targets:** config/state contract, bootstrap/docs, tasks, tests。

### R6-Q5 — rare Pi overflow之后的旧block恢复语义（源码核对后修订）

**Pi 0.81.1原生行为：**

1. `/compact`、threshold和overflow共用append-only `CompactionEntry`。
2. 原消息不从JSONL/tree删除；active provider context变成compaction summary + recent tail。
3. Overflow error保留在session history，但从retry context移除；失败响应最多compact-and-retry一次。
4. Extension可通过`session_before_compact`按`manual|threshold|overflow`取消或提供custom compaction。

**Pinned prior-art行为：**

1. 正常compress只是provider-time隐藏host raw messages并注入summary recap；decompress停用block后，raw messages在后续context重新出现。
2. 100% major GC截短old-generation summaries，并可能把多个summary合并成一个；它不直接删除host raw messages。
3. 它没有接管OpenCode native compaction。检测到host compaction会重置transient IDs；若anchor已从host message list消失，会停用该block，因此没有cross-native-compaction active-restore保证。

**结论：** Pi比该prior art多一个可靠能力：Extension可从只读`sessionManager.getBranch()`取得emergency compaction前的原entries。因此严格query-only过于保守，但也不能无预算重建整个old epoch，否则会重现刚刚的overflow。

请选择：

- **A — strict archive：** overflow前blocks只可search/query，不可active restore。最简单，但放弃Pi仍保存raw branch这一能力。
- **B（源码核对后的推荐）— guarded cross-epoch restore：** native compaction summary仍是new-epoch baseline；旧blocks默认archived。显式`aili_decompress`只有在current-branch entry identity、完整tool protocol atom、state digest和hard projected-token budget全部通过时，才把选中raw content作为provider-only exact restore overlay激活，直到recompress。任何检查失败均不改变state，明确返回原因并降级为bounded search excerpts；不得恢复整个epoch或绕过emergency reserve。
- **C：** emergency overflow后禁用AILI Compact直到新session。
- **D：** 自定义restore/failure policy。

**Answer:** 用户要求“按照Pi原生的走”，映射为 **A**。

**Classification:** `confirmed by evidence`。Emergency Pi compaction后，active context严格使用native compaction summary + kept tail；pre-compaction AILI blocks进入archived/query-only状态。`aili_decompress`不得把它们跨epoch重新注入provider context，必须明确返回archived/unrestorable；原entries仍留在JSONL/tree，可由current-branch bounded search或用户显式tree navigation查看。新epoch重新开始AILI compression state。

**Rejected after source comparison:** guarded cross-epoch restore虽技术可行，但偏离Pi原生行为，用户明确要求不采用。

**Write-back targets:** epoch/replay/decompress contract, fault injection, test plan。

## Round 6 Ingestion Result

- Search follows Pi: current active branch only; no cross-tree model search.
- Emergency recovery follows Pi: native summary + kept tail starts a new epoch; no cross-epoch active decompression.
- All five Round 6 answers are confirmed and the decision frontier is empty.
- User-facing naming remains exclusively AILI Compact / `aili-compact`.
- Final shared-understanding rule: Pi is authoritative for persistence/search/tree/provider-context/native-epoch mechanics; pinned prior art is authoritative only for adaptable compression policy and UX. No prior-art storage model may override Pi append-only Session behavior.

## Post-Grilling Writeback Queue

1. Reconcile `proposal.md`, `context.md`, `design.md`, capability spec and `tasks.md` with all material decisions.
2. Derive exact tool schemas, default thresholds, protected tools and nudge policy from pinned evidence while adapting only Pi host differences.
3. Rewrite the stale private-BUILD `test-plan.md`, strict-validate it, then request explicit test-plan acceptance.
4. Named provider/model live requests, exact dependency/version/lockfile changes, source-copy operations, BUILD, Git, version and release remain separate approvals.

## Domain Terms Awaiting Resolution

- `AILI Compact` / `aili-compact`：已解决的canonical product/runtime name。Command为`/aili-compact`，model tools使用已确认的`aili_*`namespace；ACP/DCP只作为provenance/source reference，不是user-facing alias。
- `全部移植`：Pi-adapted full functional parity已确认；排除OpenCode-only installer/update/migration/auth plumbing。
- `正式版就是测试版`：**已解决**。使用单一代码线，未来发布正常新version；任何version/release动作仍需用户单独明确批准。
- `会话JSON完整`：**已解决**。指Pi-persisted Session entries保持append-only完整，provider-time projection可压缩；不扩展为Pi持久化前stdout archive。

## Requirements-Grilling Readiness

`READY`：material decision frontier为空；用户已明确确认“Pi host/session semantics + prior-art compression behavior”的precedence rule，可进行DEFINE material writeback。该状态不接受旧test plan、不授权BUILD或任何exact operation；public release仍有named license blocker。

## Next Action

Requirements grilling结束。下一步是material writeback和重写private-BUILD test plan；在用户明确接受新test plan之前，BUILD readiness仍为blocked。

## Superseding Public-License Decision — target 0.1.13

### User decision

在 0.1.12 已存在、目标改为 0.1.13 后，用户明确选择许可路线 **B**：整个 `@rosetears/aili-pi` Package 从 0.1.13 起采用 `AGPL-3.0-or-later`，保留AILI Compact进入公开包。

### Classification

- `confirmed` + `material-delta`：改变package-wide public license、provenance、SBOM、notice、release validator和candidate acceptance。
- Prospective only：不宣称撤销 0.1.12 及更早版本已授予的许可。
- Third-party licenses preserved：现有MIT/OFL/Apache等依赖与adaptation声明不得被批量改写。
- Pinned reference identity：`ranxianglei/opencode-acp@v1.12.6`、commit `f1a33d9f4ce55af808eb4e050717c914ed16084b`、`AGPL-3.0-or-later`进入packaged provenance/notice；当前事实仍为no direct source/prompt/schema/fixture/asset copy。
- This decision resolves the route only. Production license/version edits, live probes, commit/push/tag/publish/GitHub release/install remain separately gated.

### Write-back and readiness

Owning artifacts and direct dependents were revised. The prior private-BUILD test-plan acceptance is stale for public relicensing. Readiness is `BLOCKED_PENDING_REVISED_TEST_PLAN_ACCEPTANCE` until the user accepts the new package-wide AGPL/0.1.13 test plan.

## Superseding Exclusive-Compaction Decision — 2026-07-27

### User decision

After direct comparison with pinned `ranxianglei/opencode-acp@v1.12.6`, the user rejected the previously selected Pi overflow emergency fallback and selected option **B** from the focused implementation question: the AILI bootstrap SHALL automatically modify user-global Pi settings so AILI Compact is the exclusive compression and GC owner.

### Confirmed behavior

- Exact HOME target: `/home/rosetears/.pi/agent/settings.json` for the current user; packaged bootstrap generalizes this as `~/.pi/agent/settings.json`.
- Bootstrap atomically merges `compaction.enabled=false`, preserves unrelated settings, is idempotent, and refuses malformed/non-object JSON without replacement.
- AILI independently runs provider-free major GC before provider projection at its emergency boundary; this path must not depend on Pi `session_before_compact`.
- Every delivered Pi `manual|threshold|overflow` compaction event is cancelled while AILI is enabled. No new Pi-generated summary or compact-and-retry fallback is permitted.
- If AILI GC cannot recover enough budget, the provider overflow error is surfaced truthfully.
- `/aili-compact off` does not silently undo the user-global Pi setting; the documented consequence is that no automatic compaction owner remains until the user re-enables one.
- Historical Pi compaction entries remain replayable ancestry and are not rewritten.

### Classification and write-back

- Classification: `confirmed` + `material-delta` + exact user-HOME write approval.
- Supersedes Round 5 Q2 option B and Round 6 emergency-fallback summaries for future compaction behavior.
- Affected artifacts: `proposal.md`, `context.md`, `design.md`, capability spec, `tasks.md`, `test-plan.md`, runtime/bootstrap/settings tests, doctor and README.
- Requirements-grilling readiness: `READY`.

### Final test-plan acceptance

- On 2026-07-27 the user replied “开始” to the explicit renewed-acceptance prompt.
- Classification: confirmed final `test-plan.md` acceptance plus BUILD authorization for tasks 10.1-10.5.
- Exact HOME merge remains authorized only after implementation and focused checks; Git/provider/TUI/publish/release remain unauthorized.
