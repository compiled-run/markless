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
	{ name: 'markless-resume-branches', test: fileBasenamePattern('resume-branches') },
	{ name: 'markless-resume-behaviors', test: fileBasenamePattern('resume-behaviors') },
	{ name: 'markless-event-behaviors', test: fileBasenamePattern('event-only-behaviors') },
	{
		name: 'markless-resume-repeats',
		test: fileBasenamePattern('resume-keyed-repeats', 'repeat-runtime'),
	},
	{
		name: 'markless-resume-async',
		test: fileBasenamePattern('resume-async-boundaries', 'resume-async-wiring'),
	},
	{
		name: 'markless-resume-shared-patch',
		test: fileBasenamePattern('resume-shared-patch'),
	},
	{ name: 'markless-resume-runtime', test: fileBasenamePattern('resume-runtime') },
	{ name: 'markless-resume-runtime-start', test: fileBasenamePattern('resume-runtime-start') },
	{ name: 'markless-resume-runtime-shared', test: fileBasenamePattern('resume-runtime-shared') },
	{ name: 'markless-resume-events', test: fileBasenamePattern('resume-events') },
	{ name: 'markless-resume-handoff', test: fileBasenamePattern('resume-handoff') },
	{ name: 'markless-resume-locators', test: fileBasenamePattern('resume-locators') },
	{ name: 'markless-resume-errors', test: fileBasenamePattern('resume-errors') },
	{ name: 'markless-resume-sync-computed', test: fileBasenamePattern('resume-sync-computed') },
	{ name: 'markless-resume-sync-demand', test: fileBasenamePattern('resume-sync-demand') },
	{ name: 'markless-payload-full', test: fileBasenamePattern('payload-full') },
	{ name: 'markless-payload-resume', test: fileBasenamePattern('payload-resume') },
	{
		name: 'markless-inline-payload-document',
		test: /[/\\]web[/\\]src[/\\]inline[/\\]payload-document\.ts(?:[?#].*)?$/,
	},
	{
		name: 'markless-payload-document',
		test: fileBasenamePattern('payload-document', 'payload-resume-registry'),
	},
	{
		name: 'markless-payload-graph-construct',
		test: fileBasenamePattern('payload-graph-construct'),
	},
	{ name: 'markless-dom-journal', test: fileBasenamePattern('dom-journal') },
	{
		name: 'markless-protocol-decode',
		test: fileBasenamePattern('protocol-client', 'protocol-state'),
	},
	{
		name: 'markless-value-decode',
		test: fileBasenamePattern('value-decode-client', 'value-decode-extensions'),
	},
	{
		name: 'markless-payload-leaves',
		test: fileBasenamePattern('payload', 'payload-document'),
	},
	{ name: 'markless-dev-log', test: /virtual:markless:dev-log|[/\\]web[/\\]src[/\\]dev-log\.ts(?:[?#].*)?$/ },
	{ name: 'markless-resume-core', test: fileBasenamePattern('resume') },
	{ name: 'markless-runtime-graph-core', test: fileBasenamePattern('graph-core') },
	{ name: 'markless-runtime-graph-collections', test: fileBasenamePattern('graph-collections') },
	{ name: 'markless-runtime-graph-computed', test: fileBasenamePattern('graph-computed') },
	{ name: 'markless-runtime-graph-async', test: fileBasenamePattern('graph-async') },
	{ name: 'markless-runtime-graph-scheduler', test: fileBasenamePattern('graph-scheduler') },
	{ name: 'markless-runtime-graph-shared', test: fileBasenamePattern('graph-shared') },
	// Workspace-source paths: @markless/runtime + serializer resolve to packages/*/src
	// in this monorepo, so the package-name groups below never match them.
	{
		name: 'markless-graph',
		test: /[/\\](?:runtime[/\\]src[/\\](?!graph-(?:core|collections|computed|async|scheduler|shared)\.ts)|core[/\\]src[/\\]runtime)[/\\]?/,
	},
	{ name: 'markless-serializer', test: /[/\\]serializer[/\\]src[/\\](?!protocol-validation)/ },
];

function fileBasenamePattern(...names: string[]): RegExp {
	return new RegExp(`[/\\\\](?:${names.join('|')})\\.ts(?:[?#].*)?$`);
}

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
