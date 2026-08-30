import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { assemblePromptModifiers, discoverPromptModifiers, promptPolicyAllowsTool, PromptModifierProvenanceStore, resolvePromptModifiers, type PromptModifierDefinition, type ResolvedPromptModifiers } from "../../src/runtime/prompt-middleware/index.js";

export default function registerPromptMiddleware(pi: ExtensionAPI): void {
  const provenance = new PromptModifierProvenanceStore();
  let turn = 0;
  let armed = false;
  let pending: string[] = [];
  let active: ResolvedPromptModifiers | undefined;
  let definitions: readonly PromptModifierDefinition[] = [];
  let cwd = process.cwd();

  const reload = async (trusted: boolean) => {
    definitions = await discoverPromptModifiers([
      { path: join(getAgentDir(), "snippets"), trusted: true },
      { path: join(cwd, ".pi", "snippets"), trusted },
    ].filter((root) => existsSync(root.path)));
  };

  const choose = async (ctx: any) => {
    await reload(ctx.isProjectTrusted?.() === true);
    if (!definitions.length) return ctx.ui.notify("No trusted prompt modifiers found", "info");
    const selected = await ctx.ui.select("Prompt modifier", ["Clear", ...definitions.map((item) => `${item.id} — ${item.name}`)]);
    if (!selected) return;
    if (selected === "Clear") pending = [];
    else pending = [selected.split(" — ", 1)[0]!];
    ctx.ui.notify(pending.length ? `Pending prompt modifier: ${pending.join(", ")}` : "Prompt modifiers cleared", "info");
  };

  pi.registerCommand("snippets", {
    description: "List, preview, select, or clear one-shot prompt modifiers",
    handler: async (args, ctx) => {
      cwd = ctx.cwd;
      await reload(ctx.isProjectTrusted?.() === true);
      const input = args.trim();
      if (!input || input === "list") return ctx.ui.notify(definitions.map((item) => `${item.id}: ${item.name}`).join("\n") || "No trusted prompt modifiers found", "info");
      if (input === "status") return ctx.ui.notify(JSON.stringify({ pending, provenance: provenance.list() }, null, 2), "info");
      if (input === "clear") { pending = []; return ctx.ui.notify("Prompt modifiers cleared", "info"); }
      if (input.startsWith("preview ")) {
        const item = definitions.find((candidate) => candidate.id === input.slice(8).trim());
        return ctx.ui.notify(item ? `${item.name}\n\n${item.body}\n\npolicy=${JSON.stringify(item.runtimePolicyPatch ?? {})}` : "Unknown prompt modifier", item ? "info" : "error");
      }
      pending = input.split(",").map((item) => item.trim()).filter(Boolean);
      try { resolvePromptModifiers(definitions, pending, { surface: "main" }); }
      catch (error) { provenance.recordRejected(++turn, pending, error instanceof Error ? error.message : String(error)); throw error; }
      ctx.ui.notify(`Pending prompt modifiers: ${pending.join(", ")}`, "info");
    },
  });
  pi.registerShortcut("alt+s", { description: "Select prompt modifier", handler: async (ctx) => { cwd = ctx.cwd; await choose(ctx); } });

  pi.on("before_agent_start", (_event, ctx) => {
    cwd = ctx.cwd;
    if (!pending.length) return;
    try { active = resolvePromptModifiers(definitions, pending, { surface: "main" }); }
    catch (error) { provenance.recordRejected(++turn, pending, error instanceof Error ? error.message : String(error)); throw error; }
    const selected = active.ordered;
    armed = true;
    const assembly = assemblePromptModifiers("", "Apply these one-turn instructions to the current user request.", selected);
    return { message: { customType: "prompt-middleware", content: assembly.dynamicMessage, display: false } };
  });
  pi.on("tool_call", (event) => {
    if (!active) return;
    const patch = active.policyPatch;
    if (!promptPolicyAllowsTool(event.toolName, patch)) {
      return { block: true, reason: `Prompt middleware denied ${event.toolName} for this turn` };
    }
  });
  pi.on("turn_start", () => {
    if (armed && active) { provenance.record(++turn, active); pending = []; armed = false; }
  });
  pi.on("turn_end", () => { active = undefined; armed = false; });
  pi.on("session_before_switch", () => { pending = []; active = undefined; armed = false; provenance.clear(); turn = 0; });
  pi.on("session_shutdown", () => { pending = []; active = undefined; armed = false; provenance.clear(); turn = 0; });
}
