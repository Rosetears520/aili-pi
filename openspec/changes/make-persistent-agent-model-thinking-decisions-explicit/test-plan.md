# 测试文档：current-turn subagent model/thinking authority

## 0. 文档元信息
- 来源：该 change 的 proposal/design/spec/tasks；当前 `sub` Herdr 实测结果（未传覆盖时继承 Parent；显式覆盖在 inherit-only 下被拒绝）
- 生成时间：2026-08-28
- 适用版本 / 分支：当前 `aili-pi` 工作树；managed 与 Herdr backend
- 状态：accepted（用户于 2026-08-28 明确要求继续实现；既有实现证据保留）

## 1. 被测对象、目标与边界
- 被测对象：用户消息到当轮 `CurrentTurnModelAuthority` 的受限投影、model/thinking 分字段解析、managed/Herdr 等价和审计。
- 要支持的接受 claim：当用户明确说“这些 subagent 用 X/某 thinking”时，匹配的当轮 dispatch 可直接使用；模型生成的工具参数不能自授权；不可用/不兼容严格失败。
- In scope：当轮授权生成/销毁、目标范围和值匹配、目录解析、thinking 能力、backend 等价、结果/audit 投影。
- Out of scope：持久 role/model 配置、自动选择未授权模型、Herdr 独立权限规则、模型安装/认证、hub send deferred task 3.2。

## 2. 需求 / 决策 / 风险追踪
| 需求 / 决策 / 风险 | 来源 | 任务 / Package | 文件 / Artifact | 验证命令 / 检查 | 证据 | 覆盖状态 |
|---|---|---|---|---|---|---|
| 用户明确指令形成当轮 explicit authority | spec direct-user-turn scenarios; design D5 | 3.3 | production/model-selection/dispatch adapter | focused authority tests | exact allowed model/thinking and turn identity | planned |
| 工具参数不能扩权 | spec tool arguments exceed instruction | 3.3 | preflight capture | mismatch/extra-field tests | rejected-unauthorized with bounded reason | planned |
| Herdr/managed 一致 | spec backend selection | 3.3 | production/backends/loadout | backend matrix | same effective identity, backend metadata only differs | planned |
| 不可用/不兼容严格失败 | spec unavailable/incompatible | 3.3, 4.3 | catalog/model selection | unavailable/ambiguous/thinking tests | no inheritance or silent switch | planned |
| 当轮结束后销毁 | design D5 | 3.3 | turn state | consecutive-turn test | next turn inherits unless user repeats instruction | planned |
| 审计可见 | existing explicit decision requirements | 4.3 | result/metadata/audit | projection tests | requested/effective/source/decision retained | partial existing |

## 3. 选定验证
| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| authority/value/scope/expiry | focused model-authority and production tests | 直接覆盖授权边界 | 不证明某外部模型已认证可用 |
| backend independence | managed/Herdr fake-driver matrix | 隔离 backend 与 model decision | 不测试真实 provider 质量 |
| result/audit consistency | sub/output-delivery tests | 验证用户可见证据 | 不产生持久配置授权 |
| integration | `npm run typecheck`; focused tests; `npm test`; strict OpenSpec | 覆盖类型与回归 | 不授权 Git/发布 |

## 4. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Unverified | `gpt-5.6-luna` 是否存在于目标用户的已认证模型目录及支持哪些 thinking 等级 | 该具体模型能否运行 | 运行时严格目录解析；不可用时明确失败，不写死模型能力 |

## 5. Final acceptance gate
- [x] 用户明确接受本次新增测试计划（2026-08-28）
- [x] 用户授权新增 task 3.3/4.3 的 repository-local BUILD（2026-08-28）
