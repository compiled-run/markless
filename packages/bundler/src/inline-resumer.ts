import {
	createInlineResumerDebugRegistrationSource,
	createInlineResumerSource,
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
