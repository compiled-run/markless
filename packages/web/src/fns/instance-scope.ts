import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';

// A composed child's compiled symbols spell the child module's own graph node
// ids, but composition merged that child's nodes into the page graph under its
// instance path. The symbol id carries the same path, so every loader — the
// bundler's symbol route, the dev harness, a test's own loadSymbol — recovers
// the instance from the id it was asked for. INSTANCE_PATH restates the
// serializer's grammar; composed-page-space.test.ts keeps the two in step.
const INSTANCE_PATH = /^(?:[cp]\d+:)+/;

// A symbol loaded through the child's own composed loader already answers in
// page space, so resume must not scope it a second time.
const composedSymbols = new WeakSet<object>();

export function marklessMarkComposedSymbol<T extends object>(symbol: T): T {
	composedSymbols.add(symbol);
	return symbol;
}

export function marklessInstanceScopedLoadSymbol(
	loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>,
): (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol> {
	return (symbolId: string) => {
		const instancePath = INSTANCE_PATH.exec(symbolId)?.[0];
		if (!instancePath) return loadSymbol(symbolId);
		const loaded = loadSymbol(symbolId);
		return typeof (loaded as Promise<ResumeSymbol>)?.then === 'function'
			? (loaded as Promise<ResumeSymbol>).then((symbol) => scopeSymbol(symbol, instancePath))
			: scopeSymbol(loaded as ResumeSymbol, instancePath);
	};
}

function scopeSymbol(symbol: ResumeSymbol, instancePath: string): ResumeSymbol {
	if (composedSymbols.has(symbol)) return symbol;
	return (context: ResumeSymbolContext) =>
		symbol({
			...context,
			graph: marklessInstanceScopedGraph(context.graph, instancePath),
			...(context.read
				? {
						read: (graphNodeId: string, path?: ReadonlyArray<string>) =>
							context.graph.read(instancePath + graphNodeId, path),
					}
				: {}),
		});
}

// Only ids the symbol itself spells are child-local. Shared definitions and the
// graph's own bookkeeping (journal, flush, subscriptions by record id) stay in
// page space.
export function marklessInstanceScopedGraph(
	graph: RuntimeGraph,
	instancePath: string,
): RuntimeGraph {
	if (!instancePath) return graph;
	const qualify = (graphNodeId: string) => instancePath + graphNodeId;
	return {
		...graph,
		read: (graphNodeId, path) => graph.read(qualify(graphNodeId), path),
		write: (write) => graph.write({ ...write, graphNodeId: qualify(write.graphNodeId) }),
		update: (update) => graph.update({ ...update, graphNodeId: qualify(update.graphNodeId) }),
		call: (call) => graph.call({ ...call, graphNodeId: qualify(call.graphNodeId) }),
		delete: (deletion) =>
			graph.delete({ ...deletion, graphNodeId: qualify(deletion.graphNodeId) }),
		subscribe: (subscription) =>
			graph.subscribe({
				...subscription,
				graphNodeId: qualify(subscription.graphNodeId),
			}),
	};
}
