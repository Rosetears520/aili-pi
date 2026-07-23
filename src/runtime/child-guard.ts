import type { ExtensionAPI, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

interface ChildPolicy {
  schemaVersion: 1;
  taskId: string;
  role: string;
  projectRoot: string;
  allowedTools: string[];
  taskBoundaries: string[];
}

function loadPolicy(): ChildPolicy {
  const path = process.env.AILI_CHILD_POLICY_FILE;
  if (!path) throw new Error("AILI child policy is missing");
  const policy = JSON.parse(readFileSync(path, "utf8")) as ChildPolicy;
  if (policy.schemaVersion !== 1 || !policy.taskId || !policy.role || !policy.projectRoot || !Array.isArray(policy.allowedTools) || !Array.isArray(policy.taskBoundaries) || policy.taskBoundaries.length === 0) {
    throw new Error("AILI child policy is malformed");
  }
  return policy;
}

function inside(target: string, boundary: string): boolean {
  const rel = relative(boundary, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep));
}

async function canonicalizeTarget(root: string, rawPath: string): Promise<string> {
  const requested = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath);
  const missing: string[] = [];
  let cursor = requested;
  while (true) {
    try {
      await lstat(cursor);
      const parent = await realpath(cursor);
      return missing.reduceRight((current, segment) => resolve(current, segment), parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(cursor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
      cursor = parent;
    }
  }
}

export default function registerChildGuard(pi: ExtensionAPI): void {
  const policy = loadPolicy();
  pi.on("tool_call", async (event): Promise<ToolCallEventResult | undefined> => {
    try {
      const allowed = policy.allowedTools.includes(event.toolName);
      if (!allowed) return { block: true, reason: "AILI child denied by task/parent/role tool ceiling" };
      if (["read", "write", "edit", "grep", "find", "ls"].includes(event.toolName)) {
        const input = event.input as Record<string, unknown>;
        const rawPath = typeof input.path === "string" ? input.path : policy.projectRoot;
        const target = await canonicalizeTarget(policy.projectRoot, rawPath);
        if (!policy.taskBoundaries.some((boundary) => inside(target, boundary))) {
          return { block: true, reason: "AILI child denied outside the explicit task path boundary" };
        }
      } else if (event.toolName === "bash" && !policy.taskBoundaries.includes(policy.projectRoot)) {
        return { block: true, reason: "AILI child denied bash because the task path boundary is narrower than the project root" };
      }
      return undefined;
    } catch {
      return { block: true, reason: "AILI child denied by classification.error.fail-closed" };
    }
  });
}
