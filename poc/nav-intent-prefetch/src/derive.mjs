export function deriveAsyncComputedDemand(protocolState, protocolView) {
	const computedById = new Map(
		protocolState.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	const demanded = new Set();
	for (const boundary of protocolView.asyncBoundaries)
		for (const read of boundary.asyncReads) demanded.add(read.graphNodeId);

	for (const graphNodeId of demanded) {
		const computed = computedById.get(graphNodeId);
		if (!computed) continue;
		for (const dependency of computed.dependencies ?? []) demanded.add(dependency.graphNodeId);
	}

	const asyncComputedIds = [...demanded].filter(
		(graphNodeId) => computedById.get(graphNodeId)?.async === true,
	);
	for (const graphNodeId of asyncComputedIds) {
		if (!protocolView.asyncRunners?.[graphNodeId]) {
			throw new Error(
				`Compiled boundary demand ${graphNodeId} has no entry in protocolView.asyncRunners`,
			);
		}
	}
	return { demanded, asyncComputedIds };
}
