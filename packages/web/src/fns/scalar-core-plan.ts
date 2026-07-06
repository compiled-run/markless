export function marklessScalarCorePlan(state, view, eventRecord, graphNodeIds: ReadonlyArray<string>) {
	if (!eventRecord || state.computed.length > 0) return null;
	const domUpdates = view.domUpdates;
	if (domUpdates.some((record) => !record.symbolId || record.target?.kind !== 'text')) return null;
	const cellIds = new Set([...graphNodeIds, ...domUpdates.map((record) => record.graphNodeId)]);
	const cells = state.cells.filter((cell) => cellIds.has(cell.graphNodeId));
	if (cells.length !== cellIds.size) return null;
	if (cells.some((cell) => cell.valueKind !== 'scalar' || marklessCellNeedsFullDecode(cell.value))) return null;
	const locatorHostIds = new Set([eventRecord.hostNodeId, ...domUpdates.map((record) => record.hostNodeId)]);
	return {
		eventRecord,
		locators: view.locators.filter((locator) => locatorHostIds.has(locator.hostNodeId)),
		domUpdates,
		keyedRepeats: [],
		cells,
		fullDecodeCellIds: new Set(),
	};
}

function marklessCellNeedsFullDecode(value): boolean {
	return Boolean(value && typeof value === 'object' && Array.isArray(value.records) && value.records.length > 0);
}
