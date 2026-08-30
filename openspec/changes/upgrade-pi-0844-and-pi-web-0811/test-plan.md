# 测试文档：upgrade-pi-0844-and-pi-web-0811

## 0. 文档元信息
- 来源：本 change proposal/design/spec/tasks；官方 Pi 0.84.4 changelog；Pi Web 0.8.10/0.8.11 release notes、npm/Git/source snapshots；当前 AILI Web/Prompt/Memory/Herdr 代码与测试
- 生成时间：2026-08-29
- 适用版本 / 分支：当前 `aili-pi` dirty 工作树；目标 Pi 0.84.4、Pi Web 0.8.11
- 状态：accepted（用户于 2026-08-29 明确接受并授权 repository-local BUILD）

## 1. 被测对象、目标与边界
- 被测对象：Pi 0.84.4 依赖/API/事件/RPC/compaction 行为适配，Pi Web 0.8.11 选择性移植，以及 AILI 现有行为保留。
- 接受 claim：仓库只使用目标 Pi 0.84.4 运行线；Pi Web 活跃基线为 0.8.11；选定优化可用；Gateway/BFF、lease、Herdr、Prompt、Memory 和 AILI UI 改动没有被上游覆盖。
- In scope：依赖/lockfile、源码锁、非浏览器单元/集成、Web build、包/生成/来源验证。
- Explicitly out of scope：Native Browser、Playwright/Browser E2E 执行、Web Push 自动订阅、上游 built-in subagents、Git/publish/release。
- 假设：Browser 测试文件可以更新，但执行必须等待用户后续单独授权。

## 2. 需求 / 决策 / 风险追踪
| 需求 / 决策 / 风险 | 来源 | 任务 | 验证命令 / 检查 | 接受证据 |
|---|---|---|---|---|
| 单一 Pi 0.84.4 依赖线 | spec exact baseline | 2.1–2.4 | `npm ls`; package/lock/version tests | 无 0.84.2/0.84.3 runtime copy；guards=0.84.4 |
| Pi 0.84.4 UI prompt events | official changelog | 3.1 | Prompt/Interaction integration tests | waiting activity 可见；pending/authority 未变化 |
| RPC clear_queue | official changelog | 3.2 | Gateway/RPC queue tests | bounded returned+removed；无 direct browser RPC |
| 大工具结果压缩顺序 | official changelog + memory contract | 3.5 | lifecycle integration fixture | checkpoint before unchanged compaction; assistant resumes |
| resume/message ordering/toolChoice fixes | official changelog | 3.4, 3.6 | JSONL/order/compaction tests | no corruption/provider ordering rejection |
| exact Pi Web 0.8.11 lock | proposal/source evidence | 1.2–1.5 | `node --experimental-strip-types scripts/validate-web-source-locks.ts`; source inventory/package tests | exactly one active 0.8.11; historical 0.8.9 independently valid; both absent from pack |
| dirty tree preservation | user requirement + design D11 | 1.1, 6.4 | pre/post `git status --porcelain=v2`; `cmp` task baseline; write-scope inspection | unrelated/pre-existing bytes unchanged |
| 保留 AILI mutation owner | active D-19 + new spec | 1.6, 5.3 | `tests/unit/web-lifecycle-static.test.ts`; `tests/unit/web-foreground-dispatch.test.mjs`; direct route fixtures | all mutating API methods terminate at Gateway or reject; no force removal |
| 保留 AILI UI/Agent/Prompt/Memory | design D3/D10 | all packages | mount/command/extension tests | no missing surface or duplicate owner |
| ANSI/icons/zh-TW/Project Info/dialog/settings | Pi Web releases | 4.1–4.6 | component/helper/registry tests | selected improvements present, direct writes absent |
| pagination/opaque lazy images | Pi Web 0.8.10 | 5.1–5.2 | BFF history/media tests | bounded cursors; no raw session/entry ID |
| built-in subagents/direct routes excluded | design D9 | 1.3, 5.4 | source/import/negative scans | no second Agent/RPC/mutation owner |
| generated/package consistency | project rules | 6.1–6.4 | typecheck/build/full validators | all active artifacts target final versions |

## 3. 选定验证
| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| Dependency/runtime convergence | `npm install --ignore-scripts`; `npm ls @earendil-works/pi-agent-core @earendil-works/pi-ai @earendil-works/pi-coding-agent @earendil-works/pi-tui`; `tests/unit/package.test.ts`; `tests/integration/pi-0821-model-metadata.test.ts` | 证明解析图和 guards | 不证明 UI 行为 |
| Pi extension compatibility | `tests/unit/prompt-middleware.test.ts`; `tests/unit/interaction-broker.test.ts`; `tests/integration/automatic-memory-extension.test.ts`; `tests/integration/persistent-agent-production.test.ts`; new 0.84.4 event/order fixtures | 覆盖 0.84.4 变更触及的事件与 owner | 不证明真实浏览器布局 |
| Web selected ports | existing/new `src/web/**/*.test.mjs` for ANSI/icon/i18n/project-info/settings/pagination/media | 覆盖纯逻辑、DOM-independent contract | dialog scrolling/iOS spacing/clipboard UI remain `Unverified` |
| Gateway preservation | `tests/unit/web-lifecycle-static.test.ts`; `tests/unit/web-foreground-dispatch.test.mjs`; `tests/unit/web-access-policy.test.ts`; `tests/unit/session-writer-lease.test.ts`; `tests/integration/web-session-runtime.test.ts` | 检测 direct mutation/identity leak | 不证明生产公网安全 |
| Build/package/source | `npm run build:web`; `npm run validate:package`; `npm run validate:generated`; `npm run validate:provenance`; `npm run validate:compatibility`; `node --experimental-strip-types scripts/validate-web-source-locks.ts` | 证明可构建和来源一致 | 不授权发布 |
| Repository regression | `npm run typecheck`; `npx vitest run --no-file-parallelism` | 覆盖交叉回归 | 不执行 Browser/E2E |
| Formal consistency | `openspec validate upgrade-pi-0844-and-pi-web-0811 --strict` | 检查 artifacts/scenarios | 不等于用户接受或发布准备 |

## 4. 条件性失败路径

- 0.84.4 类型/API 不兼容：停止对应包，不回退混用 0.84.2。
- Pi Web source/hash/identity 不匹配或 active/historical 记录不唯一：停止导入，不使用浮动 latest。
- 上游改动要求第二 Agent/RPC/mutation owner：记录 excluded，不做近似实现。
- `/api/git/checkout`、`/api/worktrees` 或其他 direct mutation 未完成 Gateway 收口：阻断后续 mutation-heavy port；force remove 必须不可达。
- `cmp` 发现 unrelated/pre-existing dirty bytes 漂移：立即停止相关包，不用 reset/stash/checkout 修复。
- Web build 失败：定位 source/dependency drift；不删除 AILI 功能绕过。
- Browser 执行未授权：标记 `Unverified`，不声称视觉/E2E 通过。

## 5. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Verified | Pi 0.84.4 安装后 GPT-5.6 exact metadata | model fixtures | 已读取安装后的官方 registry；Parent/managed/Herdr 选择测试通过 |
| Verified | Pi Web 0.8.11 source APIs 在 Pi 0.84.4 下的编译差异（上游自身为 0.84.3） | selective ports | 已以 0.84.4 types 完成 Web production build；依赖图无 0.84.3 副本 |
| Deferred | Web Push 与 mutation-heavy settings | privacy/owner | 不纳入本 change，负向测试 |
| Unverified | Browser/mobile visual flows、滚动、iOS spacing、真实 clipboard disclosure | UI acceptance | 等待 Native Browser/Browser QA 单独授权；非浏览器 BUILD 不得宣称这些已验收 |

## 6. Final acceptance gate
- [x] 用户明确接受最终测试计划（2026-08-29）
- [x] 用户授权 repository-local BUILD（包含 Pi dependency/lockfile 更新和 0.8.11 source snapshot import，2026-08-29）
- [ ] Browser/E2E 仍未授权，实施期间不得执行

## 7. Final non-browser execution evidence（2026-08-29）

- Pi 0.84.4 聚焦组：12 个测试文件、82 个测试通过。
- Pi Web/Gateway 聚焦组：Vitest 9 个测试文件、41 个测试通过；Node Web 合同测试 22 个通过。
- 最终全量：126 个测试文件通过、2 个按既有门禁跳过；874 个测试通过、2 个跳过。
- `npm run typecheck`、`npm run build:web`、package/generated/provenance/SBOM/compatibility/capabilities/doctor/audit-redaction、Web source locks、OpenSpec strict validation 全部通过。Web build 仅保留既有 dynamic export-route warning。
- `npm ls` 显示 agent-core/ai/coding-agent/tui/client/protocol/telemetry 均收敛到 0.84.4。
- 最终 `npm pack --dry-run --json` 共 9,450 个文件；`src/web/`、两个 Pi Web source snapshots 和 `scripts/build-web.ts` 均未进入包。
- 最终 mutation inventory 对每个 POST/PUT/PATCH/DELETE 路由都有显式 disposition；session auto-name、models/plugins/skills/MCP/keybinds/project-trust 经 Gateway，Git/Worktree mutation fail closed，无 force removal。
- 最终 dirty-tree 对比保留全部 339 个原有 dirty path；新增 537 个 path 全部位于已授权 upgrade write scopes；24 个 byte baseline 文件均存在且为任务内有意修改，未执行 stage/reset/stash/checkout/clean/delete。
- Native Browser、Playwright/Browser E2E、Git mutation、publish/release 均未执行；视觉滚动、iOS safe-area 与真实 clipboard 行为继续保持 `Unverified`。
