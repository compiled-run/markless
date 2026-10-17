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

type RowMintFlag = 'rowSlotReader' | 'rowComponentMint';

/** Components whose tree rebuilds rows through a render-data reader, transitively through imports. */
export function rowSlotReaderComponents(input: RowSlotReaderComponentsInput): ReadonlySet<string> {
	const reading = new Set<string>();
	for (const repeat of input.protocolView.keyedRepeats ?? [])
		if (!repeat.rowComponent && repeat.rowTemplate?.componentName)
			reading.add(repeat.rowTemplate.componentName);
	return withComposingComponents(reading, input, 'rowSlotReader');
}

/** Components whose tree builds rows that render a component, transitively through imports. */
export function rowComponentMintComponents(
	input: RowSlotReaderComponentsInput,
): ReadonlySet<string> {
	const minting = new Set<string>();
	for (const repeat of input.protocolView.keyedRepeats ?? []) {
		if (!repeat.rowComponent) continue;
		const placing = input.componentEdges.find(
			(edge) => edge.id === repeat.rowComponent?.componentEdgeId,
		);
		// A record naming no edge is still this module's, so every component composing a child may own it.
		for (const edge of placing ? [placing] : input.componentEdges)
			minting.add(edge.parentComponentName);
	}
	return withComposingComponents(minting, input, 'rowComponentMint');
}

function withComposingComponents(
	reading: Set<string>,
	input: RowSlotReaderComponentsInput,
	flag: RowMintFlag,
): ReadonlySet<string> {
	const importedReads = (edge: SemanticComponentEdge): boolean =>
		input.importedModuleInterfaces?.[edge.importSource!]?.render.components.some(
			(component) =>
				component.componentName === edge.childComponentName && component[flag] === true,
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
	const minting = rowComponentMintComponents(input);
	if (reading.size === 0 && minting.size === 0) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) => ({
				...component,
				...(reading.has(component.componentName) ? { rowSlotReader: true as const } : {}),
				...(minting.has(component.componentName) ? { rowComponentMint: true as const } : {}),
			})),
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

/** Whether any component a module imports builds rows that render a component, in its tree. */
export function importedRowComponentMints(
	importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined,
): boolean {
	return Object.values(importedModuleInterfaces ?? {}).some((moduleInterface) =>
		moduleInterface.render.components.some((component) => component.rowComponentMint === true),
	);
}
