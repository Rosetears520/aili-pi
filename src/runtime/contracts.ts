import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type RuntimeAvailability = "available" | "unverified" | "blocked";

export interface RuntimeComponent {
  id: string;
  availability: RuntimeAvailability;
  register?: (pi: ExtensionAPI) => void | Promise<void>;
}
