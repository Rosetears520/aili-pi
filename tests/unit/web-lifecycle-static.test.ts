import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Pi Web static lifecycle seams", () => {
  it("registers one Pi-visible web command through the package extension entry", async () => {
    const [entry, web] = await Promise.all([
      source("extensions/index.ts"),
      source("extensions/web/index.ts"),
    ]);

    expect(entry).toContain('import { registerWebCommand } from "./web/index.js"');
    expect(entry).toContain("registerWebCommand(pi)");
    expect(web).toContain('WEB_COMMAND_NAME = "web"');
    expect(web).toContain("pi.registerCommand(WEB_COMMAND_NAME");
    expect(web).toContain("Pi-owned AILI Web foreground child");
    expect(web).not.toContain("registerTool(");
  });

  it("keeps the CLI foreground-owned and performs all static pre-listen checks before spawn", async () => {
    const cli = await source("bin/pi-web.js");
    const prelisten = cli.lastIndexOf("checkPrelisten(options.hostname, options.port)");
    const buildCheck = cli.lastIndexOf("assertBuild(appRoot)");
    const runtimeCheck = cli.lastIndexOf('if (!regularFile(nextCli)) throw new Error("locked Next runtime is missing")');
    const spawn = cli.indexOf("const child = spawn(", runtimeCheck);

    expect(prelisten).toBeGreaterThan(-1);
    expect(buildCheck).toBeGreaterThan(prelisten);
    expect(runtimeCheck).toBeGreaterThan(buildCheck);
    expect(spawn).toBeGreaterThan(runtimeCheck);
    expect(cli).toContain('stdio: ["inherit", "pipe", "inherit", "pipe", "pipe", "pipe"]');
    expect(cli).toContain("shell: false");
    expect(cli).not.toContain("detached: true");
    expect(cli).toContain('detached: false');
    expect(cli).toContain('child.once("error"');
    expect(cli).toContain('child.once("exit"');
  });

  it("builds and stages only the declared AILI-owned web source boundary", async () => {
    const build = await source("scripts/build-web.ts");
    expect(build).toContain('WEB_SOURCE_ROOT = "src/web"');
    expect(build).toContain('WEB_OUTPUT_ROOT = "dist/web"');
    expect(build).toContain('PI_WEB_SOURCE_LOCK = "upstream/web-source-locks.json"');
    expect(build).toContain('source: "upstream/pi-web-0.8.8"');
    expect(build).toContain('sourceRevision: "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903"');
    expect(build).toContain("await runNextBuild(root, sourceRoot)");
    expect(build).toContain('cp(join(sourceRoot, ".next"), join(outputRoot, ".next")');
    expect(build).not.toContain('cp(join(root, "upstream"');
  });

  it("pins the browser runtime and packages the CLI, built output, extension, and runtime sources", async () => {
    const manifest = JSON.parse(await source("package.json")) as {
      bin?: Record<string, string>;
      files?: string[];
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(manifest.bin).toEqual({ "pi-web": "./bin/pi-web.js", "aili-pi": "./bin/aili-pi.js" });
    expect(manifest.files).toEqual(expect.arrayContaining(["bin/", "dist/web/", "extensions/web/", "src/"]));
    expect(manifest.dependencies).toMatchObject({ next: "16.2.12", react: "19.2.4", "react-dom": "19.2.4" });
    expect(manifest.dependencies).not.toHaveProperty("@agegr/pi-web");
    expect(manifest.scripts).toMatchObject({ "build:web": expect.stringContaining("scripts/build-web.ts") });
  });

  it("sets private no-store and same-origin response headers in both Next and BFF seams", async () => {
    const [next, bff] = await Promise.all([
      source("src/web/next.config.js"),
      source("src/runtime/web/bff-gateway.ts"),
    ]);
    for (const value of [
      "private, no-store, max-age=0",
      "no-referrer",
      "nosniff",
      "same-origin",
    ]) {
      expect(next).toContain(value);
      expect(bff).toContain(value);
    }
    expect(bff).toContain("Content-Security-Policy");
    expect(bff).toContain("frame-ancestors 'none'");
  });
});
