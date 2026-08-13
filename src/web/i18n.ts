export type WorkbenchLocale = "en" | "zh-CN";

const EN = {
  appName: "AILI Pi Workbench", sessions: "Sessions", timeline: "Timeline", inspector: "Inspector",
  resources: "Resources", agents: "Agents", mcp: "MCP", files: "Files", worktrees: "Worktrees",
  skills: "Skills", plugins: "Plugins", commands: "Commands", resume: "Resume", rename: "Rename",
  export: "Export", safeDelete: "Delete safely", branch: "Branch", fork: "Fork", send: "Send",
  queueNext: "Queue Next", steer: "Steer", model: "Model", thinking: "Thinking", context: "Context",
  connection: "Connection", writer: "Writer", activeRun: "Active run", noSession: "Select a session",
  observer: "Read-only observer", media: "Add images", remove: "Remove", status: "Runtime status",
  emptyAgents: "No persistent Agents are projected", emptyMcp: "No MCP servers are projected",
  mcpLazy: "Inspection never connects lazy MCP servers", loading: "Loading workbench…", retry: "Retry",
} as const;
const ZH: Record<keyof typeof EN, string> = {
  appName: "AILI Pi 工作台", sessions: "会话", timeline: "时间线", inspector: "检查器",
  resources: "资源", agents: "持久 Agent", mcp: "MCP", files: "文件", worktrees: "工作树",
  skills: "技能", plugins: "插件", commands: "命令", resume: "恢复", rename: "重命名",
  export: "导出", safeDelete: "安全删除", branch: "分支", fork: "派生会话", send: "发送",
  queueNext: "排队下一条", steer: "引导当前回合", model: "模型", thinking: "思考", context: "上下文",
  connection: "连接", writer: "写者", activeRun: "活动运行", noSession: "请选择会话",
  observer: "只读观察者", media: "添加图片", remove: "移除", status: "运行时状态",
  emptyAgents: "没有持久 Agent 投影", emptyMcp: "没有 MCP 服务器投影",
  mcpLazy: "检查状态不会连接惰性 MCP 服务器", loading: "正在加载工作台…", retry: "重试",
};
export type TranslationKey = keyof typeof EN;
export function translate(locale: WorkbenchLocale, key: TranslationKey): string { return (locale === "zh-CN" ? ZH : EN)[key]; }
export function resolveLocale(languages: readonly string[]): WorkbenchLocale { return languages.some((value) => value.toLowerCase().startsWith("zh")) ? "zh-CN" : "en"; }
