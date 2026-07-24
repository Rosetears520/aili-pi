import { readFileSync } from "node:fs";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { legacyRoseThemeGuidanceFromSettings } from "../../src/runtime/rose-theme.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

type RGB = readonly [number, number, number];

function rgb([r, g, b]: RGB, text: string, bold = false): string {
  return `${bold ? BOLD : ""}\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

function gradient(text: string, from: RGB, to: RGB, bold = false): string {
  const chars = [...text];
  const span = Math.max(1, chars.length - 1);
  return chars.map((char, index) => {
    if (char === " ") return char;
    const t = index / span;
    const color: RGB = [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    ];
    return rgb(color, char, bold);
  }).join("");
}

const ROSE_ART = readFileSync(fileURLToPath(new URL("../../src/runtime/rose-head.txt", import.meta.url)), "utf8").trimEnd().split("\n") as readonly string[];

function getAvailableRows(tui: unknown): number {
  try {
    const terminal = (tui as { terminal?: { rows?: unknown } }).terminal;
    const rows = terminal?.rows;
    return typeof rows === "number" && Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0;
  } catch {
    return 0;
  }
}

export function renderRoseHeader(width: number, availableRows = 0): string[] {
  if (width <= 0) return [];

  const blue: RGB = [136, 184, 255];
  const cyan: RGB = [125, 228, 255];
  const violet: RGB = [188, 167, 255];
  const ice: RGB = [214, 244, 255];
  const telemetry = "◈  ROSE CYBERDECK  ◈";
  const artWidth = Math.max(...ROSE_ART.map((line) => [...line].length));
  const visibleArtWidth = Math.min(width, artWidth);
  const artPad = " ".repeat(Math.max(0, Math.floor((width - visibleArtWidth) / 2) - 2));
  // Keep the divider visually subordinate: inset it symmetrically from the artwork.
  const railInset = visibleArtWidth >= 8 ? Math.max(2, Math.round(visibleArtWidth * 0.15)) : 0;
  const railWidth = Math.max(1, visibleArtWidth - railInset * 2);
  const rail = "━".repeat(railWidth);
  const railPad = " ".repeat(Math.max(0, Math.min(width - railWidth, Math.floor((width - railWidth) / 2) + 1)));
  const visibleTelemetry = [...telemetry].slice(0, width).join("");
  const telemetryWidth = [...visibleTelemetry].length;
  const telemetryPad = " ".repeat(Math.max(0, Math.min(width - telemetryWidth, Math.floor((width - telemetryWidth) / 2) + 1)));

  const art = ROSE_ART.map((line) => {
    const clipped = [...line].slice(0, visibleArtWidth).join("");
    return `${artPad}${gradient(clipped, blue, ice)}`;
  });

  const visualHeight = ROSE_ART.length + 3; // artwork + gap + divider + label
  const extraTopPadding = Math.max(0, Math.floor((availableRows - visualHeight) / 2) - 1);

  return [
    ...Array(extraTopPadding).fill(""),
    "",
    ...art,
    "",
    `${railPad}${gradient(rail, blue, ice)}`,
    `${telemetryPad}${gradient(visibleTelemetry, violet, cyan, true)}`,
    "",
  ];
}

export default function roseCyberdeckHeader(pi: ExtensionAPI): void {
  let legacyThemeNoticeSent = false;
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (!legacyThemeNoticeSent) {
      const guidance = legacyRoseThemeGuidanceFromSettings(join(getAgentDir(), "settings.json"));
      if (guidance) {
        legacyThemeNoticeSent = true;
        ctx.ui.notify(guidance, "warning");
      }
    }
    ctx.ui.setHeader((tui) => ({
      render: (width) => renderRoseHeader(width, getAvailableRows(tui)),
      invalidate() {},
    }));
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });
}
