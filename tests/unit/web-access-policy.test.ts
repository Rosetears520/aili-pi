import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CanonicalAllowedRootPolicy,
  WEB_BOOTSTRAP_TTL_MS,
  WEB_MAX_REQUEST_BYTES,
  WEB_SESSION_COOKIE,
  WebAccessLifecycle,
  canonicalizeAllowedRoots,
  redactWebSecretText,
  redactWebSecrets,
  validateWebListenPolicy,
} from "../../src/runtime/web/access-policy.js";

function cookieHeader(setCookie: string): string {
  return setCookie.split(";", 1)[0]!;
}

async function withRoots(run: (root: string, outside: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "aili-web-root-"));
  const outside = await mkdtemp(join(tmpdir(), "aili-web-outside-"));
  try {
    await run(root, outside);
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
}

describe("web access and filesystem policy", () => {
  it("fails non-loopback policy before listen unless exact site, gate, and canonical roots are present", () => {
    expect(() => validateWebListenPolicy({ hostname: "0.0.0.0", port: 30141 })).toThrow(/Host and Origin/);
    expect(() => validateWebListenPolicy({
      hostname: "0.0.0.0",
      port: 30141,
      expectedHost: "web.example.test:30141",
      expectedOrigin: "https://web.example.test:30141",
    })).toThrow(/password/);
    expect(() => validateWebListenPolicy({
      hostname: "0.0.0.0",
      port: 30141,
      expectedHost: "web.example.test:30141",
      expectedOrigin: "https://web.example.test:30141",
      accessPhrase: "fixture-gate-value",
    })).toThrow(/allowed roots/);

    expect(validateWebListenPolicy({
      hostname: "0.0.0.0",
      port: 30141,
      expectedHost: "web.example.test:30141",
      expectedOrigin: "https://web.example.test:30141",
      accessPhrase: "fixture-gate-value",
      allowedRoots: ["/srv/aili"],
      protocol: "https",
    })).toMatchObject({
      loopback: false,
      requiresAccessPhrase: true,
      expectedHost: "web.example.test:30141",
      expectedOrigin: "https://web.example.test:30141",
      allowedRoots: ["/srv/aili"],
    });
  });

  it("exchanges a one-use bootstrap for a same-site session and enforces mutation admission", () => {
    let now = new Date("2026-08-13T00:00:00.000Z");
    const policy = validateWebListenPolicy({ hostname: "127.0.0.1", port: 30141 });
    const lifecycle = new WebAccessLifecycle(policy, undefined, () => now);
    const site = { host: "127.0.0.1:30141", origin: "http://127.0.0.1:30141" };

    const rejectedBootstrap = lifecycle.createBootstrap();
    expect(lifecycle.consumeBootstrap(rejectedBootstrap, { ...site, origin: "http://other.test" })).toBeUndefined();
    expect(lifecycle.consumeBootstrap(rejectedBootstrap, site)).toBeUndefined();

    const bootstrap = lifecycle.createBootstrap();
    const exchanged = lifecycle.consumeBootstrap(bootstrap, site);
    expect(exchanged?.setCookie).toContain(`${WEB_SESSION_COOKIE}=`);
    expect(exchanged?.setCookie).toContain("HttpOnly");
    expect(exchanged?.setCookie).toContain("SameSite=Strict");
    expect(lifecycle.consumeBootstrap(bootstrap, site)).toBeUndefined();
    const cookie = cookieHeader(exchanged!.setCookie);

    expect(lifecycle.authorizeRequest({
      ...site,
      cookie,
      method: "POST",
      mutation: true,
      contentType: "application/json; charset=utf-8",
      bodyBytes: 128,
      capabilityAllowed: true,
    })).toMatchObject({ ok: true, authMode: "session" });
    expect(lifecycle.authorizeRequest({ ...site, cookie, method: "GET", mutation: true, contentType: "application/json" }))
      .toEqual({ ok: false, reason: "mutation-method-required" });
    expect(lifecycle.authorizeRequest({ ...site, cookie, method: "POST", mutation: true, contentType: "text/plain" }))
      .toEqual({ ok: false, reason: "json-content-type-required" });
    expect(lifecycle.authorizeRequest({ ...site, cookie, bodyBytes: WEB_MAX_REQUEST_BYTES + 1 }))
      .toEqual({ ok: false, reason: "request-size-invalid" });
    expect(lifecycle.authorizeRequest({ ...site, cookie, capabilityAllowed: false }))
      .toEqual({ ok: false, reason: "capability-denied" });
    expect(lifecycle.authorize({ ...site, cookie, accessPhrase: "ignored-on-protected-routes" })).toMatchObject({ ok: true });

    now = new Date(Date.parse("2026-08-13T00:00:00.000Z") + WEB_BOOTSTRAP_TTL_MS + 1);
    expect(lifecycle.createBootstrap()).toMatch(/^[A-Za-z0-9_-]+$/);
    lifecycle.dispose();
    expect(lifecycle.authorize({ ...site, cookie })).toEqual({ ok: false, reason: "same-site-session-required" });
  });

  it("allows explicit unauthenticated loopback reads but never loopback mutations", () => {
    const policy = validateWebListenPolicy({ hostname: "localhost", port: 30141 });
    const lifecycle = new WebAccessLifecycle(policy);
    const site = { host: "localhost:30141", origin: "http://localhost:30141" };

    expect(lifecycle.authorizeRequest({ ...site, method: "GET", allowLoopbackReadWithoutSession: true }))
      .toEqual({ ok: true, sessionId: "loopback-read-policy", authMode: "loopback-read" });
    expect(lifecycle.authorizeRequest({
      ...site,
      method: "POST",
      mutation: true,
      contentType: "application/json",
      bodyBytes: 0,
      allowLoopbackReadWithoutSession: true,
    })).toEqual({ ok: false, reason: "same-site-session-required" });
  });

  it("rotates non-loopback browser sessions when the access gate changes", () => {
    const policy = validateWebListenPolicy({
      hostname: "0.0.0.0",
      port: 30141,
      expectedHost: "web.example.test:30141",
      expectedOrigin: "https://web.example.test:30141",
      accessPhrase: "fixture-gate-value",
      allowedRoots: ["/srv/aili"],
      protocol: "https",
    });
    const lifecycle = new WebAccessLifecycle(policy, "fixture-gate-value");
    const site = { host: policy.expectedHost, origin: policy.expectedOrigin };
    const loginRequest = { ...site, method: "POST", contentType: "application/json", bodyBytes: 64 };
    expect(lifecycle.login("wrong-gate-value", loginRequest)).toBeUndefined();
    const login = lifecycle.login("fixture-gate-value", loginRequest);
    expect(login?.setCookie).toContain("; Secure");
    const cookie = cookieHeader(login!.setCookie);
    expect(lifecycle.authorize({ ...site, cookie })).toMatchObject({ ok: true });

    lifecycle.changeAccessPhrase("replacement-gate-value");
    expect(lifecycle.authorize({ ...site, cookie })).toEqual({ ok: false, reason: "same-site-session-required" });
    expect(lifecycle.login("fixture-gate-value", loginRequest)).toBeUndefined();
    expect(lifecycle.login("replacement-gate-value", loginRequest)).toBeDefined();
  });

  it("canonicalizes roots, rejects escape links, and detects a target replaced after authorization", async () => {
    await withRoots(async (root, outside) => {
      await mkdir(join(root, "nested"));
      const target = join(root, "nested", "record.txt");
      await writeFile(target, "first", "utf8");
      await writeFile(join(outside, "outside.txt"), "outside", "utf8");
      await symlink(outside, join(root, "escape"));

      const roots = await canonicalizeAllowedRoots([root, root]);
      expect(roots).toEqual([root]);
      const policy = await CanonicalAllowedRootPolicy.create(roots);
      const grant = await policy.grant(target, { mustExist: true });
      expect(grant).toMatchObject({ requestedPath: target, resolvedPath: target, allowedRoot: root, exists: true });
      await expect(policy.grant(join(root, "escape", "outside.txt"), { mustExist: true })).rejects.toThrow(/escapes|outside/);
      await expect(policy.grant(join(outside, "outside.txt"), { mustExist: true })).rejects.toThrow(/outside/);

      const replacement = join(root, "nested", "replacement.txt");
      await writeFile(replacement, "second", "utf8");
      await rename(replacement, target);
      await expect(policy.revalidate(grant)).rejects.toThrow(/changed after authorization/);
    });
  });

  it("recursively redacts sensitive fields and text before diagnostics", () => {
    const sensitiveKey = ["pass", "word"].join("");
    const value = {
      ok: "visible",
      [sensitiveKey]: "fixture-marker",
      nested: { label: "visible", header: `${sensitiveKey}=fixture-marker` },
    };
    expect(redactWebSecrets(value)).toEqual({
      ok: "visible",
      [sensitiveKey]: "[REDACTED]",
      nested: { label: "visible", header: `${sensitiveKey}=[REDACTED]` },
    });
    expect(redactWebSecretText(`failure ${sensitiveKey}=fixture-marker\nnext-line`)).not.toContain("fixture-marker");
  });
});
