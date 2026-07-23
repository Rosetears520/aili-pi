import { type Theme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderBoxedLine, renderSakuraGradient } from "./gradient.js";
import { installPrototypePatch } from "./prototype-patch-registry.js";

const SETTLED_CACHE_MAX_LINES = 80;
const SETTLED_CACHE_MAX_CHARS = 64 * 1024;

type Cleanup = () => void;
type ToolExecutionRuntime = {
	isPartial?: boolean;
	result?: {
		isError?: boolean;
		content?: Array<{ type?: string }>;
	};
	toolName?: string;
	hideComponent?: boolean;
	expanded?: boolean;
	showImages?: boolean;
	getRenderShell?: () => "default" | "self";
};

type SettledRender = {
	width: number;
	result: ToolExecutionRuntime["result"];
	expanded: boolean;
	showImages: boolean;
	lines: string[];
};

function isBlank(line: string): boolean {
	return line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim().length === 0;
}

function containsTerminalImage(lines: readonly string[]): boolean {
	return lines.some((line) => line.includes("\x1b_G") || line.includes("\x1b]1337;File="));
}

function truncatePlainText(text: string, maxWidth: number): string {
	let result = "";
	let width = 0;
	for (const char of text) {
		const charWidth = visibleWidth(char);
		if (width + charWidth > maxWidth) break;
		result += char;
		width += charWidth;
	}
	return result;
}

function fitBorderLabel(label: string, width: number): string {
	if (width <= 0) return "";
	if (width === 1) return "╭";
	const innerWidth = Math.max(0, width - 2);
	const lead = truncatePlainText(`─ ${label} `, innerWidth);
	return `╭${lead}${"─".repeat(Math.max(0, innerWidth - visibleWidth(lead)))}╮`;
}

function bottomBorder(width: number): string {
	if (width <= 0) return "";
	if (width === 1) return "╰";
	return `╰${"─".repeat(Math.max(0, width - 2))}╯`;
}

function statusLabel(runtime: ToolExecutionRuntime): string {
	const name = (runtime.toolName || "tool").replaceAll("_", " ").toUpperCase();
	if (runtime.isPartial !== false) return `◆ ${name} · RUNNING`;
	return runtime.result?.isError ? `× ${name} · FAILED` : `✓ ${name} · COMPLETE`;
}

function containsResultImage(runtime: ToolExecutionRuntime): boolean {
	return runtime.result?.content?.some((item) => item.type === "image") ?? false;
}

function isCacheableSettledRender(lines: readonly string[]): boolean {
	if (lines.length > SETTLED_CACHE_MAX_LINES) return false;
	let chars = 0;
	for (const line of lines) {
		chars += line.length;
		if (chars > SETTLED_CACHE_MAX_CHARS) return false;
	}
	return true;
}

/**
 * Give built-in/default-shell tool rows a compact status rail. Settled rows are
 * cached because animation renders otherwise rebuild every historical tool box;
 * success/error stays on the rail instead of a full green/red background.
 */
export function installToolExecutionStyle(getTheme: () => Theme | undefined): Cleanup {
	const settledRenders = new WeakMap<object, SettledRender>();

	const cleanupRenderPatch = installPrototypePatch(
		ToolExecutionComponent.prototype,
		"render",
		"tool-execution-render",
		({ predecessor, receiver, args }) => {
			const width = args[0];
			const runtime = receiver as ToolExecutionRuntime;
			if (
				typeof width === "number" &&
				runtime.isPartial === false &&
				!runtime.hideComponent &&
				!containsResultImage(runtime)
			) {
				const cached = settledRenders.get(receiver as object);
				if (
					cached?.width === width &&
					cached.result === runtime.result &&
					cached.expanded === Boolean(runtime.expanded) &&
					cached.showImages === Boolean(runtime.showImages)
				) {
					return cached.lines;
				}
			}

			const rendered = Reflect.apply(predecessor, receiver, args);
			if (!Array.isArray(rendered) || !rendered.every((line) => typeof line === "string")) {
				return rendered;
			}
			const lines = rendered as string[];
			if (
				typeof width !== "number" ||
				width <= 2 ||
				lines.length === 0 ||
				runtime.hideComponent ||
				runtime.getRenderShell?.() === "self" ||
				containsTerminalImage(lines)
			) {
				return lines;
			}

			const theme = getTheme();
			if (!theme) return lines;
			const pending = runtime.isPartial !== false;

			const prefix: string[] = [];
			const body = [...lines];
			if (body[0] !== undefined && isBlank(body[0])) {
				const blank = body.shift();
				if (blank !== undefined) prefix.push(blank);
			}
			const label = fitBorderLabel(statusLabel(runtime), width);
			const top = renderSakuraGradient(label);
			// Keep only the status rail slightly heavier. State is expressed in the
			// native macaron palette rather than traffic-light red/green: lavender
			// while running, sky blue when complete, and Sakura pink when failed.
			const leftRail = pending
				? theme.fg("thinkingXhigh", "┃ ")
				: runtime.result?.isError
					? theme.fg("accent", "┃ ")
					: theme.fg("syntaxFunction", "┃ ");
			const rightRail = renderSakuraGradient(" │");
			const bottom = renderSakuraGradient(bottomBorder(width));

			const boxed = [
				...prefix,
				top,
				...body.map((line) => renderBoxedLine(line, width, leftRail, rightRail)),
				bottom,
			];
			if (!pending && !containsResultImage(runtime) && isCacheableSettledRender(boxed)) {
				settledRenders.set(receiver as object, {
					width,
					result: runtime.result,
					expanded: Boolean(runtime.expanded),
					showImages: Boolean(runtime.showImages),
					lines: boxed,
				});
			}
			return boxed;
		},
	);

	const cleanupInvalidatePatch = installPrototypePatch(
		ToolExecutionComponent.prototype,
		"invalidate",
		"tool-execution-invalidate",
		({ predecessor, receiver, args }) => {
			settledRenders.delete(receiver as object);
			return Reflect.apply(predecessor, receiver, args);
		},
	);

	return () => {
		cleanupInvalidatePatch();
		cleanupRenderPatch();
	};
}
