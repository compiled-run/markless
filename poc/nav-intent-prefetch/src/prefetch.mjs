import { deriveAsyncComputedDemand } from './derive.mjs';

export function createDestinationPrestart(compiled) {
	const { protocolState, protocolView, loadSymbol } = compiled;
	const { demanded, asyncComputedIds } = deriveAsyncComputedDemand(protocolState, protocolView);
	const computedById = new Map(
		protocolState.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	const values = new Map(
		protocolState.cells.map((cell) => [cell.graphNodeId, decodeSeedValue(cell.value)]),
	);
	const runs = new Map();
	const started = new Set();
	let resolveAllStarted;
	const allStarted = new Promise((resolve) => {
		resolveAllStarted = resolve;
	});

	const graph = {
		read(graphNodeId, path = []) {
			let value = values.get(graphNodeId);
			for (const key of path) value = value?.[key];
			return value;
		},
	};

	async function runNode(graphNodeId) {
		if (!demanded.has(graphNodeId) || !computedById.has(graphNodeId)) return;
		if (runs.has(graphNodeId)) return runs.get(graphNodeId);
		const computed = computedById.get(graphNodeId);
		const run = (async () => {
			await Promise.all(
				(computed.dependencies ?? []).map((dependency) => runNode(dependency.graphNodeId)),
			);
			if (computed.async) {
				const symbolId = protocolView.asyncRunners[graphNodeId];
				const runner = await loadSymbol(symbolId);
				started.add(graphNodeId);
				if (started.size === asyncComputedIds.length) resolveAllStarted();
				const value = await runner({
					graph,
					read: graph.read,
					key: null,
					signal: new AbortController().signal,
					element: undefined,
					getElementHandle: () => undefined,
				});
				values.set(graphNodeId, { status: 'fulfilled', value });
				return value;
			}
			const derive = await loadSymbol(computed.deriveSymbolId);
			const value = derive({ graph, read: graph.read });
			values.set(graphNodeId, value);
			return value;
		})();
		runs.set(graphNodeId, run);
		return run;
	}

	if (asyncComputedIds.length === 0) resolveAllStarted();
	const settled = Promise.all(asyncComputedIds.map(runNode));
	return {
		allStarted,
		asyncComputedIds,
		settled,
		value(graphNodeId) {
			const value = values.get(graphNodeId);
			return value?.status === 'fulfilled' ? value.value : value;
		},
	};
}

function decodeSeedValue(value) {
	if (value === undefined) return undefined;
	if (value.version !== 1 || !Array.isArray(value.records) || value.records.length !== 0)
		throw new Error('This POC graph shim only supports scalar destination seed cells');
	return value.root;
}
