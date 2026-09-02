import type { ProtocolViewPayload } from '@markless/serializer';
import { isEventAttribute, normalizeEventName } from 'yuku-tsrx';
import type {
	ModuleGraphInterfaceSpreadHost,
	PlannedSymbol,
	ProtocolViewPayloadInput,
	SemanticComponentEdge,
	SemanticComponentPropBinding,
	SemanticGraphArtifact,
	SymbolResolverInput,
} from '../artifacts.ts';

/**
 * Owned by the `protocol-view` pass; the `symbol-resolver` pass reads the same
 * join to plan one update symbol per forwarded attribute.
 *
 * A part that spreads its props onto an element carries whatever its consumer
 * passed and the part itself never claimed: an `onMouseEnter` the part declares
 * no handler for belongs on the element it spreads onto, a consumer `el`
 * handle fills alongside the part's own, and a `class` or `data-*` read off a
 * consumer cell is rewritten on that element when the cell moves. All are
 * ordinary view records, and this module is where they are written.
 *
 * Nothing about that is a render-time discovery. The consumer's call site is
 * compiled by the same build, so the props on a component edge are known here;
 * the child's spread sites arrive on its module-graph interface. Joining the
 * two produces records the runtime already knows how to read, qualified with
 * the same `c<n>:` host prefix the composition seam gives that edge — so
 * spread forwarding costs no shipped runtime code, and a part whose consumer
 * passed only static props emits nothing at all.
 */
export function forwardedSpreadViewRecords(input: ProtocolViewPayloadInput): {
	readonly locators: ProtocolViewPayload['locators'];
	readonly events: ProtocolViewPayload['events'];
	readonly domUpdates: ProtocolViewPayload['domUpdates'];
	readonly elementHandles: ProtocolViewPayload['elementHandles'];
} {
	const empty = { locators: [], events: [], domUpdates: [], elementHandles: [] };
	if (!input.semanticGraph) return empty;

	const locators: Array<ProtocolViewPayload['locators'][number]> = [];
	const events: Array<ProtocolViewPayload['events'][number]> = [];
	const domUpdates: Array<ProtocolViewPayload['domUpdates'][number]> = [];
	const elementHandles: Array<ProtocolViewPayload['elementHandles'][number]> = [];
	const callbackSymbolIds = new Map<string, string>();
	const domUpdateSymbolIds = new Map<string, string>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'callback-prop')
			callbackSymbolIds.set(`${symbol.componentEdgeId}:${symbol.propName}`, symbol.id);
		if (symbol.kind === 'dom-update')
			domUpdateSymbolIds.set(forwardedUpdateKey(symbol), symbol.id);
	}

	for (const { hostNodeId, edge, spread } of spreadHostsByEdge(input)) {
		const before = events.length + elementHandles.length + domUpdates.length;
		for (const prop of edge.props) {
			if (spread.destructuredNames.includes(prop.name)) continue;
			if (
				prop.kind === 'graph-reference' &&
				prop.graphBindingKind === 'element' &&
				prop.name === 'el'
			) {
				// A handle is additive: the part's own `el=` does not shadow it,
				// so `excludeNames` has no say here.
				elementHandles.push({
					hostNodeId,
					handleId: prop.graphNodeId,
					name: prop.source,
				});
				continue;
			}
			if (prop.kind === 'callback' && isEventAttribute(prop.name)) {
				// A handler is additive too. The part's own `onClick=` does not
				// shadow the consumer's: both run, the part's first, exactly as two
				// listeners on one element behave on the platform. `excludeNames`
				// still governs plain attributes, where the element's own wins.
				const symbolId = callbackSymbolIds.get(`${edge.id}:${prop.name}`);
				if (!symbolId) continue;
				events.push({
					hostNodeId,
					eventName: normalizeEventName(prop.name),
					symbolIds: [symbolId],
					// Without this the consumer's preventDefault waits for the lazy
					// callback symbol, which lands after the native default action:
					// a forwarded onSubmit navigates the page.
					...(prop.syncPolicy ? { syncPolicy: prop.syncPolicy } : {}),
				});
				continue;
			}
			const update = forwardedAttributeUpdate(hostNodeId, spread, prop);
			if (!update) continue;
			const symbolId = domUpdateSymbolIds.get(forwardedUpdateKey(update));
			domUpdates.push(symbolId ? { ...update, symbolId } : update);
		}
		// Composition keeps a parent record only for a host the parent's own
		// view locates; the child's locator for the same element is filtered
		// against its own render, so the parent states this one itself.
		if (events.length + elementHandles.length + domUpdates.length > before)
			locators.push({
				hostNodeId,
				strategy: 'dom-order',
				index: 0,
				tagName: '*',
			});
	}

	return { locators, events, domUpdates, elementHandles };
}

export type ForwardedSpreadInput = Pick<SymbolResolverInput, 'source'> & {
	readonly semanticGraph?: SemanticGraphArtifact;
};

export type ForwardedAttributeUpdate = Omit<
	ProtocolViewPayload['domUpdates'][number],
	'symbolId' | 'target'
> & {
	readonly target: NonNullable<ProtocolViewPayload['domUpdates'][number]['target']>;
};

/**
 * The attribute rewrites a consumer's props ask of a child's spread host, before
 * any symbol is planned for them. The symbol resolver plans one `dom-update`
 * per record; the view pass files the record with that symbol attached.
 */
export function forwardedSpreadAttributeUpdates(
	input: ForwardedSpreadInput,
): ReadonlyArray<ForwardedAttributeUpdate> {
	return spreadHostsByEdge(input).flatMap(({ hostNodeId, edge, spread }) =>
		edge.props.flatMap((prop) => {
			if (spread.destructuredNames.includes(prop.name)) return [];
			const update = forwardedAttributeUpdate(hostNodeId, spread, prop);
			return update ? [update] : [];
		}),
	);
}

/** The key a planned dom-update symbol and its view record share. */
export function forwardedUpdateKey(
	record: Pick<
		Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
		'hostNodeId' | 'source' | 'graphNodeId' | 'target'
	>,
): string {
	const name = 'name' in record.target ? record.target.name : '';
	return `${record.hostNodeId}:${record.target.kind}:${name}:${record.graphNodeId}:${record.source}`;
}

// Only a prop whose value the graph holds can be rewritten later: a literal is
// final at render, and an expression with no cell of its own (a `@for` row's
// read) is rendered by the row. The element's own attribute wins over a
// spread-carried one, except `class`, which the element composes behind its
// scope class rather than replacing.
function forwardedAttributeUpdate(
	hostNodeId: string,
	spread: ModuleGraphInterfaceSpreadHost,
	prop: SemanticComponentPropBinding,
): ForwardedAttributeUpdate | null {
	if (prop.kind !== 'graph-reference' || prop.graphBindingKind === 'element') return null;
	if (!isSpreadAttributeName(prop.name)) return null;
	const composesClass = prop.name === 'class' && spread.leadingClass !== undefined;
	if (spread.excludeNames.includes(prop.name) && !composesClass) return null;
	const target: ForwardedAttributeUpdate['target'] =
		prop.name === 'class'
			? { kind: 'class', ...(composesClass ? { leadingClass: spread.leadingClass } : {}) }
			: prop.name === 'style'
				? { kind: 'style' }
				: { kind: 'attribute', name: prop.name };
	return {
		hostNodeId,
		source: prop.source,
		graphNodeId: prop.graphNodeId,
		path: prop.path,
		target,
	};
}

// The names the spread renderer writes as attributes, and nothing it skips.
function isSpreadAttributeName(name: string): boolean {
	return (
		/^[A-Za-z_][\w.:-]*$/.test(name) &&
		!isEventAttribute(name) &&
		!name.startsWith('__markless') &&
		name !== 'attach' &&
		name !== 'el' &&
		name !== 'children'
	);
}

function spreadHostsByEdge(input: ForwardedSpreadInput): ReadonlyArray<{
	readonly hostNodeId: string;
	readonly edge: SemanticComponentEdge;
	readonly spread: ModuleGraphInterfaceSpreadHost;
}> {
	const semanticGraph = input.semanticGraph;
	if (!semanticGraph) return [];
	return semanticGraph.components.flatMap((component) => {
		// The edge order the composition seam numbers `c0:`, `c1:`, ... from.
		const edges = semanticGraph.componentEdges.filter(
			(edge) => edge.parentComponentName === component.name,
		);
		return edges.flatMap((edge, index) =>
			childSpreadHosts(input, edge).map((spread) => ({
				hostNodeId: `c${index}:${spread.hostNodeId}`,
				edge,
				spread,
			})),
		);
	});
}

function childSpreadHosts(
	input: ForwardedSpreadInput,
	edge: SemanticComponentEdge,
): ReadonlyArray<ModuleGraphInterfaceSpreadHost> {
	const moduleInterface = edge.importSource
		? input.source?.importedModuleInterfaces?.[edge.importSource]
		: input.semanticGraph?.moduleGraphInterface;
	return (
		moduleInterface?.render.components.find(
			(component) => component.componentName === edge.childComponentName,
		)?.spreadHosts ?? []
	);
}
