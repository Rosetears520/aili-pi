import { stripAnsi } from "@/lib/ansi";

export interface PermStatusView {
  readonly label: string;
  readonly sandboxWarning: boolean;
  readonly raw: string;
}

/** Parse the permission-mode footer text the extension reports via setStatus("perm", …). */
export function parsePermStatus(text: string | undefined): PermStatusView | undefined {
  if (!text) return undefined;
  const plain = stripAnsi(text).trim();
  if (!plain) return undefined;
  const warning = plain.includes("(!)");
  const head = plain.split(/\s+\(/)[0]?.trim() ?? plain;
  return { label: head || plain, sandboxWarning: warning, raw: plain };
}

export interface QuotaStatusView {
  readonly percent: number | undefined;
  readonly lines: readonly string[];
}

/** Parse the pi-quota-status footer text into an orb-facing view. */
export function parseQuotaStatus(text: string | undefined): QuotaStatusView | undefined {
  if (!text) return undefined;
  const plain = stripAnsi(text).trim();
  if (!plain) return undefined;
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(plain);
  return {
    percent: match ? Math.max(0, Math.min(100, Number(match[1]))) : undefined,
    lines: plain.split(/\s{2,}|\n/).map((line) => line.trim()).filter(Boolean),
  };
}
