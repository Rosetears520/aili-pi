import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface PackageManifest {
  bundledDependencies?: string[];
  dependencies?: Record<string, string>;
}

const root = process.cwd();
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as PackageManifest;
const bundles = manifest.bundledDependencies ?? [];

if (bundles.length === 0) {
  throw new Error("package must declare bundledDependencies");
}

const missingDeclarations = bundles.filter((name) => !manifest.dependencies?.[name]);
if (missingDeclarations.length > 0) {
  throw new Error(`bundled dependencies missing from dependencies: ${missingDeclarations.join(", ")}`);
}

const missingFiles: string[] = [];
for (const name of bundles) {
  try {
    await access(resolve(root, "node_modules", name, "package.json"));
  } catch {
    missingFiles.push(name);
  }
}

if (missingFiles.length > 0) {
  throw new Error(`bundled dependencies are not installed in the package root: ${missingFiles.join(", ")}`);
}

console.log(`package bundles verified: ${bundles.join(", ")}`);
