# 实施计划：Quota、Matrix/Reasoning 与 Subagent Agent 标签修复

## 当前结论

这不是单纯的屏幕像素分辨率问题；Pi 传给 Matrix 的 `width` 是终端 cell 数。

- **普通空列是上游设计的一部分：** Matrix 每隔 2 cells 建一条轨道，默认只启用约 65%，四行画布外还有 `gap=1..5` 的循环，因此同一帧出现若干空列是正常的稀疏瀑布效果。
- **已确认一个超宽终端缺陷：** 当前 `selected.slice(0, 96)` 只保留左侧前 96 条 active tracks。确定性探针在 320/384/480/640 cells 下分别产生约 47/89/187/343 cells 的永久空白右区。
- **不是字符宽度问题：** 78 个 Matrix glyph 经 Pi-TUI 检查均为 1 cell。
- **不是主要的帧率问题：** 延迟渲染会让动画跳帧，但不会永久排除某一段横向区域；resize 会改变 seed，因此图案可能突然换一组空隙。

推荐保持上游默认 `density=0.65` 和普通宽度的稀疏节奏，只修复超宽终端的前缀截断。若之后希望整体更密，再显式使用 `/sakura-matrix density 0.8`，不把偏好偷偷写成 Package 默认值。

## 架构决定

1. `pi-quota-status@0.3.0` 继续独占真实 quota polling/state；AILI 只修正 Zentui placement/priority，并从 `Wk`（优先）或旧版误标 `5h`（fallback）中只显示一个 `codex <percent> <reset>` 周额度。
2. Matrix 在候选数不超过现有预算时保持 pinned Sakura 的确定性序列；溢出时做 bounded、确定性的全宽采样，而不是截取左侧前缀。
3. `✦ REASONING` 恢复 pinned Sakura gradient；Rem header/editor shell 不变。
4. Subagent 仅包装 upstream `renderCall` 增加 Agent 标题；schema、execute、result 和 lifecycle 保持 upstream 行为。
5. 实现不升级依赖；用户已另行批准 `0.1.6` 仅版本 lockfile 更新、Git/tag/npm publish、本机安装与既定只读 live probes，其他依赖或破坏性操作仍不在范围内。

## 工作包

### Task 1：建立 Matrix 可复现反馈环（AFK）

**目标：** 用确定性测试区分“正常稀疏”与“超宽右区永久空白”。

**验收标准：**
- [x] width 240 的 drop 序列保持当前 pinned 行为。
- [x] width 320/384/480/640 的旧实现可复现前缀截断。
- [x] 每个 glyph 为 1 cell，每条输出行严格等于请求的 visible width。
- [x] 测试不依赖真实 TUI、时间或 provider。

**验证：** `npx vitest run tests/unit/matrix.test.ts`

**依赖：** 无

**可能文件：**
- `tests/unit/matrix.test.ts`
- `extensions/matrix/index.ts`（只为导出可测的纯 helper，若需要）

### Task 2：修复 Matrix 宽度覆盖并恢复 Sakura reasoning gradient（AFK）

**目标：** 保留普通宽度视觉，移除超宽终端的永久空白右区，并让 reasoning 使用 exact Sakura 色值。

**验收标准：**
- [x] candidate count ≤ 96 时 drop 顺序与当前 pinned 实现一致。
- [x] candidate count > 96 时 bounded tracks 同时覆盖首尾 10% 区域。
- [x] 不取消时间性空列，不改变默认 density/height/fps。
- [x] Matrix BG/TEXT/CANDY 与 reasoning gradient stops/fallback 对齐 pinned Sakura。

**验证：**
- `npx vitest run tests/unit/matrix.test.ts tests/unit/zentui-gradient.test.ts`

**依赖：** Task 1

**可能文件：**
- `extensions/matrix/index.ts`
- `extensions/zentui/gradient.ts`
- `tests/unit/matrix.test.ts`
- `tests/unit/zentui-gradient.test.ts`

### Task 3：修复 Codex quota 页脚优先级（AFK）

**目标：** 默认显示真实 Codex quota，不再由 cache stats 抢占有限宽度。

**验收标准：**
- [x] `pi-cache-stats` 默认 placement 为 `off`，但用户仍可显式启用。
- [x] 两者同时启用时 `pi-quota-status` 排在 cache 前。
- [x] 同时存在时优先选择明确的 `Wk/weekly`；只有它缺失时才兼容误标 `5h`。
- [x] 最终只显示一个 `codex <percent> <reset>`，所选百分比/reset 原样保留，不显示重复 `7d`。

**验证：** `npx vitest run tests/unit/extension-status.test.ts`

**依赖：** 无；为减少共享验证状态，实施时排在 Task 2 后串行完成。

**可能文件：**
- `extensions/zentui/config.ts`
- `extensions/zentui/extension-status.ts`
- `tests/unit/extension-status.test.ts`

### Task 4：在 Subagent 调用上方显示 Agent（AFK）

**目标：** 在 upstream call component 上方增加清晰、安全的 Agent/Agents 行。

**验收标准：**
- [x] 单任务显示 `Agent: <name>`。
- [x] 并行任务显示 bounded `Agents: ...`；未指定项显示 `agentless`。
- [x] 控制字符被移除、空白折叠、单项与总长度受限，标题不含 task 文本。
- [x] lifecycle-only action 不显示 Agent 标题。
- [x] upstream renderer 缺失时安全回退；schema、execute credential guard 与 lifecycle 测试保持通过。

**验证：** `npx vitest run tests/unit/subagents.test.ts`

**依赖：** 无；为避免同一批集成证据交叉，实施时排在 Task 3 后。

**可能文件：**
- `src/runtime/subagents.ts`
- `tests/unit/subagents.test.ts`

### Task 5：文档与 provenance 对齐（AFK）

**目标：** 准确记录 display/responsive adaptations 和用户配置入口。

**验收标准：**
- [x] README 说明 `rem-cyberdeck`、quota/cache 展示、Matrix density 命令。
- [x] NOTICE/provenance 保留准确 upstream 版本与 bounded adaptation 描述。
- [x] 不把 `~/.pi`、OpenSpec、测试或本机状态打入 npm tarball。

**验证：**
- `npm run validate:provenance`
- `npm pack --dry-run --json`

**依赖：** Tasks 2–4

**可能文件：**
- `README.md`
- `THIRD_PARTY_NOTICES.md`
- `notices/*`
- `manifests/adapter-evidence.json`
- `manifests/provenance.json`

### Task 6：集成验证与 closeout（AFK）

**验收标准：**
- [x] focused tests、typecheck、full Vitest、release/provenance validators、package dry-run、strict OpenSpec 和 `git diff --check` 全部有 fresh evidence。
- [x] 未执行的真实 TUI 项明确标记 `Unverified`；另行授权的 headless provider probes 已记录为 PASS。

**验证命令：**

```bash
npx vitest run tests/unit/extension-status.test.ts tests/unit/matrix.test.ts tests/unit/subagents.test.ts tests/unit/zentui-gradient.test.ts
npm run typecheck
npm test
npm run validate:provenance
npm run validate:release
npm pack --dry-run --json
openspec validate fix-quota-animation-subagent-label --strict
git diff --check
```

**依赖：** Tasks 2–5

### Task 7：发版、安装与人工视觉确认（HITL）

**目标：** 仅在独立批准后 bump/publish/install，并重启 Pi 检查真实终端。

**验收标准：**
- [x] 获得精确的 `0.1.6` 版本、commit/push/tag/publish/install 批准。
- [ ] 正常宽度和超宽宽度下 Matrix 轨道覆盖完整横向区域，仍保留自然稀疏感。
- [ ] footer 只显示真实 `codex <weekly %> <reset>`；默认无 cache stats。
- [ ] named subagent 调用上方可见 Agent 标签；headless provider probes 已获授权并通过，真实 TUI 外观仍待安装重启观察。

**依赖：** Task 6 与用户批准

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 为消除空列而把 Matrix 填满 | 丢失上游瀑布风格 | 只修永久右区；保留 density、gap 与普通宽度序列 |
| 超宽修复增加渲染成本 | TUI 卡顿 | 保留 bounded track budget，并做多宽度纯函数测试 |
| quota 文本来自 cache 而非 subscription | 继续误导 | cache 默认 off；quota 显式最高优先级；不复制 poller |
| Agent 标题声称 resolved 成功 | UI 误导 | 标签仅表示 requested Agent；agentless/lifecycle 明确区分 |
| 本地视觉无法自动证明 | 错误宣称完成 | 发版后人工检查保持 HITL/Unverified 门 |

## 执行门

最终 `test-plan.md` 已被接受，仓库实现与另行授权的 live probes 已完成；用户随后明确批准 `0.1.6` 仅版本 lockfile 更新、任务范围 commit/push/tag、公开 npm 发布和本机安装。交互式重启观察仍为人工门。
