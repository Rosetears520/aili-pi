import { stripVTControlCharacters } from "node:util";
import type {
	ExtensionStatusColorMode,
	ExtensionStatusPlacement,
	PolishedTuiConfig,
} from "./config.js";
import { getExtensionStatusColorMode, getExtensionStatusPlacement } from "./config.js";

export type ExtensionStatusSegment = {
	key: string;
	text: string;
	placement: ExtensionStatusPlacement;
	colorMode: ExtensionStatusColorMode;
};

export type ExtensionStatusSegmentsByPlacement = {
	left: ExtensionStatusSegment[];
	middle: ExtensionStatusSegment[];
	right: ExtensionStatusSegment[];
};

const safeSgrPattern = /\x1b\[[0-9;:]*m/g;
const sgrPlaceholderPattern = /__ZENTUI_SGR_(\d+)__/g;
const quotaSegmentSeparatorPattern = /\s+·\s+/;
const quotaWeeklyLabelPattern = /^(?:wk|weekly|7d)\b/i;
const quotaLegacyLabelPattern = /^5h\b/i;
const quotaDisplayLabelPattern = /^((?:\x1b\[[0-9;:]*m)*)\s*(?:wk|weekly|7d|5h)\b/i;

function statusPriority(key: string): number {
	return key === "pi-quota-status" ? 0 : 1;
}

function compareKeys(a: ExtensionStatusSegment, b: ExtensionStatusSegment): number {
	const priorityDifference = statusPriority(a.key) - statusPriority(b.key);
	if (priorityDifference !== 0) return priorityDifference;
	return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function normalizeStatusWhitespace(value: string): string {
	return value
		.replace(/[\r\n\t\f\v]+/g, " ")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function sanitizeExtensionStatusText(value: string): string {
	return normalizeStatusWhitespace(stripVTControlCharacters(value));
}

function hasVisibleStatusText(value: string): boolean {
	return sanitizeExtensionStatusText(value).length > 0;
}

function quotaSegmentLabel(segment: string): "weekly" | "legacy" | undefined {
	const plain = normalizeStatusWhitespace(stripVTControlCharacters(segment));
	if (quotaWeeklyLabelPattern.test(plain)) return "weekly";
	if (quotaLegacyLabelPattern.test(plain)) return "legacy";
	return undefined;
}

function formatQuotaWindowLabel(key: string, text: string): string {
	if (key !== "pi-quota-status") return text;
	const segments = text.split(quotaSegmentSeparatorPattern);
	const selected =
		segments.find((segment) => quotaSegmentLabel(segment) === "weekly") ??
		segments.find((segment) => quotaSegmentLabel(segment) === "legacy");
	if (!selected) return text;
	return selected.replace(quotaDisplayLabelPattern, (_match, sgrPrefix: string) =>
		`${sgrPrefix}codex`,
	);
}

export function sanitizeExtensionStatusOriginalText(value: string): string {
	const safeSequences: string[] = [];
	const protectedValue = value.replace(safeSgrPattern, (sequence) => {
		const index = safeSequences.push(sequence) - 1;
		return `__ZENTUI_SGR_${index}__`;
	});
	const cleaned = normalizeStatusWhitespace(stripVTControlCharacters(protectedValue));
	const restored = cleaned.replace(sgrPlaceholderPattern, (_match, indexText: string) => {
		const index = Number.parseInt(indexText, 10);
		return safeSequences[index] ?? "";
	});

	return hasVisibleStatusText(restored) ? restored : "";
}

export function collectExtensionStatusSegments(
	statuses: ReadonlyMap<string, string>,
	config: PolishedTuiConfig,
): ExtensionStatusSegmentsByPlacement {
	const segments: ExtensionStatusSegmentsByPlacement = {
		left: [],
		middle: [],
		right: [],
	};

	for (const [key, value] of statuses.entries()) {
		const placement = getExtensionStatusPlacement(config, key);
		if (placement === "off") continue;

		const colorMode = getExtensionStatusColorMode(config, key);
		const text = formatQuotaWindowLabel(
			key,
			colorMode === "original"
				? sanitizeExtensionStatusOriginalText(value)
				: sanitizeExtensionStatusText(value),
		);
		if (!text) continue;

		segments[placement].push({ key, text, placement, colorMode });
	}

	segments.left.sort(compareKeys);
	segments.middle.sort(compareKeys);
	segments.right.sort(compareKeys);
	return segments;
}
