import { createProtocolStatePayload, protocolInstanceQualifies } from '@markless/serializer';
import type { ProtocolStatePayload } from '@markless/serializer';
import type { ProtocolStatePayloadInput, SemanticSharedReturnProperty } from '../artifacts.ts';
import { planSymbolResolver } from './symbol-resolver.ts';

type StateBindingWithInitializer =
	ProtocolStatePayloadInput['semanticGraph']['graphBindings'][number] & {
		readonly initialValueKnown?: boolean;
	};

export function createProtocolStatePayloadFromArena(
	input: ProtocolStatePayloadInput,
): ProtocolStatePayload {
	const deriveSymbolIds = syncDeriveSymbolIds(input);
	const computed = input.payloadArena.state.computed.map((computed) => ({
		graphNodeId: computed.graphNodeId,
		name: computed.name,
		async: computed.async,
		...(!computed.async && deriveSymbolIds.has(computed.graphNodeId)
			? { deriveSymbolId: deriveSymbolIds.get(computed.graphNodeId) }
			: {}),
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
		storage: input.payloadArena.state.storage,
	});

	const state: ProtocolStatePayload = {
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
	for (const node of [...state.cells, ...state.computed]) assertClassifiable(node.graphNodeId);
	return state;
}

// Composition qualifies a composed child's ids with its instance path by plain
// concatenation, so nothing at runtime asks which family an id belongs to. That
// is only sound while every id a module emits is classifiable, which is decided
// here, at the one place the served state payload is minted from the arena.
function assertClassifiable(graphNodeId: string): void {
	if (protocolInstanceQualifies(graphNodeId) !== undefined) return;
	throw Object.assign(
		new Error(
			`MARKLESS_COMPOSED_GRAPH_NODE_UNCLASSIFIED: the compiler cannot tell whether graph node "${graphNodeId}" belongs to a composed component instance or to the page, so it refuses to emit it into the state payload.`,
		),
		{ code: 'MARKLESS_COMPOSED_GRAPH_NODE_UNCLASSIFIED', graphNodeId },
	);
}

function syncDeriveSymbolIds(input: ProtocolStatePayloadInput): ReadonlyMap<string, string> {
	const symbolResolver =
		input.symbolResolver ??
		planSymbolResolver({
			semanticGraph: input.semanticGraph,
			payloadArena: input.payloadArena,
		});

	return new Map(
		symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'sync-computed-derive'
				? [[symbol.graphNodeId, symbol.id] as const]
				: [],
		),
	);
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
