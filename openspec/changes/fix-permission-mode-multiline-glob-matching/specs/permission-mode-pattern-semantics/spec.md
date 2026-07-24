## ADDED Requirements

### Requirement: Permission glob wildcards include line terminators
AILI 的 `pi-permission-modes@2.2.0` adaptation SHALL 让共享 permission pattern matcher 的 `*` 匹配零个或多个任意 UTF-16 code unit、让 `?` 匹配恰好一个任意 UTF-16 code unit，并且两者 MUST 包含 `\n`、`\r`、U+2028 和 U+2029。该修订 MUST 保留 literal escaping、home expansion、full-target anchoring 和 last-matching-pattern-wins。

#### Scenario: Universal wildcard matches multiline target
- **WHEN** pattern `*` 被用于匹配包含任一或多个 line terminator 的 target
- **THEN** matcher 返回匹配，而不是因 RegExp dot 默认语义而失配

#### Scenario: Single-character wildcard matches one line terminator
- **WHEN** pattern `prefix?suffix` 的 target 在 `prefix` 与 `suffix` 之间恰有一个 `\n`、`\r`、U+2028 或 U+2029
- **THEN** matcher返回匹配；零个或两个 code unit仍不匹配

#### Scenario: Last matching rule still wins
- **WHEN** 一个 multiline target 同时匹配通用规则和后置 specific rule
- **THEN** 使用定义顺序中最后一个匹配规则的 action，与单行 target 语义一致

### Requirement: YOLO allows multiline Bash without permission prompts
在 stock YOLO mode 中，AILI SHALL 对单行、多行、heredoc 和包含项目外路径的 Bash统一解析为显式 `bash:allow`。Permission extension MUST NOT 对这些调用显示确认、创建 session approval 需求或返回 `bash blocked`。

#### Scenario: YOLO executes a multiline in-project script
- **WHEN** 当前 mode 为 stock YOLO，Bash command包含至少一个实际换行和多个无副作用 shell statements
- **THEN** dispatcher不调用 `ctx.ui.select`，命令按 unsandboxed YOLO 路径执行

#### Scenario: YOLO executes a multiline heredoc
- **WHEN** 当前 mode 为 stock YOLO，Bash command通过 heredoc向只读解释器提供多行内容
- **THEN** `"*": "allow"` 覆盖完整 command，且不出现 `Allow bash? (sandbox disabled; command will run unsandboxed)`

#### Scenario: YOLO reads outside the project in a multiline command
- **WHEN** 当前 mode 为 stock YOLO，多行 Bash切换到 `/tmp` 或读取另一个非凭据目录且不请求 AILI child credential path
- **THEN** permission-modes不因换行或 external path询问；操作仍受操作系统用户权限和独立 hard guard约束

#### Scenario: Different multiline YOLO commands run without session grants
- **WHEN** 同一 YOLO session依次提交两条文本不同的多行 Bash
- **THEN** 两条都直接遵循 allow policy，而不是要求逐条选择 Allow for session

### Requirement: Restrictive and custom policies remain effective
修复 SHALL NOT 通过 YOLO 特判或 permissive fallback 放宽其他 mode。自定义 unsandboxed `ask` 仍 MUST 询问，自定义 `deny` 仍 MUST block，无匹配 sparse policy仍 MUST fail closed，project tighten-only overlay仍 MUST 以 most-restrictive 方式生效。

#### Scenario: Custom unsandboxed ask receives multiline command
- **WHEN** 自定义 mode设置 `sandbox.enabled:false` 且 multiline Bash匹配 `bash:ask`
- **THEN** dispatcher显示 unsandboxed confirmation，并在拒绝后返回 `bash blocked`

#### Scenario: Custom unsandboxed deny receives multiline command
- **WHEN** 自定义 mode设置 `sandbox.enabled:false` 且 multiline Bash匹配 `bash:deny`
- **THEN** dispatcher在执行前 block，且不把该调用误当作 YOLO allow

#### Scenario: Project overlay tightens a multiline target
- **WHEN** base permission允许 target，但 project overlay 的后置 pattern 对跨 line terminator 的 target解析为 ask或deny
- **THEN** ask或deny以 most-restrictive 规则获胜

#### Scenario: Sparse policy has no matching rule
- **WHEN** 一个自定义 sparse policy确实没有任何 matching pattern
- **THEN** `decide()` 仍回退为 ask；修复不得把 fallback改为 allow

### Requirement: Shared pattern-map surfaces use consistent multiline semantics
所有经过共享 matcher 的 permission surface SHALL 使用同一 line-terminator-safe 语义，包括 `path`、`external_directory`、file tools、`bash`、`web_search`、`tool` 和 `skill`。测试 MAY 使用 schema允许或边界构造的 target，但不得仅以 YOLO Bash通过代表全部共享 matcher 行为。

#### Scenario: File/path target contains a newline
- **WHEN** Unix-compatible fixture提供含实际换行的合法 path target，且 `path` 或 file surface使用 pattern map
- **THEN** `*`/`?`、specific pattern、last-match 和 most-restrictive 结果与相同结构的单行 target一致

#### Scenario: Multiline policy target uses a custom surface map
- **WHEN** `web_search` 或另一可直接传入字符串 target 的 surface使用 pattern map，并收到 multiline target
- **THEN** wildcard规则跨 line terminator匹配，allow/ask/deny结果不回退到意外默认值

#### Scenario: Bash command composition preserves deny
- **WHEN** `decideBashCommand` 的 joined target或 token包含 line terminator且匹配 deny pattern
- **THEN** deny仍被识别并在 most-restrictive composition 中获胜

### Requirement: The 2.2.0 adaptation is reproducible and truthfully attributed
AILI SHALL 将修订标识为基于 `pi-permission-modes@2.2.0`、revision `23d65d10a53b67043cae42322acf9044d6edb196` 的 adapted source。运行时 MUST NOT 依赖手工修改全局/hoisted `node_modules`。Provenance、SBOM、notice、doctor 和 package evidence MUST 记录来源、文件/哈希、local semantic diff 和验证，不得声称运行的是未经修改的 vanilla 2.2.0。

#### Scenario: Adapted source passes drift validation
- **WHEN** generated/provenance validator检查 adapted permission runtime
- **THEN** upstream baseline hashes、唯一声明的 matcher diff、license和 runtime file inventory均匹配；额外或遗漏 drift使验证失败

#### Scenario: Package runtime loads permission modes
- **WHEN** disposable Pi加载打包后的 AILI Package
- **THEN** `/perm`、四个 stock mode、sandbox/network/runtime行为来自 adapted entry，且 vanilla与adapted handler不会重复注册

#### Scenario: Scoped npm installation hoists the exact dependency
- **WHEN** `@rosetears/aili-pi` 位于 scoped package目录，而 npm 将 `pi-permission-modes` 放在祖先 `node_modules` 而非 Package-local `node_modules`
- **THEN** generator、doctor和release validator MUST 使用 Node package resolution找到 exact dependency；不得因硬编码嵌套路径而 false fail 或跳过 hash验证

#### Scenario: A future upstream fix is considered
- **WHEN** 维护者拟采用后续 upstream release并移除 adaptation
- **THEN** 必须进入单独 dependency/lockfile 决策，并用本 spec 的 multiline matcher与dispatcher矩阵重新验证

### Requirement: Dependency and installation mutations remain separately gated
本 OpenSpec DEFINE SHALL NOT 自行授权 dependency/lockfile、用户全局 Pi home、安装、发布或外部仓库写入。

#### Scenario: BUILD requires dependency or lockfile changes
- **WHEN** adapted entry的实施需要增删 package dependency、更新 `package-lock.json` 或采用 upstream/fork package
- **THEN** 执行在变更前停止，并取得单独精确批准
