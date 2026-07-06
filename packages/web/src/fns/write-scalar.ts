import type { EventOnlyResumeSymbolContext } from '../event-only-lean/types.ts';

type ScalarWriteInput =
	| {
			readonly graphNodeId: string;
			readonly path?: readonly string[];
			readonly value: unknown;
	  }
	| {
			readonly graphNodeId: string;
			readonly path?: readonly string[];
			readonly update: (value: unknown) => unknown;
	  };

export function marklessWriteScalar(
	context: EventOnlyResumeSymbolContext,
	input: ScalarWriteInput,
): unknown {
	if ('update' in input) {
		return context.graph.update({
			graphNodeId: input.graphNodeId,
			path: input.path,
			returnValue: 'next',
			update: input.update,
		});
	}
	context.graph.write({
		graphNodeId: input.graphNodeId,
		path: input.path,
		value: input.value,
	});
}
