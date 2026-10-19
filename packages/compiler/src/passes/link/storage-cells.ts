import type { ProtocolStatePayload } from '@markless/serializer';
import type { ModuleGraphInterfaceArtifact, SemanticComponentEdge } from '../../artifacts.ts';

export type StorageCellsInput = {
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly protocolState: Pick<ProtocolStatePayload, 'storage'>;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

function importedStorageCells(input: StorageCellsInput, edge: SemanticComponentEdge): boolean {
	return (
		input.importedModuleInterfaces?.[edge.importSource!]?.render.components.some(
			(component) =>
				component.componentName === (edge.importedName ?? edge.childComponentName) &&
				component.storageCells === true,
		) === true
	);
}

/** Whether a page of this module can serve storage() cells, its own or a composed child's. */
export function moduleReachesStorageCells(input: StorageCellsInput): boolean {
	return (
		(input.protocolState.storage?.length ?? 0) > 0 ||
		input.componentEdges.some(
			(edge) => edge.importSource !== undefined && importedStorageCells(input, edge),
		)
	);
}

/** Components whose tree serves storage() cells, transitively through imports. */
function storageCellComponents(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: StorageCellsInput,
): ReadonlySet<string> {
	const reaching = new Set<string>(
		(input.protocolState.storage?.length ?? 0) > 0
			? moduleGraphInterface.render.components.map((component) => component.componentName)
			: [],
	);
	for (let grew = true; grew;) {
		grew = false;
		for (const edge of input.componentEdges) {
			if (reaching.has(edge.parentComponentName)) continue;
			if (
				edge.importSource !== undefined
					? importedStorageCells(input, edge)
					: reaching.has(edge.childComponentName)
			) {
				reaching.add(edge.parentComponentName);
				grew = true;
			}
		}
	}
	return reaching;
}

export function withStorageCells(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: StorageCellsInput,
): ModuleGraphInterfaceArtifact {
	const reaching = storageCellComponents(moduleGraphInterface, input);
	if (reaching.size === 0) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) =>
				reaching.has(component.componentName)
					? { ...component, storageCells: true }
					: component,
			),
		},
	};
}
