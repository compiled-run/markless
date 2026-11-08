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

/** The nodes an async value is fetched with: what its recipe reads, through sync computeds and upstream async values. */
export function asyncKeyInputs(
	computed: ReadonlyMap<string, ComputedNode>,
): (graphNodeId: string) => ReadonlySet<string> {
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
	return keyInputsOf;
}

/** Async computeds a reader (computed, handler or component edge) reads beside an input of their key, each with its upstream async values. */
export function pairedAsyncValues(
	computed: ReadonlyMap<string, ComputedNode>,
	readers: Iterable<ReadonlyArray<string>>,
): ReadonlySet<string> {
	const { reach, dependencyIds } = asyncReach(computed);
	const keyInputsOf = asyncKeyInputs(computed);
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
