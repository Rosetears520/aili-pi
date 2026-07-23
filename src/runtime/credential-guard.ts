import type { ExtensionAPI, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { isProtectedCredentialPath } from "./path-boundaries.js";

const FILE_TOOLS = new Set(["read", "write", "edit", "ls", "grep", "find"]);

function normalizeShellCandidate(value: string): string {
  return value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replaceAll("$HOME", homedir())
    .replace(/^~(?=\/|$)/, homedir());
}

/**
 * Conservatively finds path-shaped shell words, including arguments embedded
 * in `bash -c` strings. A false positive only blocks a credential-like path;
 * a false negative must never be treated as an allow decision elsewhere.
 */
export function bashMentionsCredentialPath(command: string): boolean {
  const candidates = command
    .replace(/\\([\s'"`])/g, "$1")
    .split(/[\s;|&(){}<>]+/)
    .flatMap((part) => part.split(/["'`]/))
    .map(normalizeShellCandidate)
    .filter(Boolean);
  return candidates.some((candidate) => isProtectedCredentialPath(candidate));
}

export async function isProtectedChildPath(cwd: string, path: string): Promise<boolean> {
  // The predicate deliberately checks lexical credential names. Resolving a
  // caller-selected external root is unnecessary for this hard denial and
  // avoids treating a missing path as permission to read it later.
  void cwd;
  return isProtectedCredentialPath(normalizeShellCandidate(path));
}

/**
 * This extension is injected by the AILI generic subagent wrapper for every
 * child run. It is intentionally independent of caller-supplied role, cwd,
 * sandbox, or extension settings and blocks only credential-path access.
 */
export default function registerCredentialGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event): Promise<ToolCallEventResult | undefined> => {
    try {
      const input = event.input as Record<string, unknown>;
      if (FILE_TOOLS.has(event.toolName) && typeof input.path === "string" && await isProtectedChildPath(process.cwd(), input.path)) {
        return { block: true, reason: "AILI child denied credential/auth/private-key path access" };
      }
      if (event.toolName === "bash" && typeof input.command === "string" && bashMentionsCredentialPath(input.command)) {
        return { block: true, reason: "AILI child denied credential/auth/private-key path access in bash" };
      }
      return undefined;
    } catch {
      return { block: true, reason: "AILI child denied credential-path classification failure" };
    }
  });
}
