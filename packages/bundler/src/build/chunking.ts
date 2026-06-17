import type { CodeSplittingOptions, OutputOptions } from 'rolldown';
import type { ArcadeEnvironment } from '../types.ts';

export const ARCADE_BUILD_DIR = 'build';
export const ARCADE_BUILD_PREFIX = `${ARCADE_BUILD_DIR}/`;
export const ARCADE_BUNDLE_GRAPH = `${ARCADE_BUILD_PREFIX}bundle-graph.json`;

const ARCADE_RUNTIME_GROUPS = [
	{
		name: 'arcade-runtime',
		test: /[/\\]@arcadejs[/\\]runtime[/\\]/,
	},
	{
		name: 'arcade-symbols',
		test: /virtual:arcade:symbol:/,
	},
] satisfies NonNullable<CodeSplittingOptions['groups']>;

export function outputDefaults(
	output: OutputOptions,
	environment: ArcadeEnvironment,
): OutputOptions {
	if (environment === 'lib') {
		return output;
	}

	const next: OutputOptions = { ...output, hoistTransitiveImports: false };
	if (environment === 'server') {
		next.entryFileNames ??= '[name].js';
		next.chunkFileNames ??= 'chunk-[hash].js';
		next.codeSplitting = arcadeCodeSplitting(next.codeSplitting);
		return next;
	}

	next.entryFileNames ??= `${ARCADE_BUILD_PREFIX}chunk-[hash].js`;
	next.chunkFileNames ??= `${ARCADE_BUILD_PREFIX}chunk-[hash].js`;
	next.minifyInternalExports = false;
	next.strictExecutionOrder = true;
	next.codeSplitting = arcadeCodeSplitting(next.codeSplitting);
	return next;
}

function arcadeCodeSplitting(codeSplitting: OutputOptions['codeSplitting']) {
	if (typeof codeSplitting === 'boolean') {
		throw new Error(
			'@arcadejs/bundler requires output.codeSplitting to be an object so runtime chunks can be grouped.',
		);
	}

	return {
		...codeSplitting,
		groups: [...ARCADE_RUNTIME_GROUPS, ...(codeSplitting?.groups ?? [])],
	} satisfies CodeSplittingOptions;
}
