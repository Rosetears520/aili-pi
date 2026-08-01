# `aili-pi` PR #1 后续改造说明：Pi Adapter、Formal Task Board 与 Skills 分发解耦

## 1. 文档目的

本文定义 `aili-workflows` 完成共享协议并发布精确 `rose-aili` 版本后，`aili-pi` 在 PR #1 及后续 BUILD 中需要完成的改造。

本文是第二阶段文档。前置共享协议未发布前，不得把 `add-file-task-board` 或 `separate-shared-and-pi-skill-distribution` 的实现项标为完成。

## 2. 当前基线

### 2.1 `aili-pi`

- 仓库：`Rosetears520/aili-pi`
- 当前主分支基线：`ff2e32f27a7ca1d213311abeba6ef402468696e8`
- 当前发布版本：`@rosetears/aili-pi@0.1.15`
- PR：`#1 docs: add four OpenSpec proposals`
- PR head：`ca326d3d4e827ed1c3905b24a82a65479e07aef6`
- PR 当前内容：34 个 OpenSpec 文档文件，未包含生产代码、依赖、lockfile、tarball 或 Runtime 实现。

### 2.2 当前共享基线问题

PR head 的 `upstream/aili-workflows.lock.json` 固定在：

```text
7eb35f357ad489f5841ee10dac1e44549c1bdb76
```

该 snapshot 自身也没有：

```text
.agents/skills/aili-delivery-flow/references/formal-task-board.md
```

因此 blocker 的正确表述是：

> canonical `aili-workflows` 需要先实现并发布 formal-board 和 Agent-selection 共享协议；`aili-pi` 随后固定该 exact release 并实现 Pi adapter。

不得再表述为“公开 `rose-aili` 只需追平 embedded fallback”，因为当前 embedded snapshot 也没有该协议。

## 3. 前置输入

开始 BUILD 前，必须把以下占位符替换为第一阶段真实发布信息：

```text
ROSE_AILI_VERSION=0.4.2
ROSE_AILI_COMMIT=bb1fedacc46d71045daa6257d121f2b71ba29d54
ROSE_AILI_NPM_GIT_HEAD=bb1fedacc46d71045daa6257d121f2b71ba29d54
ROSE_AILI_TARBALL_SHA256=df7c67af6acaa7e5080e81f5c7fab6b9dc77b5a24397a26240a527370cad206f
AGENT_SELECTION_PROTOCOL=aili-agent-selection/v1
FORMAL_TASK_BOARD_PROTOCOL=aili-task-board/v1
AGENT_SELECTION_REF_SHA256=562951ec896b351983223a4a04833c260d9570307a1688dbaf7032055ee4161d
FORMAL_TASK_BOARD_REF_SHA256=04343832b5cdfbde65f53f0a981a5f0e7c6e1b3507e65e5fdfbf2b3f696af58b
```

上述值于 2026-08-01 从 exact `rose-aili@0.4.2` npm metadata、`v0.4.2` 对应 Git commit 和下载后的 exact tarball 验证。npm registry SHA-512 与本地下载内容一致；SHA-256 为本地计算值。不得用未来移动后的 `@latest` 替换这组 release identity。

## 4. 本轮范围

### 4.1 进入 BUILD

- `add-file-task-board`
- `separate-shared-and-pi-skill-distribution`
- Pi 输出面、授权和 persistent Agent 适配所需的最小改动

### 4.2 不与本轮 release gate 绑定

- `improve-tui-interaction-and-wsl-image-paste`
- `replace-pi-native-fallback-with-aili-emergency-checkpoint`

这两个 proposal 可以继续留在 PR 中作为独立设计，但不得因为它们尚未实现而阻塞 formal task-board / distribution release，也不得因为 formal task-board 完成而宣称它们已经完成。

压缩 proposal 仍然是 upstream-blocked 设计，不是当前已修复能力。

## 5. 第一项：先修正 PR #1 的公开文档

在任何实现前，先修复 PR 的事实状态。

### 5.1 删除人类制品中的内部标签

对 PR 正文及所有公开 OpenSpec 文档删除英语或中文的内部证据状态标签前缀，包括“已知”“工具结果”“推断”“未验证”和框架内状态的方括号标签形式。不要在公开制品中复刻这些前缀。

保留不确定性，但用普通语言表达。例如：

```text
真实 Provider overflow 行为尚未验证。
```

不要在句首加内部状态标签。

### 5.2 删除不可移交的来源

不得把以下内容作为 accepted、done、verified 或 authorized 的依据：

```text
当前会话
本轮对话
用户刚才选择
agent://ses_REDACTEDxx
history://...
本地未提交 worktree
未随 PR 提交的 progress/handoff
```

用户决定必须把实际决定完整写入文档。Runtime ref 只能作为 internal supplemental metadata，不能是公共完成证明。

### 5.3 修正 blocker 基线

将所有类似表述：

```text
rose-aili 缺少 pinned snapshot 已有的 formal-task-board.md
```

改为：

```text
当前公开 rose-aili 与 PR head 的 embedded snapshot 都没有 formal-task-board
共享协议。解锁条件是 canonical aili-workflows 先实现并发布该协议。
```

### 5.4 重置不可验证的完成状态

PR 是 docs-only。凡是当前公开 diff 中不存在实现代码、测试或可访问 commit 的 package，必须改为：

```text
pending
blocked-upstream
not-independently-verifiable
```

不得继续把下列内容标为 `done`：

- 上游 19 个文件已修改；
- snapshot 已同步到不存在的公开 commit；
- formal parser/root/update/bootstrap bridge 已实现；
- 23/47/77/98/180 等测试已经通过；
- Agent session ref 已证明 pre-dispatch timing。

同一批生成的 `context.md`、`design.md`、`test-plan.md`、`review-report.md` 和 `tasks.md` 不能互相作为独立接受证据。

### 5.5 分离状态

公开文档至少区分：

```text
decision_status
contract_acceptance
implementation_authorization
implementation_status
verification_status
git_operation_status
release_status
```

测试计划接受不等于实现授权；实现授权不等于 commit、push、publish 或 release 授权。

## 6. 第二项：固定并消费新的共享协议

### 6.1 更新 upstream lock

更新：

```text
upstream/aili-workflows.lock.json
```

固定第一阶段 exact commit，并记录：

- `rose-aili` exact version；
- npm `gitHead`；
- tarball SHA-256；
- Skill tree hash；
- 两个协议 reference 的 SHA-256；
- canonical 19 role inventory。

### 6.2 repository-only snapshot

本轮允许暂时保留 repository-local `skills/**` 作为 generated verification baseline，但必须满足：

- 不属于 installed runtime resource；
- 不进入 npm tarball；
- 不由 `postinstall` 写入用户 HOME；
- 不允许语义手改；
- `verify:skills` 验证它与 exact upstream revision 一致；
- 文档明确它不是第二个 shared Skill owner。

后续可以单独改为 exact npm tarball/CI checkout 验证，但不要把该清理扩大进当前 PR。

## 7. 第三项：生成 Pi 专属 Agent Routing Projection

共享角色选择矩阵位于安装后的：

```text
~/.agents/skills/parallel-subagent-dispatch/references/agent-selection-matrix.md
```

源仓库 exact revision 中的对应路径用于生成 Pi adapter。

### 7.1 新增生成脚本

建议新增：

```text
scripts/sync-agent-routing.ts
```

输入：

```text
<exact aili-workflows checkout>/
  .agents/skills/parallel-subagent-dispatch/references/agent-selection-matrix.md
agents/*.md
```

输出：

```text
manifests/agent-routing.generated.json
```

该文件可以由 Pi Package 打包，因为它由 `aili-pi` Runtime 主动读取，不依赖模型主动发现。

生成记录至少包含：

```json
{
  "schemaVersion": 1,
  "source": {
    "repository": "https://github.com/Rosetears520/aili-workflows.git",
    "commit": "<exact>",
    "protocol": "aili-agent-selection/v1",
    "sourceSha256": "<sha256>"
  },
  "roles": [
    {
      "roleId": "code-scout",
      "selector": "aili.code-scout",
      "positiveTriggers": [],
      "nearMisses": [],
      "expectedEvidence": [],
      "phaseAffinity": [],
      "executionGuidance": ""
    }
  ]
}
```

不要在 generated routing manifest 手写 RoleProfile description。模型可见的一句话 description 仍从 `manifests/roles.json` / validated RoleProfile 读取。

### 7.2 生成验证

必须验证：

- 19 个 canonical specialist role 恰好映射一次；
- 每个 role ID 都存在对应 `aili.<role-id>`；
- `general` 不在 specialist matrix；
- 没有未知 role；
- phase affinity 只影响推荐，不影响权限；
- source protocol 和 hash 正确；
- generated 文件 drift 会让 CI 失败。

建议更新：

```text
scripts/sync-roles.ts
src/runtime/roles.ts
tests/unit/generated.test.ts
```

使 role source commit、routing source commit 和 upstream lock 一致。

## 8. 第四项：提高主 Agent 使用 Specialized Agent 的意愿和准确度

不要新增一个依赖模型主动加载的 Pi routing Skill。Pi 的 Agent 发现必须由 Runtime 和 `task` tool metadata 主动提供。

### 8.1 修改 `rose-context.ts`

当前每轮只注入“20 selectors + benefit-based delegation”。改为注入最小常驻规则：

```text
ordinary work:
- scan before duplicating material discovery or execution;
- prefer an exact specialist when one routing row clearly matches;
- use general only when no specialist fits or for ordinary compatibility.

formal work:
- ROSE owns decisions, decomposition, integration and final verification;
- a ready Agent-owned package must dispatch its exact specialist;
- ordinary benefit logic cannot replace that owner;
- general is not a formal package owner.

persistent continuation:
- same package may continue through the same Agent identity only while role,
  scope, permissions, acceptance boundary and expected evidence are unchanged;
- new scope/package/claim requires a new job or Agent;
- inspect async output before dependent work or final verdict.
```

同时每轮注入最小 human-artifact 和 authorization 规则：

```text
Human-facing persisted prose uses ordinary language without epistemic tags.
Artifacts record decisions and authorization but never create them.
Test-plan acceptance does not start BUILD.
```

该最小规则由 Extension 自动注入，不依赖用户是否运行过全局资源安装命令。

### 8.2 修改 `templates/APPEND_SYSTEM.md`

APPEND_SYSTEM 保存完整、可读的 Pi adapter 合同，但必须与 `rose-context.ts` 的最小规则一致。

移除旧的纯 benefit-based 表述，增加：

- ordinary / formal 两条 lane；
- exact specialist selection；
- persistent same-package continuation；
- human-artifact 普通语言；
- decision acceptance 与 implementation authorization 分离；
- `YOLO` 只改变工具权限，不表示用户授权了 BUILD、commit、push 或 release。

### 8.3 强化 `task` tool metadata

修改：

```text
src/runtime/persistent-agents/runtime.ts
src/runtime/persistent-agents/task-schema.ts
```

`task` 必须提供：

- 更明确的 `description`；
- `promptSnippet`；
- `promptGuidelines`；
- `agent` 字段 description。

示例：

```text
Create persistent AILI Agents for bounded delegated work.

Choose an exact specialized selector when the assignment matches one routing
responsibility. Omit agent only for ordinary general fallback. Formal packages
must explicitly use their specialized Owner and explicit async mode.
```

`promptGuidelines` 从 generated routing manifest 构建紧凑 Catalog：

```text
aili.code-scout — broad code locality, symbols, call paths and owning tests
aili.doc-researcher — project rules and local documentation
aili.web-researcher — current external official evidence
...
```

可以按 phase 分组，但不得建立第二份 description authority。完整 catalog 只有在 `task` active 时注入，避免每轮无条件增加全部角色 token。

### 8.4 `general` 的边界

本 PR 保持 ordinary compatibility：

```text
ordinary omitted agent → general
```

formal lifecycle：

```text
general → invalid formal Owner
```

本 PR 不删除 `general.spawns`，避免扩大兼容性范围。但必须在文档和测试中声明：

- `general` 的嵌套派发只是 Pi ordinary compatibility；
- 不属于共享 formal orchestration；
- formal package 必须由顶层 ROSE 直接选择 exact specialized Agent；
- specialized Agent 仍然不能派发子 Agent。

是否彻底移除 `general.spawns` 应由后续独立 change 评估。

## 9. 第五项：实现 Pi Formal Task Board Adapter

### 9.1 Parser 和 validator

新增或完成：

```text
src/runtime/formal-task-board.ts
src/runtime/formal-task-board-root.ts
src/runtime/formal-task-board-update.ts
```

消费 `aili-task-board/v1`，但 Pi 不重新定义通用状态机。

必须支持：

- exact OpenSpec change root；
- repository containment；
- symlink、traversal、collision 和 ambiguous identity fail closed；
- board header 和 package fields；
- seven-state transition；
- exact canonical role mapping；
- waiver、join、evidence、disposition；
- checkbox 与 `done` 同步；
- legacy/unmanaged board 保持可读、不自动迁移；
- progress append-only。

### 9.2 `formalContext`

保留 PR 已选择的最小 public schema：

```json
{
  "formalContext": {
    "changeId": "<exact-change-id>"
  }
}
```

它只承担：

- exact board root identity；
- protected board path derivation；
- ordinary/formal request 区分。

不要声称仅凭 `changeId` 就能在 Runtime 中唯一绑定具体 package Owner。当前 exact package Owner 仍由 board orchestrator 在调用前验证，并在 task assignment 中明确 package ID。

如未来需要 Runtime 对 package Owner 做不可绕过的硬绑定，应在独立 change 中评估：

```json
{
  "formalContext": {
    "changeId": "...",
    "packageId": "..."
  }
}
```

不要在本 PR 中隐式从 task 自然语言模糊解析 package ID。

### 9.3 formal request 规则

当 `formalContext` 存在：

- `agent` 必须显式提供；
- `agent` 必须是 specialized `aili.*` selector；
- `general` 和 omitted agent 无效；
- `async` 必须显式提供；
- exact root 必须声明 `aili-task-board/v1`；
- Agent 不得修改 owning `formal-task-board.md` / `progress.txt`；OpenSpec `tasks.md` 只保存接受的任务定义；
- worker 只能返回 canonical result；
- board 更新由 ROSE adapter 完成。

ordinary request 保持现状：

- omitted agent 可继续归一化为 `general`；
- top-level default async 保持；
- 不要求 formal board；
- 不增加 board write protection。

### 9.4 board write protection

修改：

```text
src/runtime/persistent-agents/task-schema.ts
src/runtime/persistent-agents/production.ts
src/runtime/persistent-agents/workspace.ts
src/runtime/persistent-agents/child-sandbox.ts
```

要求：

- 从 validated `changeId` 解析 owning `formal-task-board.md` / `progress.txt`，不自动迁移 OpenSpec `tasks.md`；
- protected paths 随 workspace lease 和 Agent lifecycle 持久化；
- write/edit 在 mutation 前拒绝；
- sandbox 支持 exact deny 时，为 formal child bash 增加 exact deny；
- 无法证明 exact bash protection 时，只对 formal child 移除 bash；
- ordinary child 的 bash 和 permission mode 不变；
- YOLO 不得绕过 formal board deny。

### 9.5 restart reconciliation

formal resume：

1. 读取 exact board；
2. 读取 bounded progress tail；
3. 查询 Agent Journal / `hub jobs/output/history`；
4. completed/partial + readable result → `returned`；
5. blocked/failed/interrupted/unexecuted/missing → `blocked`；
6. 追加 `RECONCILED`；
7. ROSE inspection 后才允许 disposition / done；
8. 不自动 redispatch、replay、fallback selector、accept result 或推进 phase。

Runtime raw refs 留在 Agent Journal。人类 board 使用 portable evidence ID；opaque refs 不得作为外部文档的唯一完成证明。

## 10. 第六项：修正 persistent Agent 与共享 package 的差异

当前 Pi Agent 是 persistent，而 OpenCode Task 通常是 fresh、single-use。Pi adapter 应利用 persistent 能力，但不能扩大 package。

允许 `hub send` 继续同一 Agent 的条件：

- same package ID；
- same canonical role；
- same scope 和 forbidden scope；
- same write scope；
- same acceptance boundary；
- same expected evidence；
- 仅澄清、补充证据或同范围一次修复。

必须新建 job/Agent：

- 新 requirement；
- 新 package；
- scope 扩大；
- material contract change；
- role 变化；
- write scope 变化；
- verification claim 变化；
- Agent 已 aborted/released；
- 当前 result 已被 rejected/superseded 且新工作不再属于原 package。

增加对应 runtime audit fields，保证 parent 能区分 continuation 和 scope expansion。

## 11. 第七项：分发解耦

### 11.1 `package.json`

修改：

- 从 `files` 删除 runtime 发布的通用 `skills/`；
- 删除 `postinstall`；
- `pi.skills` 只声明真实 Pi Package Skill；
- 如果目前没有 Pi-only Skill，不创建占位 `pi-skills/`；
- `pi-web-access` 的 package skill 声明保持。

### 11.2 删除 HOME 写入 owner

删除或退役：

```text
scripts/sync-global-skills.mjs
```

安装、更新和卸载 `@rosetears/aili-pi` 均不得创建、替换、删除或修复：

```text
~/.agents/skills/**
```

`aili-pi` 不得自动执行：

```text
npx rose-aili install
npx rose-aili update
```

### 11.3 lockfile

精确更新：

```text
package-lock.json#hasInstallScript
```

不新增、删除或升级 production dependency，除非另有明确范围。

### 11.4 README 和 bootstrap

明确两个 owner：

```text
共享 Skills:
npx -y rose-aili@<exact-or-user-selected-version> install
npx -y rose-aili@<version> update

Pi Package:
pi install npm:@rosetears/aili-pi@<version>
pi update npm:@rosetears/aili-pi@<version>
```

不要把 moving `@latest` 写成兼容性证明。可以作为用户便利命令，但 doctor 和 release evidence 使用 exact version。

## 12. 第八项：doctor compatibility

doctor 只读检查默认共享 Skill 位置中的协议文件：

```text
~/.agents/skills/parallel-subagent-dispatch/references/agent-selection-matrix.md
~/.agents/skills/aili-delivery-flow/references/formal-task-board.md
```

状态：

```text
present-compatible
missing
incompatible
unverified
```

建议判定：

- `present-compatible`：文件存在、协议版本受支持、required canonical roles 和核心字段可解析；
- `missing`：一个或多个 required reference 缺失；
- `incompatible`：协议版本不支持、role inventory 冲突、必需结构无效；
- `unverified`：路径不可读、存在歧义、内容无法安全判定。

exact hash match 可以作为附加证据：

```text
source_match=exact | compatible-newer | modified | unknown
```

不要把 exact hash 作为唯一兼容条件，否则合法的后续兼容版本会被错误判为 incompatible。

doctor：

- 不自动安装；
- 不自动更新；
- 不从 embedded snapshot 恢复；
- 不执行网络请求；
- shared protocol 缺失时不得报告 integrated workflow PASS。

## 13. 第九项：压缩 proposal 的正确处理

`replace-pi-native-fallback-with-aili-emergency-checkpoint` 当前保持：

```text
proposal-only
DEFINE blocked by missing official Pi provider-runtime seam
```

本 PR 不修改生产压缩代码，不关闭 blocker，不移除 Pi native fallback。

必须在文档中明确：

- 当前已实现的是 hybrid cooperative recovery；
- AILI 无 deterministic checkpoint 时返回 `undefined`，Pi native checkpoint/retry 接管；
- `activeBlocks=0` 的 AILI-owned emergency checkpoint 尚未实现；
- fake-provider 和单元测试不证明真实 provider overflow/retry；
- 该 proposal 不属于 formal task-board/distribution release gate；
- 等 Pi 提供公开 provider/model/auth/headers/transport/retry seam 后，另开独立 BUILD。

同时清理该 proposal/progress 中的人类标签和当前会话来源。

## 14. 建议修改文件

### PR 文档

```text
PR body
openspec/changes/add-file-task-board/**
openspec/changes/separate-shared-and-pi-skill-distribution/**
openspec/changes/replace-pi-native-fallback-with-aili-emergency-checkpoint/**
PUBLICATION-NOTE.md
```

### 上游同步和生成

```text
upstream/aili-workflows.lock.json
scripts/sync-skills.ts
scripts/sync-roles.ts
scripts/sync-agent-routing.ts
manifests/roles.json
manifests/agent-routing.generated.json
manifests/skill-compatibility.json
manifests/provenance.json
```

### Runtime

```text
src/runtime/rose-context.ts
templates/APPEND_SYSTEM.md
src/runtime/roles.ts
src/runtime/formal-task-board.ts
src/runtime/formal-task-board-root.ts
src/runtime/formal-task-board-update.ts
src/runtime/persistent-agents/task-schema.ts
src/runtime/persistent-agents/runtime.ts
src/runtime/persistent-agents/production.ts
src/runtime/persistent-agents/workspace.ts
src/runtime/persistent-agents/child-sandbox.ts
src/runtime/persistent-agents/storage.ts
src/runtime/doctor.ts
```

### 分发

```text
package.json
package-lock.json
scripts/sync-global-skills.mjs
README.md
bootstrap completion guidance
scripts/validate-package-bundles.ts
```

## 15. 必须覆盖的测试

### 15.1 routing projection

- exact upstream matrix 可解析；
- 19 role 一一映射；
- description 从 RoleProfile 获取；
- `general` 不进入 specialist matrix；
- generated drift 失败；
- task active 时模型能看到紧凑 catalog；
- task inactive 时不注入 orphan catalog。

### 15.2 ordinary Agent

- omitted agent → `general`；
- ordinary explicit specialist 正常；
- ordinary task 不要求 formalContext；
- ordinary default async 不变；
- no-trigger direct path 仍合法。

### 15.3 formal Agent

- formal omitted agent 失败；
- formal `general` 失败；
- formal async omitted 失败；
- exact specialized Owner 成功；
- invalid/legacy/symlink/mismatched board 在 allocation 前失败；
- write/edit 无法修改 tasks/progress；
- formal bash 无 exact protection 时 fail closed；
- YOLO 不能绕过 board deny；
- ordinary Bash 不受 formal change 影响。

### 15.4 continuation

- same-package same-scope follow-up 允许；
- new package 不能复用旧 package identity；
- scope/writeScope/role/claim 变化必须新 job；
- specialized Agent 不能派发；
- ordinary `general` nested compatibility 不计入 formal evidence。

### 15.5 reconciliation

- completed/partial readable → returned；
- failed/interrupted/unexecuted/missing → blocked；
- restart 不自动 replay/redispatch；
- returned 不自动 done；
- async join 未检查时 phase blocked。

### 15.6 distribution

- `package.json` 无 postinstall；
- package lock root `hasInstallScript` 正确；
- `npm pack --dry-run --json` 不包含通用 `skills/**`；
- disposable HOME 安装前后 `~/.agents/skills` byte-identical；
- install/update/uninstall 无隐式网络或 `npx rose-aili`；
- Pi-only Skill collision 检查；
- doctor 四状态覆盖。

### 15.7 output and authorization

- APPEND_SYSTEM、rose-context 和 PR 文档不要求人类内容使用 claim tags；
- 当前会话不能成为持久 source；
- conditional decision 不会升级 accepted；
- test-plan acceptance 不会启动 BUILD；
- YOLO 不会授予 implementation / commit / push / release。

## 16. 验证命令

至少运行：

```bash
npm run typecheck
npm test
npm run verify:skills
npm run verify:roles
npm run validate:compatibility
npm run validate:provenance
npm run validate:generated
npm run validate:package
npm run validate:bundles
npm run test:doctor
npm run test:bootstrap
npm run test:integration
npm pack --dry-run --json
git diff --check
```

另运行 disposable HOME 安装测试，检查：

```text
before ~/.agents/skills tree hash
install aili-pi
update aili-pi
remove aili-pi
after ~/.agents/skills tree hash
```

前后必须一致。

## 17. 发布门

完成代码不等于获得发布授权。发布前分别确认：

```text
implementation complete
focused tests passed
full required suite passed
exact rose-aili dependency recorded
npm candidate identity recorded
public exposure review passed
publish authorization granted
GitHub release authorization granted
real WSL install authorization granted
```

commit、push、npm publish、GitHub release 和真实 WSL 安装分别是独立操作。

## 18. 最终完成标准

只有全部满足时，formal task-board / distribution change 才能关闭：

1. PR 公开文档没有内部标签、当前会话伪来源或不可复核 done；
2. blocker 基线已纠正；
3. exact `rose-aili` release 已固定；
4. Pi routing projection 从共享 Skill 生成；
5. 主 Agent 在 `task` 调用前能看到角色选择信息；
6. ordinary `general` 兼容保留；
7. formal package 必须 exact specialized Owner；
8. persistent Agent 只在 same-package 条件下复用；
9. board parser、protection 和 reconciliation 已实现；
10. `aili-pi` 不再写入或发布通用 Skills；
11. doctor 只读报告兼容状态；
12. tarball、disposable HOME 和 Runtime 回归测试通过；
13. 压缩 emergency checkpoint 仍诚实标记为独立 upstream-blocked proposal；
14. 另行获得 publish/release 授权。
