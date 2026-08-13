import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, realpath, rm, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const WEB_SESSION_COOKIE = "aili_web_session";
export const WEB_BOOTSTRAP_TTL_MS = 60_000;
export const WEB_SESSION_IDLE_TTL_MS = 30 * 60_000;
export const WEB_SESSION_ABSOLUTE_TTL_MS = 8 * 60 * 60_000;
export const WEB_MAX_REQUEST_BYTES = 1024 * 1024;
export const WEB_MAX_SECRET_ARTIFACT_BYTES = 4 * 1024;

export interface WebListenPolicyInput {
  readonly hostname: string;
  readonly port: number;
  readonly accessPhrase?: string;
  readonly expectedHost?: string;
  readonly expectedOrigin?: string;
  /** Roots must already be absolute, normalized real paths. Use canonicalizeAllowedRoots at an I/O boundary. */
  readonly allowedRoots?: readonly string[];
  readonly protocol?: "http" | "https";
}

export interface ApprovedWebListenPolicy {
  readonly hostname: string;
  readonly port: number;
  readonly loopback: boolean;
  readonly expectedHost: string;
  readonly expectedOrigin: string;
  readonly allowedRoots: readonly string[];
  readonly requiresAccessPhrase: boolean;
}

export interface WebRequestIdentity {
  readonly host?: string;
  readonly origin?: string;
  readonly cookie?: string;
  /** Accepted only by login(); protected routes never re-consume a password. */
  readonly accessPhrase?: string;
}

export interface WebRequestAdmission extends WebRequestIdentity {
  readonly method?: string;
  readonly bodyBytes?: number;
  readonly contentType?: string;
  readonly mutation?: boolean;
  readonly capabilityAllowed?: boolean;
  readonly allowLoopbackReadWithoutSession?: boolean;
}

export type AuthorizationResult =
  | { readonly ok: true; readonly sessionId: string; readonly authMode?: "session" | "loopback-read" }
  | { readonly ok: false; readonly reason: string };

interface BrowserSession {
  readonly createdAt: number;
  readonly passwordGeneration: number;
  expiresAt: number;
  idleExpiresAt: number;
}

/**
 * Validate every synchronous bind invariant. Callers that accept operator paths
 * must first replace them with canonicalizeAllowedRoots() output. No listener is
 * permitted to be created until this function succeeds.
 */
export function validateWebListenPolicy(input: WebListenPolicyInput): ApprovedWebListenPolicy {
  const hostname = normalizeHostname(input.hostname);
  if (!Number.isSafeInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error("web port must be from 1 through 65535");
  }
  const loopback = isLoopbackHost(hostname);
  if (!loopback && (!input.expectedHost || !input.expectedOrigin)) {
    throw new Error("non-loopback web binding requires an explicit exact Host and Origin policy before listen");
  }
  const expectedHost = input.expectedHost ?? hostFor(hostname, input.port);
  const expectedOrigin = input.expectedOrigin ?? `${input.protocol ?? "http"}://${expectedHost}`;
  const allowedRoots = Object.freeze(validateCanonicalRootStrings(input.allowedRoots ?? []));
  if (!isExactHost(expectedHost) || !isExactOrigin(expectedOrigin, expectedHost)) {
    throw new Error("web Host and Origin must be exact values");
  }
  if (!loopback) {
    if (!strongPhrase(input.accessPhrase)) throw new Error("non-loopback web binding requires a password before listen");
    if (allowedRoots.length === 0) {
      throw new Error("non-loopback web binding requires canonical allowed roots before listen");
    }
  } else if (input.accessPhrase !== undefined && !strongPhrase(input.accessPhrase)) {
    throw new Error("configured loopback password is invalid");
  }
  return Object.freeze({
    hostname,
    port: input.port,
    loopback,
    expectedHost,
    expectedOrigin,
    allowedRoots,
    requiresAccessPhrase: !loopback,
  });
}

/** Canonicalize roots with realpath and prove each root is a directory. */
export async function canonicalizeAllowedRoots(roots: readonly string[]): Promise<readonly string[]> {
  if (!Array.isArray(roots)) throw new Error("allowed roots must be an array");
  const canonical: string[] = [];
  for (const root of roots) {
    if (typeof root !== "string" || !isAbsolute(root) || root.includes("\0")) {
      throw new Error("allowed roots must be absolute paths");
    }
    const resolved = await realpath(root);
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new Error("an allowed root is not a directory");
    if (!canonical.includes(resolved)) canonical.push(resolved);
  }
  canonical.sort(bytewiseCompare);
  return Object.freeze(canonical);
}

/** Canonicalize roots and then apply the complete pre-listen policy. */
export async function approveWebListenPolicy(input: WebListenPolicyInput): Promise<ApprovedWebListenPolicy> {
  const allowedRoots = await canonicalizeAllowedRoots(input.allowedRoots ?? []);
  return validateWebListenPolicy({ ...input, allowedRoots });
}

export function isLoopbackHost(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

/**
 * In-memory, restart-bounded browser authentication lifecycle. Bootstrap
 * material is one-use; password material is retained only as a digest; browser
 * cookies are non-persistent, HttpOnly, and rotated on every login.
 */
export class WebAccessLifecycle {
  private readonly sessions = new Map<string, BrowserSession>();
  private bootstrap?: { digest: Buffer; expiresAt: number };
  private phraseDigest?: Buffer;
  private passwordGeneration = 1;

  public constructor(
    private readonly policy: ApprovedWebListenPolicy,
    phrase?: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (policy.requiresAccessPhrase && !strongPhrase(phrase)) throw new Error("non-loopback password is required");
    this.phraseDigest = phrase === undefined ? undefined : secretDigest(phrase);
  }

  public get loopback(): boolean { return this.policy.loopback; }
  public get activeSessionCount(): number { return this.sessions.size; }

  public createBootstrap(): string {
    const value = randomBytes(32);
    this.bootstrap = { digest: secretDigest(value), expiresAt: this.now().getTime() + WEB_BOOTSTRAP_TTL_MS };
    const encoded = value.toString("base64url");
    value.fill(0);
    return encoded;
  }

  public consumeBootstrap(
    value: string,
    request: Pick<WebRequestIdentity, "host" | "origin" | "cookie">,
  ): { readonly sessionId: string; readonly setCookie: string } | undefined {
    const bootstrap = this.bootstrap;
    this.bootstrap = undefined;
    if (!bootstrap || bootstrap.expiresAt <= this.now().getTime() || !this.exactSite(request.host, request.origin, true)) {
      bootstrap?.digest.fill(0);
      return undefined;
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
      bootstrap.digest.fill(0);
      return undefined;
    }
    let candidate: Buffer;
    try { candidate = Buffer.from(value, "base64url"); }
    catch { bootstrap.digest.fill(0); return undefined; }
    const digest = secretDigest(candidate);
    candidate.fill(0);
    const accepted = digest.byteLength === bootstrap.digest.byteLength && timingSafeEqual(digest, bootstrap.digest);
    digest.fill(0);
    bootstrap.digest.fill(0);
    if (!accepted) return undefined;
    return this.issueSession(request.cookie);
  }

  public login(
    accessPhrase: string,
    request: WebRequestAdmission,
  ): { readonly sessionId: string; readonly setCookie: string } | undefined {
    if (!this.exactSite(request.host, request.origin, true) || !this.phraseDigest || !strongPhrase(accessPhrase)
      || request.method?.toUpperCase() !== "POST" || !isJsonContentType(request.contentType)
      || request.bodyBytes === undefined || !Number.isSafeInteger(request.bodyBytes)
      || request.bodyBytes < 0 || request.bodyBytes > WEB_MAX_REQUEST_BYTES) return undefined;
    const candidate = secretDigest(accessPhrase);
    const accepted = candidate.byteLength === this.phraseDigest.byteLength && timingSafeEqual(candidate, this.phraseDigest);
    candidate.fill(0);
    if (!accepted) return undefined;
    return this.issueSession(request.cookie);
  }

  /** Validate a protected request. Raw passwords are deliberately ignored here. */
  public authorize(request: WebRequestIdentity): AuthorizationResult {
    return this.authorizeRequest({ ...request, mutation: false, allowLoopbackReadWithoutSession: false });
  }

  /** Perform Host/Origin, body, content-type, capability, and session admission before route logic. */
  public authorizeRequest(request: WebRequestAdmission): AuthorizationResult {
    const mutation = request.mutation ?? isMutationMethod(request.method);
    if (!this.exactSite(request.host, request.origin, mutation || !this.policy.loopback)) {
      return { ok: false, reason: "host-or-origin-mismatch" };
    }
    if (request.capabilityAllowed === false) return { ok: false, reason: "capability-denied" };
    if (request.bodyBytes !== undefined
      && (!Number.isSafeInteger(request.bodyBytes) || request.bodyBytes < 0 || request.bodyBytes > WEB_MAX_REQUEST_BYTES)) {
      return { ok: false, reason: "request-size-invalid" };
    }
    if (mutation) {
      if (!isMutationMethod(request.method)) return { ok: false, reason: "mutation-method-required" };
      if (!isJsonContentType(request.contentType)) return { ok: false, reason: "json-content-type-required" };
      if (request.bodyBytes === undefined) return { ok: false, reason: "request-size-required" };
    }

    const sessionId = cookieValue(request.cookie, WEB_SESSION_COOKIE);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    const now = this.now().getTime();
    if (session && session.passwordGeneration === this.passwordGeneration
      && session.expiresAt > now && session.idleExpiresAt > now) {
      session.idleExpiresAt = Math.min(session.expiresAt, now + WEB_SESSION_IDLE_TTL_MS);
      return { ok: true, sessionId: sessionId!, authMode: "session" };
    }
    if (sessionId) this.sessions.delete(sessionId);
    if (!mutation && this.policy.loopback && request.allowLoopbackReadWithoutSession === true) {
      return { ok: true, sessionId: "loopback-read-policy", authMode: "loopback-read" };
    }
    return { ok: false, reason: "same-site-session-required" };
  }

  public logout(sessionId: string): string {
    this.sessions.delete(sessionId);
    return expiredCookie(this.policy.expectedOrigin);
  }

  /** A password change immediately invalidates all sessions and one-use bootstrap material. */
  public changeAccessPhrase(nextPhrase: string): void {
    if (!strongPhrase(nextPhrase)) throw new Error("password must contain from 12 through 1024 characters");
    this.erasePhraseDigest();
    this.phraseDigest = secretDigest(nextPhrase);
    this.passwordGeneration += 1;
    this.clearSecrets();
  }

  /** Expire timed-out sessions deterministically without exposing their identifiers. */
  public expire(): number {
    const now = this.now().getTime();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.passwordGeneration !== this.passwordGeneration || session.expiresAt <= now || session.idleExpiresAt <= now) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    if (this.bootstrap && this.bootstrap.expiresAt <= now) {
      this.bootstrap.digest.fill(0);
      this.bootstrap = undefined;
    }
    return removed;
  }

  public dispose(): void {
    this.clearSecrets();
    this.erasePhraseDigest();
  }

  private issueSession(previousCookie?: string): { readonly sessionId: string; readonly setCookie: string } {
    const previousId = cookieValue(previousCookie, WEB_SESSION_COOKIE);
    if (previousId) this.sessions.delete(previousId);
    const sessionId = randomBytes(32).toString("base64url");
    const now = this.now().getTime();
    this.sessions.set(sessionId, {
      createdAt: now,
      expiresAt: now + WEB_SESSION_ABSOLUTE_TTL_MS,
      idleExpiresAt: now + WEB_SESSION_IDLE_TTL_MS,
      passwordGeneration: this.passwordGeneration,
    });
    return { sessionId, setCookie: sessionCookie(sessionId, this.policy.expectedOrigin) };
  }

  private exactSite(host?: string, origin?: string, requireOrigin = true): boolean {
    if (host !== this.policy.expectedHost) return false;
    if (origin === undefined && !requireOrigin) return true;
    return origin === this.policy.expectedOrigin;
  }

  private clearSecrets(): void {
    if (this.bootstrap) this.bootstrap.digest.fill(0);
    this.bootstrap = undefined;
    this.sessions.clear();
  }

  private erasePhraseDigest(): void {
    this.phraseDigest?.fill(0);
    this.phraseDigest = undefined;
  }
}

export interface AllowedPathGrant {
  readonly requestedPath: string;
  readonly resolvedPath: string;
  readonly allowedRoot: string;
  readonly exists: boolean;
  /** The target itself, or the nearest existing ancestor for a create target. */
  readonly identityPath: string;
  readonly identity: Readonly<{ dev: bigint; ino: bigint; mode: bigint; mtimeNs: bigint; ctimeNs: bigint }>;
}

/** One lexical-plus-realpath policy shared by loopback and non-loopback routes. */
export class CanonicalAllowedRootPolicy {
  private constructor(public readonly roots: readonly string[]) {}

  public static async create(roots: readonly string[]): Promise<CanonicalAllowedRootPolicy> {
    return new CanonicalAllowedRootPolicy(await canonicalizeAllowedRoots(roots));
  }

  public async grant(target: string, options: { readonly mustExist?: boolean } = {}): Promise<AllowedPathGrant> {
    if (this.roots.length === 0) throw new Error("filesystem access requires an allowed root");
    if (typeof target !== "string" || !isAbsolute(target) || target.includes("\0")) throw new Error("target path must be absolute");
    const requestedPath = resolve(target);
    if (!this.lexicallyContained(requestedPath) || isCredentialPath(requestedPath)) throw new Error("target is outside the allowed filesystem boundary");

    const located = await locateCanonicalTarget(requestedPath);
    if (options.mustExist && !located.exists) throw new Error("target does not exist");
    const allowedRoot = this.roots.find((root) => pathContained(root, located.resolvedPath));
    if (!allowedRoot || isCredentialPath(located.resolvedPath)) throw new Error("target realpath escapes the allowed filesystem boundary");
    const info = await lstat(located.identityPath, { bigint: true });
    if (info.isSymbolicLink()) throw new Error("target identity is a symbolic link");
    return Object.freeze({
      requestedPath,
      resolvedPath: located.resolvedPath,
      allowedRoot,
      exists: located.exists,
      identityPath: located.identityPath,
      identity: Object.freeze(statIdentity(info)),
    });
  }

  /** Re-run immediately before mutation and reject stale targets or changed ancestors. */
  public async revalidate(grant: AllowedPathGrant): Promise<AllowedPathGrant> {
    const current = await this.grant(grant.requestedPath, { mustExist: grant.exists });
    if (current.resolvedPath !== grant.resolvedPath || current.exists !== grant.exists
      || current.identityPath !== grant.identityPath || !sameIdentity(current.identity, grant.identity)) {
      throw new Error("filesystem target changed after authorization");
    }
    return current;
  }

  private lexicallyContained(path: string): boolean {
    return this.roots.some((root) => pathContained(root, path));
  }
}

/** Credential and private-key targets remain denied even when nested under a broad allowed root. */
export async function revalidateAllowedPathImmediately(policy: CanonicalAllowedRootPolicy, grant: AllowedPathGrant): Promise<AllowedPathGrant> {
  return policy.revalidate(grant);
}

export function isCredentialPath(path: string): boolean {
  if (!isAbsolute(path)) return true;
  const components = path.split(sep).filter(Boolean).map((part) => part.toLowerCase());
  const base = components.at(-1) ?? "";
  if (components.some((part) => [".ssh", ".gnupg", ".aws", ".azure", ".kube"].includes(part))) return true;
  if ([".env", ".npmrc", ".netrc", ".git-credentials", "auth.json", "credentials", "credentials.json", "oauth.json", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"].includes(base)
    || base.startsWith(".env.")) return true;
  if (/\.(?:pem|p12|pfx|key|keystore)$/i.test(base)) return true;
  return components.some((part, index) => part === ".pi" && components[index + 1] === "agent"
    && ["auth.json", "oauth.json", "credentials.json"].includes(components[index + 2] ?? ""));
}

export interface OwnerOnlyArtifact {
  readonly path: string;
  cleanup(): Promise<boolean>;
}

/** Create a bounded, no-follow, owner-only one-use local artifact without overwriting. */
export async function createOwnerOnlyArtifact(path: string, content: string | Uint8Array): Promise<OwnerOnlyArtifact> {
  if (!isAbsolute(path) || path.includes("\0")) throw new Error("owner-only artifact path must be absolute");
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  if (bytes.byteLength === 0 || bytes.byteLength > WEB_MAX_SECRET_ARTIFACT_BYTES) throw new Error("owner-only artifact size is invalid");
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await verifyOwnerOnlyArtifact(parent, "directory");
  let created = false;
  try {
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    created = true;
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    await verifyOwnerOnlyArtifact(path, "file");
  } catch (error) {
    if (created) await rm(path, { force: true }).catch(() => undefined);
    throw new Error(`owner-only artifact creation failed: ${redactedWebDiagnostic(error)}`);
  } finally {
    bytes.fill(0);
  }
  let consumed = false;
  return Object.freeze({
    path,
    cleanup: async () => {
      if (consumed) return false;
      consumed = true;
      return removeOwnerOnlyArtifact(path);
    },
  });
}

export async function verifyOwnerOnlyArtifact(path: string, kind: "file" | "directory"): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (kind === "file" ? !info.isFile() : !info.isDirectory())) {
    throw new Error("owner-only artifact has an unsafe file type");
  }
  if ((info.mode & 0o077) !== 0) throw new Error("owner-only artifact permissions are too broad");
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new Error("owner-only artifact has a different owner");
}

export async function removeOwnerOnlyArtifact(path: string): Promise<boolean> {
  try {
    await verifyOwnerOnlyArtifact(path, "file");
    await rm(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(`owner-only artifact cleanup failed: ${redactedWebDiagnostic(error)}`);
  }
}

const SECRET_KEY = /(?:password|passphrase|secret|token|cookie|authorization|api[-_]?key|bootstrap|credential|private[-_]?key|provider[-_]?secret)/i;

/** Recursively redact secret-bearing fields before logs, diagnostics, snapshots, or Analytics. */
export function redactWebSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 16) return "[REDACTED_DEPTH]";
  if (typeof value === "string") return redactWebSecretText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[REDACTED_CYCLE]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactWebSecrets(item, depth + 1, seen));
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactWebSecrets(nested, depth + 1, seen);
  }
  return output;
}

export function redactWebSecretText(value: string): string {
  return value
    .replace(/("(?:password|passphrase|secret|token|cookie|authorization|api[-_]?key|bootstrap|credential|private[-_]?key|provider[-_]?secret)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, "$1\"[REDACTED]\"")
    .replace(/("(?:password|passphrase|secret|token|cookie|authorization|api[-_]?key|bootstrap|credential|private[-_]?key|provider[-_]?secret)"\s*:\s*)(?:[^,}\s]+)/gi, "$1\"[REDACTED]\"")
    .replace(/\b(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi, "$1: [REDACTED]")
    .replace(/\b(password|passphrase|secret|token|api[-_]?key|bootstrap|credential|private[-_]?key|provider[-_]?secret)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_-]+/gi, "$1 [REDACTED]")
    .replace(/([?&](?:password|passphrase|secret|token|api[-_]?key|bootstrap|credential)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{43,}\b/g, "[REDACTED_TOKEN]");
}

export function redactedWebDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactWebSecretText(message).replace(/[\r\n]+/g, " ").slice(0, 240) || "operation failed";
}

function normalizeHostname(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (!candidate || candidate.includes("%") || candidate.includes("\0")) throw new Error("invalid web hostname");
  if (isIP(candidate) !== 0 || candidate === "localhost") return candidate;
  if (candidate.length > 253 || !candidate.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error("invalid web hostname");
  }
  return candidate;
}

function hostFor(hostname: string, port: number): string {
  return hostname.includes(":") ? `[${hostname}]:${port}` : `${hostname}:${port}`;
}

function isExactHost(value: string): boolean {
  const match = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\]):([0-9]{1,5})$/i.exec(value);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65535;
}

function isExactOrigin(value: string, host: string): boolean {
  return (value === `http://${host}` || value === `https://${host}`) && isExactHost(host);
}

function strongPhrase(value: string | undefined): boolean {
  return typeof value === "string" && value.length >= 12 && value.length <= 1024 && !value.includes("\0");
}

function secretDigest(value: string | Uint8Array): Buffer {
  return createHash("sha256").update(value).digest();
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header || /[\r\n]/.test(header)) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (key === name && /^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  }
  return undefined;
}

function sessionCookie(sessionId: string, origin: string): string {
  return `${WEB_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict${origin.startsWith("https:") ? "; Secure" : ""}`;
}

function expiredCookie(origin: string): string {
  return `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${origin.startsWith("https:") ? "; Secure" : ""}`;
}

function isMutationMethod(method: string | undefined): boolean {
  return method !== undefined && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function isJsonContentType(value: string | undefined): boolean {
  return typeof value === "string" && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value.trim());
}

function validateCanonicalRootStrings(roots: readonly string[]): string[] {
  if (!Array.isArray(roots)) throw new Error("allowed roots must be an array");
  const output: string[] = [];
  for (const root of roots) {
    if (typeof root !== "string" || !isAbsolute(root) || root.includes("\0") || resolve(root) !== root) {
      throw new Error("allowed roots must be canonical absolute paths");
    }
    if (!output.includes(root)) output.push(root);
  }
  output.sort(bytewiseCompare);
  return output;
}

function pathContained(root: string, target: string): boolean {
  const nested = relative(root, target);
  return nested === "" || (nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested));
}

async function locateCanonicalTarget(requestedPath: string): Promise<{ resolvedPath: string; identityPath: string; exists: boolean }> {
  try {
    const resolvedPath = await realpath(requestedPath);
    return { resolvedPath, identityPath: resolvedPath, exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let ancestor = dirname(requestedPath);
  while (true) {
    try {
      const canonicalAncestor = await realpath(ancestor);
      const suffix = relative(ancestor, requestedPath);
      return { resolvedPath: resolve(canonicalAncestor, suffix), identityPath: canonicalAncestor, exists: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new Error("no existing ancestor for target");
      ancestor = parent;
    }
  }
}

function statIdentity(info: BigIntStats): AllowedPathGrant["identity"] {
  return { dev: info.dev, ino: info.ino, mode: info.mode, mtimeNs: info.mtimeNs, ctimeNs: info.ctimeNs };
}

function sameIdentity(left: AllowedPathGrant["identity"], right: AllowedPathGrant["identity"]): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function bytewiseCompare(left: string, right: string): number {
  return Buffer.from(left).compare(Buffer.from(right));
}
