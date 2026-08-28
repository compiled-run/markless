import type { RuntimeGraph } from '@markless/runtime';
import type { ElementHandleRegistry } from '../resume-types.ts';
import {
	MARKLESS_ROSTER_COUNT_CLOSE,
	MARKLESS_ROSTER_COUNT_OPEN,
} from '../prerender/shared-seed-slot.ts';
import { marklessInstancePath, marklessInstanceScopedElementHandle } from './instance-scope.ts';

/**
 * The roster half that only a resumed page runs, in one module nothing eagerly
 * loaded names. The `import()` specifier is written by the app's own resume
 * module, not here, so a page whose payload carries no computed nodes - and so
 * can hold no roster derivation - never emits this chunk. Both call sites read
 * the loader off `__marklessRosterResume`; an absent loader is a page with
 * nothing to derive.
 *
 * Reaching `instance-scope.ts` statically is what keeps the scoping free: the
 * dispatch core already loads it, so this chunk imports a chunk the page has,
 * instead of turning it into a dynamic entry with a re-export shim of its own.
 */

// An element() binding's graph node id, restating the compiler's spelling for
// the reason instance-scope.ts restates the serializer's grammar.
const ELEMENT_BINDING_SEGMENT = '/element:';
const INSTANCE_SEGMENT = /r:[^:]*:|[cp]\d+:/g;

type RosterComputedRecord = {
	readonly graphNodeId: string;
	readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
};

type RosterRevisionGraph = {
	readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	readonly write: (write: { readonly graphNodeId: string; readonly value: unknown }) => void;
	readonly subscribe: (subscription: {
		readonly id: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
		readonly run: () => void;
	}) => () => void;
};

/**
 * Where this part stands in its family's roster, now that there is a DOM: the
 * roster answers its live members in document order and the part's own bound
 * element is one of them.
 *
 * Built only for a derivation that depends on an element() binding, because
 * scoping the roster to THIS rendered widget is what keeps a second collection
 * on the page from answering.
 */
export function createRosterPositionReader(input: {
	readonly computed: RosterComputedRecord;
	readonly graph: RuntimeGraph;
	readonly elementHandles: ElementHandleRegistry;
}): ((rosterGraphNodeId: string, handleGraphNodeId: string) => number) | undefined {
	if (!input.computed.dependencies?.some((dependency) => isElementBinding(dependency.graphNodeId)))
		return undefined;
	const instancePath = marklessInstancePath(input.computed.graphNodeId);
	const rosterOf = marklessInstanceScopedElementHandle(
		input.elementHandles.get,
		instancePath,
		input.graph,
	);
	// The member handle's own id names no instance, so the host path this
	// derivation stands in separates its element from every sibling part's.
	const scope = hostScopePath(instancePath);
	return (rosterGraphNodeId, handleGraphNodeId) => {
		const roster = rosterOf?.(rosterGraphNodeId);
		const member =
			oneElement(input.elementHandles.get, scope + handleGraphNodeId) ??
			oneElement(input.elementHandles.get, handleGraphNodeId);
		return Array.isArray(roster) && member ? roster.indexOf(member) : -1;
	};
}

/**
 * How many parts this family instance has in the roster, now that there is a
 * DOM: the roster's own live members. No member handle is needed - a count does
 * not depend on the asker being in the roster.
 */
export function createRosterCountReader(input: {
	readonly computed: RosterComputedRecord;
	readonly graph: RuntimeGraph;
	readonly elementHandles: ElementHandleRegistry;
}): ((rosterGraphNodeId: string) => number) | undefined {
	if (!input.computed.dependencies?.some((dependency) => isElementBinding(dependency.graphNodeId)))
		return undefined;
	const rosterOf = marklessInstanceScopedElementHandle(
		input.elementHandles.get,
		marklessInstancePath(input.computed.graphNodeId),
		input.graph,
	);
	return (rosterGraphNodeId) => {
		const roster = rosterOf?.(rosterGraphNodeId);
		return Array.isArray(roster) ? roster.length : 0;
	};
}

/**
 * The host id space spelling of an instance path, which is the space element
 * handles are registered in.
 *
 * Both spaces number one component edge the same, but only symbol space carries
 * the edge a PROJECTED component was projected into: symbol `c0:p1:` and host
 * `c1:` name one rendered component. So a segment another segment projects out
 * of is dropped, and what is left is respelled as the host's own `c`.
 */
function hostScopePath(instancePath: string): string {
	const segments = instancePath.match(INSTANCE_SEGMENT) ?? [];
	let scope = '';
	for (let at = 0; at < segments.length; at++) {
		const segment = segments[at]!;
		if (segments[at + 1]?.startsWith('p')) continue;
		scope += segment.startsWith('p') ? 'c' + segment.slice(1) : segment;
	}
	return scope;
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

/**
 * Nothing else writes an element() binding node and every reader of one answers
 * from the handle registry, so the binding's cell carries a revision: bumping it
 * is how the parts deriving a place in that roster are told to derive it again.
 *
 * The ids an arm hands over are its own registered handles, which is a superset
 * of the rosters among them; a bump on a binding no derivation depends on is a
 * number written into a cell nobody reads.
 */
export function bumpRosterRevisions(
	graph: Pick<RosterRevisionGraph, 'read' | 'write'>,
	rosterGraphNodeIds: Iterable<string>,
): void {
	for (const roster of rosterGraphNodeIds) {
		if (!isElementBinding(roster)) continue;
		const revision = graph.read(roster, []);
		graph.write({
			graphNodeId: roster,
			value: (typeof revision === 'number' ? revision : 0) + 1,
		});
	}
}

/**
 * The arm channel. A roster whose member is gated by an `@if` arm moves when the
 * arm does and no collection is written, so this is the only thing that can tell
 * the parts standing in that roster to derive their place again.
 *
 * Every element() binding any arm of the branch can hold is bumped: which of
 * them are registered is exactly what a flip changes. Called after the arm's own
 * materialization, when the registry has settled - the removed hosts are unfiled
 * and the arriving ones are filed.
 */
export function bumpArmRosterRevisions(
	graph: Pick<RosterRevisionGraph, 'read' | 'write'>,
	branches: ReadonlyArray<{
		readonly armRecords?: ReadonlyArray<{
			readonly elementHandles: ReadonlyArray<{ readonly handleId?: unknown }>;
		}>;
	}>,
): void {
	const rosters = new Set<string>();
	for (const branch of branches)
		for (const set of branch.armRecords ?? [])
			for (const handle of set.elementHandles)
				if (typeof handle.handleId === 'string') rosters.add(handle.handleId);
	bumpRosterRevisions(graph, rosters);
}

/**
 * After resume the roster is live, and a part's place in it changes when a row
 * arrives, leaves or moves. This is the keyed-repeat channel: a collection write
 * is what moves the rows. An `@if` arm adopting or dropping its host elements is
 * the other one, and it bumps from resume-branches.ts through the same cell.
 *
 * Resume is itself the first revision. A render answers a place from emission
 * order and paints it, but the number never reaches the derivation's graph cell,
 * so an expression that SPENDS the place - `code.slice(pos, pos + 1)` - reads
 * `undefined` the first time it re-derives. Deriving once against the live
 * roster puts the number in the cell before anything asks for it.
 */
export function wireRosterRevisions(input: {
	readonly graph: RosterRevisionGraph;
	readonly computed: ReadonlyArray<{
		readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
	}>;
	readonly keyedRepeats: ReadonlyArray<{
		readonly id: string;
		readonly collectionGraphNodeId?: string;
		readonly collectionPath: ReadonlyArray<string>;
	}>;
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	const rosters = new Set<string>();
	for (const record of input.computed)
		for (const dependency of record.dependencies ?? [])
			if (isElementBinding(dependency.graphNodeId)) rosters.add(dependency.graphNodeId);
	if (rosters.size === 0) return;
	const bump = () => bumpRosterRevisions(input.graph, rosters);
	for (const repeat of input.keyedRepeats) {
		const collection = repeat.collectionGraphNodeId;
		if (!collection) continue;
		input.storeContainerSubscription(
			input.graph.subscribe({
				// Wired after the repeat's own row application, so the rows are placed
				// before the parts standing in them are asked where they stand.
				id: `roster-revision:${repeat.id}:${collection}`,
				graphNodeId: collection,
				path: repeat.collectionPath,
				run: bump,
			}),
		);
	}
	bump();
}

function isElementBinding(graphNodeId: string): boolean {
	return graphNodeId.includes(ELEMENT_BINDING_SEGMENT);
}

const ROSTER_COUNT = new RegExp(
	`${MARKLESS_ROSTER_COUNT_OPEN}([^${MARKLESS_ROSTER_COUNT_CLOSE}]*)${MARKLESS_ROSTER_COUNT_CLOSE}`,
	'g',
);

/**
 * Every placeholder count a render minted, answered from the page it produced:
 * the roster's members are its element-handle registrations, and composition has
 * already qualified each one with the rendered widget it belongs to.
 *
 * This is the render half, and it lives here because it is the same pay-per-use
 * fact the resume half is: a page whose payload holds no computed node can hold
 * no count, and never names this module.
 *
 * The payload is answered alongside the html because a computed a handler reads
 * is SERVED with its rendered value, and a placeholder there would outlive paint.
 */
export function marklessResolveRosterCounts<
	Surface extends {
		readonly html: string;
		readonly state?: unknown;
		readonly view?: { readonly elementHandles?: ReadonlyArray<{ readonly handleId: string }> };
	},
>(surface: Surface): Surface {
	const handles = surface.view?.elementHandles ?? [];
	const answer = (text: string) =>
		text.replace(ROSTER_COUNT, (_all, key: string) =>
			String(handles.filter((handle) => handle.handleId === key).length),
		);
	return {
		...surface,
		html: answer(surface.html),
		...(surface.state === undefined ? {} : { state: answered(surface.state, answer) }),
	} as Surface;
}

// Rebuilt only where a placeholder was found, so a payload holding none is the
// object it arrived as and nothing downstream reads a spurious divergence.
function answered(value: unknown, answer: (text: string) => string): unknown {
	if (typeof value === 'string') return answer(value);
	if (!value || typeof value !== 'object') return value;
	const held = Object.entries(value).map(([key, one]) => [key, answered(one, answer)] as const);
	if (!held.some(([key, one]) => one !== (value as Record<string, unknown>)[key])) return value;
	return Array.isArray(value) ? held.map(([, one]) => one) : Object.fromEntries(held);
}
