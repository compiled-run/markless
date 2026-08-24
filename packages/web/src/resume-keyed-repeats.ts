import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
	ResumeRuntimeInput,
	ResumeViewRecord,
} from './resume-types.ts';
import type { ResumeEventWiring } from './resume-events.ts';

/**
 * Give every computed-backed repeat collection a readable value before wiring.
 *
 * `wireKeyedRepeats` keys the SERVED rows by reading the collection once. A
 * `computed()` collection has no value in the resumed graph until something
 * writes it - the payload carries the derive symbol, not the result - so that
 * read answered an empty list, no served row was ever keyed, and the repeat
 * could never reconcile: growth found no row to reuse and shrink found no row
 * to remove. Deriving it here reproduces the served collection exactly, because
 * no dependency has moved yet.
 */
export async function primeKeyedRepeatCollections(input: {
	readonly graph: RuntimeGraph;
	readonly repeats: ReadonlyArray<ResumeKeyedRepeatRecord>;
	readonly computed: NonNullable<ResumeRuntimeInput['state']>['computed'];
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ElementHandleRegistry;
}): Promise<void> {
	const backing = new Set(
		input.repeats.flatMap((repeat) =>
			repeat.collectionGraphNodeId ? [repeat.collectionGraphNodeId] : [],
		),
	);
	if (backing.size === 0) return;
	for (const record of input.computed ?? []) {
		if (!backing.has(record.graphNodeId)) continue;
		if (record.async !== false || typeof record.deriveSymbolId !== 'string') continue;
		if (input.graph.read(record.graphNodeId, []) !== undefined) continue;
		await (
			await import('./resume-sync-computed.ts')
		).refreshSyncComputed({
			computed: record as Parameters<
				typeof import('./resume-sync-computed.ts').refreshSyncComputed
			>[0]['computed'],
			graph: input.graph,
			root: input.root,
			loadSymbol: input.loadSymbol,
			elementHandles: input.elementHandles,
		});
	}
}

type RepeatReadableGraph = Pick<RuntimeGraph, 'read'>;

export function validateOneRepeat(
	graph: RepeatReadableGraph,
	repeat: ResumeKeyedRepeatRecord,
): void {
	assertUniqueRepeatKeys(repeat, readKeyedRepeatCollection(graph, repeat));
}
export function findRepeatItemByKey(
	items: ReadonlyArray<unknown>,
	repeat: ResumeKeyedRepeatRecord,
	key: unknown,
): unknown {
	for (const item of items) if (Object.is(repeatItemKey(item, repeat), key)) return item;
}
export function findKeyedRepeatRowEventMatch(input: {
	readonly graph: RepeatReadableGraph;
	readonly view: Pick<ResumeViewRecord, 'keyedRepeats'>;
	readonly elementsByHostId: Map<string, ResumeDomElement>;
	readonly target: ResumeDomElement | null | undefined;
	readonly eventName: string;
	readonly materializeHost: (hostNodeId: string) => ResumeDomElement | undefined;
}):
	| {
			readonly element: ResumeDomElement;
			readonly match: import('./resume-events.ts').ResumeRowEventMatch;
	  }
	| undefined {
	for (let element = input.target; element; element = element.parentElement ?? null) {
		for (const repeat of input.view.keyedRepeats ?? []) {
			const rowEvents = repeat.rowEvents.filter(
				(rowEvent) => rowEvent.eventName === input.eventName,
			);
			if (rowEvents.length === 0) continue;
			validateOneRepeat(input.graph, repeat);
			const parent =
				input.elementsByHostId.get(repeat.parentHostNodeId) ??
				input.materializeHost(repeat.parentHostNodeId);
			if (!parent) continue;
			const items = readKeyedRepeatCollection(input.graph, repeat);
			for (const [rowIndex, rowRoot] of repeatRowElements(parent, repeat, items.length)) {
				const rowKey = repeatItemKey(items[rowIndex], repeat);
				for (const rowEvent of rowEvents) {
					if (rowEventHost(rowRoot, rowEvent.hostPath) === element) {
						return { element, match: { repeat, parent, rowRoot, rowKey, rowEvent } };
					}
				}
			}
		}
	}
}
export function wireKeyedRepeats(input: {
	readonly graph: RuntimeGraph;
	readonly view: ResumeViewRecord;
	readonly elementsByHostId: Map<string, ResumeDomElement>;
	readonly events: ResumeEventWiring;
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	for (const repeat of input.view.keyedRepeats ?? []) validateOneRepeat(input.graph, repeat);
	for (const repeat of input.view.keyedRepeats ?? []) {
		const parent = input.elementsByHostId.get(repeat.parentHostNodeId);
		if (!parent) continue;
		const items = readKeyedRepeatCollection(input.graph, repeat),
			rowRootsByKey = new Map<unknown, ResumeDomElement>();
		// One row-event loop, run for a served row at boot and for a minted row the
		// moment it exists. The wiring lives here, so the reconcile is handed this.
		const registerRowEvents = (rowRoot: ResumeDomElement, rowKey: unknown): void => {
			for (const rowEvent of repeat.rowEvents) {
				const host = rowEventHost(rowRoot, rowEvent.hostPath);
				if (!host) continue;
				input.events.addRowEvent(host, { repeat, parent, rowRoot, rowKey, rowEvent });
			}
		};
		// A page served with no rows already shows whatever the server painted for
		// the `@empty` arm, so this runtime must not paint a second one - and it
		// keeps no handle on those nodes, because it did not make them. `mounted`
		// with no `nodes` is exactly that state, and the mint declines in it.
		const arm: MountedEmptyArm = { mounted: items.length === 0, nodes: [] };
		for (const [rowIndex, rowRoot] of repeatRowElements(parent, repeat, items.length)) {
			const rowKey = repeatItemKey(items[rowIndex], repeat);
			rowRootsByKey.set(rowKey, rowRoot);
			registerRowEvents(rowRoot, rowKey);
		}
		if (!repeat.collectionGraphNodeId) continue;
		input.storeContainerSubscription(
			input.graph.subscribe({
				id: `keyed-repeat:${repeat.id}:${repeat.collectionGraphNodeId}:${repeat.collectionPath.join('.')}`,
				graphNodeId: repeat.collectionGraphNodeId,
				path: repeat.collectionPath,
				run() {
					validateOneRepeat(input.graph, repeat);
					applyKeyedRepeatRowOrder(
						input.graph,
						repeat,
						parent,
						rowRootsByKey,
						arm,
						registerRowEvents,
					);
				},
			}),
		);
	}
}
function applyKeyedRepeatRowOrder(
	graph: RuntimeGraph,
	repeat: ResumeKeyedRepeatRecord,
	parent: ResumeDomElement,
	rowRootsByKey: Map<unknown, ResumeDomElement>,
	arm: MountedEmptyArm,
	registerRowEvents?: (rowRoot: ResumeDomElement, rowKey: unknown) => void,
): void {
	const nextRows: ResumeDomElement[] = [];
	// Compare against every attached row THIS repeat owns, not the first
	// nextRows.length children. A prefix comparison calls [A,B,C] -> [A,B]
	// already-in-order and returns before the removal pass below, so a row
	// dropped off the END of the collection stayed in the document forever
	// while a row dropped from the middle left correctly.
	const knownRows = new Set(rowRootsByKey.values());
	for (const item of readKeyedRepeatCollection(graph, repeat)) {
		const rowKey = repeatItemKey(item, repeat);
		let rowRoot = rowRootsByKey.get(rowKey);
		if (!rowRoot) {
			// A key that was never served. The record carries this row's markup only
			// when the compiler proved the client can finish it alone; without it the
			// list stays as served, because half a row is worse than none. Same
			// refusal for a server-painted `@empty` arm this runtime cannot take out:
			// rows standing behind a live "nothing matches" is worse than no growth.
			if (!repeat.rowTemplate) return;
			if (repeat.emptyArm && arm.mounted && arm.nodes.length === 0) return;
			rowRoot = mintRepeatRow(parent, repeat, item);
			rowRootsByKey.set(rowKey, rowRoot);
			// The anchor walk below puts following rows in front of anything it does
			// not know, so a fresh row joins knownRows before that walk, not after.
			knownRows.add(rowRoot);
			registerRowEvents?.(rowRoot, rowKey);
		}
		nextRows.push(rowRoot);
	}
	const mutableParent = parent as MutableRepeatParent;
	const currentRows = elementChildren(parent).filter((child) => knownRows.has(child));
	if (
		currentRows.length === nextRows.length &&
		currentRows.every((row, index) => row === nextRows[index]) &&
		// The rows agreeing is not the whole answer once a repeat has an `@empty`
		// arm: nothing-to-nothing still has to raise the arm the first time.
		(nextRows.length > 0 || arm.mounted || !repeat.emptyArm)
	) return;
	// The pinned element census is the shipped shape as the framework has moved
	// it since (see spliceDomOrderCensus). Rows and the `@empty` arm are exactly
	// such a move, so every attach and detach below is reported to it - a mint
	// that entered the document without one would shift the index of every
	// element after this repeat.
	const census = censusRoot(parent);
	// The arm speaks only while nothing matches, so it leaves before the rows do
	// anything, and the row span is its own again by the time rows re-enter.
	if (arm.mounted && nextRows.length > 0 && arm.nodes.length > 0) {
		for (const node of arm.nodes) mutableParent.removeChild?.(node);
		if (census) spliceDomOrderCensus(census, arm.nodes, []);
		arm.mounted = false;
		arm.nodes = [];
	}
	// A key that left the collection takes its row out of the document. Without
	// this the served row stayed attached and every read of the rows - an
	// ordered element() set most of all - kept answering a row that is gone.
	// The record is kept in rowRootsByKey so the same key can return.
	const staying = new Set(nextRows);
	for (const rowRoot of rowRootsByKey.values())
		if (!staying.has(rowRoot) && elementChildren(parent).includes(rowRoot))
			mutableParent.removeChild?.(rowRoot);
	// Rows go back into their own span, not onto the end of the parent. Appending
	// was right only while a repeat owned every child; with a sibling in front of
	// the rows the anchor is the first element after the row span that this
	// repeat does not own, and appending past it would put the rows behind it.
	const anchor = elementChildren(parent)
		.slice(repeat.rowStartOffset ?? 0)
		.find((child) => !knownRows.has(child));
	for (const rowRoot of nextRows) insertRepeatNode(mutableParent, rowRoot, anchor);
	if (census && (currentRows.length > 0 || nextRows.length > 0))
		spliceDomOrderCensus(census, currentRows, nextRows);
	if (nextRows.length > 0 || arm.mounted || !repeat.emptyArm) return;
	const nodes = renderEmptyArm(parent, repeat);
	const armAnchor = elementChildren(parent).slice(repeat.rowStartOffset ?? 0)[0];
	for (const node of nodes) insertRepeatNode(mutableParent, node, armAnchor);
	arm.mounted = true;
	arm.nodes = nodes;
	if (census) spliceDomOrderCensus(census, [], nodes);
}
/**
 * The `@empty` arm this runtime raised, and the nodes it has to take back out.
 *
 * `mounted` with no `nodes` is the server's own arm on a page served with an
 * empty collection: it is up, and this runtime never removes what it did not
 * make.
 */
type MountedEmptyArm = { mounted: boolean; nodes: ReadonlyArray<ResumeDomNode> };
type MutableRepeatParent = ResumeDomElement & {
	readonly appendChild?: (node: ResumeDomNode) => unknown;
	readonly insertBefore?: (node: ResumeDomNode, before: unknown) => unknown;
	readonly removeChild?: (node: ResumeDomNode) => unknown;
};
function insertRepeatNode(
	parent: MutableRepeatParent,
	node: ResumeDomNode,
	anchor: ResumeDomNode | undefined,
): void {
	if (anchor) parent.insertBefore?.(node, anchor);
	else if (parent.appendChild) parent.appendChild(node);
	else parent.insertBefore?.(node, null);
}
/**
 * Build the `@empty` arm's nodes from the markup the payload carries.
 *
 * A detached template is the same construction `renderBranchHtml` uses for a
 * flipped `@if` arm; it is spelled here rather than threaded in because the
 * repeat runtime is reached from two call sites that hand it no renderer.
 */
function renderEmptyArm(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
): ReadonlyArray<ResumeDomNode> {
	const template = parent.ownerDocument?.createElement?.('template');
	if (!template)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_EMPTY_ARM_RENDERER_MISSING',
			'has no document to render its @empty arm markup with.',
		);
	template.innerHTML = repeat.emptyArm!.html;
	const nodes = Array.from(template.content?.childNodes ?? []) as ReadonlyArray<ResumeDomNode>;
	if (nodes.length === 0)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_EMPTY_ARM_EMPTY',
			'rendered an @empty arm of no nodes, so nothing would speak for the emptied list.',
		);
	return nodes;
}
/**
 * Build one row for a key that was never served, from the markup the record
 * carries.
 *
 * The mint renders and fills; it wires nothing and starts nothing, and the
 * compiler ships `rowTemplate` only for a row that needs no more than that. Slot
 * coordinates are FRAGMENT-relative, one segment ahead of the ROW-ROOT-relative
 * `hostPath` a row event carries: `[0]` here is the row root.
 */
function mintRepeatRow(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	item: unknown,
): ResumeDomElement {
	const rowTemplate = repeat.rowTemplate!,
		host = parent.ownerDocument as MintingDocument | undefined,
		template = host?.createElement?.('template');
	if (!template || !host?.createTextNode)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_ROW_MINT_RENDERER_MISSING',
			'has no document to build a row for an unserved key with.',
		);
	template.innerHTML = rowTemplate.html;
	const nodes = Array.from(template.content?.childNodes ?? []) as ReadonlyArray<ResumeDomNode>;
	const rowRoot = nodes.find((node) => node.nodeType === 1) as ResumeDomElement | undefined,
		slots = rowTemplate.textSlots ?? [],
		anchors = slots.map((slot) => nodeAtPath(nodes, slot.path) as ReplaceableNode | undefined);
	if (!rowRoot || anchors.some((anchor) => !anchor?.replaceWith))
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_ROW_MINT_EMPTY',
			'built no row from its markup, and half a row is worse than none.',
		);
	for (const [at, slot] of slots.entries())
		anchors[at]!.replaceWith!(host.createTextNode(String(readPath(item, slot.itemPath) ?? '')));
	return rowRoot;
}
// A local copy of fns/direct's walk, for the reason the census splice below is a
// local copy: importing that module pulls it into this on-demand module's static
// closure, which the leanness guard measures.
function nodeAtPath(
	nodes: ReadonlyArray<ResumeDomNode>,
	path: ReadonlyArray<number>,
): ResumeDomNode | undefined {
	let siblings: ReadonlyArray<ResumeDomNode> = nodes,
		node: ResumeDomNode | undefined;
	for (const index of path) {
		node = siblings[index];
		if (!node) return undefined;
		siblings = node.childNodes ?? [];
	}
	return node;
}
type MintingDocument = NonNullable<ResumeDomElement['ownerDocument']> & {
	readonly createTextNode?: (data: string) => ResumeDomNode;
};
type ReplaceableNode = ResumeDomNode & { readonly replaceWith?: (node: ResumeDomNode) => void };
// A local copy of resume-locators' census splice, for the reason resume-branches
// keeps its own DOM-walk helpers: importing that module here pulls it and the
// resume-errors chunk into this on-demand module's static closure, which the
// leanness guard measured at 28,554 source bytes against a 20,983 wall. The
// SEMANTICS are the one definition - this is the same splice, spelled twice, not
// a second way to renumber the census.
function spliceDomOrderCensus(
	root: ResumeDomElement,
	removed: Iterable<ResumeDomNode>,
	inserted: ReadonlyArray<ResumeDomNode>,
): void {
	const census = root.__marklessCensus;
	if (!census) return;
	for (const node of removed) {
		const at = census.indexOf(node as ResumeDomElement);
		if (at >= 0) census.splice(at, censusBlockEnd(census, at) - at);
	}
	if (inserted.length)
		census.splice(censusInsertionSlot(census, inserted[0]!), 0, ...censusElements(inserted));
}
function censusBlockEnd(census: ResumeDomElement[], at: number): number {
	const inside = new Set<ResumeDomNode>(censusElements([census[at]!]));
	let end = at + 1;
	while (end < census.length && inside.has(census[end]!)) end++;
	return end;
}
function censusInsertionSlot(census: ResumeDomElement[], first: ResumeDomNode): number {
	const parent = (first as ResumeDomElement).parentElement;
	if (!parent) return census.length;
	let slot = -1;
	for (const child of parent.childNodes ?? []) {
		if (child === first) break;
		const at = census.indexOf(child as ResumeDomElement);
		if (at >= 0) slot = censusBlockEnd(census, at);
	}
	if (slot >= 0) return slot;
	const at = census.indexOf(parent);
	return at >= 0 ? at + 1 : census.length;
}
function censusElements(nodes: ReadonlyArray<ResumeDomNode>): ResumeDomElement[] {
	const elements: ResumeDomElement[] = [];
	(function visit(list: ReadonlyArray<ResumeDomNode>): void {
		for (const node of list) {
			if (node.nodeType === 1) elements.push(node as ResumeDomElement);
			visit(node.childNodes ?? []);
		}
	})(nodes);
	return elements;
}
/** The container root that holds the pinned census, walking out from the parent. */
function censusRoot(element: ResumeDomElement): ResumeDomElement | undefined {
	for (
		let node: ResumeDomElement | null | undefined = element;
		node;
		node = node.parentElement ?? null
	)
		if (node.__marklessCensus) return node;
	return undefined;
}
function repeatRuntimeError(
	repeat: ResumeKeyedRepeatRecord,
	code: string,
	detail: string,
): Error {
	const error = new Error(`${code}: ${repeat.id} ${detail}`) as Error & Record<string, unknown>;
	error.name = 'KeyedRepeatRuntimeError';
	error.code = code;
	error.severity = 'error';
	error.phase = 'runtime';
	error.repeatId = repeat.id;
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}
export function readKeyedRepeatCollection(
	graph: Pick<RuntimeGraph, 'read'>,
	repeat: ResumeKeyedRepeatRecord,
): ReadonlyArray<unknown> {
	if (!repeat.collectionGraphNodeId) return [];
	const value = graph.read(repeat.collectionGraphNodeId, repeat.collectionPath);
	return Array.isArray(value) ? value : Array.from((value ?? []) as Iterable<unknown>);
}
function repeatItemKey(item: unknown, repeat: ResumeKeyedRepeatRecord): unknown {
	return readPath(item, repeat.keyPath);
}
function assertUniqueRepeatKeys(
	repeat: ResumeKeyedRepeatRecord,
	items: ReadonlyArray<unknown>,
): void {
	const seen = new Map<unknown, true>();
	for (const item of items) {
		const key = repeatItemKey(item, repeat);
		if (seen.has(key)) throw duplicateRepeatKeyError(repeat, key);
		seen.set(key, true);
	}
}
function duplicateRepeatKeyError(repeat: ResumeKeyedRepeatRecord, key: unknown): Error {
	const error = new Error(
		`MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key ${JSON.stringify(key)} from ${repeat.itemName}.${repeat.keyPath.join('.')}.`,
	) as Error & Record<string, unknown>;
	error.name = 'KeyedRepeatRuntimeError';
	error.code = 'MARKLESS_REPEAT_KEY_DUPLICATE';
	error.severity = 'error';
	error.phase = 'runtime';
	error.repeatId = repeat.id;
	error.keyPath = repeat.keyPath;
	error.collidingValue = key;
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE';
	return error;
}
function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value as Record<string, unknown> | null | undefined;
	for (const key of path) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}
/**
 * The parent's child elements that are this repeat's rows, paired with their row
 * index. Rows sit at `[rowStartOffset, rowStartOffset + count)`: the offset is
 * the compiler's count of element siblings in front of them, absent when the
 * rows already start the parent.
 */
function repeatRowElements(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	count: number,
): ReadonlyArray<readonly [number, ResumeDomElement]> {
	const offset = repeat.rowStartOffset ?? 0;
	return elementChildren(parent)
		.slice(offset, offset + count)
		.map((rowRoot, rowIndex) => [rowIndex, rowRoot] as const);
}
function elementChildren(element: ResumeDomElement): ResumeDomElement[] {
	return Array.from(element.childNodes ?? []).filter(
		(child): child is ResumeDomElement => child.nodeType === 1,
	);
}
function rowEventHost(
	rowRoot: ResumeDomElement,
	hostPath: ReadonlyArray<number>,
): ResumeDomElement | undefined {
	let current: import('./resume-types.ts').ResumeDomNode | undefined = rowRoot;
	for (const index of hostPath) {
		current = current.childNodes?.[index];
		if (!current) return;
	}
	return current.nodeType === 1 ? (current as ResumeDomElement) : undefined;
}
