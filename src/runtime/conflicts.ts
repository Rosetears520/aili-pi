import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { LIFECYCLE_PROMPTS } from "./lifecycle.js";

export interface ResourceConflict {
  name: string;
  sources: Array<{ source: string; path: string }>;
}

function baseName(name: string): string {
  return name.replace(/:\d+$/, "");
}

export function detectLifecycleConflicts(commands: ReturnType<ExtensionAPI["getCommands"]>): ResourceConflict[] {
  return LIFECYCLE_PROMPTS.flatMap((name) => {
    const matches = commands.filter((command) => baseName(command.name) === name);
    if (matches.length === 1 && matches[0]?.source === "prompt") return [];
    return [{
      name,
      sources: matches.map((command) => ({
        source: `${command.source}:${command.sourceInfo.source}`,
        path: command.sourceInfo.path,
      })),
    }];
  });
}
