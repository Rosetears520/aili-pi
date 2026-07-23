import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildContextGauge,
	buildCostLabel,
	formatCount,
	buildTokenLabel,
	formatProviderLabel,
	getUsageTotals,
} from "./format.js";
import type { GitStatusSummary } from "./git.js";
import type { PackageVersionResult } from "./package-version.js";
import type { RuntimeInfo } from "./runtime.js";

export type FooterState = GitStatusSummary & {
	modelLabel: string;
	providerLabel: string;
	contextLabel: string;
	contextUsedLabel: string;
	tokenLabel: string;
	costLabel: string;
	runtime?: RuntimeInfo;
	packageVersion?: PackageVersionResult;
	sessionStartEpoch?: number;
};

export function createInitialState(gitDefaults: GitStatusSummary): FooterState {
	return {
		modelLabel: "no-model",
		providerLabel: "Unknown",
		contextLabel: "--",
		contextUsedLabel: "--",
		tokenLabel: "↑0 ↓0",
		costLabel: "$0.000",
		runtime: undefined,
		packageVersion: undefined,
		sessionStartEpoch: Date.now(),
		...gitDefaults,
	};
}

export function syncState(state: FooterState, ctx: ExtensionContext, cacheHitIcon: string): void {
	const totals = getUsageTotals(ctx);
	state.modelLabel = ctx.model?.id ?? "no-model";
	state.providerLabel = formatProviderLabel(ctx.model?.provider);
	const usage = ctx.getContextUsage();
	const contextWindow = ctx.model?.contextWindow ?? usage?.contextWindow;
	state.contextLabel = contextWindow && contextWindow > 0
		? `[${buildContextGauge(usage?.percent ?? 0, 18)}]`
		: "--";
	state.contextUsedLabel = contextWindow && contextWindow > 0 && typeof usage?.tokens === "number"
		? `${formatCount(usage.tokens)}/${formatCount(contextWindow)}`
		: "--";
	state.tokenLabel = buildTokenLabel(totals, cacheHitIcon);
	state.costLabel = buildCostLabel(totals);
}
