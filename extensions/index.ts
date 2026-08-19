import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAiliRuntime } from "../src/runtime/index.js";
import registerNativeFooter from "./footer/index.js";
import { registerBtwCommand } from "./btw/index.js";
import { registerAnalyticsCommand } from "./analytics/index.js";
import { registerStampCommand } from "./stamp/index.js";
import { registerWebCommand } from "./web/index.js";
import { registerPiNotify } from "../src/runtime/notify.js";
import { registerFileContext } from "./file-context/index.js";
import { registerQuestionnaireTool } from "../src/questionnaire/index.ts";

export default async function ailiPi(pi: ExtensionAPI): Promise<void> {
  await registerAiliRuntime(pi);
  registerNativeFooter(pi);
  registerPiNotify(pi);
  registerFileContext(pi);
  registerQuestionnaireTool(pi);
  registerBtwCommand(pi);
  registerAnalyticsCommand(pi);
  registerStampCommand(pi);
  registerWebCommand(pi);
}
