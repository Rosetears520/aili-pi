import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getToolParameterFields } from "../../src/web/lib/tool-definition-fields.js";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Pi Web 0.8.11 presentation ports", () => {
  it("formats projected tool schemas without changing tools", () => {
    expect(getToolParameterFields({
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "File path" },
        limit: { type: "integer", default: 20 },
        mode: { enum: ["text", "json"] },
      },
    })).toEqual([
      { name: "path", type: "string", description: "File path", required: true, allowedValues: undefined, defaultValue: undefined },
      { name: "limit", type: "integer", description: undefined, required: false, allowedValues: undefined, defaultValue: "20" },
      { name: "mode", type: "string", description: undefined, required: false, allowedValues: "text, json", defaultValue: undefined },
    ]);
  });

  it("keeps Project Info read-only and uses the safe clipboard helper", async () => {
    const source = await read("src/web/components/ProjectInfoPanel.tsx");
    expect(source).toContain('from "@/lib/clipboard"');
    expect(source).toContain("project.directory");
    expect(source).toContain("project.branch");
    expect(source).toContain("project.worktree");
    expect(source).not.toMatch(/fetch\(|sendAgentCommand|method:\s*"(?:POST|PATCH|DELETE)"/);
  });

  it("loads prompt and tools through existing read-only Gateway commands", async () => {
    const hook = await read("src/web/hooks/useAgentSession.ts");
    const client = await read("src/web/lib/agent-client.ts");
    expect(hook).toContain('type: "get_state"');
    expect(hook).toContain('type: "get_tools"');
    expect(client).toContain('READ_ONLY_AGENT_COMMANDS = new Set(["get_state"');
    expect(await read("src/web/components/AppShell.tsx")).toContain("<ToolDefinitionsPanel");
  });

  it("bounds extension selection scrolling and applies safe-area modal spacing", async () => {
    const card = await read("src/web/components/aicss/ApprovalCard.module.css");
    const css = await read("src/web/app/globals.css");
    const chat = await read("src/web/components/ChatWindow.tsx");
    expect(card).toMatch(/\.questionsViewport[\s\S]*max-height:[\s\S]*overflow-y: auto/);
    expect(css).toMatch(/\.extension-modal-overlay[\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-bottom/);
    expect(chat.match(/className="extension-modal-overlay"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("provides a generic read-only SettingsUi surface", async () => {
    const source = await read("src/web/components/SettingsUi.tsx");
    expect(source).toContain("export function SettingsUi");
    expect(source).not.toMatch(/fetch\(|onChange|onSave|button/);
  });
});
