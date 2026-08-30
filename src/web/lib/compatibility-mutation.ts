import { NextResponse } from "next/server";

export type RetainedMutationRoute =
  | "/api/git/checkout POST"
  | "/api/worktrees POST"
  | "/api/worktrees DELETE";

const GATEWAY_ENDPOINT = "/api/runtime/v1/mutations";

/**
 * Retained Pi Web URLs cannot manufacture the opaque Runtime identity, writer
 * lease, or Worktree handle required by MutationEnvelopeV1. They therefore
 * fail closed instead of invoking Git/filesystem helpers outside the BFF.
 */
export function rejectCompatibilityMutation(
  route: RetainedMutationRoute,
  action: "worktree-add" | "worktree-remove" | null,
): NextResponse {
  return NextResponse.json({
    error: "runtime-gateway-migration-required",
    route,
    gateway: GATEWAY_ENDPOINT,
    action,
    retryable: false,
  }, {
    status: 409,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
