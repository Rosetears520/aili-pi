export const AILI_RELEASE_SANITIZER_FLAGS = [
  "credentialsIncluded",
  "rawConversationIncluded",
  "providerRequestsIncluded",
  "protectedTextIncluded",
  "fullLogsIncluded",
  "privatePathsIncluded",
] as const;

export type AiliReleaseSanitizerFlags = Record<(typeof AILI_RELEASE_SANITIZER_FLAGS)[number], boolean>;

/** One deterministic scanner is shared by capture, composition, generation, and validation. */
export function scanAiliReleaseEvidence(bodies: readonly string[]): AiliReleaseSanitizerFlags {
  const corpus = bodies.join("\n");
  return {
    credentialsIncluded: /(?:\bsk-[a-z0-9_-]{12,}\b|\bbearer\s+[a-z0-9._-]{12,}\b|"authorization"\s*:\s*"|"api[_-]?key"\s*:\s*"[^"\s]{8,})/i.test(corpus),
    rawConversationIncluded: /"(?:rawConversation|conversationBody|sourceBody|rawBody)"\s*:\s*"[^"\n]+/i.test(corpus),
    providerRequestsIncluded: /"(?:providerRequest|requestBody|requestHeaders|rawProviderPayload)"\s*:/i.test(corpus),
    protectedTextIncluded: /(?:PRIVATE-BLOCKER-BODY|FAKE_PROVIDER_RAW_BODY_SENTINEL|production-source-body-sentinel|SANITIZED_(?:MIGRATION|REPAIR|V3|POST_EPOCH))/i.test(corpus),
    fullLogsIncluded: /"(?:fullLog|stdout|stderr|stackTrace)"\s*:/i.test(corpus),
    privatePathsIncluded: /(?:[A-Za-z]:\\\\Users\\\\|\\\\\\\\wsl(?:\.localhost)?\\\\|\/home\/[^/\s"]+\/)/i.test(corpus),
  };
}

export function assertAiliReleaseEvidenceSanitized(bodies: readonly string[]): void {
  const flags = scanAiliReleaseEvidence(bodies);
  const finding = AILI_RELEASE_SANITIZER_FLAGS.find((key) => flags[key]);
  if (finding) throw new Error(`sanitizer rejected live evidence: ${finding}`);
}
