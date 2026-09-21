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
