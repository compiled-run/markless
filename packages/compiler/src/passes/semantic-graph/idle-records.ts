import { PROTOCOL_IDLE_EVENT_NAME } from '@markless/serializer';
import type { ModuleGraphInterfaceArtifact, SemanticGraphArtifact } from '../../artifacts.ts';
import { importedEdgeComponent } from '../link/component-target.ts';

type ImportedInterfaces = Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined;
type InterfaceComponent = ModuleGraphInterfaceArtifact['render']['components'][number];

/** `own`, plus every component that renders one of them or an imported component `imported` accepts. */
function componentsRenderingAny(
	graph: Pick<SemanticGraphArtifact, 'componentEdges'>,
	own: Iterable<string>,
	importedModuleInterfaces: ImportedInterfaces,
	imported: (component: InterfaceComponent) => boolean,
): ReadonlySet<string> {
	const found = new Set(own);
	for (let grew = true; grew; ) {
		grew = false;
		for (const edge of graph.componentEdges) {
			if (found.has(edge.parentComponentName)) continue;
			const child = edge.importSource
				? importedEdgeComponent(edge, importedModuleInterfaces?.[edge.importSource])
				: undefined;
			if (!(edge.importSource ? !!child && imported(child) : found.has(edge.childComponentName)))
				continue;
			found.add(edge.parentComponentName);
			grew = true;
		}
	}
	return found;
}

/** Components that render an `onIdle` record themselves, or render a component that does. */
export function componentsWithIdleRecords(
	graph: Pick<SemanticGraphArtifact, 'events' | 'componentEdges'>,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlySet<string> {
	return componentsRenderingAny(
		graph,
		graph.events.flatMap((event) =>
			event.componentName && event.eventName === PROTOCOL_IDLE_EVENT_NAME ? [event.componentName] : [],
		),
		importedModuleInterfaces,
		(component) => component.idleRecords === true,
	);
}

/** Components that resolve a shared() instance outliving the page themselves, or render a component that does. */
export function componentsWithLiveShared(
	graph: Pick<SemanticGraphArtifact, 'sharedInstances' | 'sharedDefinitions' | 'componentEdges'>,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlySet<string> {
	const live = new Set(
		graph.sharedDefinitions
			.filter((definition) => definition.scope !== 'subtree')
			.map((definition) => definition.id),
	);
	return componentsRenderingAny(
		graph,
		graph.sharedInstances.flatMap((instance) =>
			instance.componentName && live.has(instance.definitionId) ? [instance.componentName] : [],
		),
		importedModuleInterfaces,
		(component) => component.liveShared === true,
	);
}
