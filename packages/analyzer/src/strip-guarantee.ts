import type { AnalyzerCanonicalInvariantResult } from './contracts.ts';

export const DEBUG_CHANNEL_SENTINELS = [
	'__MARKLESS_DEBUG__',
	'__MARKLESS_DEBUG_ENABLED__',
	'markless.debug.channel.v1.bootstrap',
	'inline-resumer',
	'streamed-arm',
	'resume-record',
	'row-record',
	'direct-csr',
	'callback-prop',
	'router-delegation',
	'MARKLESS_DEBUG_',
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
