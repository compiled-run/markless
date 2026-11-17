import type { PlannedSymbol, SemanticGraphArtifact } from '../../artifacts.ts';

/**
 * Writes the analyzer's web device edits into each event handler's code: a device call removed, a target constant in
 * place of its read. Spans are the analyzer's, offset by where the handler starts in the module.
 */
export function applyWebDeviceEdits(
	symbols: ReadonlyArray<PlannedSymbol>,
	semanticGraph: SemanticGraphArtifact,
): void {
	const edits = semanticGraph.webDeviceEdits ?? [];
	if (edits.length === 0) return;
	for (const symbol of symbols) {
		if (symbol.kind !== 'event-handler' || !symbol.sourceSpan) continue;
		const { start, end } = symbol.sourceSpan;
		const inside = edits
			.filter((edit) => edit.start >= start && edit.end <= end)
			.filter(
				(edit, _, all) =>
					!all.some(
						(outer) =>
							outer !== edit && outer.start <= edit.start && outer.end >= edit.end,
					),
			)
			.sort((a, b) => b.start - a.start);
		let source = symbol.source;
		for (const edit of inside)
			source =
				source.slice(0, edit.start - start) + edit.text + source.slice(edit.end - start);
		if (source !== symbol.source) (symbol as { source: string }).source = source;
	}
}
