import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface NativeFooterSnapshot {
  provider?: string;
  model?: string;
  quota?: string;
  retry?: string;
  updateAge?: string;
  clock?: string;
  cwd?: string;
  gitBranch?: string;
  context?: string;
}

export function plainDisplayText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function modelLabel(snapshot: NativeFooterSnapshot): string {
  const model = plainDisplayText(snapshot.model) ?? "no-model";
  const provider = plainDisplayText(snapshot.provider);
  return provider ? `${provider}/${model}` : model;
}

function compose(segments: readonly string[], width: number): string {
  return truncateToWidth(segments.filter(Boolean).join(" · "), width, width > 1 ? "…" : "");
}

export function renderNativeFooter(snapshot: NativeFooterSnapshot, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return "";
  const safeWidth = Math.floor(width);
  const required = [modelLabel(snapshot), plainDisplayText(snapshot.retry), plainDisplayText(snapshot.quota)].filter((value): value is string => Boolean(value));
  const optional = [
    plainDisplayText(snapshot.cwd),
    plainDisplayText(snapshot.gitBranch),
    plainDisplayText(snapshot.context),
    plainDisplayText(snapshot.updateAge),
    plainDisplayText(snapshot.clock),
  ].filter((value): value is string => Boolean(value));

  const segments = [...required, ...optional];
  while (segments.length > required.length && visibleWidth(compose(segments, safeWidth)) > safeWidth) segments.splice(required.length, 1);
  return compose(segments, safeWidth);
}
