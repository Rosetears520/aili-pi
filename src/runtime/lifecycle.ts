export const DELIVERY_MODES = ["IDEATE", "DEFINE", "BUILD", "SHIP"] as const;
export const LIFECYCLE_PROMPTS = ["ideate", "define", "build", "ship", "local-review"] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number];

const intentPatterns: Array<[DeliveryMode, RegExp]> = [
  ["IDEATE", /\b(ideate|brainstorm|explore an idea|shape an idea)\b/i],
  ["DEFINE", /\b(define|specify|write (?:a )?spec|requirements|test plan)\b/i],
  ["BUILD", /\b(build|implement|apply (?:the )?change)\b/i],
  ["SHIP", /\b(ship|release readiness|launch readiness)\b/i],
];

export function detectLifecycleIntent(input: string): DeliveryMode | undefined {
  const slash = input.match(/^\s*\/(ideate|define|build|ship)\b/i)?.[1]?.toUpperCase() as
    | DeliveryMode
    | undefined;
  if (slash) return slash;
  return intentPatterns.find(([, pattern]) => pattern.test(input))?.[0];
}
