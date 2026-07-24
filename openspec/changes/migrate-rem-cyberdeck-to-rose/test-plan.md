# 测试文档：完整 Rose 品牌增强版

## 0. 文档元信息

- 来源：`proposal.md`、`design.md`、`context.md`、`interview.md`、`tasks.md`、`specs/rose-working-animation/spec.md`、`specs/rose-cyberdeck-branding/spec.md`，以及当前 Matrix/Header/Zentui/theme/package/tests 与 Pi 0.81.1 Extension/TUI 类型和实现证据
- 生成时间：2026-07-24
- 适用版本 / 分支：当前 `fix/quota-animation-subagent-label` 工作树；目标 package 版本和 release 操作不在本计划授权范围
- 状态：**ACCEPTED — BUILD implementation complete; manual TUI/provider items remain Unverified**

## 1. 被测对象、目标与边界

- **被测对象：** 单一 Rose Shimmer + 四行 Rose Code Rain Widget、共享动画时钟、四阶段状态机、真实 usage/耗时、无空白行兜底、深浅外观、Matrix/Zentui 配置兼容、`rose-cyberdeck` 主题/Header/Zentui/文档品牌迁移及第三方归属保持。
- **要支持的接受 claim：** 在官方 Pi 0.81.1 TUI 中，符合条件的活动 run 只显示一个五行 Rose 工作 Widget；状态、宽度、颜色、并行工具和清理行为符合 spec；产品 canonical 品牌为 Rose；legacy 配置/命令可安全迁移；未报告的 token 不被估算；上游归属不被改写。
- **In scope：** `extensions/matrix/**`、`extensions/header/**`、受 Rose gradient/config 影响的 `extensions/zentui/**`、Rose-owned head asset、`themes/`、`package.json`、README、package-owned notice/provenance/SBOM inputs/outputs、相关 `tests/unit/` 与必要的 `tests/integration/` fixtures。
- **Explicitly not run / out of scope：** 本 DEFINE 不实现、不运行测试、不修改用户 Home 配置、不启动真实 provider/subagent、不安装/发布、不修改 dependency/lockfile、不执行 commit/push/tag/release。`npm run validate:release` 中需要新外部 live evidence 的部分属于后续单独授权的 SHIP gate，而非 BUILD 自动权限。
- **适用假设：** Node `>=22.19.0`、TypeScript 5.9、Vitest 4.1.9、官方 Pi 0.81.1、Linux TUI；未知自定义主题在 auto 模式下 fail closed，故无需猜测其背景。

## 2. 需求 / 决策 / 风险追踪

| ID / 需求、决策或风险 | 来源 | 任务 | 文件 / Artifact | 验证命令 / 检查 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|---|
| RWA-1 五行统一 Widget、无内部空行、原生 Working Line 隐藏 | working spec: contiguous Widget | 3.1, 6.1, 6.2 | `extensions/matrix/**`, `tests/unit/matrix.test.ts` | focused Vitest + fake UI spy | active render exactly 5 lines; index 0 Shimmer, 1-4 rain; no empty separator; active `setWorkingVisible(false)` | planned |
| RWA-2 单一动画时钟 | working spec: shared clock | 3.1, 3.4, 6.2 | Matrix lifecycle fixture | Vitest fake timers | repeated start has one timer; no independent working-indicator/Shimmer interval | planned |
| D-STATE-B `tool → requesting → working` | `interview.md` Q-002 | 3.2, 6.2 | Matrix state controller/tests | event-table fixture | last tool end enters requesting; first subsequent text event enters working | planned |
| RWA-3 并行工具与异常 end 安全 | working spec: four-phase state | 3.2, 6.2 | lifecycle fixtures | parallel/out-of-order/duplicate event tests | phase stays tool until set empty; unknown end cannot underflow/change phase | planned |
| RWA-4 逐字符 Shimmer 与 exact frames/colors | working spec: per-character highlight | 2.1, 2.2, 6.1 | Rose palette/Shimmer renderer tests | 120ms deterministic timestamp snapshots + ANSI color inspection | exact ten-frame sequence; four-char bidirectional band; no whole-line flash/second timer; dark/tool/light colors exact | planned |
| RWA-5 精确耗时与真实 usage only | working spec: exact stats | 2.2, 3.2, 6.1, 6.2 | Shimmer/state tests | usage fixture with missing/zero/increasing/decreasing values and multiple assistant-message boundaries | elapsed hidden before 30s; completed usage summed once; current partial added without double-count; absent/decreasing usage produces no estimate | planned |
| RWA-6 几何节奏、glyph、96 tracks、超宽覆盖保持 | working spec: deterministic geometry | 2.3, 6.1 | Matrix geometry tests | widths 40/80/120/240/320/640 | geometry-only digest stable at ordinary width; glyph width=1; <=96 tracks; first/final deciles covered ultra-wide | planned |
| RWA-7 83.3% 蓝系、Rose accents、无绿色 | working spec: palette | 2.1, 2.3, 6.1 | palette tests | exact constant inspection | 10/12 blue/cyan/ice, 2/12 Rose; no green; violet reserved for tool Shimmer | planned |
| RWA-8 每帧四行无空白 | working spec: blank-row repair | 2.4, 6.1 | pure grid repair + Matrix render tests | synthetic empty/partial grids + timestamp property samples | repair extends vertical structure; all-empty gives 4-row track; every rain row non-space and fallback contrast >=2:1 | planned |
| RWA-9 每行 width 严格相等 | user acceptance + TUI contract | 2.2, 2.4, 6.1 | renderer tests | `visibleWidth` at 40/80/120/240/320/640, dark/light/all phases | all five lines equal requested width; ANSI reset/truncation does not alter width | planned |
| RWA-10 appearance 解析与未知主题 fail closed | working spec: appearance | 2.1, 4.3, 6.1, 6.2 | appearance/start/invalidation tests | known light/dark/rose/legacy/unknown and active theme-change fixtures | correct fade target and derived palette; unknown start installs nothing; active change to unknown stops animation and restores native Working Line | planned |
| RWA-11 完整清理与恢复 | working spec: lifecycle cleanup | 3.3, 6.2 | fake UI/timer lifecycle tests | agent_end/switch/shutdown/repeated stop | Widget cleared; timer/tool IDs/usage/cache/context cleared; default message/indicator + visible true restored; stale generation inert | planned |
| RWA-12 canonical/legacy Matrix 命令与配置 | working spec: commands/config | 4.1, 4.2, 6.3 | disposable HOME fixtures | command handler + config filesystem tests | `/rose-matrix` full surface; alias warning; explicit `version: 2`; atomic migration; non-4→4; corrupt/unsafe no overwrite; old file retained | planned |
| RCB-1 只发布一个 `rose-cyberdeck` theme | branding spec: canonical theme | 5.1, 6.4 | theme/package tests | focused Vitest + schema/resource inspection | package declares one Rose theme; no formal duplicate Rem theme; all required tokens | planned |
| RCB-2 Header/owned names/README 统一 Rose | branding spec: owned surfaces | 5.1, 5.5, 6.4 | Header/package/README/naming inventory tests | focused Vitest + bounded grep classification | `ROSE CYBERDECK`; canonical Rose commands/terms; remaining Rem/Sakura only approved exceptions | planned |
| RCB-3 Zentui Rose gradient 与 config fallback | branding spec: Zentui | 5.2, 5.3, 6.3, 6.4 | Zentui gradient/config tests | exact gradient/symbol/config fixtures | Rose symbols/colors used; legacy Rem config read; first explicit save writes new path atomically; old retained | planned |
| RCB-4 旧主题 setting 非静默提示 | branding spec: legacy theme guidance | 5.4, 6.4 | settings parser/notification fixtures | single theme, light/dark pair, non-match tests | exact token replacement guidance; pair other side preserved; settings file unchanged; no false warning | planned |
| RCB-5 上游身份和许可保持 | branding spec: provenance | 5.5, 6.5, 6.6 | notices/manifests/provenance tests | `npm run validate:provenance` + source assertions | upstream name/URL/revision/license/NOTICE/SBOM identity exact; local adaptation text truthfully says Rose | planned |
| RISK-1 Native Working Line 组合限制 | `design.md` Risks | 3.3, 5.5, 6.2 | source/docs + lifecycle fixture | direct inspection | active ownership bounded; cleanup restores Pi default; inability to restore another extension customization documented | planned |
| RISK-2 Package 无依赖/lockfile drift、无内部 artifact 泄漏 | proposal boundaries | 6.5, 6.6 | package manifest/tarball | `npm pack --dry-run --json`, package tests, scoped diff | no dependency/lockfile change; no OpenSpec/tests/local state in package tarball | planned |
| MAN-1 真实深/浅终端视觉 | `context.md` Unverified | 6.6 | manual Linux TUI | separately authorized `/rose-matrix preview` under dark/light | contiguous five-line visual, readable shimmer/rain, no perceptual blank row | unverified |
| MAN-2 provider streaming usage availability | `context.md` Unverified | 6.6 | optional real provider observation | separately authorized provider run only | if provider reports usage it is exact; otherwise token field absent | unverified |

## 3. 选定验证

| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| Rose renderer、状态、迁移和 naming 行为 | `npx vitest run tests/unit/matrix.test.ts tests/unit/matrix-lifecycle.test.ts tests/unit/matrix-config.test.ts tests/unit/header.test.ts tests/unit/theme-migration.test.ts tests/unit/zentui-gradient.test.ts tests/unit/zentui-config.test.ts tests/unit/package.test.ts tests/unit/provenance.test.ts` | 直接覆盖纯渲染、fake clock/UI、文件迁移、theme/package 和 attribution 合同 | 不证明真实终端字体/颜色观感或 provider usage timing |
| TypeScript/Pi 0.81.1 API 合约 | `npm run typecheck` | 编译所有扩展和测试引用，捕获事件/UI/type 不兼容 | 不证明 runtime layout 或颜色观感 |
| 全仓相关回归 | `npm test` | 覆盖 Header/Zentui/package/provenance 等相邻既有行为 | 不替代针对每帧 invariant 的纯函数测试或手工 TUI |
| 生成物与第三方归属 | `npm run validate:provenance` 及现有 applicable generated validators | 验证 source identity、revision、notice/SBOM 与生成边界 | 不授权刷新 dependency/lockfile、外部 live evidence 或 release |
| 包边界 | `npm run validate:package`、`npm pack --dry-run --json` | 验证唯一 theme resource、包内文件和禁止 artifact | 不发布或安装 package |
| OpenSpec 一致性 | `openspec validate migrate-rem-cyberdeck-to-rose --strict` | 验证 proposal/spec/design/tasks 结构和 requirement scenarios | 不证明代码已实现 |
| 源码文本/格式卫生 | `git diff --check` + task-scoped diff inspection | 捕获 whitespace 错误并核对只触及 accepted scope | 不构成 commit/push/release 权限 |
| 真实视觉与 provider 差异 | 手工 TUI/provider checks，仅在分别授权后 | 自动 ANSI/fixture 无法完全证明终端渲染和 provider 报告时机 | 未授权前不得报告为已执行或通过 |

## 4. 条件性场景 / 边界 / 权限用例

1. **Unknown theme:** auto 模式不得隐藏原生 Working Line、创建 Widget 或启动 timer；只提示显式 appearance。
2. **Parallel tools:** 至少覆盖 2 个 tool IDs、逆序结束、duplicate end、unknown end、stream event while tool active。
3. **Usage:** missing、0-before-report、within-message monotonic increase/decrease、message-end commit、next-message reset、double-finalization、run restart；任何非真实值不得出现 token 字段。
4. **Blank repair:** 单空行、连续空行、全四行空、已有列冲突、width 40 与 640；兜底必须是纵向结构且颜色达到阈值。
5. **Config paths:** missing/valid/corrupt/unreadable/symlink-or-unsafe target、mode preservation、atomic temp cleanup、legacy file retention。
6. **Theme setting:** exact single value、legacy on light side、legacy on dark side、substring false positive、already Rose；检测不得写用户 setting。
7. **Brand inventory:** compatibility alias和 attribution 允许旧词；产品 README/Header/theme/config/symbol 中旧词失败。
8. **Lifecycle:** start→start、start→agent_end→shutdown、start→switch→shutdown、stale timer callback；最终均无残留。

## 5. 手工验收（另行授权）

1. 在 `rose-cyberdeck` 暗色主题下预览，确认第一行和四行雨连续、蓝系为主、Rose 为少量强调、四行始终可见。
2. 在 Pi built-in `light` 下预览，确认状态文字使用深派生蓝/ink、雨向 `#FAF7F2` 淡出且无棕灰脏色。
3. 在未知自定义主题的 auto 模式下确认动画不接管 Working Line，并显示一次 appearance 指引。
4. 观察 thinking、正文 streaming、两个并行工具和工具结束后的 requesting 状态。
5. 仅在真实 provider 操作被单独授权时观察 usage：有真实 usage 才出现 `output tokens`，否则字段缺席。

## 6. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Unverified | 真实 Linux 终端的字体、ANSI、深浅色视觉和 Pi 固定 Widget spacer 观感 | 阻止“真实视觉已通过”声明，不阻止实现纯函数/UI 合同 | BUILD 后单独授权手工 TUI；未执行时保持 Unverified |
| Unverified | provider 是否在 streaming 阶段提供真实 `usage.output` | 阻止对某 provider 的 live token 展示承诺 | 缺失时 fail closed 隐藏字段；真实 probe 需单独授权 |
| Unverified | `npm run validate:release` 是否因新 source hash 要求新 live evidence | 可能阻止后续 SHIP/release readiness | BUILD 只运行不需外部 probe 的 validators；SHIP 时按具体失败和权限单独处理 |

没有 material product、architecture、acceptance 或 decision-shaping research Open Question。

## 7. Final acceptance gate

- [x] 用户明确接受本最终 `test-plan.md`（2026-07-24，`/build接受测试，直接开始build`）。
- Acceptance effect: 仅在其他 target/rules/material/permission gates 同时满足时允许后续单独的 BUILD 请求；不授权 dependency/lockfile、用户 Home、外部 provider/TUI、Git、发布、安装或 release 操作。
- Acceptance record: accepted by explicit user BUILD request on 2026-07-24.
- BUILD verification record: focused 9-file Vitest set (40 passed), `npm test` (132 passed, 3 skipped), `npm run typecheck`, `npm run validate:provenance`, `npm run validate:package`, `npm run validate:release`, strict OpenSpec validation, `git diff --check`, and `npm pack --dry-run --json` (Rose theme present; no legacy theme entry) passed. MAN-1 and MAN-2 remain separately gated `Unverified`.
