import type { CodeSplittingOptions, OutputOptions } from 'rolldown';
import type { MarklessEnvironment } from '../types.ts';

export const MARKLESS_BUILD_DIR = 'build';
export const MARKLESS_BUILD_PREFIX = `${MARKLESS_BUILD_DIR}/`;
export const MARKLESS_BUNDLE_GRAPH = `${MARKLESS_BUILD_PREFIX}bundle-graph.json`;

const MARKLESS_RUNTIME_GROUPS = [
	{
		name: 'markless-runtime',
		test: /[/\\]@markless[/\\]runtime[/\\]/,
	},
	{
		name: 'markless-symbols',
		test: /virtual:markless:symbol:/,
	},
] satisfies NonNullable<CodeSplittingOptions['groups']>;

export function outputDefaults(
	output: OutputOptions,
	environment: MarklessEnvironment,
): OutputOptions {
	if (environment === 'lib') {
		return output;
	}

	const next: OutputOptions = { ...output, hoistTransitiveImports: false };
	if (environment === 'server') {
		next.entryFileNames ??= '[name].js';
		next.chunkFileNames ??= 'chunk-[hash].js';
		next.codeSplitting = marklessCodeSplitting(next.codeSplitting);
		return next;
	}

	next.entryFileNames ??= `${MARKLESS_BUILD_PREFIX}chunk-[hash].js`;
	next.chunkFileNames ??= `${MARKLESS_BUILD_PREFIX}chunk-[hash].js`;
	next.minifyInternalExports = false;
	next.strictExecutionOrder = true;
	next.codeSplitting = marklessCodeSplitting(next.codeSplitting);
	return next;
}

function marklessCodeSplitting(codeSplitting: OutputOptions['codeSplitting']) {
	if (typeof codeSplitting === 'boolean') {
		throw new Error(
			'@markless/bundler requires output.codeSplitting to be an object so runtime chunks can be grouped.',
		);
	}

	return {
		...codeSplitting,
		groups: [...MARKLESS_RUNTIME_GROUPS, ...(codeSplitting?.groups ?? [])],
	} satisfies CodeSplittingOptions;
}
