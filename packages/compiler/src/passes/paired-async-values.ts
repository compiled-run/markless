type ComputedNode = {
	readonly async?: boolean;
	readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
};

/** What reads reach through sync computeds: the async values they stop at, and every other node. */
export function asyncReach(computed: ReadonlyMap<string, ComputedNode>) {
	const isAsync = (graphNodeId: string) => computed.get(graphNodeId)?.async === true;
	const reach = (graphNodeIds: Iterable<string>) => {
		const asyncValues = new Set<string>();
		const plain = new Set<string>();
		const visit = (graphNodeId: string): void => {
			if (isAsync(graphNodeId)) return void asyncValues.add(graphNodeId);
			if (plain.has(graphNodeId)) return;
			plain.add(graphNodeId);
			for (const dependency of computed.get(graphNodeId)?.dependencies ?? [])
				visit(dependency.graphNodeId);
		};
		for (const graphNodeId of graphNodeIds) visit(graphNodeId);
		return { asyncValues, plain };
	};
	const dependencyIds = (graphNodeId: string) =>
		(computed.get(graphNodeId)?.dependencies ?? []).map((dependency) => dependency.graphNodeId);
	// The nearest async values a node derives from.
	const asyncInputs = (graphNodeId: string) => [...reach(dependencyIds(graphNodeId)).asyncValues];
	return { isAsync, reach, dependencyIds, asyncInputs };
}

/**
 * The async computeds some reader pairs with an input of their key: a reader that reads the
 * value beside one of those inputs, or beside another async value fetched with one of them.
 * Readers are computeds (async ones too), handlers and component edges, each a list of the
 * nodes it reads. Each paired value keeps its upstream async values, whose inputs it was
 * fetched with; only a page that serves one loads matched values.
 */
export function pairedAsyncValues(
	computed: ReadonlyMap<string, ComputedNode>,
	readers: Iterable<ReadonlyArray<string>>,
): ReadonlySet<string> {
	const { reach, dependencyIds } = asyncReach(computed);
	const keyInputs = new Map<string, ReadonlySet<string>>();
	const keyInputsOf = (graphNodeId: string): ReadonlySet<string> => {
		let inputs = keyInputs.get(graphNodeId);
		if (inputs) return inputs;
		keyInputs.set(graphNodeId, new Set());
		const reached = reach(dependencyIds(graphNodeId));
		inputs = new Set([
			...reached.plain,
			...[...reached.asyncValues].flatMap((id) => [...keyInputsOf(id)]),
		]);
		keyInputs.set(graphNodeId, inputs);
		return inputs;
	};
	const meets = (left: ReadonlySet<string>, right: ReadonlySet<string>) =>
		[...left].some((graphNodeId) => right.has(graphNodeId));
	const paired = new Set<string>();
	for (const reader of readers) {
		const { asyncValues, plain } = reach(reader);
		const values = [...asyncValues];
		for (const value of values)
			if (
				meets(keyInputsOf(value), plain) ||
				values.some((other) => other !== value && meets(keyInputsOf(value), keyInputsOf(other)))
			)
				paired.add(value);
	}
	for (const value of paired)
		for (const upstream of reach(dependencyIds(value)).asyncValues) paired.add(upstream);
	return paired;
}

/** What each component edge hands its child: a child may read those props together. */
export function componentEdgeReads(
	edges: ReadonlyArray<{
		readonly props: ReadonlyArray<{ readonly kind: string; readonly graphNodeId?: string }>;
	}>,
): ReadonlyArray<ReadonlyArray<string>> {
	return edges.map((edge) =>
		edge.props.flatMap((prop) =>
			prop.kind === 'graph-reference' && prop.graphNodeId ? [prop.graphNodeId] : [],
		),
	);
}
