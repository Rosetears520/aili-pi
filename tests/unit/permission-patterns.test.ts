import os from "node:os";
import { describe, expect, it } from "vitest";
import type { ModeDef, Surface } from "pi-permission-modes/src/schema.ts";
import {
  decide,
  decideBashCommand,
  matchPattern,
  resolveSurface,
} from "../../src/vendor/pi-permission-modes/resolve.js";

const sandbox = { enabled: false, writable: true } as const;

function mode(permission: ModeDef["permission"], projectOverlay?: ModeDef["projectOverlay"]): ModeDef {
  return {
    label: "Fixture",
    color: "muted",
    sandbox,
    permission,
    ...(projectOverlay === undefined ? {} : { projectOverlay }),
  };
}

describe("adapted permission glob semantics", () => {
  it("matches every ECMAScript line terminator with star and one code unit with question", () => {
    expect(matchPattern("*", "")).toBe(true);
    for (const terminator of ["\n", "\r", "\u2028", "\u2029"]) {
      expect(matchPattern("*", `before${terminator}after`)).toBe(true);
      expect(matchPattern("before?after", `before${terminator}after`)).toBe(true);
    }
    expect(matchPattern("?", "😀")).toBe(false);
    expect(matchPattern("before?after", "beforeafter")).toBe(false);
    expect(matchPattern("before?after", "before\r\nafter")).toBe(false);
    expect(matchPattern("before?after", "before\n\nafter")).toBe(false);
  });

  it("preserves literal escaping, home expansion, full-target anchoring, and last-match-wins", () => {
    expect(matchPattern("file[1].(ts)+", "file[1].(ts)+")).toBe(true);
    expect(matchPattern("file[1].(ts)+", "prefix-file[1].(ts)+")).toBe(false);
    expect(matchPattern("~/*", `${os.homedir()}/nested\nfile`)).toBe(true);
    expect(resolveSurface({ "*": "allow", "*secret*": "deny", "safe*": "allow" }, "safe\nsecret")).toBe("allow");
  });

  it("uses the same multiline matcher for every pattern-map surface", () => {
    const surfaces: Surface[] = [
      "path", "external_directory", "read", "write", "edit", "grep", "find", "ls",
      "bash", "web_search", "tool", "skill",
    ];
    for (const surface of surfaces) {
      const permission = { [surface]: { "*": "allow", "*deny\nme*": "deny" } } as ModeDef["permission"];
      expect(decide(mode(permission), surface, "prefix deny\nme suffix", { isOutside: surface === "external_directory" })).toBe("deny");
    }
  });

  it("keeps project overlays most-restrictive and sparse policies fail-closed", () => {
    const overlaid = mode(
      { bash: { "*": "allow" }, path: { "*": "allow" } },
      { bash: { "*blocked\ncommand*": "deny" } },
    );
    expect(decide(overlaid, "bash", "run blocked\ncommand now")).toBe("deny");
    expect(decide(mode({ bash: { "safe*": "allow" } }), "bash", "unknown\ncommand")).toBe("ask");
  });

  it("keeps multiline path denies effective in parsed bash composition", () => {
    const policy = mode({
      bash: { "*": "allow" },
      path: { "*": "allow", "*blocked\nargument*": "deny" },
    });
    expect(decideBashCommand(policy, "printf", ["blocked\nargument"])).toBe("deny");
  });
});
