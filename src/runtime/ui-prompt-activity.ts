import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type UiPromptKind = "select" | "confirm" | "input" | "editor" | "custom";
export interface UiPromptDescriptor { reason: "ui_prompt"; kind: UiPromptKind; title?: string }
export interface UiPromptActivitySnapshot {
  state: "working" | "waiting-for-user";
  prompt?: UiPromptDescriptor;
}

/**
 * Backend-neutral, notification-only projection of Pi's UI prompt span.
 * Pi already coalesces nested prompts, but the depth makes this tolerant of
 * synthetic/test emitters too. This class never opens, answers, or closes UI.
 */
export class UiPromptActivityProjection {
  private depth = 0;
  private current?: UiPromptDescriptor;

  start(event: UiPromptDescriptor): UiPromptActivitySnapshot {
    this.depth += 1;
    this.current ??= { reason: "ui_prompt", kind: event.kind, ...(event.title ? { title: event.title } : {}) };
    return this.snapshot();
  }

  end(): UiPromptActivitySnapshot {
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.current = undefined;
    return this.snapshot();
  }

  clear(): UiPromptActivitySnapshot {
    this.depth = 0;
    this.current = undefined;
    return this.snapshot();
  }

  snapshot(): UiPromptActivitySnapshot {
    return this.current
      ? { state: "waiting-for-user", prompt: this.current }
      : { state: "working" };
  }
}

/** Production status projection. Event handlers remain synchronous and
 * best-effort, matching Pi 0.84.4's non-awaited notification contract. */
export function registerUiPromptActivity(pi: ExtensionAPI): UiPromptActivityProjection {
  const activity = new UiPromptActivityProjection();
  const render = (ctx: any, snapshot: UiPromptActivitySnapshot) => {
    try {
      if (snapshot.state === "waiting-for-user") {
        const title = snapshot.prompt?.title?.trim();
        ctx.ui.setStatus("aili-ui-activity", title ? `Waiting for user: ${title}` : "Waiting for user");
      } else {
        ctx.ui.setStatus("aili-ui-activity", undefined);
      }
    } catch {
      // Observability is best-effort and can never affect prompt behavior.
    }
  };
  pi.on("ui_prompt_start", (event, ctx) => { render(ctx, activity.start(event)); });
  pi.on("ui_prompt_end", (_event, ctx) => { render(ctx, activity.end()); });
  pi.on("agent_settled", (_event, ctx) => { render(ctx, activity.clear()); });
  pi.on("session_shutdown", (_event, ctx) => { render(ctx, activity.clear()); });
  return activity;
}
