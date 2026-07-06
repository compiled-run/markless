import type { CodeSplittingOptions, OutputOptions } from 'rolldown';
import type { MarklessEnvironment } from '../types.ts';

export const MARKLESS_BUILD_DIR = 'build';
export const MARKLESS_BUILD_PREFIX = `${MARKLESS_BUILD_DIR}/`;
export const MARKLESS_BUNDLE_GRAPH = `${MARKLESS_BUILD_PREFIX}bundle-graph.json`;

// Progressive runtime execution (specs/framework/06-runtime-resumer.md): each web
// runtime capability chunks separately so an action never executes untouched
// capabilities and no runtime chunk can absorb the others (per-chunk walls in
// fixture-builds.test.ts). Named groups FORCE-merge their matches into one chunk,
// so every group here must stay under the walls on its own (~8K raw / ~2K gz).
const WEB_RUNTIME_CAPABILITY_GROUPS = [
	{ name: 'markless-resume-branches', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]resume-branches\.ts/ },
	{ name: 'markless-resume-behaviors', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]resume-behaviors\.ts/ },
	{ name: 'markless-event-behaviors', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]event-only-behaviors\.ts/ },
	{ name: 'markless-resume-repeats', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\](resume-keyed-repeats|repeat-runtime)\.ts/ },
	{ name: 'markless-resume-async', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\](resume-async-boundaries|resume-async-wiring)\.ts/ },
	{ name: 'markless-resume-shared-patch', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]resume-shared-patch\.ts/ },
	{ name: 'markless-resume-runtime', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]resume-runtime\.ts/ },
	{ name: 'markless-resume-wiring', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\](resume-events|resume-handoff|resume-locators|resume-sync-computed|resume-sync-demand)\.ts/ },
	{ name: 'markless-payload-full', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]payload-full\.ts/ },
	{ name: 'markless-dom-journal', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]dom-journal\.ts/ },
	{ name: 'markless-protocol-decode', test: /[/\\]serializer[/\\]src[/\\](protocol-client|protocol-state)\.ts/ },
	{ name: 'markless-value-decode', test: /[/\\]serializer[/\\]src[/\\](value-decode-client|value-decode-extensions)\.ts/ },
	{ name: 'markless-payload-leaves', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\](payload|inline[/\\]payload-document)\.ts/ },
	{ name: 'markless-resume-core', test: /[/\\](?:web[/\\]src|core[/\\]src(?:[/\\]web)?)[/\\]resume\.ts/ },
	// Workspace-source paths: @markless/runtime + serializer resolve to packages/*/src
	// in this monorepo, so the package-name groups below never match them.
	{ name: 'markless-graph', test: /[/\\](?:runtime[/\\]src|core[/\\]src[/\\]runtime)[/\\]?/ },
	{ name: 'markless-serializer', test: /[/\\]serializer[/\\]src[/\\](?!protocol-validation)/ },
];

const MARKLESS_RUNTIME_GROUPS = [
	...WEB_RUNTIME_CAPABILITY_GROUPS,
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
