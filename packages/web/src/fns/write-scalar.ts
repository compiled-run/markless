type ScalarWriteGraph = {
	readonly hasCell?: (graphNodeId: string) => boolean;
	readonly read?: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	readonly write: (write: {
		readonly graphNodeId: string;
		readonly path?: ReadonlyArray<string>;
		readonly value: unknown;
	}) => void;
	readonly update: (update: {
		readonly graphNodeId: string;
		readonly path?: ReadonlyArray<string>;
		readonly returnValue?: 'previous' | 'next';
		readonly update: (value: unknown) => unknown;
	}) => unknown;
};

type ScalarWriteContext = {
	readonly graph?: ScalarWriteGraph;
};

type ScalarWriteInput =
	| {
			readonly graphNodeId: string;
			readonly path?: ReadonlyArray<string>;
			readonly value: unknown;
	  }
	| {
			readonly graphNodeId: string;
			readonly path?: ReadonlyArray<string>;
			readonly update: (value: unknown) => unknown;
			readonly returnValue?: 'previous' | 'next';
	  };

export function marklessWriteScalar(context: ScalarWriteContext, input: ScalarWriteInput): unknown {
	if (!context.graph)
		throw marklessScalarLeafError('MARKLESS_SCALAR_WRITE_GRAPH_MISSING', 'write-graph');
	if ((input.path?.length ?? 0) !== 0)
		throw marklessScalarLeafError('MARKLESS_SCALAR_WRITE_SHAPE', 'write-path');
	if (context.graph.hasCell?.(input.graphNodeId) === false) {
		throw marklessScalarLeafError('MARKLESS_SCALAR_WRITE_CELL_MISSING', 'write-cell');
	}
	context.graph.read?.(input.graphNodeId, []);
	if ('update' in input) {
		return context.graph.update({
			graphNodeId: input.graphNodeId,
			path: [],
			returnValue: input.returnValue,
			update: input.update,
		});
	}
	context.graph.write({ graphNodeId: input.graphNodeId, path: [], value: input.value });
}

function marklessScalarLeafError(code: string, site: string): Error {
	return Object.assign(new Error(code), { code, site });
}
