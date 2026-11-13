import type { ModuleGraphInterfaceArtifact, SemanticGraphArtifact } from '../../artifacts.ts';

type RejectionGraph = Pick<SemanticGraphArtifact, 'events' | 'componentEdges'>;
type ImportedInterfaces = Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined;

/** Components whose own handlers, or a component they render, can hand back a promise no @catch of theirs takes. */
export function componentsWithRejectingHandlers(
	graph: RejectionGraph,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlySet<string> {
	const rejecting = new Set<string>();
	for (const event of graph.events)
		if (
			event.componentName &&
			(((event.handlerReturnsPromise || event.inPlaceSubmit) && !event.handlerCatchBoundaryId) ||
				(event.handlerMayReject && !event.dispatchCatchBoundaryId))
		)
			rejecting.add(event.componentName);
	for (const edge of graph.componentEdges)
		if (edge.props.some((prop) => 'returnsPromise' in prop && prop.returnsPromise && !prop.catchBoundaryId))
			rejecting.add(edge.parentComponentName);
	for (let grew = true; grew; ) {
		grew = false;
		for (const edge of graph.componentEdges) {
			if (edge.catchBoundaryId || rejecting.has(edge.parentComponentName)) continue;
			if (!childRejects(edge, rejecting, importedModuleInterfaces)) continue;
			rejecting.add(edge.parentComponentName);
			grew = true;
		}
	}
	return rejecting;
}

/** A component inside a @try with a @catch makes that boundary catch handlers only when one of its handlers can reject. */
export function keepRejectingChildCatches(
	graph: RejectionGraph & { componentEdges: SemanticGraphArtifact['componentEdges'][number][] },
	importedModuleInterfaces: ImportedInterfaces,
): void {
	const rejecting = componentsWithRejectingHandlers(graph, importedModuleInterfaces);
	graph.componentEdges = graph.componentEdges.map((edge) => {
		if (!edge.catchBoundaryId || childRejects(edge, rejecting, importedModuleInterfaces)) return edge;
		const { catchBoundaryId: _dropped, ...kept } = edge;
		return kept;
	});
}

function childRejects(
	edge: SemanticGraphArtifact['componentEdges'][number],
	rejecting: ReadonlySet<string>,
	importedModuleInterfaces: ImportedInterfaces,
): boolean {
	if (!edge.importSource) return rejecting.has(edge.childComponentName);
	return (
		importedModuleInterfaces?.[edge.importSource]?.render.components.find(
			(component) => component.componentName === edge.childComponentName,
		)?.rejectingHandlers === true
	);
}
