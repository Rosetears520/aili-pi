import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type RGB = readonly [number, number, number];

export const ROSE_GRADIENT = "rose-cyberdeck-gradient";
export const ROSE_GRADIENT_STOPS: readonly RGB[] = [
  [199, 91, 122], // brand Rose #C75B7A
  [232, 167, 184], // soft Rose  #E8A7B8
  [188, 167, 255], // violet     #BCA7FF
  [136, 184, 255], // blue       #88B8FF
  [125, 228, 255], // cyan       #7DE4FF
  [214, 244, 255], // ice        #D6F4FF
];

const RESET = "\x1b[0m";
const GRADIENT_CACHE_LIMIT = 128;
const gradientCache = new Map<string, string>();

function mix(from: RGB, to: RGB, amount: number): RGB {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function sampleGradient(position: number): RGB {
  const normalized = Math.max(0, Math.min(1, position));
  const scaled = normalized * (ROSE_GRADIENT_STOPS.length - 1);
  const index = Math.min(ROSE_GRADIENT_STOPS.length - 2, Math.floor(scaled));
  const from = ROSE_GRADIENT_STOPS[index] ?? ROSE_GRADIENT_STOPS[0]!;
  const to = ROSE_GRADIENT_STOPS[index + 1] ?? from;
  return mix(from, to, scaled - index);
}

function foreground(color: RGB, text: string): string {
  return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m${text}`;
}

/** Render the stable Rose-to-ice gradient for Zentui chrome and markers. */
export function renderRoseGradient(text: string): string {
  const cached = gradientCache.get(text);
  if (cached !== undefined) return cached;
  const chars = [...text];
  if (chars.length === 0) return text;
  const span = Math.max(1, chars.length - 1);
  const rendered = `${chars.map((char, index) => foreground(sampleGradient(index / span), char)).join("")}${RESET}`;
  if (gradientCache.size >= GRADIENT_CACHE_LIMIT) gradientCache.delete(gradientCache.keys().next().value ?? "");
  gradientCache.set(text, rendered);
  return rendered;
}

/** Add symmetric colored side rails while preserving the terminal width contract. */
export function renderBoxedLine(line: string, width: number, leftRail: string, rightRail: string): string {
  if (width <= 0) return "";
  const innerWidth = Math.max(0, width - visibleWidth(leftRail) - visibleWidth(rightRail));
  const content = truncateToWidth(line, innerWidth, "");
  return truncateToWidth(`${leftRail}${content}${" ".repeat(Math.max(0, innerWidth - visibleWidth(content)))}${rightRail}`, width, "");
}
