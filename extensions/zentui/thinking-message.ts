import { AssistantMessageComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { renderSakuraGradient } from "./gradient.js";
import { installPrototypePatch } from "./prototype-patch-registry.js";

type Cleanup = () => void;
type AssistantContent = {
	type: string;
	text?: string;
	thinking?: string;
};
type AssistantMessageRuntime = {
	contentContainer?: { children?: Component[] };
	hideThinkingBlock?: boolean;
};
type AssistantMessageLike = {
	content?: AssistantContent[];
};

const MAX_REASONING_WIDTH = 96;

function isBlankRenderedLine(line: string): boolean {
	return line
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.trim().length === 0;
}

function removeTrailingPadding(line: string): string {
	return line.replace(
		/ +((?:(?:\x1b\[[0-?]*[ -/]*[@-~])|(?:\x1b\][^\x07]*(?:\x07|\x1b\\)))*)$/,
		"$1",
	);
}

function removeOutputPadding(line: string): string {
	let index = 0;
	while (index < line.length && line[index] === "\x1b") {
		if (line[index + 1] === "[") {
			const match = line.slice(index).match(/^\x1b\[[0-?]*[ -/]*[@-~]/);
			if (!match) break;
			index += match[0].length;
			continue;
		}
		if (line[index + 1] === "]") {
			const bell = line.indexOf("\x07", index + 2);
			const st = line.indexOf("\x1b\\", index + 2);
			const end = bell >= 0 && (st < 0 || bell < st) ? bell + 1 : st >= 0 ? st + 2 : -1;
			if (end < 0) break;
			index = end;
			continue;
		}
		break;
	}
	return line[index] === " " ? `${line.slice(0, index)}${line.slice(index + 1)}` : line;
}

function isVisibleContent(content: AssistantContent): boolean {
	return (
		(content.type === "text" && Boolean(content.text?.trim())) ||
		(content.type === "thinking" && Boolean(content.thinking?.trim()))
	);
}

/** Locate the children emitted for thinking runs by Pi's updateContent algorithm. */
function thinkingChildIndices(message: AssistantMessageLike): number[] {
	const content = message.content ?? [];
	let childIndex = content.some(isVisibleContent) ? 1 : 0; // Initial Spacer
	const result: number[] = [];

	for (let index = 0; index < content.length; index++) {
		const item = content[index]!;
		if (item.type === "text" && item.text?.trim()) {
			childIndex += 1;
			continue;
		}
		if (item.type !== "thinking") continue;

		let hasThinking = false;
		while (index < content.length && content[index]!.type === "thinking") {
			hasThinking ||= Boolean(content[index]!.thinking?.trim());
			index += 1;
		}
		index -= 1;
		if (!hasThinking) continue;

		result.push(childIndex);
		childIndex += 1;
		if (content.slice(index + 1).some(isVisibleContent)) childIndex += 1; // Spacer
	}
	return result;
}

class ThinkingTrailComponent implements Component {
	constructor(
		private readonly inner: Component,
		private readonly getTheme: () => Theme | undefined,
	) {}

	invalidate(): void {
		this.inner.invalidate?.();
	}

	render(width: number): string[] {
		if (width < 8) return this.inner.render(width);
		const contentWidth = Math.max(1, Math.min(width - 2, MAX_REASONING_WIDTH));
		const rawLines = this.inner.render(contentWidth);
		const rows: Array<{ line: string; step: boolean }> = [];
		let startsStep = true;
		for (const line of rawLines) {
			if (isBlankRenderedLine(line)) {
				startsStep = true;
				continue;
			}
			rows.push({ line: removeOutputPadding(removeTrailingPadding(line)), step: startsStep });
			startsStep = false;
		}
		if (rows.length === 0) return [];

		const stepCount = rows.filter((row) => row.step).length;
		const theme = this.getTheme();
		if (!theme) return rawLines;
		const count = theme.fg("muted", ` · ${stepCount} ${stepCount === 1 ? "STEP" : "STEPS"}`);
		const title = `${renderSakuraGradient("✦ REASONING")}${count}`;
		let currentStep = 0;
		const body = rows.map(({ line, step }) => {
			if (step) currentStep += 1;
			const isLastStep = currentStep === stepCount;
			const branchText = step ? (isLastStep ? "╰─ " : "├─ ") : isLastStep ? "   " : "│  ";
			const branch = theme.fg("thinkingXhigh", branchText);
			const marker = step ? renderSakuraGradient("◇ ") : "  ";
			return truncateToWidth(`${branch}${marker}${line}`, width, "");
		});

		return [title, ...body];
	}
}

/** Decorate only thinking runs; normal assistant Markdown remains untouched. */
export function installThinkingMessageStyle(getTheme: () => Theme | undefined): Cleanup {
	return installPrototypePatch(
		AssistantMessageComponent.prototype,
		"updateContent",
		"assistant-thinking-content",
		({ predecessor, receiver, args }) => {
			const result = Reflect.apply(predecessor, receiver, args);
			const runtime = receiver as AssistantMessageRuntime;
			const children = runtime.contentContainer?.children;
			const message = args[0] as AssistantMessageLike | undefined;
			if (!children || !message) return result;

			for (const index of thinkingChildIndices(message)) {
				const child = children[index];
				if (child) children[index] = new ThinkingTrailComponent(child, getTheme);
			}
			return result;
		},
	);
}
