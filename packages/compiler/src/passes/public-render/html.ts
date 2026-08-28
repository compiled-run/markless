import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { stripAuthoredExpression } from './authored-strip.ts';
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
): ReadonlyMap<
	string,
	{ readonly graphNodeId: string; readonly name: string; readonly source: string }
> {
	const definitions = collectSsrAsyncRunnerDefinitions(input);
	const runnersByGraphNode = new Map(
		input.symbolResolver.symbols.flatMap((symbol) => {
			if (symbol.kind !== 'async-computed-runner' && symbol.kind !== 'sync-computed-derive')
				return [];
			const definition = definitions.get(symbol.graphNodeId);
			return definition
				? [[symbol.graphNodeId, { name: symbol.name, source: definition.source }] as const]
				: [];
		}),
	);
	const byBoundary = new Map<
		string,
		{ readonly graphNodeId: string; readonly name: string; readonly source: string }
	>();
	const boundaryRunners = resolveBoundaryRunners(input.semanticGraph);
	for (const boundary of input.protocolView.asyncBoundaries) {
		const read = boundaryRunners.get(boundary.id)?.authored;
		const runner = read ? runnersByGraphNode.get(read.graphNodeId) : undefined;
		if (read && runner)
			byBoundary.set(boundary.id, { graphNodeId: read.graphNodeId, ...runner });
	}
	return byBoundary;
}

export function collectSsrAsyncRunnerDefinitions(
	input: PublicRenderModuleInput,
): ReadonlyMap<
	string,
	{
		readonly source: string;
		readonly dependencies: ReadonlyArray<string>;
		readonly async: boolean;
	}
> {
	const asyncCapableSyncIds = new Set(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'computed' && binding.async !== true && binding.asyncCapable === true
				? [binding.id]
				: [],
		),
	);
	const registeredGraphNodeIds = new Set(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'async-computed-runner' ||
			(symbol.kind === 'sync-computed-derive' && asyncCapableSyncIds.has(symbol.graphNodeId))
				? [symbol.graphNodeId]
				: [],
		),
	);
	const computedByGraphNode = new Map(
		input.protocolState.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	return new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'async-computed-runner' ||
			(symbol.kind === 'sync-computed-derive' && asyncCapableSyncIds.has(symbol.graphNodeId))
				? [
						[
							symbol.graphNodeId,
							{
								source: ssrAsyncRunnerSource(
										symbol,
										registeredGraphNodeIds,
										input.source.filename,
									),
								dependencies: (
									computedByGraphNode.get(symbol.graphNodeId)?.dependencies ?? []
								)
									.map((dependency) => dependency.graphNodeId)
									.filter((graphNodeId) =>
										registeredGraphNodeIds.has(graphNodeId),
									),
								async: symbol.kind === 'async-computed-runner',
							},
						] as const,
					]
				: [],
		),
	);
}

function ssrAsyncRunnerSource(
	symbol: Extract<
		PublicRenderModuleInput['symbolResolver']['symbols'][number],
		{ readonly kind: 'async-computed-runner' | 'sync-computed-derive' }
	>,
	registeredGraphNodeIds: ReadonlySet<string>,
	filename: string,
): string {
	// One local per read root. A dependency whose node sits BELOW that root (a
	// shared instance's `allChecked` resolves to the computed itself) contributes
	// a member of the local instead of replacing it.
	const roots = new Map<string, { root: string | null; members: Map<string, string> }>();
	for (const dependency of symbol.dependencies ?? []) {
		if (!registeredGraphNodeIds.has(dependency.graphNodeId)) continue;
		const sourcePath = dependency.source.split('.');
		const name = sourcePath[0];
		if (!name || sourcePath.some((part) => !/^[$A-Z_a-z][$\w]*$/.test(part))) continue;
		const entry = roots.get(name) ?? { root: null, members: new Map<string, string>() };
		roots.set(name, entry);
		const read = (path: ReadonlyArray<string>) =>
			`read(${JSON.stringify(dependency.graphNodeId)},${JSON.stringify(path)})`;
		const rootPathLength = dependency.path.length - sourcePath.length + 1;
		if (rootPathLength >= 0) {
			entry.root ??= read(dependency.path.slice(0, rootPathLength));
			continue;
		}
		const member = sourcePath[1];
		if (!member || entry.members.has(member)) continue;
		entry.members.set(member, read(dependency.path));
	}
	const declarations = [...roots].flatMap(([name, entry]) => {
		const members = [...entry.members].map(([key, read]) => `${JSON.stringify(key)}:${read}`);
		if (members.length === 0) return entry.root ? [`const ${name}=${entry.root};`] : [];
		const spread = entry.root ? [`...${entry.root}`] : [];
		return [`const ${name}={${[...spread, ...members].join(',')}};`];
	});
	const authored = stripAuthoredExpression(symbol.source, {
		filename,
		what: 'a computed runner carried into the SSR module',
	});
	if (symbol.kind === 'sync-computed-derive') {
		return `({read})=>{${declarations.join('')}const derive=${authored};return derive()}`;
	}
	if (declarations.length === 0) return authored;
	return `({key,signal,read})=>{${declarations.join('')}const run=${authored};return run({key,signal,read})}`;
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
				? ([
						[
							symbol.graphNodeId,
							ssrAsyncRunnerSource(symbol, sharedGraphNodeIds, input.source.filename),
						],
					] as const)
				: [],
		),
	);
}

export const TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX = 'computed:templateExpression:';

/**
 * A recombined template expression that reads a shared() instance has no
 * render-body local either: the instance is not a binding, so SSR derives the
 * value from the factory's seeded state nodes exactly as a shared computed does.
 */
export function collectSsrTemplateComputedSources(
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
			symbol.kind === 'sync-computed-derive' &&
			symbol.graphNodeId.startsWith(TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX) &&
			(symbol.dependencies ?? []).some((dependency) =>
				sharedGraphNodeIds.has(dependency.graphNodeId),
			)
				? ([
						[
							symbol.graphNodeId,
							ssrAsyncRunnerSource(symbol, sharedGraphNodeIds, input.source.filename),
						],
					] as const)
				: [],
		),
	);
}
