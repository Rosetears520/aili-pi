import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** Resolve the installed dependency from either a development tree or npm's hoisted scoped-package layout. */
export function resolvePermissionModesPackageRoot(from: string | URL = import.meta.url): URL {
  const packageJson = createRequire(from).resolve("pi-permission-modes/package.json");
  return new URL("./", pathToFileURL(packageJson));
}
