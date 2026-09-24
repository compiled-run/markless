import type { ModuleGraphInterfaceArtifact, SemanticComponentEdge } from '../../artifacts.ts';

export type ClosureActionOwnersInput = {
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	// Whether this module compiled a closure plan for any of its own actions.
	readonly planned: boolean;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

/** Components whose tree holds a compiled closure action, transitively through imports. */
export function closureActionOwnerComponents(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: ClosureActionOwnersInput,
): ReadonlySet<string> {
	const owning = new Set<string>(
		input.planned
			? moduleGraphInterface.render.components.map((component) => component.componentName)
			: [],
	);
	for (let grew = true; grew;) {
		grew = false;
		for (const edge of input.componentEdges) {
			if (owning.has(edge.parentComponentName)) continue;
			if (
				edge.importSource !== undefined
					? importedClosureActions(input.importedModuleInterfaces?.[edge.importSource])
					: owning.has(edge.childComponentName)
			) {
				owning.add(edge.parentComponentName);
				grew = true;
			}
		}
	}
	return owning;
}

export function withClosureActionOwners(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: ClosureActionOwnersInput,
): ModuleGraphInterfaceArtifact {
	const owning = closureActionOwnerComponents(moduleGraphInterface, input);
	if (owning.size === 0) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) =>
				owning.has(component.componentName)
					? { ...component, closureActions: true }
					: component,
			),
		},
	};
}

function importedClosureActions(
	moduleInterface: ModuleGraphInterfaceArtifact | undefined,
): boolean {
	return (
		moduleInterface?.render.components.some(
			(component) => component.closureActions === true,
		) === true
	);
}
