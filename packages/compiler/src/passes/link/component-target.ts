import type {
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceLinkedComponent,
	SemanticComponentEdge,
} from '../../artifacts.ts';
import { memberTagPropertyPath, memberTagRootName } from '../../ast/tsrx.ts';

type ComponentImport = Pick<SemanticComponentEdge, 'importKind' | 'importedName'>;

export function componentExportPath(localTarget: string, imported: ComponentImport): string[] {
	return [
		...(imported.importKind === 'namespace'
			? []
			: imported.importKind === 'default'
				? ['default']
				: [imported.importedName ?? memberTagRootName(localTarget)]),
		...memberTagPropertyPath(localTarget),
	];
}

export function linkedComponentTarget(
	localTarget: string,
	imported: ComponentImport,
	moduleInterface: ModuleGraphInterfaceArtifact | undefined,
): ModuleGraphInterfaceLinkedComponent | undefined {
	const exportPath = componentExportPath(localTarget, imported);
	return moduleInterface?.linkedComponents?.find(
		(candidate) =>
			candidate.exportPath.length === exportPath.length &&
			candidate.exportPath.every((part, index) => part === exportPath[index]),
	);
}

/** The imported module's component an edge renders, found through the edge's import binding rather than its local tag name. */
export function importedEdgeComponent(
	edge: Pick<SemanticComponentEdge, 'childComponentName' | 'importKind' | 'importedName'>,
	moduleInterface: ModuleGraphInterfaceArtifact | undefined,
): ModuleGraphInterfaceArtifact['render']['components'][number] | undefined {
	const exportPath = componentExportPath(edge.childComponentName, edge);
	// A linked namespace edge already names the component it resolved to.
	return moduleInterface?.render.components.find((component) =>
		exportPath.length === 1
			? component.exportName === exportPath[0]
			: component.componentName === edge.childComponentName,
	);
}
