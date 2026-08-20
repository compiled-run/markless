import type { ProtocolViewPayload } from '@markless/serializer';
import { isEventAttribute, normalizeEventName } from '../yuku-tsrx-adapter.ts';
import type {
	ModuleGraphInterfaceSpreadHost,
	ProtocolViewPayloadInput,
	SemanticComponentEdge,
} from '../artifacts.ts';

/**
 * Owned by the `protocol-view` pass.
 *
 * A part that spreads its props onto an element carries whatever its consumer
 * passed and the part itself never claimed: an `onMouseEnter` the part declares
 * no handler for belongs on the element it spreads onto, and a consumer `el`
 * handle fills alongside the part's own. Both are ordinary view records, and
 * this module is where they are written.
 *
 * Nothing about that is a render-time discovery. The consumer's call site is
 * compiled by the same build, so the props on a component edge are known here;
 * the child's spread sites arrive on its module-graph interface. Joining the
 * two produces records the runtime already knows how to read, qualified with
 * the same `c<n>:` host prefix the composition seam gives that edge — so
 * spread forwarding costs no shipped runtime code, and a part whose consumer
 * passed no function props emits nothing at all.
 */
export function forwardedSpreadViewRecords(input: ProtocolViewPayloadInput): {
	readonly locators: ProtocolViewPayload['locators'];
	readonly events: ProtocolViewPayload['events'];
	readonly elementHandles: ProtocolViewPayload['elementHandles'];
} {
	const empty = { locators: [], events: [], elementHandles: [] };
	const semanticGraph = input.semanticGraph;
	if (!semanticGraph) return empty;

	const locators: Array<ProtocolViewPayload['locators'][number]> = [];
	const events: Array<ProtocolViewPayload['events'][number]> = [];
	const elementHandles: Array<ProtocolViewPayload['elementHandles'][number]> = [];
	const callbackSymbolIds = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'callback-prop'
				? [[`${symbol.componentEdgeId}:${symbol.propName}`, symbol.id] as const]
				: [],
		),
	);

	for (const component of semanticGraph.components) {
		// The edge order the composition seam numbers `c0:`, `c1:`, ... from.
		const edges = semanticGraph.componentEdges.filter(
			(edge) => edge.parentComponentName === component.name,
		);
		for (const [index, edge] of edges.entries()) {
			const hostPrefix = `c${index}:`;
			for (const spread of childSpreadHosts(input, edge)) {
				const hostNodeId = hostPrefix + spread.hostNodeId;
				const before = events.length + elementHandles.length;
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
					if (prop.kind !== 'callback' || !isEventAttribute(prop.name)) continue;
					// The part's own handler owns the event it writes; the shadow guard
					// (MARKLESS_EVENT_SPREAD_SHADOWED) is what makes that a build error.
					if (spread.excludeNames.includes(prop.name)) continue;
					const symbolId = callbackSymbolIds.get(`${edge.id}:${prop.name}`);
					if (!symbolId) continue;
					events.push({
						hostNodeId,
						eventName: normalizeEventName(prop.name),
						symbolIds: [symbolId],
					});
				}
				// Composition keeps a parent record only for a host the parent's own
				// view locates; the child's locator for the same element is filtered
				// against its own render, so the parent states this one itself.
				if (events.length + elementHandles.length > before)
					locators.push({
						hostNodeId,
						strategy: 'dom-order',
						index: 0,
						tagName: '*',
					});
			}
		}
	}

	return { locators, events, elementHandles };
}

function childSpreadHosts(
	input: ProtocolViewPayloadInput,
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
