# 测试文档：fix-permission-mode-multiline-glob-matching

## 0. 文档元信息

- 来源：`proposal.md`、`context.md`、`design.md`、`specs/permission-mode-pattern-semantics/spec.md`、会话 `019f8f59-b8bd-7f7d-b6cd-17ce358bac81`、`pi-permission-modes@2.2.0` 源码与当前 AILI permission tests。
- 生成时间：2026-07-23。
- 适用版本 / 分支：Pi 0.81.1、`pi-permission-modes@2.2.0`、upstream revision `23d65d10a53b67043cae42322acf9044d6edb196`、当前 `fix/quota-animation-subagent-label` 工作树中的独立 change。
- 状态：`implemented / targeted verified`。用户于 2026-07-24 授权仓库内实现和重复本地测试；dependency/lockfile、全局安装、Git、publish/release仍未授权。

## 1. 被测对象、目标与边界

- 被测对象：基于 exact 2.2.0 的 AILI permission-mode adapted runtime、共享 glob matcher、policy composition、真实 Extension dispatcher 和 provenance/release evidence。
- 要支持的完成 / 接受 claim：所有 pattern-map surface 的 `*`/`?` 均包含 line terminator；stock YOLO 对多行 Bash不再询问；自定义 ask/deny、overlay、sandboxed modes和 fail-closed规则不弱化；Package真实加载 adapted entry且可审计。
- In scope：adapted permission runtime/lock、`src/runtime/native-integrations.ts`、`tests/unit/permission-patterns.test.ts`、`tests/integration/generic-permission.test.ts`、新增真实 dispatcher fixture、permission sandbox regressions、provenance/SBOM/notices/doctor/release/docs。
- Explicitly out of scope：subagent inline SDK、quota/theme、`/sandbox` 通知不可见、network产品语义重设、credential guard重设、真实全局 Pi home、publish/release。
- 当前根因复现：单行 YOLO Bash通过；多行 heredoc进入 `decide(...)->fallback ask->unsandboxed prompt`；拒绝后返回 `bash blocked`。

## 2. 需求 / 决策 / 风险追踪

| ID | 需求 / 决策 / 风险 | 来源 | 任务 | 主要文件 / Artifact | 验证 | 预期证据 | 状态 |
|---|---|---|---|---|---|---|---|
| GLOB-1 | `*`/`?` 覆盖全部 line terminator | spec Req 1；design D1 | 2.2, 3.1 | adapted `resolve.ts`、unit fixture | pure matcher matrix | `\n`/`\r`/U+2028/U+2029 全通过；single/empty/UTF-16边界正确 | implemented |
| GLOB-2 | escaping/home/anchoring/last-match 不漂移 | spec Req 1 | 2.2, 3.1 | matcher fixture | positive/negative golden cases | only wildcard line-terminator semantics changes | implemented |
| YOLO-1 | 多行/heredoc YOLO 无确认 | spec Req 2；会话证据 | 3.3 | adapted entry、dispatcher fixture | fake UI `select` spy + actual bash tool execution | 多条不同命令 `select=0`、无 `bash blocked`、命令完成 | implemented |
| YOLO-2 | 项目外多行命令同样允许 | spec Req 2 | 3.3, 3.5 | disposable command fixture | harmless `/tmp` command | no permission-mode prompt；0 business writes | implemented |
| POLICY-1 | custom unsandboxed ask/deny 保留 | spec Req 3；design D4 | 2.4, 3.4 | dispatcher fixture | ask/deny/no-UI matrix | ask prompts；deny blocks；headless ask denies | implemented |
| POLICY-2 | overlay/most-restrictive/fallback 保留 | spec Req 3 | 3.2 | resolver policy fixture | base+overlay matrix | deny > ask > allow；no-match remains ask | implemented |
| SURF-1 | 共享 surface 不只 Bash | spec Req 4；用户要求 | 3.2, 3.3 | unit/integration policy fixtures | all-surface pure matrix + file/external/query dispatcher | multiline target无意外 fallback或deny bypass | implemented |
| ADAPT-1 | exact 2.2.0 可复现适配 | spec Req 5；design D2 | 1.2, 2.1, 4.1 | upstream lock、adapted source、license/provenance | generated drift + hash inspection | revision/file/hash/diff/license完整 | implemented |
| ADAPT-2 | scoped npm布局中 dependency被hoist | spec Req 5；design risk | 2.5, 3.1 | package resolver + generated fixture | fake `node_modules/@rosetears/aili-pi` caller + ancestor dependency | generator/validator解析 exact ancestor package，不依赖 Package-local嵌套路径 | implemented |
| LOAD-1 | Package只加载一个 adapted handler | spec Req 5 | 2.3, 3.3 | native integration、extension-load fixture | command/tool/handler diagnostics | `/perm` 单实例；无 vanilla+adapted重复 | implemented |
| EVID-1 | doctor/release不 false PASS | spec Req 5 | 4.2 | manifests/validators | baseline/path/hash/semantic checks | exact permission adaptation通过；drift使 gate失败 | implemented |
| DEP-1 | dependency/lockfile 另行批准 | spec Req 6 | 1.3, 5.3 | package files/final diff | scoped diff inspection | dependency declarations与lockfile无 task-owned diff | implemented |
| RISK-1 | deny pattern跨行被绕过 | design Risks | 3.1, 3.2 | negative matcher/policy corpus | multiline deny cases | deny稳定命中 | implemented |
| RISK-2 | 只测 helper 导致真实 UI仍询问 | design D3 | 3.3, 3.4 | full dispatcher harness | `ctx.ui.select` call count | stock YOLO 0；custom ask 1 | implemented |

## 3. Pure matcher matrix

| Case | Pattern | Target | Expected |
|---|---|---|---|
| MAT-01 | `*` | empty / single line | match |
| MAT-02 | `*` | `a\nb` | match |
| MAT-03 | `*` | targets containing `\r`, U+2028, U+2029 | match |
| MAT-04 | `prefix?suffix` | each one-code-unit line terminator | match |
| MAT-05 | `prefix?suffix` | zero or two intervening code units | no match |
| MAT-06 | escaped literal metacharacters | same literal target | existing match semantics unchanged |
| MAT-07 | `~` / `$HOME` patterns | expanded single/multiline target | existing expansion semantics unchanged |
| MAT-08 | `*` allow then `*secret*` deny | multiline target containing secret token | final deny wins |
| MAT-09 | specific ask then later allow | multiline target matching both | last matching pattern wins |

## 4. Dispatcher / permission scenarios

| ID | Mode / Input | Expected result | 状态 |
|---|---|---|---|
| DISP-01 | stock YOLO, two-statement multiline Bash | no UI select; execute unsandboxed | implemented |
| DISP-02 | stock YOLO, harmless heredoc | no UI select; no `bash blocked` | implemented |
| DISP-03 | stock YOLO, multiline command under `/tmp` | no UI select; no write | implemented |
| DISP-04 | stock YOLO, two different multiline commands | both no prompt; no session grant needed | implemented |
| DISP-05 | custom unsandboxed `bash:ask` | one prompt; deny returns `bash blocked` | implemented |
| DISP-06 | custom unsandboxed `bash:deny` | block before execution; no allow override | implemented |
| DISP-07 | custom no-UI ask | fail closed without execution | implemented |
| DISP-08 | Build multiline command | existing sandbox execution and network policy unchanged | shared-matcher + existing sandbox regression passed |
| DISP-09 | Plan multiline command | read-only sandbox/Markdown rules unchanged | shared-matcher + existing sandbox regression passed |
| DISP-10 | Default multiline command | existing ask/session semantics unchanged | shared-matcher + existing permission regression passed |
| DISP-11 | project overlay multiline deny | overlay wins over base allow | implemented |
| DISP-12 | file path containing actual newline in disposable Unix fixture | shared path/file patterns resolve correctly | implemented |
| DISP-13 | custom multiline web/query target pattern | no accidental fallback; configured action returned | implemented |

## 5. 选定验证

| Claim | 命令或检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| matcher/policy root fixed | `npx vitest run tests/unit/permission-patterns.test.ts tests/integration/generic-permission.test.ts` | 直接覆盖 shared matcher和composition正反例 | 不单独证明真实 Extension不提示 |
| dispatcher不再 false prompt | `npx vitest run tests/integration/permission-modes.test.ts` | 捕获真实 adapted `tool_call` handler、UI select次数及 harmless bash执行 | 不证明真实全局 Pi已安装 |
| sandboxed modes无回归 | `npx vitest run tests/integration/permission-sandbox.test.ts` 加受影响 permission fixtures | 保留 Build/Plan/Default runtime boundary | 不声明 OS sandbox绝对隔离 |
| package只加载 adapted entry | extension/package runtime integration test | 验证实际 Package注册而非只测 helper | 不授权写 `~/.pi/agent` |
| provenance真实 | `npm run validate:provenance`; generated lock/hash validator | 检查 baseline、diff、license、SBOM与声明 | 不代表 upstream已合并 |
| 全仓受影响面 | `npm run typecheck`; `npm test`; `npm run validate:capabilities`; `npm run validate:release` | 捕获类型、现有 integration、doctor/release回归 | 不授权 publish/release |
| Package边界 | `npm run validate:package`; `npm pack --dry-run --json`; tarball inspection | adapted runtime/license包含且无无关文件 | 不执行安装 |
| OpenSpec/diff | `openspec validate fix-permission-mode-multiline-glob-matching --strict`; `git diff --check` | 格式与文本完整性 | 不证明行为已实现 |

## 6. Fault injection / false-PASS checks

| ID | 注入 | Expected |
|---|---|---|
| FI-01 | 移除 RegExp dotAll修订 | multiline matcher和dispatcher tests同时失败 |
| FI-02 | 仅在 YOLO handler hardcode allow | custom ask/deny或shared-surface tests失败 |
| FI-03 | 把 fallback改为 allow | sparse/no-UI fail-closed tests失败 |
| FI-04 | 加载 vanilla与adapted两个 entry | duplicate command/handler diagnostic失败 |
| FI-05 | 修改 adapted source但不更新 lock | generated/provenance validation失败 |
| FI-06 | provenance仍写 unmodified dependency | provenance/release validation失败 |
| FI-07 | 只授予第一条 multiline ask session grant | 第二条 stock YOLO命令仍必须因 policy allow而不询问；若询问则失败 |

## 7. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理 |
|---|---|---|---|
| Unverified | upstream后续 commit/release是否已有等价修复 | 未来采用本地 adaptation还是新 dependency | BUILD 前可做 bounded read-only check；采用新依赖需单独批准 |
| Resolved | generated two-file adaptation + lock/license/generator均在 tarball | Package size/provenance清单 | package dry-run与 exact lock已固化 |
| Unverified | 当前 Pi进程仍加载未更新的 installed Package；2026-07-24 对仓库实现完成后的真实 heredoc探针仍出现旧 `Allow bash?` 弹窗 | 不否定 repository adapted-dispatcher结果，但禁止声称 live/global已修复 | 仅在取得独立 `~/.pi/agent` install/update许可并启动新进程后做 live验证；当前不安装 |
| Out of scope | `/sandbox` 命令通知没有可见显示 | 不影响本 matcher root cause，但仍是 UI residual | 留给独立 UI change；本 plan不声称修复 |
| Out of scope | subagent omitted/auto inline SDK失败 | 独立 compatibility change | 由 `fix-subagent-inline-sdk-compatibility` 管理 |

## 8. Final acceptance gate

- [x] 用户于 2026-07-24 明确接受最终 `test-plan.md` 并授权仓库内 BUILD。
- [x] Separate gate preserved：未发生 dependency/lockfile、`~/.pi/agent`/installed `node_modules`、外部仓库、Git、publish/release/install mutation。
