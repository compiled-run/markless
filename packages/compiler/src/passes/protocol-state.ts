import { createProtocolStatePayload } from '@markless/serializer';
import type { ProtocolStatePayload } from '@markless/serializer';
import type { ProtocolStatePayloadInput, SemanticSharedReturnProperty } from '../artifacts.ts';

type StateBindingWithInitializer = ProtocolStatePayloadInput['semanticGraph']['graphBindings'][number] & {
	readonly initialValueKnown?: boolean;
};

export function createProtocolStatePayloadFromArena(
	input: ProtocolStatePayloadInput,
): ProtocolStatePayload {
	const computed = input.payloadArena.state.computed.map((computed) => ({
		graphNodeId: computed.graphNodeId,
		name: computed.name,
		async: computed.async,
		...(computed.dependencies && computed.dependencies.length > 0
			? {
					dependencies: computed.dependencies.map((dependency) => ({
						graphNodeId: dependency.graphNodeId,
						path: dependency.path,
					})),
				}
			: {}),
	}));
	const sharedDefinitions = input.payloadArena.state.sharedDefinitions.map((definition) => ({
		id: definition.id,
		name: definition.name,
		exportedName: definition.exportedName,
		...(definition.scope ? { scope: definition.scope } : {}),
		version: 0,
		graphNodeIds: definition.graphNodeIds,
		...(definition.dependencies && definition.dependencies.length > 0
			? {
					dependencies: definition.dependencies.map((dependency) => ({
						definitionId: dependency.definitionId,
						definitionName: dependency.definitionName,
					})),
				}
			: {}),
		...(definition.returnProperties && definition.returnProperties.length > 0
			? {
					returnProperties: definition.returnProperties.map(protocolReturnProperty),
				}
			: {}),
	}));
	const payload = createProtocolStatePayload({
		cells: [],
		computed,
		sharedDefinitions,
	});

	return {
		...payload,
		cells: input.payloadArena.state.cells.map((cell) => {
			const binding = input.semanticGraph.graphBindings.find(
				(candidate) => candidate.id === cell.graphNodeId,
			) as StateBindingWithInitializer | undefined;
			const valueKind = cell.valueKind ?? 'unknown';
			if (!binding?.initialValueKnown) {
				return {
					graphNodeId: cell.graphNodeId,
					name: cell.name,
					valueKind,
				};
			}

			return createProtocolStatePayload({
				cells: [{ ...cell, valueKind, value: binding.initialValue }],
				computed: [],
			}).cells[0]!;
		}),
	};
}

function protocolReturnProperty(
	property: SemanticSharedReturnProperty,
): NonNullable<
	NonNullable<ProtocolStatePayload['sharedDefinitions']>[number]['returnProperties']
>[number] {
	if (property.kind === 'method') {
		return {
			kind: property.kind,
			name: property.name,
		};
	}

	return {
		kind: property.kind,
		name: property.name,
		graphNodeId: property.graphNodeId,
		path: property.path,
	};
}
