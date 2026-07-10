import {
	MARKLESS_DEBUG_CHANNEL_SYMBOL_KEY, MARKLESS_DEBUG_COMPILE_FLAG,
	MARKLESS_DEBUG_DIAGNOSTIC_PREFIX, MARKLESS_DEBUG_GLOBAL_PROPERTY,
	MARKLESS_DEBUG_INTERACTION_KIND_DIRECT_CSR, MARKLESS_DEBUG_INTERACTION_KIND_INLINE_RESUMER,
	MARKLESS_DEBUG_INTERACTION_KIND_RESUME_RECORD, MARKLESS_DEBUG_INTERACTION_KIND_ROUTER_DELEGATION,
	MARKLESS_DEBUG_INTERACTION_KIND_ROW_RECORD, MARKLESS_DEBUG_SOURCE_CALLBACK_PROP,
	MARKLESS_DEBUG_SOURCE_STREAMED_ARM,
} from '@markless/web';
import type { AnalyzerCanonicalInvariantResult } from './contracts.ts';

export const DEBUG_CHANNEL_SENTINELS = [
	MARKLESS_DEBUG_GLOBAL_PROPERTY,
	MARKLESS_DEBUG_COMPILE_FLAG,
	MARKLESS_DEBUG_CHANNEL_SYMBOL_KEY,
	MARKLESS_DEBUG_INTERACTION_KIND_INLINE_RESUMER,
	MARKLESS_DEBUG_SOURCE_STREAMED_ARM,
	MARKLESS_DEBUG_INTERACTION_KIND_RESUME_RECORD,
	MARKLESS_DEBUG_INTERACTION_KIND_ROW_RECORD,
	MARKLESS_DEBUG_INTERACTION_KIND_DIRECT_CSR,
	MARKLESS_DEBUG_SOURCE_CALLBACK_PROP,
	MARKLESS_DEBUG_INTERACTION_KIND_ROUTER_DELEGATION,
	MARKLESS_DEBUG_DIAGNOSTIC_PREFIX,
] as const;

export interface AnalyzerTextArtifact {
	readonly path: string;
	readonly content: string;
}

export function evaluateDebugChannelStrip(input: {
	readonly debugEnabled: boolean;
	readonly artifacts: readonly AnalyzerTextArtifact[];
	readonly sentinels?: readonly string[];
}): AnalyzerCanonicalInvariantResult {
	const sentinels = input.sentinels ?? DEBUG_CHANNEL_SENTINELS;
	const matches = input.artifacts.flatMap((artifact) =>
		sentinels
			.filter((sentinel) => artifact.content.includes(sentinel))
			.map((sentinel) => ({ path: artifact.path, sentinel })),
	);
	const passed = input.debugEnabled ? matches.length > 0 : matches.length === 0;
	return {
		id: 'MLA-S4-STRIP-GUARANTEE',
		status: passed ? 'pass' : 'fail',
		details: input.debugEnabled
			? passed
				? []
				: ['flagged build contained no debug-channel sentinel (positive control failed)']
			: matches.map(
					(match) => `${match.path} retained debug-channel sentinel ${match.sentinel}`,
				),
	};
}
