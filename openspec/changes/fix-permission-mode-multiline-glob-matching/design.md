## Context

AILI 当前通过唯一 Extension entry 动态加载 `pi-permission-modes/src/index.ts`，并把 `pi-permission-modes@2.2.0` 记录为未经修改的 dependency。该版本使用一个共享 `matchPattern()` 处理所有 permission pattern maps。其注释声明 `*` 匹配任意字符序列、`?` 匹配任意一个字符，但实现生成 `.*` 和 `.` 后使用无 dotAll flag 的 RegExp。

该差异在普通单行 target 中不可见。YOLO 的 Bash fast path会把完整命令文本直接交给 matcher；多行 heredoc 或脚本中的换行使 `"*": "allow"` 完全不匹配，`decide()` 随后 fail-closed 为 `ask`，再由 unsandboxed gate产生 `Allow bash? (sandbox disabled; command will run unsandboxed)`。这也是“Allow for session”无法覆盖后续不同多行脚本的原因：每个失配调用被按完整命令文本询问和记忆。

共享 matcher 也服务于 path、external_directory、read/write/edit/ls/grep/find、bash、web_search、tool 和 skill policy maps。虽然部分 surface 的正常 schema 不常包含换行，修复必须落实在共享语义层，避免某个 surface 在未来或边界输入上继续失配或绕过 deny。

## Goals / Non-Goals

**Goals:**

- 让 `*`/`?` 对所有 ECMAScript line terminator 保持文档化的任意字符语义。
- 让 YOLO 的单行与多行 Bash具有相同的无提示 policy 结果，包括项目外只读命令。
- 保持自定义 unsandboxed ask/deny、sandboxed mode、overlay 和 fail-closed 行为。
- 基于 exact `2.2.0` revision形成可复现、可验证、有 provenance 的 AILI adaptation。
- 用 pure matcher、policy engine 和真实 dispatcher 三层测试防止 false PASS。

**Non-Goals:**

- 把 YOLO 改为绕过其他 AILI hard guard，或改变当前系统用户权限。
- 改变 shell parser、sandbox runtime、network proxy、protected paths、mode UI 或 `/sandbox` 通知显示。
- 顺带修复 subagent、quota/theme 或其他 upstream integration。
- 在 DEFINE 阶段修改依赖、lockfile、全局安装或发布状态。

## Decisions

### 1. 在共享 matcher 启用 line-terminator-safe wildcard 语义

适配 SHALL 保持现有 pattern-to-RegExp 构造和 anchoring，只让 wildcard dot具备 dotAll 语义。首选最小实现是以 `new RegExp(re, "s")` 编译生成表达式，使：

- `*` 继续表示零个或多个 UTF-16 code unit，但现在也覆盖 `\n`、`\r`、U+2028、U+2029；
- `?` 继续表示恰好一个 UTF-16 code unit，并同样覆盖 line terminator；
- literal escaping、`~`/`$HOME` expansion、起止 anchoring 和 pattern insertion order 不变。

若实现使用 `[\\s\\S]*` / `[\\s\\S]`，必须通过同一矩阵且不得改变其他 escaping 语义。

**拒绝方案：**

- **只在 YOLO dispatcher 直接 allow：** 会绕过自定义 unsandboxed ask/deny，并隐藏共享 matcher 缺陷。
- **把多行 Bash 压成单行后匹配：** 会改变 pattern boundary，可能把 deny/allow 规则错误拼接。
- **把无匹配 fallback 改成 allow：** 破坏 sparse/custom policy 的 fail-closed 保证。
- **只修 `*` 不修 `?`：** 与 matcher 的同一“任意字符”契约不一致，并留下同类缺陷。

### 2. 维护 exact-baseline、可审计的 AILI adaptation

BUILD SHALL 以 `pi-permission-modes@2.2.0`、revision `23d65d10a53b67043cae42322acf9044d6edb196` 为来源，形成最小、revision-bound 的适配源码和锁定清单。实现采用生成式双文件适配：Package-owned `index.ts` 仅把 unchanged sibling imports重定向到 exact dependency，并使用本地 adapted `resolve.ts`；运行时从该 Package entry加载，不依赖对用户全局或 hoisted `node_modules` 的临时改写，也不复制无关 upstream runtime/docs/tests。

适配材料 SHALL：

- 记录 upstream 文件清单/哈希、唯一语义 diff、MIT license 和来源 revision；
- 仅包含运行所需 upstream surface 与该 matcher 修订，不顺带重写 mode policy；
- 由生成/验证脚本证明未发生未声明 drift；
- 在 provenance、SBOM、notice、doctor 和 package dry-run 中标记为 `adapted`，替换当前“unmodified dependency”声明。

如果 BUILD 选择正式 upstream fixed release替代本地适配，必须先停下取得 dependency/lockfile 批准，并证明其 matcher 和 dispatcher 覆盖满足本 spec；本 OpenSpec 不预先授权升级。

### 3. 用三层回归覆盖共享语义与真实提示路径

1. **Pure matcher:** `*`、`?`、literal、home expansion、空字符串、四类 line terminator、last-match-wins。
2. **Policy composition:** `resolveSurface`、`decide`、`decideBashCommand` 在 allow/ask/deny、project overlay 和 absent-pattern fallback 下保持最严格结果。
3. **Dispatcher:** 注册真实适配 Extension，以 fake UI 捕获 `select()`；YOLO 多行/heredoc/外部路径不得调用 select，自定义 unsandboxed ask必须调用，自定义 deny必须在执行前 block。

仅证明 regex helper 通过，不足以声称用户弹窗已修复；仅运行单行 Bash也不足以代表 multiline contract。

### 4. 保留 session approval 与安全边界

本修复不改变 approval key。对显式 `ask` mode，多行完整命令仍按现有 target 规则询问/记忆；对 YOLO，规则正确解析为 allow，因此根本不进入 approval UI。项目 overlay 的 ask/deny 仍以 most-restrictive 方式覆盖 base allow，包括跨 line terminator 的 target。

## Risks / Trade-offs

- **[Risk] 某些自定义规则曾意外依赖换行失配。** → 这是对已声明 wildcard 语义的纠正；文档列为 bug fix，并用 ask/deny fixture展示新的一致结果。
- **[Risk] `*deny*` 现在可以跨行命中更多 target。** → 这是安全收紧且符合任意字符定义；most-restrictive 和 last-match-wins 测试防止意外放宽。
- **[Risk] 本地 adapted snapshot 与 upstream 漂移。** → exact revision/hash lock、单一语义 diff、provenance validator 和未来 upstream migration gate。
- **[Risk] 只测 helper 导致真实 dispatcher 仍提示。** → 要求 fake-UI dispatcher 断言 `select` 调用次数，并加入多条不同多行命令。
- **[Risk] 复制 upstream runtime 扩大 Package surface。** → 只保留完整运行所需文件，记录 license/source/hash，并以 package dry-run 和 generated-drift validator审计。
- **[Risk] npm 将普通 dependency hoist 到 scoped Package 目录之外。** → generator与 runtime validator共用 Node package-resolution语义，不假设 `<package>/node_modules/pi-permission-modes`；scoped/hoisted fixture固化该布局。

## Migration Plan

1. 物化并锁定 exact 2.2.0 runtime baseline及 license/provenance。
2. 应用唯一 matcher dotAll 修订，并先建立 pure/policy negative regressions。
3. 将 native integration切换到 adapted entry，加入真实 dispatcher 回归。
4. 更新 provenance/SBOM/notices/doctor/docs，并运行 package/release validators。
5. 在单独批准 dependency/lockfile 变更后，移除不再使用的 vanilla dependency或调整 pin。
6. 回滚时恢复 vanilla 2.2.0 integration；该回滚会重新引入已证实的 YOLO 多行确认缺陷，必须标记为功能回归。

## Open Questions

- **Unverified:** upstream 后续版本/commit 是否已有等价修复和测试。采用它属于后续 dependency 决策。
- **Resolved in BUILD:** adapted code closure为 generated `index.ts` + `resolve.ts`；exact dependency继续提供 unchanged sibling modules。Lock、MIT license、generator和 package dry-run共同固化其可复现边界。
