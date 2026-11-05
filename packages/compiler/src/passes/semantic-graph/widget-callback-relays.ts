import type {
	LoweredStateRead,
	ModuleGraphInterfaceArtifact,
	SemanticComponentEdge,
	SemanticComponentPropBinding,
	SemanticComponentPropDeclaration,
	SemanticSharedCallbackBinding,
} from '../../artifacts.ts';

/** The props a component files into a widget callback slot, published so a composing module can see them. */
export function callbackSlotPropsField(
	bindings: ReadonlyArray<SemanticSharedCallbackBinding>,
	componentName: string,
): { readonly callbackSlotProps?: ReadonlyArray<string> } {
	const names = [
		...new Set(
			bindings
				.filter((binding) => binding.componentName === componentName)
				.map((binding) => binding.propName),
		),
	];
	return names.length > 0 ? { callbackSlotProps: names } : {};
}

// A callback a component only received has no symbol of its own for a widget slot to name, so handing it to a root goes through `(value) => onChange?.(value)`.
export function relayWidgetCallbackProps(input: {
	readonly componentEdges: SemanticComponentEdge[];
	readonly componentPropBindings: ReadonlyArray<SemanticComponentPropDeclaration>;
	readonly sharedCallbackBindings: ReadonlyArray<SemanticSharedCallbackBinding>;
	readonly importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): void {
	input.componentEdges.forEach((edge, index) => {
		const slotProps = childCallbackSlotProps(edge, input);
		if (slotProps.length === 0) return;
		const props = edge.props.map((prop) =>
			slotProps.includes(prop.name) && receivedPropRead(prop)
				? relayCallback(prop.name, prop.source, prop.sourceSpan)
				: prop,
		);
		for (const name of slotProps) {
			if (props.some((prop) => prop.name === name)) continue;
			const spread = props.findLast(
				(prop) => prop.kind === 'spread' && !prop.excludeNames.includes(name),
			);
			if (spread?.kind !== 'spread') continue;
			const bindingId = input.componentPropBindings.find(
				(binding) =>
					binding.componentName === edge.parentComponentName &&
					binding.localName === spread.source,
			)?.bindingId;
			const read: LoweredStateRead = {
				source: `${spread.source}.${name}`,
				...(spread.sourceSpan ? { sourceSpan: spread.sourceSpan } : {}),
				...(bindingId ? { bindingId } : {}),
				componentName: edge.parentComponentName,
				graphNodeId: spread.graphNodeId,
				path: [...spread.path, name],
			};
			props.push(relayCallback(name, read.source, spread.sourceSpan, read));
		}
		input.componentEdges[index] = { ...edge, props };
	});
}

function childCallbackSlotProps(
	edge: SemanticComponentEdge,
	input: Parameters<typeof relayWidgetCallbackProps>[0],
): ReadonlyArray<string> {
	if (!edge.importSource)
		return input.sharedCallbackBindings
			.filter((binding) => binding.componentName === edge.childComponentName)
			.map((binding) => binding.propName);
	return (
		input.importedModuleInterfaces[edge.importSource]?.render.components.find(
			(component) => component.componentName === edge.childComponentName,
		)?.callbackSlotProps ?? []
	);
}

function receivedPropRead(prop: SemanticComponentPropBinding): boolean {
	return prop.kind === 'graph-reference' && prop.graphBindingKind === 'prop';
}

function relayCallback(
	name: string,
	received: string,
	sourceSpan: SemanticComponentPropBinding['sourceSpan'],
	relayedRead?: LoweredStateRead,
): SemanticComponentPropBinding {
	const parameter = /^value\b/.test(received) ? 'next' : 'value';
	return {
		name,
		source: `(${parameter}) => ${received}?.(${parameter})`,
		kind: 'callback',
		parameters: [parameter],
		...(sourceSpan ? { sourceSpan } : {}),
		...(relayedRead ? { relayedRead } : {}),
	};
}
