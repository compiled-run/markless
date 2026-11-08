import type { RuntimeGraph } from '@markless/runtime';
import { marklessIsBoundSymbolId, marklessRowScopedSymbolContext } from '../resume-events.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';
import { marklessRecordRowScope } from './instance-scope.ts';

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
		const rowScope = context.graph && marklessRecordRowScope(record.graphNodeId, context.graph);
		if (!context.graph || !rowScope?.length) return derive(context);
		const placed = marklessRowScopedSymbolContext(
			context as ResumeSymbolContext & { readonly graph: RuntimeGraph },
			rowScope,
		);
		return derive({ ...context, ...placed, read: placed.graph.read });
	};
}
