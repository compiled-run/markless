import type {
	ModuleGraphInterfaceArtifact,
	SemanticComponentEdge,
	SemanticMarkupArtifact,
} from '../../artifacts.ts';

export type PropertyMembersInput = {
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly chunks: SemanticMarkupArtifact['chunks'];
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

function importedPropertyMembers(
	input: PropertyMembersInput,
	edge: SemanticComponentEdge,
): boolean {
	return (
		input.importedModuleInterfaces?.[edge.importSource!]?.render.components.some(
			(component) =>
				component.componentName === (edge.importedName ?? edge.childComponentName) &&
				component.propertyMembers === true,
		) === true
	);
}

/** Components whose markup, or a composed child's, renders a member with no live attribute. */
export function withPropertyMembers(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: PropertyMembersInput,
): ModuleGraphInterfaceArtifact {
	const reaching = new Set(
		input.chunks.flatMap((chunk) => (chunk.propertyMembers ? [chunk.componentName] : [])),
	);
	for (let grew = true; grew;) {
		grew = false;
		for (const edge of input.componentEdges) {
			if (reaching.has(edge.parentComponentName)) continue;
			if (
				edge.importSource !== undefined
					? importedPropertyMembers(input, edge)
					: reaching.has(edge.childComponentName)
			) {
				reaching.add(edge.parentComponentName);
				grew = true;
			}
		}
	}
	if (reaching.size === 0) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) =>
				reaching.has(component.componentName)
					? { ...component, propertyMembers: true }
					: component,
			),
		},
	};
}
