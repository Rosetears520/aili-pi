import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAiliRuntime } from "../src/runtime/index.js";
import registerNativeFooter from "./footer/index.js";
import { registerBtwCommand } from "./btw/index.js";
import { registerAnalyticsCommand } from "./analytics/index.js";
import { registerStampCommand } from "./stamp/index.js";
import { registerChangesCommand, registerWebCommand } from "./web/index.js";
import { registerPiNotify } from "../src/runtime/notify.js";
import { registerFileContext } from "./file-context/index.js";
import { registerQuestionnaireTool } from "../src/questionnaire/index.ts";
import { registerWorktreeSwitch } from "../src/runtime/worktree-switch.js";
import registerPromptMiddleware from "./prompt-middleware/index.js";
import registerObservationalMemory from "./observational-memory/index.js";
import { registerUiPromptActivity } from "../src/runtime/ui-prompt-activity.js";

export default async function ailiPi(pi: ExtensionAPI): Promise<void> {
  // Register the side-effect-only memory barrier before ACP/context compaction owners,
  // whose cancellation may short-circuit later session_before_compact handlers.
  registerObservationalMemory(pi);
  registerUiPromptActivity(pi);
  await registerAiliRuntime(pi);
  registerNativeFooter(pi);
  registerPiNotify(pi);
  registerFileContext(pi);
  registerQuestionnaireTool(pi);
  registerPromptMiddleware(pi);
  registerBtwCommand(pi);
  registerAnalyticsCommand(pi);
  registerStampCommand(pi);
  registerWebCommand(pi);
  registerChangesCommand(pi);
  registerWorktreeSwitch(pi);
}
