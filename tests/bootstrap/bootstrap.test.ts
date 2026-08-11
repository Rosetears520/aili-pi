import { chmod, cp, lstat, mkdtemp, mkdir, readFile, readdir, readlink, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const INSTALL = join(ROOT, "install.sh");
const BOOTSTRAP = join(ROOT, "scripts/bootstrap.sh");
const SETTINGS_MERGER = join(ROOT, "scripts/merge-global-settings.mjs");
const KEYBINDINGS_MERGER = join(ROOT, "scripts/merge-global-keybindings.mjs");
const scratch: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(options: {
  version?: string;
  installFails?: boolean;
  updateFails?: boolean;
  withPi?: boolean;
  help?: string;
  listFails?: boolean;
  headlessFails?: boolean;
  platform?: string;
  architecture?: string;
  assertKeybindingApplyAfterInstall?: boolean;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "aili-bootstrap-test-"));
  scratch.push(root);
  const bin = join(root, "bin");
  const home = join(root, "home");
  const log = join(root, "pi.log");
  const state = join(root, "package-state");
  const template = join(root, "fake-pi");
  const pi = join(bin, "pi");
  const installer = join(root, "official-installer.sh");
  const fakeCurl = join(bin, "curl");
  const fakeUname = join(bin, "uname");
  const forbiddenSharedWorkflowCommand = join(root, "forbidden-shared-workflow-command");
  await mkdir(bin);
  await mkdir(home);
  await symlink(process.execPath, join(bin, "node"));
  await writeFile(template, `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$FAKE_PI_LOG"
case " $* " in
  *" --version "*) printf '%s\\n' "${options.version ?? "0.82.1"}" ;;
  *" --help "*) printf '%s\\n' '${options.help ?? "  --extension <path>\n  --no-extensions\n  --no-skills\n  --no-prompt-templates\n  --mode <mode>\n  --no-session\n  --print, -p\n  --offline\n  --list-models [search]"}' ;;
  *" --list-models "*) [ "${options.headlessFails ? "1" : "0"}" = 0 ] ;;
  *" list "*)
    [ "${options.listFails ? "1" : "0"}" = 0 ] || exit 1
    [ ! -f "$FAKE_PI_STATE" ] || cat "$FAKE_PI_STATE"
    ;;
  *" install "*)
    [ "${options.installFails ? "1" : "0"}" = 0 ] || exit 1
    if [ "$FAKE_PI_KEYBINDING_ORDER_CHECK" = 1 ]; then
      [ ! -e "$HOME/.pi/agent/keybindings.json" ] || exit 9
      mkdir -p "$HOME/.pi/agent"
      printf '%s\\n' '{"app.clipboard.pasteImage":["shift+v"],"createdBy":"pi-install"}' > "$HOME/.pi/agent/keybindings.json"
    fi
    printf '%s\\n' "$2" > "$FAKE_PI_STATE"
    ;;
  *" update --self "*) [ "${options.updateFails ? "1" : "0"}" = 0 ] ;;
  *" update "*) exit 0 ;;
  *" remove "*) rm -f "$FAKE_PI_STATE" ;;
  *) exit 2 ;;
esac
`, { mode: 0o700 });
  await writeFile(installer, `#!/bin/sh
set -eu
cp "$FAKE_PI_TEMPLATE" "$FAKE_PI_TARGET"
chmod 700 "$FAKE_PI_TARGET"
printf '%s\\n' official-installer >> "$FAKE_PI_LOG"
`, { mode: 0o700 });
  await writeFile(fakeCurl, `#!/bin/sh
set -eu
all_args=$*
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift; output=$1 ;;
    https://*) url=$1 ;;
  esac
  shift
done
[ "$url" = 'https://pi.dev/install.sh' ]
[ -n "$output" ]
cp "$FAKE_INSTALLER_SOURCE" "$output"
printf '%s\\n' "curl $all_args" >> "$FAKE_PI_LOG"
`, { mode: 0o700 });
  await writeFile(fakeUname, `#!/bin/sh
case "\${1:-}" in
  -s) printf '%s\\n' "$FAKE_UNAME_S" ;;
  -m) printf '%s\\n' "$FAKE_UNAME_M" ;;
  *) exit 2 ;;
esac
`, { mode: 0o700 });
  await writeFile(forbiddenSharedWorkflowCommand, `#!/bin/sh
printf '%s\\n' "$(basename "$0") $*" >> "$FAKE_PI_LOG"
exit 97
`, { mode: 0o700 });
  await Promise.all(["npm", "npx", "rose-aili"].map((name) => cp(forbiddenSharedWorkflowCommand, join(bin, name))));
  if (options.withPi !== false) await cp(template, pi);
  await chmod(pi, options.withPi === false ? 0o600 : 0o700).catch(() => undefined);
  const env = {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: home,
    FAKE_PI_LOG: log,
    FAKE_PI_STATE: state,
    FAKE_PI_TEMPLATE: template,
    FAKE_PI_TARGET: pi,
    FAKE_INSTALLER_SOURCE: installer,
    FAKE_UNAME_S: options.platform ?? "Linux",
    FAKE_UNAME_M: options.architecture ?? "x86_64",
    FAKE_PI_KEYBINDING_ORDER_CHECK: options.assertKeybindingApplyAfterInstall ? "1" : "0",
  };
  return { root, home, log, state, pi, env };
}

function run(env: NodeJS.ProcessEnv, args: string[] = []) {
  return spawnSync("sh", [INSTALL, ...args], { cwd: ROOT, env, encoding: "utf8" });
}

function runBootstrap(env: NodeJS.ProcessEnv, args: string[] = []) {
  return spawnSync("sh", [BOOTSTRAP, ...args], { cwd: ROOT, env, encoding: "utf8" });
}

function runSettingsMerger(env: NodeJS.ProcessEnv, args: string[] = []) {
  return spawnSync(process.execPath, [SETTINGS_MERGER, ...args], { cwd: ROOT, env, encoding: "utf8" });
}

function runKeybindingsMerger(env: NodeJS.ProcessEnv, args: string[] = []) {
  return spawnSync(process.execPath, [KEYBINDINGS_MERGER, ...args], { cwd: ROOT, env, encoding: "utf8" });
}

function wslEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, WSL_DISTRO_NAME: "AILI-Test-WSL" };
}

describe("thin Unix bootstrap", () => {
  it("uses only the official installer when Pi is absent, then installs AILI", async () => {
    const fx = await fixture({ withPi: false });
    const result = run(fx.env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pi_state=installed aili_state=installed");
    expect(result.stdout).toContain("platform=linux architecture=x86_64");
    expect(result.stdout).toContain("shared_workflows_status=not-run owner=explicit-user-command");
    expect(result.stdout).toContain("shared_workflows_install_command=npx -y rose-aili@0.4.2 install");
    expect(result.stdout).toContain("shared_workflows_update_command=npx -y rose-aili@0.4.2 update");
    expect(result.stdout).toContain("pi_package_update_command=pi update npm:@rosetears/aili-pi");
    expect(result.stdout).toContain("pi_package_remove_command=pi remove npm:@rosetears/aili-pi");
    const log = await readFile(fx.log, "utf8");
    expect(log).toContain("official-installer");
    expect(log).toContain("--proto =https --proto-redir =https");
    expect(log).toContain("--connect-timeout 15 --max-time 120 --max-filesize 1048576");
    expect(log).toContain("install npm:@rosetears/aili-pi@latest");
    expect(log).not.toMatch(/^(?:npm|npx|rose-aili)(?: |$)/m);
    expect(await lstat(join(fx.home, ".agents/skills")).catch(() => undefined)).toBeUndefined();
  });

  it("validates settings idempotently without changing unrelated user state", async () => {
    const fx = await fixture();
    const agentState = join(fx.home, ".pi/agent");
    const settings = join(agentState, "settings.json");
    await mkdir(agentState, { recursive: true });
    const originalSettings = '{"theme":"rose","compaction":{"threshold":42}}\n';
    await writeFile(settings, originalSettings, { mode: 0o640 });
    const files = [
      join(agentState, "auth.json"),
      join(agentState, "sessions/session.jsonl"),
      join(fx.home, "project/owned.txt"),
    ];
    for (const [index, file] of files.entries()) {
      await mkdir(resolve(file, ".."), { recursive: true });
      await writeFile(file, `user-owned-${index}\n`);
    }
    const before = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(run(fx.env).status).toBe(0);
    expect(await readFile(settings, "utf8")).toBe(originalSettings);
    expect((await stat(settings)).mode & 0o777).toBe(0o640);

    expect(run(fx.env).status).toBe(0);
    expect(await readFile(settings, "utf8")).toBe(originalSettings);
    expect(await Promise.all(files.map((file) => readFile(file, "utf8")))).toEqual(before);
    const log = await readFile(fx.log, "utf8");
    expect(log).not.toContain("official-installer");
    expect(log.match(/install npm:@rosetears\/aili-pi@latest/g)).toHaveLength(2);
    expect((await readFile(fx.state, "utf8")).trim()).toBe("npm:@rosetears/aili-pi@latest");
  });

  it("leaves missing global settings absent without touching project settings", async () => {
    const fx = await fixture();
    const projectSettings = join(fx.root, ".pi/settings.json");
    await mkdir(resolve(projectSettings, ".."), { recursive: true });
    await writeFile(projectSettings, '{"compaction":{"enabled":true}}\n');

    const result = runBootstrap(fx.env);
    expect(result.status).toBe(0);
    expect(await readFile(join(fx.home, ".pi/agent/settings.json"), "utf8").catch(() => undefined)).toBeUndefined();
    expect(await readFile(projectSettings, "utf8")).toBe('{"compaction":{"enabled":true}}\n');
  });

  it.each([
    ["explicit true", '{"compaction":{"enabled":true,"threshold":42}}\n'],
    ["unmarked explicit false", '{"compaction":{"enabled":false,"threshold":42}}\n'],
  ])("preserves %s settings byte-for-byte on validation and refresh", async (_label, original) => {
    const fx = await fixture();
    const settings = join(fx.home, ".pi/agent/settings.json");
    await mkdir(resolve(settings, ".."), { recursive: true });
    await writeFile(settings, original, { mode: 0o600 });

    expect(runSettingsMerger(fx.env).status).toBe(0);
    expect(await readFile(settings, "utf8")).toBe(original);
    expect(runSettingsMerger(fx.env, ["--check"]).status).toBe(0);
    expect(await readFile(settings, "utf8")).toBe(original);
  });

  it("validates readable settings without requiring write access", async () => {
    const fx = await fixture();
    const agentState = join(fx.home, ".pi/agent");
    const settings = join(agentState, "settings.json");
    const original = '{"theme":"rose"}\n';
    await mkdir(agentState, { recursive: true });
    await writeFile(settings, original, { mode: 0o600 });
    await chmod(agentState, 0o500);
    try {
      expect(runSettingsMerger(fx.env).status).toBe(0);
      expect(await readFile(settings, "utf8")).toBe(original);
    } finally {
      await chmod(agentState, 0o700);
    }
  });

  it.each([
    ["malformed JSON", '{"theme":'],
    ["non-object root", '[1,2,3]\n'],
  ])("fails on %s without changing settings bytes", async (_label, original) => {
    const fx = await fixture();
    const settings = join(fx.home, ".pi/agent/settings.json");
    await mkdir(resolve(settings, ".."), { recursive: true });
    await writeFile(settings, original, { mode: 0o600 });

    const result = run(fx.env);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("stage=user-global-settings-validate");
    expect(await readFile(settings, "utf8")).toBe(original);
    expect(await readFile(fx.log, "utf8")).not.toContain("install npm:");
  });

  it("atomically creates the default WSL image-paste bindings when the target is absent", async () => {
    const fx = await fixture();
    const target = join(fx.home, ".pi/agent/keybindings.json");
    const result = runKeybindingsMerger(wslEnvironment(fx.env));

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readFile(target, "utf8")).toBe(`{
  "app.clipboard.pasteImage": [
    "ctrl+v",
    "alt+v"
  ]
}
`);
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it("preserves unrelated WSL keybindings and adds only the image-paste action", async () => {
    const fx = await fixture();
    const target = join(fx.home, ".pi/agent/keybindings.json");
    const original = '{"app.editor.undo":["ctrl+z"],"nested":{"enabled":true}}\n';
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, original, { mode: 0o640 });

    expect(runKeybindingsMerger(wslEnvironment(fx.env), ["--check"]).status).toBe(0);
    expect(await readFile(target, "utf8")).toBe(original);
    expect(runKeybindingsMerger(wslEnvironment(fx.env)).status).toBe(0);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
      "app.editor.undo": ["ctrl+z"],
      nested: { enabled: true },
      "app.clipboard.pasteImage": ["ctrl+v", "alt+v"],
    });
  });

  it("preserves an explicit image-paste action and the entire file byte-for-byte", async () => {
    const fx = await fixture();
    const target = join(fx.home, ".pi/agent/keybindings.json");
    const original = '{  "app.clipboard.pasteImage" : ["shift+insert"], "other": null }\n\n';
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, original, { mode: 0o640 });

    expect(runKeybindingsMerger(wslEnvironment(fx.env), ["--check"]).status).toBe(0);
    expect(runKeybindingsMerger(wslEnvironment(fx.env)).status).toBe(0);
    expect(await readFile(target, "utf8")).toBe(original);
    expect((await stat(target)).mode & 0o777).toBe(0o640);
  });

  it.each([
    ["malformed JSON", '{"app.editor.undo":'],
    ["non-object root", '["ctrl+v"]\n'],
  ])("fails closed for WSL %s keybindings", async (_label, original) => {
    const fx = await fixture();
    const target = join(fx.home, ".pi/agent/keybindings.json");
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, original, { mode: 0o600 });

    const result = runKeybindingsMerger(wslEnvironment(fx.env), ["--check"]);
    expect(result.status).toBe(1);
    expect(await readFile(target, "utf8")).toBe(original);
  });

  it("rejects symlinked and non-regular WSL keybinding targets", async () => {
    const linked = await fixture();
    const linkedTarget = join(linked.home, ".pi/agent/keybindings.json");
    const destination = join(linked.home, "user-keybindings.json");
    await mkdir(resolve(linkedTarget, ".."), { recursive: true });
    await writeFile(destination, '{"user":true}\n');
    await symlink(destination, linkedTarget);

    const linkedResult = runKeybindingsMerger(wslEnvironment(linked.env), ["--check"]);
    expect(linkedResult.status).toBe(1);
    expect(linkedResult.stderr).toContain("symlinks are not allowed");
    expect((await lstat(linkedTarget)).isSymbolicLink()).toBe(true);
    expect(await readlink(linkedTarget)).toBe(destination);
    expect(await readFile(destination, "utf8")).toBe('{"user":true}\n');

    const nonRegular = await fixture();
    const nonRegularTarget = join(nonRegular.home, ".pi/agent/keybindings.json");
    await mkdir(nonRegularTarget, { recursive: true });
    const nonRegularResult = runKeybindingsMerger(wslEnvironment(nonRegular.env), ["--check"]);
    expect(nonRegularResult.status).toBe(1);
    expect(nonRegularResult.stderr).toContain("must be a regular file");
    expect((await stat(nonRegularTarget)).isDirectory()).toBe(true);
  });

  it("is a non-WSL no-op without validating or changing the target", async () => {
    const fx = await fixture();
    const target = join(fx.home, ".pi/agent/keybindings.json");
    const malformed = '{not-json\n';
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, malformed, { mode: 0o640 });
    const moduleUrl = pathToFileURL(KEYBINDINGS_MERGER).href;
    const program = `
      import { mergeGlobalKeybindings } from ${JSON.stringify(moduleUrl)};
      const options = {
        environment: process.env,
        platform: "linux",
        operations: { readFile: async () => "6.8.0-linux" },
      };
      const applyResult = await mergeGlobalKeybindings(options);
      const checkResult = await mergeGlobalKeybindings({ ...options, args: ["--check"] });
      if (applyResult.status !== "not-wsl" || checkResult.status !== "not-wsl") process.exitCode = 2;
    `;

    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: ROOT,
      env: fx.env,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(await readFile(target, "utf8")).toBe(malformed);
    expect((await stat(target)).mode & 0o777).toBe(0o640);
  });

  it("keeps the original target and removes only its own temp after an injected rename failure", async () => {
    const fx = await fixture();
    const agentState = join(fx.home, ".pi/agent");
    const target = join(agentState, "keybindings.json");
    const original = '{"app.editor.undo":["ctrl+z"]}\n';
    await mkdir(agentState, { recursive: true });
    await writeFile(target, original, { mode: 0o640 });
    const moduleUrl = pathToFileURL(KEYBINDINGS_MERGER).href;
    const program = `
      import { mergeGlobalKeybindings } from ${JSON.stringify(moduleUrl)};
      const failure = Object.assign(new Error("injected rename failure"), { code: "EIO" });
      await mergeGlobalKeybindings({
        environment: process.env,
        operations: { rename: async () => { throw failure; } },
      });
    `;

    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: ROOT,
      env: wslEnvironment(fx.env),
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("injected rename failure");
    expect(await readFile(target, "utf8")).toBe(original);
    expect((await stat(target)).mode & 0o777).toBe(0o640);
    expect(await readdir(agentState)).toEqual(["keybindings.json"]);
  });

  it("checks WSL keybindings before package installation and applies only afterward", async () => {
    const ordered = await fixture({ assertKeybindingApplyAfterInstall: true });
    const orderedResult = run(wslEnvironment(ordered.env));
    const orderedTarget = join(ordered.home, ".pi/agent/keybindings.json");
    expect(orderedResult.status).toBe(0);
    expect(await readFile(orderedTarget, "utf8")).toBe(
      '{"app.clipboard.pasteImage":["shift+v"],"createdBy":"pi-install"}\n',
    );

    const invalid = await fixture();
    const invalidTarget = join(invalid.home, ".pi/agent/keybindings.json");
    const malformed = '{"app.clipboard.pasteImage":';
    await mkdir(resolve(invalidTarget, ".."), { recursive: true });
    await writeFile(invalidTarget, malformed);
    const invalidResult = run(wslEnvironment(invalid.env));
    expect(invalidResult.status).toBe(1);
    expect(invalidResult.stdout).toContain("stage=user-global-keybindings-validate");
    expect(await readFile(invalidTarget, "utf8")).toBe(malformed);
    expect(await readFile(invalid.log, "utf8")).not.toContain("install npm:");
  });

  it("updates official Pi only when explicitly requested", async () => {
    const normal = await fixture();
    expect(run(normal.env).status).toBe(0);
    expect(await readFile(normal.log, "utf8")).not.toContain("update --self");
    const update = await fixture();
    const result = run(update.env, ["--update-pi"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pi_state=updated");
    expect(await readFile(update.log, "utf8")).toContain("update --self");
  });

  it("accepts the exact Pi 0.82.1 compatibility floor", async () => {
    const compatible = await fixture({ version: "0.82.1" });
    const result = run(compatible.env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("preflight=pass pi_version=0.82.1");
    expect(await readFile(compatible.log, "utf8")).toContain("install npm:@rosetears/aili-pi@latest");
  });

  it("fails before package mutation for incompatible Pi and unsupported platforms", async () => {
    const incompatible = await fixture({ version: "0.82.0" });
    const versionResult = run(incompatible.env);
    expect(versionResult.status).toBe(1);
    expect(versionResult.stdout).toContain("stage=pi-version-incompatible");
    expect(await readFile(incompatible.log, "utf8")).not.toContain("install npm:");

    const malformed = await fixture({ version: "0.82.1-beta1" });
    expect(run(malformed.env).stdout).toContain("stage=pi-version-format");
    expect(await readFile(malformed.log, "utf8")).not.toContain("install npm:");

    const unsupported = await fixture({ platform: "MINGW64_NT" });
    const platformResult = run(unsupported.env);
    expect(platformResult.status).toBe(1);
    expect(platformResult.stdout).toContain("unsupported=native-windows-or-other");
    expect(await readFile(unsupported.log, "utf8").catch(() => "")).toBe("");

    const macos = await fixture({ platform: "Darwin", architecture: "arm64" });
    const macosResult = run(macos.env);
    expect(macosResult.status).toBe(1);
    expect(macosResult.stdout).toContain("stage=platform unsupported=macos");
    expect(await readFile(macos.log, "utf8").catch(() => "")).toBe("");
  });

  it("reports partial state and repair/remove commands without rolling Pi back", async () => {
    const fx = await fixture({ withPi: false, installFails: true });
    const result = run(fx.env);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("pi_state=installed");
    expect(result.stdout).toContain("aili_state=possibly-partial");
    expect(result.stdout).toContain("repair=pi install npm:@rosetears/aili-pi@latest");
    expect(result.stdout).toContain("optional_destructive_remove=pi remove npm:@rosetears/aili-pi");
    expect(await readFile(fx.pi, "utf8")).toContain("FAKE_PI_LOG");
    expect(await readFile(join(fx.home, ".pi/agent/settings.json"), "utf8").catch(() => undefined)).toBeUndefined();

    const existing = await fixture({ installFails: true });
    await writeFile(existing.state, "npm:@rosetears/aili-pi@latest\n");
    const existingResult = run(existing.env);
    expect(existingResult.stdout).toContain("aili_state=previous-installation-may-remain");
    expect(existingResult.stdout).not.toContain("aili_state=not-installed");
  });

  it("delegates list, update, and remove to Pi without a parallel receipt", async () => {
    const fx = await fixture({ platform: "Linux", architecture: "aarch64" });
    const result = run(fx.env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("platform=linux architecture=aarch64");
    expect(result.stdout).toContain("shared_workflows_status=not-run owner=explicit-user-command");
    expect(result.stdout).toContain("pi_package_update_command=pi update npm:@rosetears/aili-pi");
    expect(result.stdout).toContain("pi_package_remove_command=pi remove npm:@rosetears/aili-pi");
    expect(spawnSync(fx.pi, ["list"], { env: fx.env, encoding: "utf8" }).stdout).toContain("npm:@rosetears/aili-pi");
    expect(spawnSync(fx.pi, ["update", "npm:@rosetears/aili-pi"], { env: fx.env, encoding: "utf8" }).status).toBe(0);
    expect(spawnSync(fx.pi, ["remove", "npm:@rosetears/aili-pi"], { env: fx.env, encoding: "utf8" }).status).toBe(0);
    const log = await readFile(fx.log, "utf8");
    expect(log).not.toContain("curl https://pi.dev/install.sh");
    expect(log).toContain("install npm:@rosetears/aili-pi@latest");
    expect(log).toContain("update npm:@rosetears/aili-pi");
    expect(log).toContain("remove npm:@rosetears/aili-pi");
    expect(log).not.toMatch(/^(?:npm|npx|rose-aili)(?: |$)/m);
  });

  it("fails closed for API, package resource, headless, and update failures", async () => {
    const api = await fixture({ help: "  --extension-tools\n  --no-extensions\n  --no-skills\n  --no-prompt-templates\n  --mode\n  --no-session\n  --print\n  --offline\n  --list-models" });
    expect(run(api.env).stdout).toContain("stage=pi-api-incompatible");
    expect(await readFile(api.log, "utf8")).not.toContain("install npm:");

    const update = await fixture({ updateFails: true });
    const updateResult = run(update.env, ["--update-pi"]);
    expect(updateResult.stdout).toContain("stage=official-pi-update");
    expect(updateResult.stdout).toContain("pi_state=update-attempted-possibly-changed");
    expect(await readFile(update.log, "utf8")).not.toContain("install npm:");

    const resource = await fixture({ listFails: true });
    expect(run(resource.env).stdout).toContain("stage=pi-package-resource-probe");
    expect(await readFile(resource.log, "utf8")).not.toContain("install npm:");

    const headless = await fixture({ headlessFails: true });
    expect(run(headless.env).stdout).toContain("stage=pi-headless-load-probe");
    expect(await readFile(headless.log, "utf8")).not.toContain("install npm:");
  });

  it("does not expose production behavior overrides through test environment variables", async () => {
    const fx = await fixture();
    const result = run({
      ...fx.env,
      AILI_BOOTSTRAP_TESTING: "1",
      AILI_BOOTSTRAP_TEST_PACKAGE_SOURCE: "/attacker/package.tgz",
      AILI_BOOTSTRAP_TEST_PLATFORM: "unsupported",
      AILI_BOOTSTRAP_TEST_PI_COMMAND: "/attacker/pi",
    });
    expect(result.status).toBe(0);
    const log = await readFile(fx.log, "utf8");
    expect(log).toContain("install npm:@rosetears/aili-pi@latest");
    expect(log).not.toContain("attacker");
  });
});
