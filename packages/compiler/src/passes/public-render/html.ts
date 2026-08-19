import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { resolveBoundaryRunners } from './boundary-runner.ts';

// Retained only as a type-compatible import for dead component-wiring helpers;
// production module emission never calls the retired AST HTML renderer.
export function emitHtmlChildren(..._retiredInputs: ReadonlyArray<unknown>): string {
	throw new Error('AST HTML emission retired; use renderData chunks.');
}

// SSR still needs authored runner functions; HTML itself is emitted from
// renderData chunks in ssr-module.ts.
export function collectSsrAsyncRunners(
	input: PublicRenderModuleInput,
): ReadonlyMap<string, { readonly graphNodeId: string; readonly name: string; readonly source: string }> {
	const definitions = collectSsrAsyncRunnerDefinitions(input);
	const runnersByGraphNode = new Map(
		input.symbolResolver.symbols.flatMap((symbol) => {
			if (symbol.kind !== 'async-computed-runner' && symbol.kind !== 'sync-computed-derive') return [];
			const definition = definitions.get(symbol.graphNodeId);
			return definition ? [[symbol.graphNodeId, { name: symbol.name, source: definition.source }] as const] : [];
		}),
	);
	const byBoundary = new Map<string, { readonly graphNodeId: string; readonly name: string; readonly source: string }>();
	const boundaryRunners = resolveBoundaryRunners(input.semanticGraph);
	for (const boundary of input.protocolView.asyncBoundaries) {
		const read = boundaryRunners.get(boundary.id)?.authored;
		const runner = read ? runnersByGraphNode.get(read.graphNodeId) : undefined;
		if (read && runner) byBoundary.set(boundary.id, { graphNodeId: read.graphNodeId, ...runner });
	}
	return byBoundary;
}

export function collectSsrAsyncRunnerDefinitions(input: PublicRenderModuleInput): ReadonlyMap<
	string,
	{ readonly source: string; readonly dependencies: ReadonlyArray<string>; readonly async: boolean }
> {
	const asyncCapableSyncIds = new Set(input.semanticGraph.graphBindings.flatMap((binding) =>
		binding.kind === 'computed' && binding.async !== true && binding.asyncCapable === true ? [binding.id] : [],
	));
	const registeredGraphNodeIds = new Set(input.symbolResolver.symbols.flatMap((symbol) =>
		symbol.kind === 'async-computed-runner' ||
		(symbol.kind === 'sync-computed-derive' && asyncCapableSyncIds.has(symbol.graphNodeId))
			? [symbol.graphNodeId]
			: [],
	));
	const computedByGraphNode = new Map(input.protocolState.computed.map((computed) => [computed.graphNodeId, computed]));
	return new Map(input.symbolResolver.symbols.flatMap((symbol) =>
		symbol.kind === 'async-computed-runner' ||
		(symbol.kind === 'sync-computed-derive' && asyncCapableSyncIds.has(symbol.graphNodeId))
			? [[symbol.graphNodeId, {
				source: ssrAsyncRunnerSource(symbol, registeredGraphNodeIds),
				dependencies: (computedByGraphNode.get(symbol.graphNodeId)?.dependencies ?? [])
					.map((dependency) => dependency.graphNodeId)
					.filter((graphNodeId) => registeredGraphNodeIds.has(graphNodeId)),
				async: symbol.kind === 'async-computed-runner',
			}] as const]
			: [],
	));
}

function ssrAsyncRunnerSource(
	symbol: Extract<PublicRenderModuleInput['symbolResolver']['symbols'][number], { readonly kind: 'async-computed-runner' | 'sync-computed-derive' }>,
	registeredGraphNodeIds: ReadonlySet<string>,
): string {
	const declarations: string[] = [];
	const names = new Set<string>();
	for (const dependency of symbol.dependencies ?? []) {
		if (!registeredGraphNodeIds.has(dependency.graphNodeId)) continue;
		const sourcePath = dependency.source.split('.');
		const name = sourcePath[0];
		if (!name || names.has(name) || sourcePath.some((part) => !/^[$A-Z_a-z][$\w]*$/.test(part))) continue;
		names.add(name);
		const path = dependency.path.slice(0, dependency.path.length - sourcePath.length + 1);
		declarations.push(`const ${name}=read(${JSON.stringify(dependency.graphNodeId)},${JSON.stringify(path)});`);
	}
	if (symbol.kind === 'sync-computed-derive') {
		return `({read})=>{${declarations.join('')}const derive=${symbol.source};return derive()}`;
	}
	if (declarations.length === 0) return symbol.source;
	return `({key,signal,read})=>{${declarations.join('')}const run=${symbol.source};return run({key,signal,read})}`;
}

// A shared() computed lives in the factory, so SSR has no render-body local to
// re-read: it derives the value from the factory's seeded state nodes instead.
export function collectSsrSharedComputedSources(
	input: PublicRenderModuleInput,
): ReadonlyMap<string, string> {
	const sharedGraphNodeIds = new Set(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.sharedDefinitionId !== undefined ? [binding.id] : [],
		),
	);
	if (sharedGraphNodeIds.size === 0) return new Map();

	return new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'sync-computed-derive' && sharedGraphNodeIds.has(symbol.graphNodeId)
				? ([[symbol.graphNodeId, ssrAsyncRunnerSource(symbol, sharedGraphNodeIds)]] as const)
				: [],
		),
	);
}
