import type {
	ModuleGraphInterfaceArtifact,
	SemanticComponentEdge,
	SemanticEvent,
	SemanticGraphDiagnostic,
} from '../../artifacts.ts';

/**
 * The props each component hands to an event as is (`onSubmit={props.onSave}`), in any of its
 * elements, `@if` arms and `@for` rows, or by passing them on as is to a child that does.
 * A parent's cancel in such a prop has to run during the dispatch, so composition carries it there.
 */
export function moduleRelayedProps(input: {
	readonly componentNames: ReadonlyArray<string>;
	readonly events: ReadonlyArray<SemanticEvent>;
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): ReadonlyMap<string, ReadonlySet<string>> {
	const relayed = new Map(input.componentNames.map((name) => [name, new Set<string>()]));
	for (const event of input.events)
		if (event.relayedPropName && event.componentName)
			relayed.get(event.componentName)?.add(event.relayedPropName);
	const childRelays = (
		edge: SemanticComponentEdge,
	): ReadonlySet<string> | ReadonlyArray<string> =>
		edge.importSource
			? (input.importedModuleInterfaces[edge.importSource]?.render.components.find(
					(component) => component.componentName === edge.childComponentName,
				)?.relayedProps ?? [])
			: (relayed.get(edge.childComponentName) ?? []);
	// A same-module chain passes a prop on through several components, so repeat until nothing is added.
	for (let grew = true; grew;) {
		grew = false;
		for (const edge of input.componentEdges) {
			const own = relayed.get(edge.parentComponentName);
			if (!own) continue;
			const relays = new Set(childRelays(edge));
			for (const prop of edge.props) {
				if (
					prop.kind !== 'graph-reference' ||
					prop.graphBindingKind !== 'prop' ||
					prop.path.length !== 1 ||
					!relays.has(prop.name) ||
					own.has(prop.path[0]!)
				)
					continue;
				own.add(prop.path[0]!);
				grew = true;
			}
		}
	}
	return relayed;
}

/** The deferred refusals whose child hands the prop to an event, where the cancel would run too late. */
export function relayCancelDiagnostics(
	refusals: ReadonlyArray<{
		readonly childComponentName: string;
		readonly importSource?: string;
		readonly propName: string;
		readonly diagnostic: SemanticGraphDiagnostic;
	}>,
	relayed: ReadonlyMap<string, ReadonlySet<string>>,
	importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>,
): ReadonlyArray<SemanticGraphDiagnostic> {
	return refusals.flatMap((refusal) => {
		const props = refusal.importSource
			? importedModuleInterfaces[refusal.importSource]?.render.components.find(
					(component) => component.componentName === refusal.childComponentName,
				)?.relayedProps
			: [...(relayed.get(refusal.childComponentName) ?? [])];
		return props?.includes(refusal.propName) ? [refusal.diagnostic] : [];
	});
}
