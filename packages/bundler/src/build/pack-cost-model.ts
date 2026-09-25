// Fitted on the interaction benchmark under the constrained profile (150 ms RTT, 5 Mbps, 4x CPU).
export const PACK_COST_MODEL = {
	// One more serial fetch round on a path to a response.
	roundMs: 162,
	// One more request inside a round that is already being fetched (HTTP/2).
	parallelRequestMs: 0,
	// Transfer per gzip KB on the boot path, where bytes compete with HTML and CSS.
	bootMsPerGzipKb: 2.8,
	// Transfer per gzip KB fetched at interaction or navigation time.
	interactionMsPerGzipKb: 1.5,
	// Parse, compile and evaluate per decoded KB (Chromium parses lazily).
	decodedMsPerKb: 0,
	// Wrapper imports, exports and lost cross-file compression of one more file.
	fileOverheadGzipKb: 0.5,
	// The same for a lazy sibling, which imports its first half's bindings (router fixture landings: 0.96-1.00).
	lazySiblingOverheadGzipKb: 1,
	// Smallest deferred pack worth a file of its own; below it the per-file overhead dominates.
	minDeferredGzipKb: 1,
	// Pre-tree-shake module source to shipped gzip bytes, for planning before output exists.
	sourceGzipRatio: 0.25,
} as const;

export type PackCostModel = typeof PACK_COST_MODEL;

export function estimatedGzipKb(sourceLength: number, model: PackCostModel = PACK_COST_MODEL) {
	return (sourceLength * model.sourceGzipRatio) / 1024;
}

// Whether a group some loaders need should ride a pack every loader already fetches in the
// same round: the loaders that do not need it pay its bytes, the ones that do save one file.
export function mergeIntoWiderPack(
	input: {
		readonly gzipKb: number;
		readonly loadersNeeding: number;
		readonly loadersNotNeeding: number;
		readonly msPerGzipKb: number;
	},
	model: PackCostModel = PACK_COST_MODEL,
): boolean {
	const merged = input.loadersNotNeeding * input.gzipKb * input.msPerGzipKb;
	const split =
		input.loadersNeeding *
		(model.parallelRequestMs + model.fileOverheadGzipKb * input.msPerGzipKb);
	return merged < split;
}

// Moving code no first use needs off the boot path pays only when it outweighs the file it adds.
export function deferralPays(gzipKb: number, model: PackCostModel = PACK_COST_MODEL): boolean {
	return gzipKb >= model.minDeferredGzipKb;
}

// A lazy sibling still loads in the landing round: it takes its bytes off the first event's path on the
// pages whose first events are lean, and every page loading it pays the bytes its extra file adds.
export function lazySiblingPays(
	input: { readonly gzipKb: number; readonly loadersSpedUp: number; readonly loaders: number },
	model: PackCostModel = PACK_COST_MODEL,
): boolean {
	return (
		deferralPays(input.gzipKb, model) &&
		input.loadersSpedUp * input.gzipKb > input.loaders * model.lazySiblingOverheadGzipKb
	);
}

// App code changes with nearly every deploy and framework code only on an upgrade, so a startup pack
// holding both re-sends its framework half to returning visitors; both halves still load in one round.
export function frameworkSplitPays(
	input: { readonly appGzipKb: number; readonly frameworkGzipKb: number },
	model: PackCostModel = PACK_COST_MODEL,
): boolean {
	return deferralPays(input.appGzipKb, model) && deferralPays(input.frameworkGzipKb, model);
}
