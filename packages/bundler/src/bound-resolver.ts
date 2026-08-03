// Imported child modules were compiled before their parent edges were known, so
// their symbol code still reads the legacy prop graph cell. Bound rows carry the
// parent-proven routes; this adapter makes those reads edge-specific at load time.
export function adaptImportedCaptureResolver(source: string, hasImportedRows: boolean): string {
	if (!hasImportedRows) return source;
	const original =
		'\treturn (context) => base({ ...context, capture: createCaptureContext(context, bound) });';
	const replacement = [
		'\treturn async (context) => {',
		'\t\tconst pendingCallbacks = [];',
		'\t\tconst capture = createCaptureContext(context, bound);',
		'\t\tconst result = await base({ ...context, graph: createBoundGraph(context, bound, capture, pendingCallbacks), capture });',
		'\t\tawait Promise.all(pendingCallbacks);',
		'\t\treturn result;',
		'\t};',
	].join('\n');
	const helper = [
		'function createBoundGraph(context, bound, capture, pendingCallbacks) {',
		'\tconst legacySlots = new Map(bound.captureSlots.flatMap((slot) => slot.legacyGraphRead ? [[JSON.stringify([slot.legacyGraphRead.graphNodeId, slot.legacyGraphRead.path ?? []]), slot]] : []));',
		'\treturn {',
		'\t\t...context.graph,',
		'\t\tread(graphNodeId, path = []) {',
		'\t\t\tconst slot = legacySlots.get(JSON.stringify([graphNodeId, path]));',
		'\t\t\tif (!slot) return context.graph.read(graphNodeId, path);',
		'\t\t\tif (slot.route.kind === callbackRoute) return (...args) => {',
		'\t\t\t\tconst pending = context.invokeSymbol(slot.route.callbackSymbolId, { ...context, event: context.event, args });',
		'\t\t\t\tpendingCallbacks.push(Promise.resolve(pending));',
		'\t\t\t\treturn pending;',
		'\t\t\t};',
		'\t\t\treturn capture.read(slot.slotId);',
		'\t\t},',
		'\t};',
		'}',
		'',
	].join('\n');
	return source
		.replace(original, replacement)
		.replace(
			'function createCaptureContext(context, bound) {',
			`${helper}function createCaptureContext(context, bound) {`,
		);
}
