import type { RuntimeGraph } from '@markless/runtime';
import { marklessIsBoundSymbolId, marklessRowScopedSymbolContext } from '../resume-events.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';
import { marklessInstancePath, marklessRecordRowScope } from './instance-scope.ts';

/**
 * A bound derive placed in the keyed row its computed node sits in. Its id names
 * component edges, never a row; the node it writes names the row, as a bound
 * handler's dispatching host does.
 */
export function marklessRowPlacedDerive(
	derive: ResumeSymbol,
	record: { readonly graphNodeId: string; readonly deriveSymbolId: string },
): ResumeSymbol {
	if (!marklessIsBoundSymbolId(record.deriveSymbolId)) return derive;
	return (context) => {
		// A row minted inside an owner row binds its symbols under the owner's rows, so those are already placed.
		let bound = marklessInstancePath(record.deriveSymbolId);
		if (!bound.includes('r:') || !record.graphNodeId.startsWith(bound)) bound = '';
		const rowScope =
			context.graph &&
			marklessRecordRowScope(record.graphNodeId.slice(bound.length), context.graph)?.map((pair) => ({
				...pair,
				rowFree: bound + pair.rowFree,
				withRows: bound + pair.withRows,
			}));
		if (!context.graph || !rowScope?.length) return derive(context);
		const placed = marklessRowScopedSymbolContext(
			context as ResumeSymbolContext & { readonly graph: RuntimeGraph },
			rowScope,
		);
		return derive({ ...context, ...placed, read: placed.graph.read });
	};
}
