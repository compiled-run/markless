import type {
	ModuleGraphInterfaceArtifact,
	ProtocolViewPayloadWithArmRecords,
	SemanticComponentEdge,
} from '../../artifacts.ts';

export type RowSlotReaderComponentsInput = {
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly protocolView: Pick<ProtocolViewPayloadWithArmRecords, 'keyedRepeats'>;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

/** Components whose tree rebuilds rows through a render-data reader, transitively through imports. */
export function rowSlotReaderComponents(input: RowSlotReaderComponentsInput): ReadonlySet<string> {
	const reading = new Set<string>();
	for (const repeat of input.protocolView.keyedRepeats ?? [])
		if (!repeat.rowComponent && repeat.rowTemplate?.componentName)
			reading.add(repeat.rowTemplate.componentName);
	const importedReads = (edge: SemanticComponentEdge): boolean =>
		input.importedModuleInterfaces?.[edge.importSource!]?.render.components.some(
			(component) =>
				component.componentName === edge.childComponentName &&
				component.rowSlotReader === true,
		) === true;
	for (let grew = true; grew;) {
		grew = false;
		for (const edge of input.componentEdges) {
			if (reading.has(edge.parentComponentName)) continue;
			if (
				edge.importSource !== undefined
					? importedReads(edge)
					: reading.has(edge.childComponentName)
			) {
				reading.add(edge.parentComponentName);
				grew = true;
			}
		}
	}
	return reading;
}

export function withRowSlotReaders(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: RowSlotReaderComponentsInput,
): ModuleGraphInterfaceArtifact {
	const reading = rowSlotReaderComponents(input);
	if (reading.size === 0) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) =>
				reading.has(component.componentName)
					? { ...component, rowSlotReader: true }
					: component,
			),
		},
	};
}

/** Whether any component a module imports carries a row slot reader in its tree. */
export function importedRowSlotReaders(
	importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined,
): boolean {
	return Object.values(importedModuleInterfaces ?? {}).some((moduleInterface) =>
		moduleInterface.render.components.some((component) => component.rowSlotReader === true),
	);
}
