import { describe, expect, it } from "vitest";
import { runAiliTask } from "../../src/runtime/subagents.js";

const liveMode = process.env.AILI_LIVE_SUBAGENT_PROBE;

describe("approved live provider child probe", () => {
  it.skipIf(liveMode !== "1")("completes one read-only fresh child without project mutation", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const result = await runAiliTask({
        role: "code-scout",
        task: "Read only package.json. Report the package name with one concise evidence anchor. Do not write files or run commands. Return the required structured JSON result.",
        tools: ["read"],
        paths: ["package.json"],
      }, process.cwd(), controller.signal, undefined, { parentTools: ["read"] });
      console.log(JSON.stringify({ status: result.status, summary: result.summary, evidence: result.evidence, changedFiles: result.changedFiles, blockers: result.blockers, confidence: result.confidence, metadata: result.metadata }));
      expect(result.status).toBe("completed");
      expect(result.changedFiles).toEqual([]);
      expect(JSON.stringify(result)).toContain("@rosetears/aili-pi");
    } finally {
      clearTimeout(timer);
    }
  }, 130_000);

  it.skipIf(liveMode !== "static")("isolates provider JSON protocol without exposing any tools", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const result = await runAiliTask({
        role: "code-scout",
        task: "Do not inspect files or call tools. Return the required structured JSON result with status completed, summary protocol-probe, and empty arrays.",
        tools: [],
        paths: ["package.json"],
      }, process.cwd(), controller.signal, undefined, { parentTools: ["read"] });
      console.log(JSON.stringify({ status: result.status, summary: result.summary, blockers: result.blockers, confidence: result.confidence, metadata: result.metadata }));
      expect(result.status).toBe("completed");
      expect(result.changedFiles).toEqual([]);
    } finally {
      clearTimeout(timer);
    }
  }, 130_000);
});
