import type { ProtocolStatePayload } from '@markless/serializer';
import type { ModuleGraphInterfaceArtifact, SemanticComponentEdge } from '../../artifacts.ts';

// The compiler's spelling of an element() binding's graph node id.
const ELEMENT_BINDING_SEGMENT = '/element:';

export type RosterDerivationsInput = {
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly protocolState: Pick<ProtocolStatePayload, 'computed'>;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

/** Components whose tree holds a computed reading an element() roster, transitively through imports. */
export function rosterDerivationComponents(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: RosterDerivationsInput,
): ReadonlySet<string> {
	const derives = (input.protocolState.computed ?? []).some((computed) =>
		computed.dependencies?.some((dependency) =>
			dependency.graphNodeId.includes(ELEMENT_BINDING_SEGMENT),
		),
	);
	const deriving = new Set<string>(
		derives
			? moduleGraphInterface.render.components.map((component) => component.componentName)
			: [],
	);
	const importedDerives = (edge: SemanticComponentEdge): boolean =>
		input.importedModuleInterfaces?.[edge.importSource!]?.render.components.some(
			(component) =>
				component.componentName === (edge.importedName ?? edge.childComponentName) &&
				component.rosterDerivation === true,
		) === true;
	for (let grew = true; grew;) {
		grew = false;
		for (const edge of input.componentEdges) {
			if (deriving.has(edge.parentComponentName)) continue;
			if (
				edge.importSource !== undefined
					? importedDerives(edge)
					: deriving.has(edge.childComponentName)
			) {
				deriving.add(edge.parentComponentName);
				grew = true;
			}
		}
	}
	return deriving;
}

export function withRosterDerivations(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: RosterDerivationsInput,
): ModuleGraphInterfaceArtifact {
	const deriving = rosterDerivationComponents(moduleGraphInterface, input);
	if (deriving.size === 0) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) =>
				deriving.has(component.componentName)
					? { ...component, rosterDerivation: true }
					: component,
			),
		},
	};
}
