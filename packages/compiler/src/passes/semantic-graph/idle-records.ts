import { PROTOCOL_IDLE_EVENT_NAME } from '@markless/serializer';
import type { ModuleGraphInterfaceArtifact, SemanticGraphArtifact } from '../../artifacts.ts';
import { importedEdgeComponent } from '../link/component-target.ts';

type IdleGraph = Pick<SemanticGraphArtifact, 'events' | 'componentEdges'>;
type ImportedInterfaces = Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined;

/** Components that render an `onIdle` record themselves, or render a component that does. */
export function componentsWithIdleRecords(
	graph: IdleGraph,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlySet<string> {
	const idle = new Set<string>();
	for (const event of graph.events)
		if (event.componentName && event.eventName === PROTOCOL_IDLE_EVENT_NAME)
			idle.add(event.componentName);
	for (let grew = true; grew; ) {
		grew = false;
		for (const edge of graph.componentEdges) {
			if (idle.has(edge.parentComponentName)) continue;
			const childIdle = edge.importSource
				? importedEdgeComponent(edge, importedModuleInterfaces?.[edge.importSource])?.idleRecords ===
					true
				: idle.has(edge.childComponentName);
			if (!childIdle) continue;
			idle.add(edge.parentComponentName);
			grew = true;
		}
	}
	return idle;
}

/** Components that carry an `overlay` mark themselves, or render a component that does. */
export function componentsWithOverlays(
	graph: Pick<SemanticGraphArtifact, 'overlays' | 'componentEdges'>,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlySet<string> {
	const marked = new Set(graph.overlays.flatMap((overlay) => (overlay.componentName ? [overlay.componentName] : [])));
	for (let grew = true; grew; ) {
		grew = false;
		for (const edge of graph.componentEdges) {
			if (marked.has(edge.parentComponentName)) continue;
			const childMarked = edge.importSource
				? importedEdgeComponent(edge, importedModuleInterfaces?.[edge.importSource])?.overlayRecords === true
				: marked.has(edge.childComponentName);
			if (!childMarked) continue;
			marked.add(edge.parentComponentName);
			grew = true;
		}
	}
	return marked;
}
