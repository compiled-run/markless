import type { RuntimeGraph } from '@markless/runtime';
import type { ElementHandleRegistry } from '../resume-types.ts';
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
 * After resume the roster is live, and a part's place in it changes when a row
 * arrives, leaves or moves. Nothing else writes an element() binding node and
 * every reader of one answers from the handle registry, so the binding's cell
 * carries a revision: bumping it is how the parts deriving a place in that
 * roster are told to derive it again.
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
				run: () => {
					for (const roster of rosters) {
						const revision = input.graph.read(roster, []);
						input.graph.write({
							graphNodeId: roster,
							value: (typeof revision === 'number' ? revision : 0) + 1,
						});
					}
				},
			}),
		);
	}
}

function isElementBinding(graphNodeId: string): boolean {
	return graphNodeId.includes(ELEMENT_BINDING_SEGMENT);
}
