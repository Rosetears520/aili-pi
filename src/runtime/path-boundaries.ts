import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface CanonicalTarget {
  canonicalRoot: string;
  canonicalTarget: string;
  insideProject: boolean;
  protectedCredential: boolean;
}

export async function canonicalizeTarget(cwd: string, rawTarget: string): Promise<CanonicalTarget> {
  const canonicalRoot = await realpathOrResolve(cwd);
  const expanded = rawTarget === "~" ? homedir() : rawTarget.startsWith(`~${sep}`) ? resolve(homedir(), rawTarget.slice(2)) : rawTarget;
  const lexicalTarget = isAbsolute(expanded) ? resolve(expanded) : resolve(canonicalRoot, expanded);
  const canonicalTarget = await resolveThroughExistingParent(lexicalTarget);
  const projectRelative = relative(canonicalRoot, canonicalTarget);
  return {
    canonicalRoot,
    canonicalTarget,
    insideProject: projectRelative === "" || (!projectRelative.startsWith(`..${sep}`) && projectRelative !== ".." && !isAbsolute(projectRelative)),
    protectedCredential: isProtectedCredentialPath(lexicalTarget) || isProtectedCredentialPath(canonicalTarget),
  };
}

async function resolveThroughExistingParent(target: string): Promise<string> {
  const missing: string[] = [];
  let current = target;
  while (true) {
    try {
      await lstat(current);
      return resolve(await realpath(current), ...missing.reverse());
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = dirname(current);
      if (parent === current) return resolve(target);
      missing.push(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
      current = parent;
    }
  }
}

async function realpathOrResolve(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!isMissingPathError(error)) throw error;
    return resolve(path);
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function isProtectedCredentialPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const basename = normalized.split("/").at(-1) ?? "";
  if (/^\.env(?:\..+)?$/.test(basename)) return true;
  if (basename === ".envrc" || /^(?:secrets?|service[-_]?account|[a-z0-9._-]*(?:secret|credential|auth)[a-z0-9._-]*)\.(?:json|ya?ml)$/.test(basename)) return true;
  if (/^(?:auth\.json|credentials(?:\.json)?|\.git-credentials|\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519)$/.test(basename)) return true;
  if (/\.(?:pem|key|p12|pfx)$/.test(basename)) return true;
  if (/(?:^|\/)\.(?:ssh|aws|azure|gnupg)(?:\/|$)/.test(normalized)) return true;
  if (/(?:^|\/)\.pi\/agent\/auth\.json$/.test(normalized)) return true;
  if (/(?:^|\/)\.config\/(?:gh|gcloud|glab-cli|opencode)(?:\/|$)/.test(normalized)) return true;
  if (/(?:^|\/)\.docker\/config\.json$/.test(normalized)) return true;
  if (/(?:^|\/)\.kube\/config$/.test(normalized)) return true;
  return /(?:^|\/)\.git\/(?:config|credentials)$/.test(normalized);
}
