import {
	PRERENDER_INLINE_EVENT_NAMES_TOKEN,
	createInlineResumerDebugRegistrationSource,
	createInlineResumerSelfWakeSource,
	createInlineResumerSource,
	createPrerenderInlineResumerSource,
	createPrerenderSettleInlineResumerSource,
	renderPrerenderInlineResumerSource,
	type InlineResumerBuildOptions,
	type InlineResumerSourceVariants,
} from '@markless/web/inline/resumer';
import { __marklessDebugBootstrapSource } from '../../web/src/debug-channel.ts';
import type { MarklessExecutionLogMode } from './types.ts';

type OxcTools = Pick<typeof import('rolldown/experimental'), 'minifySync' | 'transformSync'>;

let oxcToolsPromise: Promise<OxcTools> | undefined;
const compiledSources = new Map<string, Promise<InlineResumerSourceVariants>>();

function loadOxcTools(): Promise<OxcTools> {
	oxcToolsPromise ??= import('rolldown/experimental').then(({ minifySync, transformSync }) => ({
		minifySync,
		transformSync,
	}));
	return oxcToolsPromise;
}

export function compileInlineResumerSources(options: {
	readonly debug: boolean;
	readonly executionLog: MarklessExecutionLogMode;
}): Promise<InlineResumerSourceVariants> {
	const cacheKey = `${options.debug ? 'debug' : 'production'}:${options.executionLog}`;
	let compiled = compiledSources.get(cacheKey);
	if (!compiled) {
		compiled = compileInlineResumerSourceVariants(options);
		compiledSources.set(cacheKey, compiled);
	}
	return compiled;
}

async function compileInlineResumerSourceVariants(options: {
	readonly debug: boolean;
	readonly executionLog: MarklessExecutionLogMode;
}): Promise<InlineResumerSourceVariants> {
	const shared = { debug: options.debug, executionLog: options.executionLog };
	const [event, syncPolicy, graphSyncPolicyOwner, graphSyncPolicyConsumer] = await Promise.all([
		compileInlineResumerSource({
			...shared,
			graphSyncPolicy: false,
			sharedGraphPolicy: false,
			syncPolicy: false,
		}),
		compileInlineResumerSource({
			...shared,
			graphSyncPolicy: false,
			sharedGraphPolicy: false,
			syncPolicy: true,
		}),
		compileInlineResumerSource({
			...shared,
			graphSyncPolicy: true,
			sharedGraphPolicy: true,
			syncPolicy: true,
		}),
		compileInlineResumerSource({
			...shared,
			graphSyncPolicy: true,
			sharedGraphPolicy: false,
			syncPolicy: true,
		}),
	]);
	return { ...shared, event, syncPolicy, graphSyncPolicyOwner, graphSyncPolicyConsumer };
}

export async function compileInlineResumerSource(
	options: InlineResumerBuildOptions,
): Promise<string> {
	const source = createInlineResumerSource({
		...options,
		...(options.debug
			? {
					debugBootstrapSource: __marklessDebugBootstrapSource(),
					debugRegistrationSource: createInlineResumerDebugRegistrationSource(),
				}
			: {}),
	});
	const { minifySync, transformSync } = await loadOxcTools();
	const transformed = transformSync('markless-inline-resumer.js', source, {
		lang: 'js',
		sourceType: 'script',
		target: 'es2020',
	});
	assertOxcResult('transform', transformed.errors);
	const minified = minifySync('markless-inline-resumer.js', transformed.code, {
		compress: true,
		mangle: { toplevel: true },
		module: false,
	});
	assertOxcResult('minify', minified.errors);
	return minified.code.trim();
}

function assertOxcResult(phase: string, errors: ReadonlyArray<Error>): void {
	if (errors.length === 0) return;
	throw new Error(
		`MARKLESS_INLINE_RESUMER_${phase.toUpperCase()}_FAILED:\n${errors
			.map((error) => error.message)
			.join('\n')}`,
	);
}

// ---------------------------------------------------------------------------
// Prerender + self-wake inline boot, precompiled.
//
// The classic resumer ships through OXC because `Function.prototype.toString`
// serializes authored source verbatim. The prerender boot did not, so a
// prerendered CSR page paid full authored bytes at load. It compiles the same
// way, with one difference: its event names vary per page, so they stay a free
// identifier the mangler must preserve, substituted at emission.
// ---------------------------------------------------------------------------

export { PRERENDER_INLINE_EVENT_NAMES_TOKEN, renderPrerenderInlineResumerSource };

export type PrerenderInlineResumerVariants = {
	/** Delegated capture listeners only. */
	readonly prerender: string;
	/** Delegated capture listeners plus the event-less self-wake. */
	readonly prerenderSelfWake: string;
	/** Delegated capture listeners plus the fill-plan settle path. */
	readonly prerenderSettle: string;
};

const compiledPrerenderSources = new Map<string, Promise<PrerenderInlineResumerVariants>>();

export function compilePrerenderInlineResumerSources(): Promise<PrerenderInlineResumerVariants> {
	let compiled = compiledPrerenderSources.get('production');
	if (!compiled) {
		compiled = compilePrerenderVariants();
		compiledPrerenderSources.set('production', compiled);
	}
	return compiled;
}

async function compilePrerenderVariants(): Promise<PrerenderInlineResumerVariants> {
	const [prerender, prerenderSelfWake, prerenderSettle] = await Promise.all([
		compilePrerenderInlineResumerSource(false),
		compilePrerenderInlineResumerSource(true),
		compilePrerenderInlineResumerSource('settle'),
	]);
	return { prerender, prerenderSelfWake, prerenderSettle };
}

export async function compilePrerenderInlineResumerSource(
	selfWake: boolean | 'settle',
): Promise<string> {
	const source = parameterizedPrerenderInlineResumerSource(selfWake);
	const { minifySync, transformSync } = await loadOxcTools();
	const transformed = transformSync('markless-prerender-inline-resumer.js', source, {
		lang: 'js',
		sourceType: 'script',
		target: 'es2020',
	});
	assertOxcResult('transform', transformed.errors);
	const minified = minifySync('markless-prerender-inline-resumer.js', transformed.code, {
		compress: true,
		mangle: { toplevel: true },
		module: false,
	});
	assertOxcResult('minify', minified.errors);
	const code = minified.code.trim();
	// The token is an unresolved reference, so OXC must leave it verbatim. If a
	// future compressor folds it away the substitution below would silently ship
	// a page with no listeners, so fail the build here instead.
	if (code.split(PRERENDER_INLINE_EVENT_NAMES_TOKEN).length !== 2) {
		throw new Error('MARKLESS_PRERENDER_INLINE_RESUMER_EVENT_NAMES_TOKEN_LOST');
	}
	return code;
}

// The authored source with the event-name array literal replaced by the free
// token. Built from the SAME source builders render-to-string calls, so the
// minified variant can never drift from the unminified boot.
export function parameterizedPrerenderInlineResumerSource(selfWake: boolean | 'settle'): string {
	const placeholder = [PRERENDER_INLINE_EVENT_NAMES_TOKEN];
	const literal = JSON.stringify(placeholder);
	const plain =
		selfWake === 'settle'
			? createPrerenderSettleInlineResumerSource(placeholder, undefined)
			: createPrerenderInlineResumerSource(placeholder, undefined);
	if (plain.split(literal).length !== 2) {
		throw new Error('MARKLESS_PRERENDER_INLINE_RESUMER_EVENT_NAMES_UNPLACEABLE');
	}
	return `${plain.replace(literal, PRERENDER_INLINE_EVENT_NAMES_TOKEN)}${
		selfWake === true ? createInlineResumerSelfWakeSource(undefined) : ''
	}`;
}
