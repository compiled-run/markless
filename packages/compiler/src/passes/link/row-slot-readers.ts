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

type RowMintFlag =
	| 'rowSlotReader'
	| 'rowComponentMint'
	| 'rowTemplateMint'
	| 'nestedRepeats'
	| 'rowBranchMint';

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

/** Components whose tree builds plain template rows, transitively through imports. */
export function rowTemplateMintComponents(
	input: RowSlotReaderComponentsInput,
	componentNames: ReadonlyArray<string>,
	flag: 'rowTemplateMint' | 'nestedRepeats' | 'rowBranchMint' = 'rowTemplateMint',
): ReadonlySet<string> {
	// A plain row record names no component, so every component of its module may own it.
	const owns = (input.protocolView.keyedRepeats ?? []).some((repeat) =>
		flag === 'nestedRepeats'
			? repeat.enclosingRow !== undefined
			: flag === 'rowBranchMint'
				? repeat.rowTemplate?.branchSlots !== undefined
				: (repeat.rowTemplate ?? repeat.emptyArm) !== undefined,
	);
	return withComposingComponents(new Set(owns ? componentNames : []), input, flag);
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
	const componentNames = moduleGraphInterface.render.components.map(
		(component) => component.componentName,
	);
	const templating = rowTemplateMintComponents(input, componentNames);
	const nesting = rowTemplateMintComponents(input, componentNames, 'nestedRepeats');
	const flipping = rowTemplateMintComponents(input, componentNames, 'rowBranchMint');
	if (
		reading.size === 0 &&
		minting.size === 0 &&
		templating.size === 0 &&
		nesting.size === 0 &&
		flipping.size === 0
	)
		return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) => ({
				...component,
				...(reading.has(component.componentName) ? { rowSlotReader: true as const } : {}),
				...(minting.has(component.componentName)
					? { rowComponentMint: true as const }
					: {}),
				...(templating.has(component.componentName)
					? { rowTemplateMint: true as const }
					: {}),
				...(nesting.has(component.componentName) ? { nestedRepeats: true as const } : {}),
				...(flipping.has(component.componentName) ? { rowBranchMint: true as const } : {}),
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

/** Whether any component a module imports builds plain template rows, in its tree. */
export function importedRowTemplateMints(
	importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined,
): boolean {
	return Object.values(importedModuleInterfaces ?? {}).some((moduleInterface) =>
		moduleInterface.render.components.some((component) => component.rowTemplateMint === true),
	);
}

/** Whether any component a module imports holds a repeat inside another repeat's rows, in its tree. */
export function importedNestedRepeats(
	importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined,
): boolean {
	return Object.values(importedModuleInterfaces ?? {}).some((moduleInterface) =>
		moduleInterface.render.components.some((component) => component.nestedRepeats === true),
	);
}

/** Whether any component a module imports holds rows that flip an @if of their own, in its tree. */
export function importedRowBranchMints(
	importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined,
): boolean {
	return Object.values(importedModuleInterfaces ?? {}).some((moduleInterface) =>
		moduleInterface.render.components.some((component) => component.rowBranchMint === true),
	);
}
