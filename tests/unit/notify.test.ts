import { describe, expect, it } from "vitest";
import { notifyParentCompletion, osc9, osc99, osc777, tmuxPassthrough } from "../../src/runtime/notify.js";

describe("pi-notify adaptation", () => {
  it("retains OSC 777, iTerm OSC 9, Kitty OSC 99, tmux and sound routes", () => {
    expect(osc777("Pi", "done")).toBe("\x1b]777;notify;Pi;done\x07");
    expect(osc9("done")).toBe("\x1b]9;done\x07");
    expect(osc99("Pi", "done")).toContain("\x1b]99;");
    expect(tmuxPassthrough(osc777("Pi", "done"))).toContain("tmux;");
  });

  it("contains every terminal and PowerShell failure", () => {
    expect(() => notifyParentCompletion("Pi", "done", { TMUX: "1", WT_SESSION: "1" }, {
      write() { throw new Error("terminal unavailable"); },
      spawn() { throw new Error("powershell unavailable"); },
    })).not.toThrow();
  });

  it("launches PowerShell only for a Windows Terminal parent", () => {
    const calls: string[] = [];
    notifyParentCompletion("Pi", "done", { WT_SESSION: "parent" }, {
      write(value) { calls.push(value); },
      spawn(command) { calls.push(command); return { on() {} }; },
    });
    expect(calls).toContain("powershell.exe");
    expect(calls.at(-1)).toBe("\x07");
  });
});
