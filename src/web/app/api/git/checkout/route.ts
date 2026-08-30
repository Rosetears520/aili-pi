import { rejectCompatibilityMutation } from "@/lib/compatibility-mutation";

/**
 * Retained for the existing Git Changes UI only. Branch checkout has no safe
 * Runtime action contract: `worktree-switch` is a session transition, not a
 * branch checkout. Fail closed rather than touching a dirty checkout.
 */
export async function POST() {
  return rejectCompatibilityMutation("/api/git/checkout POST", null);
}
