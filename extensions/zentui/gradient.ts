import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type RGB = readonly [number, number, number];

export const SAKURA_MACARON_GRADIENT = "sakura-macaron-gradient";
export const SAKURA_MACARON_STOPS: readonly RGB[] = [
	[136, 184, 255], // sakura pink  #88B8FF
	[125, 228, 255], // sakura-iro   #7DE4FF
	[188, 167, 255], // petal        #BCA7FF
	[188, 167, 255], // lavender     #BCA7FF
	[125, 228, 255], // sky macaron  #7DE4FF
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
	const stops = SAKURA_MACARON_STOPS;
	const normalized = Math.max(0, Math.min(1, position));
	const scaled = normalized * (stops.length - 1);
	const index = Math.min(stops.length - 2, Math.floor(scaled));
	const from = stops[index] ?? SAKURA_MACARON_STOPS[0] ?? [136, 184, 255];
	const to = stops[index + 1] ?? from;
	return mix(from, to, scaled - index);
}

function foreground(color: RGB, text: string): string {
	return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m${text}`;
}

/** Render the stable Sakura → sky gradient used by the editor and sent prompts. */
export function renderSakuraGradient(text: string): string {
	const cached = gradientCache.get(text);
	if (cached !== undefined) return cached;
	const chars = [...text];
	if (chars.length === 0) return text;
	const span = Math.max(1, chars.length - 1);
	const rendered = `${chars.map((char, index) => foreground(sampleGradient(index / span), char)).join("")}${RESET}`;
	if (gradientCache.size >= GRADIENT_CACHE_LIMIT) {
		gradientCache.delete(gradientCache.keys().next().value ?? "");
	}
	gradientCache.set(text, rendered);
	return rendered;
}

/** Add symmetric colored side rails while preserving the terminal width contract. */
export function renderBoxedLine(
	line: string,
	width: number,
	leftRail: string,
	rightRail: string,
): string {
	if (width <= 0) return "";
	const leftWidth = visibleWidth(leftRail);
	const rightWidth = visibleWidth(rightRail);
	const innerWidth = Math.max(0, width - leftWidth - rightWidth);
	const content = truncateToWidth(line, innerWidth, "");
	const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
	return truncateToWidth(`${leftRail}${content}${padding}${rightRail}`, width, "");
}
