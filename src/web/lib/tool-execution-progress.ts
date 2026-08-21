import { agentLiveProgress } from "./agent-dispatch";

const MAX_PROGRESS_LENGTH = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getToolExecutionProgress(partialResult: unknown, toolName?: string): string | null {
  if (!isObject(partialResult)) return null;

  // Persistent-agent live updates carry a structured TaskLiveSnapshot whose
  // content text is raw JSON — render the identity row from details instead.
  if (!toolName || toolName === "sub" || toolName === "task" || toolName === "formal_task") {
    const live = agentLiveProgress(partialResult.details);
    if (live) return live.length <= MAX_PROGRESS_LENGTH ? live : `...${live.slice(-(MAX_PROGRESS_LENGTH - 3))}`;
  }

  const content = partialResult.content;
  if (!Array.isArray(content)) return null;

  const text = content
    .filter((block) => isObject(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
  const lines = text.split(/\r?\n/);
  let latest = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    latest = lines[index].trim();
    if (latest) break;
  }
  if (!latest) return null;

  const normalized = latest.replace(/\s+/g, " ");
  return normalized.length <= MAX_PROGRESS_LENGTH
    ? normalized
    : `...${normalized.slice(-(MAX_PROGRESS_LENGTH - 3))}`;
}
