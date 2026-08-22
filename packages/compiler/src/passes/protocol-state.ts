import { createProtocolStatePayload, protocolInstanceQualifies } from '@markless/serializer';
import type { ProtocolStatePayload } from '@markless/serializer';
import type { ProtocolStatePayloadInput, SemanticSharedReturnProperty } from '../artifacts.ts';
import { sharedCallbackSlotGraphNodeId } from './semantic-graph/collect-shared.ts';
import { componentPropReads } from './symbol-modules.ts';
import { planSymbolResolver } from './symbol-resolver.ts';

type StateBindingWithInitializer =
	ProtocolStatePayloadInput['semanticGraph']['graphBindings'][number] & {
		readonly initialValueKnown?: boolean;
	};

export function createProtocolStatePayloadFromArena(
	input: ProtocolStatePayloadInput,
): ProtocolStatePayload {
	const symbolResolver =
		input.symbolResolver ??
		planSymbolResolver({
			semanticGraph: input.semanticGraph,
			payloadArena: input.payloadArena,
		});
	const deriveSymbolIds = syncDeriveSymbolIds(symbolResolver);
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
	const callbackSlots = callbackSlotNodes(input);
	const sharedDefinitions = input.payloadArena.state.sharedDefinitions.map((definition) => ({
		id: definition.id,
		name: definition.name,
		exportedName: definition.exportedName,
		...(definition.scope ? { scope: definition.scope } : {}),
		version: 0,
		graphNodeIds: [
			...definition.graphNodeIds,
			...callbackSlots.flatMap((slot) =>
				slot.definitionId === definition.id ? [slot.graphNodeId] : [],
			),
		],
		...(definition.dependencies && definition.dependencies.length > 0
			? {
					dependencies: definition.dependencies.map((dependency) => ({
						definitionId: dependency.definitionId,
						definitionName: dependency.definitionName,
					})),
				}
			: {}),
		...(payloadReturnProperties(definition.returnProperties).length > 0
			? {
					returnProperties: payloadReturnProperties(definition.returnProperties).map(
						protocolReturnProperty,
					),
				}
			: {}),
	}));
	const payload = createProtocolStatePayload({
		cells: [],
		computed,
		sharedSeeds: sharedSeedFollows(input, symbolResolver),
		sharedDefinitions,
		storage: input.payloadArena.state.storage,
	});
	// The slot's cell holds the answering symbol id, written by the widget root's
	// own seed; it has no factory initial, so it starts unvalued like any cell
	// whose initial the compiler could not read.
	const slotCells = callbackSlots.map((slot) => ({
		graphNodeId: slot.graphNodeId,
		name: slot.slotName,
		valueKind: 'unknown' as const,
	}));

	// Two components of one module may each declare a state() of the same name,
	// so one id can spell two cells. Consume the bindings for an id in order:
	// the Nth cell takes the Nth binding's initial value.
	const pendingBindings = new Map<string, StateBindingWithInitializer[]>();
	for (const candidate of input.semanticGraph.graphBindings) {
		const queue = pendingBindings.get(candidate.id);
		if (queue) queue.push(candidate as StateBindingWithInitializer);
		else pendingBindings.set(candidate.id, [candidate as StateBindingWithInitializer]);
	}
	const state: ProtocolStatePayload = {
		...payload,
		cells: [...input.payloadArena.state.cells, ...slotCells].map((cell) => {
			const queue = pendingBindings.get(cell.graphNodeId);
			const binding =
				queue && queue.length > 1 ? queue.shift() : queue?.[0];
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

function syncDeriveSymbolIds(
	symbolResolver: NonNullable<ProtocolStatePayloadInput['symbolResolver']>,
): ReadonlyMap<string, string> {
	return new Map(
		symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'sync-computed-derive'
				? [[symbol.graphNodeId, symbol.id] as const]
				: [],
		),
	);
}

/**
 * The shared nodes this module seeds from a component's own props, each with the
 * prop reads its seed expression makes.
 *
 * A composed family renders its instance from the props its edge was given, and
 * an enclosing family's write moves one of those props. The record says which
 * reads the node follows, so browser resume can re-run the seed's own symbol when
 * one of them moves; the node still holds its own value, so a part's write to it
 * stands until the next prop change overwrites it. A seed reading no prop (a
 * constant, or a value only this component can move) declares nothing.
 */
function sharedSeedFollows(
	input: ProtocolStatePayloadInput,
	symbolResolver: NonNullable<ProtocolStatePayloadInput['symbolResolver']>,
): NonNullable<ProtocolStatePayload['sharedSeeds']> {
	return symbolResolver.symbols.flatMap((symbol) => {
		// A callback slot's seed is answered by the composing edge itself, not by a
		// prop the enclosing family can write, so it follows nothing.
		if (
			symbol.kind !== 'shared-seed' ||
			symbol.callbackSlotPropName !== undefined ||
			!symbol.componentName
		)
			return [];
		const dependencies = componentPropReads(
			symbol.componentName,
			symbol.source,
			input.semanticGraph,
			input.semanticGraph.filename,
		).map((read) => ({
			graphNodeId: read.graphNodeId,
			path: read.path,
			reads: { graphNodeId: read.graphNodeId, path: read.path },
		}));
		if (dependencies.length === 0) return [];
		return [
			{ graphNodeId: symbol.graphNodeId, deriveSymbolId: symbol.id, dependencies },
		];
	});
}

/**
 * The callback slots a widget root of this module answers, as graph nodes of the
 * definition that declares them. A slot is a node so the part's dispatch can
 * reach the consumer's handler through the same instance-qualified graph its
 * other reads resolve by; a module whose components fill no slot declares none.
 */
function callbackSlotNodes(
	input: ProtocolStatePayloadInput,
): ReadonlyArray<{
	readonly definitionId: string;
	readonly slotName: string;
	readonly graphNodeId: string;
}> {
	const seen = new Set<string>();
	return (input.semanticGraph.sharedCallbackBindings ?? []).flatMap((binding) => {
		const graphNodeId = sharedCallbackSlotGraphNodeId(binding.definitionId, binding.slotName);
		if (seen.has(graphNodeId)) return [];
		seen.add(graphNodeId);
		return [{ definitionId: binding.definitionId, slotName: binding.slotName, graphNodeId }];
	});
}

// The slot's own return property is a compile-time route with no value, so it
// never reaches the payload: the node above carries everything runtime needs.
function payloadReturnProperties(
	properties: ReadonlyArray<SemanticSharedReturnProperty> | undefined,
): ReadonlyArray<Exclude<SemanticSharedReturnProperty, { readonly kind: 'callback-slot' }>> {
	return (properties ?? []).flatMap((property) =>
		property.kind === 'callback-slot' ? [] : [property],
	);
}

function protocolReturnProperty(
	property: Exclude<SemanticSharedReturnProperty, { readonly kind: 'callback-slot' }>,
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
