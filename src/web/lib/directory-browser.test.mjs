import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function loadSubject() {
  return import("./directory-browser.ts");
}

test("lists directories and directory symlinks without returning files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-browse-"));
  try {
    await mkdir(path.join(root, "project"));
    await writeFile(path.join(root, "notes.txt"), "test", "utf8");
    await symlink(path.join(root, "project"), path.join(root, "linked-project"));

    const { listDirectories } = await loadSubject();
    const directories = await listDirectories(root);

    assert.deepEqual(directories.map((entry) => entry.name), ["linked-project", "project"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expands home-relative paths and rejects missing directories", async () => {
  const {
    getBrowseStartDirectory,
    normalizeDirectory,
    resolveDirectory,
    shouldShowWindowsDrivePicker,
  } = await loadSubject();
  assert.equal(getBrowseStartDirectory(), homedir());
  assert.equal(getBrowseStartDirectory("/project"), "/project");
  assert.equal(shouldShowWindowsDrivePicker(undefined, "win32"), true);
  assert.equal(shouldShowWindowsDrivePicker(undefined, "darwin"), false);
  assert.equal(shouldShowWindowsDrivePicker(undefined, "linux"), false);
  assert.equal(shouldShowWindowsDrivePicker("C:\\Projects", "win32"), false);
  assert.equal(normalizeDirectory("~/project"), path.join(homedir(), "project"));
  await assert.rejects(resolveDirectory(path.join(tmpdir(), `pi-web-missing-${Date.now()}`)));
});

test("builds every Windows drive-letter candidate", async () => {
  const { getWindowsDriveCandidates } = await loadSubject();
  const drives = getWindowsDriveCandidates();

  assert.equal(drives.length, 26);
  assert.deepEqual(drives[0], { name: "A:", path: "A:\\" });
  assert.deepEqual(drives.at(-1), { name: "Z:", path: "Z:\\" });
});

test("finds parent directories across POSIX and Windows paths", async () => {
  const { getParentDirectory } = await loadSubject();

  assert.equal(getParentDirectory("/Users/alex/project"), "/Users/alex");
  assert.equal(getParentDirectory("/"), null);
  assert.equal(getParentDirectory("C:\\Users\\Alex\\project"), "C:\\Users\\Alex");
  assert.equal(getParentDirectory("C:\\"), null);
});

test("selects the native explorer command per platform including WSL", async () => {
  const { systemExplorerLauncher } = await loadSubject();
  assert.deepEqual(systemExplorerLauncher("win32", false), {
    command: "explorer", label: "Windows Explorer", requiresWslPath: false, ignoreExitCode: true,
  });
  assert.deepEqual(systemExplorerLauncher("darwin", false), {
    command: "open", label: "Finder", requiresWslPath: false, ignoreExitCode: false,
  });
  // 普通 Linux：xdg-open，无需路径翻译。
  assert.deepEqual(systemExplorerLauncher("linux", false), {
    command: "xdg-open", label: "system file manager", requiresWslPath: false, ignoreExitCode: false,
  });
  // WSL：explorer.exe + wslpath -w 翻译，且忽略其退出码。
  const wsl = systemExplorerLauncher("linux", true);
  assert.equal(wsl.command, "explorer.exe");
  assert.equal(wsl.requiresWslPath, true);
  assert.equal(wsl.ignoreExitCode, true);
});

test("openInSystemExplorer rejects missing directories without spawning", async () => {
  const { openInSystemExplorer } = await loadSubject();
  await assert.rejects(
    openInSystemExplorer(path.join(tmpdir(), "pi-web-browse-missing-目录")),
    /ENOENT|does not exist|not a directory/i,
  );
});

test("builds the PowerShell folder-pick script with fail-safe dialog flags", async () => {
  const { folderPickPowershellScript, stripFolderPickSuffix } = await loadSubject();
  const script = folderPickPowershellScript();
  assert.match(script, /System\.Windows\.Forms\.OpenFileDialog/);
  assert.match(script, /\$dlg\.ValidateNames = \$false/);
  assert.match(script, /\$dlg\.CheckFileExists = \$false/);
  assert.match(script, /Select this folder/);
  assert.doesNotMatch(folderPickPowershellScript(), /InitialDirectory/);
  // 初始目录会注入且单引号被转义。
  assert.match(folderPickPowershellScript("C:\\Users\\rose's"), /InitialDirectory = 'C:\\Users\\rose''s'/);

  // 文件名技巧后缀剥离（Windows 与 POSIX 分隔符都不残留）。
  assert.equal(stripFolderPickSuffix("\\\\wsl.localhost\\Ubuntu\\home\\rose\\code\\Select this folder"), "\\\\wsl.localhost\\Ubuntu\\home\\rose\\code");
  assert.equal(stripFolderPickSuffix("/home/rose/code/Select this folder"), "/home/rose/code");
  assert.equal(stripFolderPickSuffix("  "), "");
  assert.equal(stripFolderPickSuffix("/home/rose"), "/home/rose");
  // Windows 自动补上过滤器扩展名的污染变体也要剥干净。
  assert.equal(stripFolderPickSuffix("D:\\works\\雷小莉简历\\Select this folder.files"), "D:\\works\\雷小莉简历");
  assert.equal(stripFolderPickSuffix("/mnt/d/works/雷小莉简历/Select this folder.no"), "/mnt/d/works/雷小莉简历");
});
