import { PROTOCOL_CONTAINER_HOST_NODE_ID } from '@markless/serializer';
import type {
	ModuleGraphInterfaceArtifact,
	SemanticGraphArtifact,
	SemanticGraphDiagnostic,
} from '../../artifacts.ts';
import { childRepeatWithoutElementDiagnostic } from './diagnostics.ts';

/** Components whose template holds a keyed repeat with no element around it. */
export function containerRepeatComponents(graph: SemanticGraphArtifact): Set<string> {
	const repeatIds = new Set(
		graph.keyedRepeats
			.filter((repeat) => repeat.parentHostNodeId === PROTOCOL_CONTAINER_HOST_NODE_ID)
			.map((repeat) => repeat.id),
	);
	const names = new Set<string>();
	if (repeatIds.size === 0) return names;
	for (const chunk of graph.markup.chunks)
		if (
			chunk.componentName &&
			chunk.slots.some((slot) => slot.kind === 'repeat' && repeatIds.has(slot.repeatId))
		)
			names.add(chunk.componentName);
	return names;
}

/** A child placed inside another component cannot use the container as its rows' parent. */
export function childContainerRepeatDiagnostics(input: {
	readonly graph: SemanticGraphArtifact;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): void {
	const local = containerRepeatComponents(input.graph);
	const diagnostics = input.graph.diagnostics as SemanticGraphDiagnostic[];
	for (const edge of input.graph.componentEdges) {
		const hasContainerRepeat =
			edge.importSource === undefined
				? local.has(edge.childComponentName)
				: input.importedModuleInterfaces?.[edge.importSource]?.render.components.some(
						(component) =>
							component.componentName === edge.childComponentName &&
							component.containerRepeat,
					);
		if (hasContainerRepeat)
			diagnostics.push(
				childRepeatWithoutElementDiagnostic({
					childComponentName: edge.childComponentName,
					span: edge.sourceSpan,
				}),
			);
	}
}
