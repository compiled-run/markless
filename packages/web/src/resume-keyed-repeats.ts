import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
	ResumeRenderDataThunk,
	ResumeRuntimeInput,
	ResumeViewRecord,
} from './resume-types.ts';
import type { DisposedRepeatRow, ResumeEventWiring } from './resume-events.ts';

/**
 * Give every computed-backed repeat collection a readable value before wiring.
 *
 * The payload carries a `computed()` collection's derive symbol, not its result,
 * so the read that keys the SERVED rows answered an empty list and the repeat
 * could never reconcile. No dependency has moved yet, so deriving here
 * reproduces the served collection exactly.
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

/**
 * The node-BUILDING half of a repeat, loaded only by a repeat that can build.
 *
 * The `import()` specifier is NOT written here: every repeat loads this module,
 * so naming the mint would emit its chunk for every app with any keyed repeat.
 * The app's own resume module writes the loader into `__marklessRowMint`, and
 * only for a page the compiler recorded a mintable repeat for; an absent loader
 * is a page that cannot build nodes, and every mint site refuses without one. A
 * page with a component row answers that global with `fns/row-component-mint`, a
 * superset. The loader is page-AGNOSTIC - two page modules in one document write
 * the same one - so the page a row renders against arrives on the wiring.
 */
type RowMint = typeof import('./fns/row-mint.ts') &
	Partial<import('./fns/row-component-mint.ts').RowComponentMintApi>;
type RowComponentHost = import('./fns/row-component-mint.ts').RowComponentMintHost;
type RowMintHost = {
	readonly __marklessRowMint?: (
		renderData?: ResumeRenderDataThunk,
		graph?: RuntimeGraph,
		host?: RowComponentHost,
	) => Promise<RowMint>;
};
type RowMintCell = { mint?: RowMint; load?: Promise<RowMint> };
// Per graph, because the bridge BINDS the graph and registrar it is handed: one
// module-wide memo gave a second container the FIRST container's registrar, and
// rows minted there registered events that container's dispatch never reads.
const rowMintCells = new WeakMap<object, RowMintCell>();
const noGraphKey = {};
function rowMintCell(graph?: RuntimeGraph): RowMintCell {
	const key = graph ?? noGraphKey;
	let cell = rowMintCells.get(key);
	if (!cell) rowMintCells.set(key, (cell = {}));
	return cell;
}
function loadRowMint(
	renderData?: ResumeRenderDataThunk,
	graph?: RuntimeGraph,
	host?: RowComponentHost,
): Promise<RowMint> | undefined {
	const load = (globalThis as RowMintHost).__marklessRowMint;
	if (!load) return undefined;
	const cell = rowMintCell(graph);
	return (cell.load ||= load(renderData, graph, host).then((module) => (cell.mint = module)));
}

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
			for (const [rowIndex, rowRoot] of repeatRowElements(parent, repeat, items.length).entries()) {
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
export function wireKeyedRepeats(
	input: {
		readonly graph: RuntimeGraph;
		readonly view: ResumeViewRecord;
		readonly elementsByHostId: Map<string, ResumeDomElement>;
		readonly events: ResumeEventWiring;
		readonly storeContainerSubscription: (release: () => void) => void;
		readonly renderData?: ResumeRenderDataThunk;
	},
	// Forwarded to a component row's bridge, never read here: the registrar a row
	// born after boot commits its records through.
	rowComponentHost?: RowComponentHost,
): void {
	for (const repeat of input.view.keyedRepeats ?? []) validateOneRepeat(input.graph, repeat);
	for (const repeat of input.view.keyedRepeats ?? []) {
		const parent = input.elementsByHostId.get(repeat.parentHostNodeId);
		if (!parent) continue;
		const items = readKeyedRepeatCollection(input.graph, repeat),
			rowRootsByKey = new Map<unknown, ResumeDomElement>();
		// One row-event loop: a served row at boot, a minted row the moment it exists.
		const registerRowEvents = (rowRoot: ResumeDomElement, rowKey: unknown): void => {
			for (const rowEvent of repeat.rowEvents) {
				const host = rowEventHost(rowRoot, rowEvent.hostPath);
				if (!host) continue;
				input.events.addRowEvent(host, { repeat, parent, rowRoot, rowKey, rowEvent });
			}
		};
		// A page served with no rows already shows the server's `@empty` arm, and
		// this runtime holds no handle on nodes it did not make: the mint declines.
		const arm: MountedEmptyArm = { mounted: items.length === 0, nodes: [] };
		// The three fields that need the building half: a repeat that only reorders
		// never touches the import, and one that does fetches at wiring time.
		const builds = Boolean(repeat.rowTemplate ?? repeat.emptyArm ?? repeat.rowComponent),
			cell = builds ? rowMintCell(input.graph) : undefined;
		if (builds)
			void loadRowMint(input.renderData, input.graph, rowComponentHost)?.catch(
				() => undefined,
			);
		for (const [rowIndex, rowRoot] of repeatRowElements(parent, repeat, items.length).entries()) {
			const rowKey = repeatItemKey(items[rowIndex], repeat);
			rowRootsByKey.set(rowKey, rowRoot);
			registerRowEvents(rowRoot, rowKey);
		}
		if (!repeat.collectionGraphNodeId) continue;
		const apply = (mint: RowMint | undefined): void => {
			applyKeyedRepeatRowOrder(
				input.graph,
				repeat,
				parent,
				rowRootsByKey,
				arm,
				mint,
				registerRowEvents,
			);
		};
		// Wrapped: absent means this pass has to await something - a mint module
		// still in flight, or a component row, whose render is async.
		const settledMint = (): { readonly mint: RowMint | undefined } | undefined =>
			!builds ? { mint: undefined } : cell?.mint && !cell.mint.rows ? { mint: cell.mint } : undefined;
		// Rows minted AT the write, so a handler that replaces a collection reads
		// the new rows off an element() handle on its next statement. Same apply,
		// same rowRootsByKey as the flush below, so the flush finds them placed and
		// returns: one mint. `settle` waits on the load this wiring already began -
		// it starts none - because a gesture that beat it would read stale rows.
		const observeWrites = input.graph.subscribeWrite?.({
			graphNodeId: repeat.collectionGraphNodeId,
			path: repeat.collectionPath,
			settle: () => (builds && !cell?.mint ? cell?.load?.then(() => undefined) : undefined),
			run(): void {
				const settled = settledMint();
				if (!settled) return;
				// A duplicate key, and anything the mint throws, is the flush's to report.
				if (!uniqueRepeatKeys(repeat, readKeyedRepeatCollection(input.graph, repeat))) return;
				try {
					apply(settled.mint);
				} catch {}
			},
		});
		if (observeWrites) input.storeContainerSubscription(observeWrites);
		input.storeContainerSubscription(
			input.graph.subscribe({
				id: `keyed-repeat:${repeat.id}:${repeat.collectionGraphNodeId}:${repeat.collectionPath.join('.')}`,
				graphNodeId: repeat.collectionGraphNodeId,
				path: repeat.collectionPath,
				run(): void | Promise<void> {
					validateOneRepeat(input.graph, repeat);
					// Ordering across the await is the graph's own: `runFlush` awaits this
					// run before any other subscription or dirty pass, so no collection
					// write applies ahead of a pending mint. The apply itself never yields.
					// A component row renders BEFORE it, and registers after it attaches.
					const settled = settledMint();
					if (settled) return apply(settled.mint);
					return (
						loadRowMint(input.renderData, input.graph, rowComponentHost)?.then(async (mint) => {
							const commit = await mint.rows?.(repeat, parent, rowRootsByKey);
							apply(mint);
							await commit?.();
						}) ?? apply(undefined)
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
	// Absent exactly when the record carries neither `rowTemplate` nor `emptyArm`.
	mint: RowMint | undefined,
	registerRowEvents?: (rowRoot: ResumeDomElement, rowKey: unknown) => void,
): void {
	const nextRows: ResumeDomElement[] = [];
	// Every attached row THIS repeat owns, not the first nextRows.length children:
	// a prefix comparison calls [A,B,C] -> [A,B] already-in-order and returns
	// before the removal pass, stranding a row dropped off the END forever.
	const knownRows = new Set(rowRootsByKey.values());
	for (const item of readKeyedRepeatCollection(graph, repeat)) {
		const rowKey = repeatItemKey(item, repeat);
		let rowRoot = rowRootsByKey.get(rowKey);
		if (!rowRoot) {
			// A key never served. Without markup the compiler proved the client can
			// finish alone, the list stays as served: half a row is worse than none.
			// Same refusal behind a server-painted `@empty` arm this cannot take out.
			if (!(repeat.rowTemplate ?? repeat.rowComponent) || !mint) return;
			if (repeat.emptyArm && arm.mounted && arm.nodes.length === 0) return;
			rowRoot = mint.mintRow(parent, repeat, item);
			if (!rowRoot) return;
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
	// Every attach and detach below is reported to the pinned census: a mint that
	// entered without one shifts the index of every element after this repeat.
	const census = censusRoot(parent);
	// The arm speaks only while nothing matches, so it leaves before the rows do
	// anything, and the row span is its own again by the time rows re-enter.
	if (arm.mounted && nextRows.length > 0 && arm.nodes.length > 0) {
		for (const node of arm.nodes) mutableParent.removeChild?.(node);
		if (census) spliceDomOrderCensus(census, arm.nodes, []);
		arm.mounted = false;
		arm.nodes = [];
	}
	// A key that left takes its row out; the record stays in rowRootsByKey so the
	// key can return. Where the row hung is kept ON the row, because a dispatch
	// runs microtasks behind its press and still walks across it.
	const staying = new Set(nextRows);
	for (const rowRoot of currentRows)
		if (!staying.has(rowRoot)) {
			mutableParent.removeChild?.(rowRoot);
			(rowRoot as DisposedRepeatRow).__marklessRowParent = parent;
		}
	// Rows go back into their own span: the anchor is the first element after the
	// span this repeat does not own, and appending past it would trail a sibling.
	const anchor = elementChildren(parent)
		.slice(repeat.rowStartOffset ?? 0)
		.find((child) => !knownRows.has(child));
	for (const rowRoot of nextRows) insertRepeatNode(mutableParent, rowRoot, anchor);
	if (census && (currentRows.length > 0 || nextRows.length > 0))
		spliceDomOrderCensus(census, currentRows, nextRows);
	if (nextRows.length > 0 || arm.mounted || !repeat.emptyArm || !mint) return;
	const nodes = mint.renderEmptyArm(parent, repeat);
	const armAnchor = elementChildren(parent).slice(repeat.rowStartOffset ?? 0)[0];
	for (const node of nodes) insertRepeatNode(mutableParent, node, armAnchor);
	arm.mounted = true;
	arm.nodes = nodes;
	if (census) spliceDomOrderCensus(census, [], nodes);
}
/**
 * The `@empty` arm this runtime raised, and the nodes it has to take back out.
 * `mounted` with no `nodes` is the server's own arm: up, and never removed here.
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
// A local copy of resume-locators' census splice: importing that module pulls it
// and the resume-errors chunk into this on-demand closure, measured at 28,554
// source bytes against a 20,983 wall. Same splice spelled twice, one semantics.
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
	for (const node of nodes) {
		if (node.nodeType === 1) elements.push(node as ResumeDomElement);
		if (node.childNodes) elements.push(...censusElements(node.childNodes));
	}
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
export function readKeyedRepeatCollection(
	graph: Pick<RuntimeGraph, 'read'>,
	repeat: ResumeKeyedRepeatRecord,
): ReadonlyArray<unknown> {
	if (!repeat.collectionGraphNodeId) return [];
	const value = graph.read(repeat.collectionGraphNodeId, repeat.collectionPath);
	return Array.isArray(value) ? value : Array.from((value ?? []) as Iterable<unknown>);
}
function repeatItemKey(item: unknown, repeat: ResumeKeyedRepeatRecord): unknown {
	let cursor = item as Record<string, unknown> | null | undefined;
	for (const key of repeat.keyPath) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}
function firstDuplicateRepeatKey(
	repeat: ResumeKeyedRepeatRecord,
	items: ReadonlyArray<unknown>,
): { readonly key: unknown } | undefined {
	const seen = new Set<unknown>();
	for (const item of items) {
		const key = repeatItemKey(item, repeat);
		if (seen.has(key)) return { key };
		seen.add(key);
	}
}
function uniqueRepeatKeys(
	repeat: ResumeKeyedRepeatRecord,
	items: ReadonlyArray<unknown>,
): boolean {
	return !firstDuplicateRepeatKey(repeat, items);
}
function assertUniqueRepeatKeys(
	repeat: ResumeKeyedRepeatRecord,
	items: ReadonlyArray<unknown>,
): void {
	const duplicate = firstDuplicateRepeatKey(repeat, items);
	if (duplicate) throw duplicateRepeatKeyError(repeat, duplicate.key);
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
// Rows sit at `[rowStartOffset, rowStartOffset + count)`: the offset is the
// compiler's count of element siblings in front of them, absent when the rows
// already start the parent.
function repeatRowElements(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	count: number,
): ReadonlyArray<ResumeDomElement> {
	const offset = repeat.rowStartOffset ?? 0;
	return elementChildren(parent).slice(offset, offset + count);
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
