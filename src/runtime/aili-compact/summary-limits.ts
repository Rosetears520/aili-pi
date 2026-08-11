/** UTF-16 character limits for AILI-owned semantic summaries only. */
export const SEMANTIC_SUMMARY_LIMITS = Object.freeze({
  minChars: 256,
  targetChars: 15_000,
  hardMaxChars: 18_000,
} as const);
