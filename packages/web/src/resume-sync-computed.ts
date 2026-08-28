import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeRuntimeInput,
} from './resume-types.ts';

// The node to write and the symbol that derives it: all a refresh needs, and the
// shape both a sync computed and a shared seed's follow record have. A seed also
// says which read each of its routes answers, because its symbol reads the props
// its component was rendered with and the live value moved to the parent's node.
type ResumeSyncComputedRecord = {
	readonly graphNodeId: string;
	readonly deriveSymbolId: string;
	readonly dependencies?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
		readonly reads?: {
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		};
	}>;
};

// An element() binding's graph node id, restating the compiler's spelling.
const ELEMENT_BINDING_SEGMENT = '/element:';
const ROW_SEGMENT = /r:[^:]*:/g;

export async function refreshSyncComputed(input: {
	readonly computed: ResumeSyncComputedRecord;
	readonly graph: RuntimeGraph;
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ElementHandleRegistry;
}): Promise<void> {
	const graph = seedSourceGraph(input.graph, input.computed);
	const result = (await input.loadSymbol(input.computed.deriveSymbolId))({
		graph,
		read: graph.read,
		element: input.root,
		getElementHandle: input.elementHandles.get,
		rosterPosition: await rosterPositionReader(input),
	});
	input.graph.write({
		graphNodeId: input.computed.graphNodeId,
		value: await result,
	});
}

/**
 * Where this part stands in its family's roster, now that there is a DOM: the
 * roster answers its live members in document order and the part's own bound
 * element is one of them.
 *
 * Loaded only for a derivation that depends on an element() binding, because
 * scoping the roster to THIS rendered widget is what keeps a second collection
 * on the page from answering, and that scoping is not on the lean path.
 */
async function rosterPositionReader(input: {
	readonly computed: ResumeSyncComputedRecord;
	readonly graph: RuntimeGraph;
	readonly elementHandles: ElementHandleRegistry;
}): Promise<((rosterGraphNodeId: string, handleGraphNodeId: string) => number) | undefined> {
	if (
		!input.computed.dependencies?.some((dependency) =>
			dependency.graphNodeId.includes(ELEMENT_BINDING_SEGMENT),
		)
	)
		return undefined;
	const scope = await import('./fns/instance-scope.ts');
	const instancePath = scope.marklessInstancePath(input.computed.graphNodeId);
	const rosterOf = scope.marklessInstanceScopedElementHandle(
		input.elementHandles.get,
		instancePath,
		input.graph,
	);
	// The member handle's own id names no instance, so the rows this derivation
	// stands in are what separate its element from every sibling part's.
	const rows = instancePath.match(ROW_SEGMENT)?.join('') ?? '';
	return (rosterGraphNodeId, handleGraphNodeId) => {
		const roster = rosterOf?.(rosterGraphNodeId);
		const member =
			oneElement(input.elementHandles.get, rows + handleGraphNodeId) ??
			oneElement(input.elementHandles.get, handleGraphNodeId);
		return Array.isArray(roster) && member ? roster.indexOf(member) : -1;
	};
}

// A key naming more than one rendered part answers no part, and the caller has
// another key to try; the registry says so by refusing rather than by answering.
function oneElement(get: ElementHandleRegistry['get'], key: string): unknown {
	try {
		const value = get(key);
		return Array.isArray(value) ? undefined : value;
	} catch {
		return undefined;
	}
}

// A shared seed re-runs its own authored expression, so its prop reads have to
// reach the value the enclosing instance now holds rather than the props its
// component was rendered with once. The symbol runs instance-scoped, so the ids
// reaching here are already qualified and the record's read matches exactly.
function seedSourceGraph(graph: RuntimeGraph, record: ResumeSyncComputedRecord): RuntimeGraph {
	const routes = record.dependencies;
	if (!routes?.some((route) => route.reads)) return graph;
	const read: RuntimeGraph['read'] = (graphNodeId, path = []) => {
		const route = routes.find(
			(candidate) =>
				candidate.reads?.graphNodeId === graphNodeId &&
				candidate.reads.path.join(' ') === path.join(' '),
		);
		return route ? graph.read(route.graphNodeId, route.path) : graph.read(graphNodeId, path);
	};
	return { ...graph, read };
}
