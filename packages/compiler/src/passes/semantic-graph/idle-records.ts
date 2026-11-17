import { PROTOCOL_IDLE_EVENT_NAME } from '@markless/serializer';
import type {
	ModuleGraphInterfaceArtifact,
	SemanticGraphArtifact,
	SemanticPropComponent,
} from '../../artifacts.ts';
import { importedEdgeComponent } from '../link/component-target.ts';
import { propComponentTargets } from './prop-components.ts';

type IdleGraph = Pick<SemanticGraphArtifact, 'events' | 'componentEdges'>;
type ImportedInterfaces = Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined;

/** Components that render an `onIdle` record themselves, or render a component that does, a component handed over as a prop included. */
export function componentsWithIdleRecords(
	graph: IdleGraph,
	importedModuleInterfaces: ImportedInterfaces,
	renderedProps: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlySet<string> {
	const idle = new Set<string>();
	for (const event of graph.events)
		if (event.componentName && event.eventName === PROTOCOL_IDLE_EVENT_NAME)
			idle.add(event.componentName);
	const targetIdle = (target: SemanticPropComponent): boolean =>
		target.importSource
			? importedEdgeComponent(target, importedModuleInterfaces?.[target.importSource])
					?.idleRecords === true
			: idle.has(target.childComponentName);
	for (let grew = true; grew; ) {
		grew = false;
		for (const edge of graph.componentEdges) {
			if (idle.has(edge.parentComponentName)) continue;
			if (
				!targetIdle(edge) &&
				!propComponentTargets(edge, renderedProps, importedModuleInterfaces).some(targetIdle)
			)
				continue;
			idle.add(edge.parentComponentName);
			grew = true;
		}
	}
	return idle;
}
