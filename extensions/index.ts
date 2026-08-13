import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAiliRuntime } from "../src/runtime/index.js";
import registerNativeFooter from "./footer/index.js";
import { registerBtwCommand } from "./btw/index.js";
import { registerAnalyticsCommand } from "./analytics/index.js";
import { registerStampCommand } from "./stamp/index.js";

export default async function ailiPi(pi: ExtensionAPI): Promise<void> {
  await registerAiliRuntime(pi);
  registerNativeFooter(pi);
  registerBtwCommand(pi);
  registerAnalyticsCommand(pi);
  registerStampCommand(pi);
}
