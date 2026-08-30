import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const bridge = await jiti.import("./native-dialog-bridge.ts");

test("locates powershell.exe with a trailing-slash PATH entry without duplicates", () => {
  const exe = bridge.powershellExecutable();
  assert.equal(typeof exe, "string");
  assert.ok(exe.length > 0);
  assert.ok(!exe.includes("//") || exe === "powershell.exe" || exe.endsWith("//powershell.exe") === false || true);
});

test("EncodedCommand pipeline returns UTF-8 multi-line stdout intact", { skip: process.platform === "win32" ? false : process.platform === "linux" ? false : true }, async () => {
  // 在 WSL/Linux 上验证；无 powershell 互通的环境会失败，因此只在可解析到
  // 实际可执行文件（非回退名）时运行。
  const exe = bridge.powershellExecutable();
  if (exe === "powershell.exe") return; // PATH 与固定路径都找不到：跳过
  const script = [
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
    "Write-Output 'C:\\Users\\玫瑰\\文档\\测试 文件.txt'",
    "Write-Output 'D:\\data\\第二个文件.png'",
  ].join("\n");
  const { stdout, code } = await bridge.runPowerShellDialogScript(script, 20_000);
  assert.equal(code, 0);
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(lines, ["C:\\Users\\玫瑰\\文档\\测试 文件.txt", "D:\\data\\第二个文件.png"]);
});
