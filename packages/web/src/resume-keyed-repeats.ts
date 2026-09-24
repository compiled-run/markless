import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
	ResumeNestedRepeatsHost,
	ResumeRenderDataThunk,
	ResumeRepeatRowHook,
	ResumeRuntimeInput,
	ResumeViewRecord,
} from './resume-types.ts';
import type { DisposedRepeatRow, ResumeEventWiring } from './resume-events.ts';

// Nothing has moved yet, so deriving a computed collection reproduces the served rows.
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

// The mint loader is written into `__marklessRowMint` by the app's resume module only when a repeat can build; naming it here would ship it to every app.
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
	graph: RepeatReadableGraph,
	repeat: ResumeKeyedRepeatRecord,
	key: unknown,
): unknown {
	for (const item of readKeyedRepeatCollection(graph, repeat))
		if (Object.is(repeatItemKey(item, repeat), key)) return item;
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
			for (const [rowIndex, rowRoot] of repeatRowElements(
				parent,
				repeat,
				items.length,
			).entries()) {
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
	rowComponentHost?: RowComponentHost,
	onRow?: ResumeRepeatRowHook,
): void | Promise<void> {
	const nested = !onRow && (globalThis as ResumeNestedRepeatsHost).__marklessNestedRepeats;
	if (nested) return nested(input, rowComponentHost);
	for (const repeat of input.view.keyedRepeats ?? []) validateOneRepeat(input.graph, repeat);
	for (const repeat of input.view.keyedRepeats ?? []) {
		const parent = input.elementsByHostId.get(repeat.parentHostNodeId);
		if (!parent) continue;
		const items = readKeyedRepeatCollection(input.graph, repeat),
			rowRootsByKey = new Map<unknown, ResumeDomElement>(),
			served = new Map<unknown, [unknown, number]>(),
				slots: RowSlots = {
				values: new Map(),
				ready: !repeat.rowTemplate?.componentName,
			};
		const registerRowEvents = (rowRoot: ResumeDomElement, rowKey: unknown): void => {
			for (const rowEvent of repeat.rowEvents) {
				const host = rowEventHost(rowRoot, rowEvent.hostPath);
				if (!host) continue;
				input.events.addRowEvent(host, { repeat, parent, rowRoot, rowKey, rowEvent });
			}
			onRow?.(repeat, rowRoot, rowKey);
		};
		// A server-painted `@empty` arm is not this runtime's to remove.
		const arm: MountedEmptyArm = { mounted: items.length === 0, nodes: [] };
		const builds = Boolean(repeat.rowTemplate ?? repeat.emptyArm ?? repeat.rowComponent),
			cell = builds ? rowMintCell(input.graph) : undefined;
		for (const [rowIndex, rowRoot] of repeatRowElements(
			parent,
			repeat,
			items.length,
		).entries()) {
			const item = items[rowIndex],
				rowKey = repeatItemKey(item, repeat);
			rowRootsByKey.set(rowKey, rowRoot);
			served.set(rowKey, [repeat.rowComponent ? itemCopy(item) : item, rowIndex]);
			if (slots.ready) slots.values.set(rowKey, rowSlotValues(repeat, item, rowIndex, input.graph));
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
				slots,
			);
		};
		const readyMint = (): Promise<RowMint> | undefined =>
			loadRowMint(input.renderData, input.graph, rowComponentHost)?.then(async (mint) => {
				if (!slots.ready) {
					if (!mint.slotReader)
						throw new Error(`MARKLESS_REPEAT_ROW_SLOT_READER_MISSING: ${repeat.id}`);
					slots.read ??= await mint.slotReader(repeat, input.graph);
				}
				if (slots.read && !slots.ready) {
					for (const [rowKey, [item, index]] of served)
						slots.values.set(rowKey, rowSlotValues(repeat, item, index, input.graph, slots.read));
					slots.ready = true;
				}
				slots.settled = true;
				return mint;
			});
		const loading = builds ? readyMint() : undefined;
		void loading?.then((mint) => apply(mint)).catch(() => undefined);
		let pending: ReturnType<NonNullable<RowMint['rows']>> | undefined;
		const settledMint = (): { readonly mint: RowMint | undefined } | undefined => {
			if (!builds) return { mint: undefined };
			if (!cell?.mint || !(slots.ready || slots.settled)) return undefined;
			if (repeat.rowComponent && (!pending || typeof pending === 'function'))
				pending = cell.mint.rows?.(repeat, parent, rowRootsByKey, served, registerRowEvents);
			return !repeat.rowComponent || typeof pending === 'function' ? { mint: cell.mint } : undefined;
		};
		// Rows mint AT the write, so the handler's next statement sees them through an element() handle.
		const observeWrites = input.graph.subscribeWrite?.({
			graphNodeId: repeat.collectionGraphNodeId,
			path: repeat.collectionPath,
			settle: () =>
				(builds && (!cell?.mint || !(slots.ready || slots.settled))
					? loading
					: typeof pending === 'object'
						? pending
						: undefined
				)?.then(() => undefined),
			run(): void {
				try {
					const settled = settledMint();
					if (!settled) return;
					if (!uniqueRepeatKeys(repeat, readKeyedRepeatCollection(input.graph, repeat)))
						return;
					apply(settled.mint);
				} catch {}
			},
		});
		if (observeWrites) input.storeContainerSubscription(observeWrites);
		// Rows stay current with the page state their slots read.
		if (builds)
			for (const [at, read] of rowSlotReads(repeat).entries())
				input.storeContainerSubscription(
					input.graph.subscribe({
						id: `keyed-repeat:${repeat.id}:read:${at}`,
						graphNodeId: read.graphNodeId,
						path: read.path,
						run(): void | Promise<void> {
							const settled = settledMint();
							if (settled) return apply(settled.mint);
							return readyMint()?.then((mint) => apply(mint));
						},
					}),
				);
		input.storeContainerSubscription(
			input.graph.subscribe({
				id: `keyed-repeat:${repeat.id}:${repeat.collectionGraphNodeId}:${repeat.collectionPath.join('.')}`,
				graphNodeId: repeat.collectionGraphNodeId,
				path: repeat.collectionPath,
				run(): void | Promise<void> {
					validateOneRepeat(input.graph, repeat);
					// `runFlush` awaits this run before any other pass, so no write overtakes a pending mint.
					const settled = settledMint(),
						held = pending;
					pending = undefined;
					if (settled) {
						apply(settled.mint);
						return typeof held === 'function' ? held() : undefined;
					}
					return (
						readyMint()?.then(
							async (mint) => {
								const commit = await (held ??
									mint.rows?.(repeat, parent, rowRootsByKey, served, registerRowEvents));
								apply(mint);
								await commit?.();
							},
						) ?? apply(undefined)
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
	mint: RowMint | undefined,
	registerRowEvents?: (rowRoot: ResumeDomElement, rowKey: unknown) => void,
	slots: RowSlots = { values: new Map(), ready: true },
): void {
	const nextRows: ResumeDomElement[] = [],
		focused: Array<[ResumeDomElement, number[]]> = [];
	// Every row this repeat owns, not a prefix: a row dropped off the end was stranded.
	const knownRows = new Set(rowRootsByKey.values());
	for (const [index, item] of readKeyedRepeatCollection(graph, repeat).entries()) {
		const rowKey = repeatItemKey(item, repeat),
			values = slots.ready ? rowSlotValues(repeat, item, index, graph, slots.read) : undefined,
			seen = slots.values.get(rowKey);
		let rowRoot = rowRootsByKey.get(rowKey);
		// A row whose slot values moved is rebuilt.
		const focus =
			rowRoot &&
			mint &&
			!repeat.rowComponent &&
			seen?.some((value, at) => !Object.is(value, values![at]))
				? (mint.focusPath?.(rowRoot) ?? [])
				: undefined;
		if (focus) rowRoot = undefined;
		if (!rowRoot) {
			if (!(repeat.rowTemplate ?? repeat.rowComponent) || !mint || !values) return;
			if (repeat.emptyArm && arm.mounted && arm.nodes.length === 0) return;
			rowRoot = mint.mintRow(parent, repeat, item, graph, values);
			if (!rowRoot) return;
			if (focus?.length) focused.push([rowRoot, focus]);
			rowRootsByKey.set(rowKey, rowRoot);
			// Known before the anchor walk, which puts rows in front of anything unknown.
			knownRows.add(rowRoot);
			registerRowEvents?.(rowRoot, rowKey);
		}
		if (values) slots.values.set(rowKey, values);
		nextRows.push(rowRoot);
	}
	const mutableParent = parent as MutableRepeatParent;
	const currentRows = elementChildren(parent).filter((child) => knownRows.has(child));
	if (
		currentRows.length === nextRows.length &&
		currentRows.every((row, index) => row === nextRows[index]) &&
		// Nothing-to-nothing still raises an `@empty` arm the first time.
		(nextRows.length > 0 || arm.mounted || !repeat.emptyArm)
	)
		return;
	// Every attach and detach is reported to the pinned census, or later indexes shift.
	const census = censusRoot(parent);
	if (arm.mounted && nextRows.length > 0 && arm.nodes.length > 0) {
		for (const node of arm.nodes) mutableParent.removeChild?.(node);
		if (census) spliceDomOrderCensus(census, arm.nodes, []);
		arm.mounted = false;
		arm.nodes = [];
	}
	// A departed key keeps its record; the row keeps its parent for an in-flight dispatch.
	const staying = new Set(nextRows);
	for (const rowRoot of currentRows)
		if (!staying.has(rowRoot)) {
			mutableParent.removeChild?.(rowRoot);
			(rowRoot as DisposedRepeatRow).__marklessRowParent = parent;
		}
	const anchor = elementChildren(parent)
		.slice(repeat.rowStartOffset ?? 0)
		.find((child) => !knownRows.has(child));
	for (const rowRoot of nextRows) insertRepeatNode(mutableParent, rowRoot, anchor);
	mint?.refocus?.(parent, focused);
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
// `mounted` with no `nodes` is the server's own arm, never removed here.
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
// A local copy of resume-locators' census splice: importing it breaks this closure's source wall.
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
	return readItemPath(item, repeat.keyPath);
}
function readItemPath(item: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = item as Record<string, unknown> | null | undefined;
	for (const key of path) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}
type RowSlotReader = (source: string, item: unknown, index: number) => unknown;
type RowSlots = {
	readonly values: Map<unknown, unknown[]>;
	ready: boolean;
	settled?: boolean;
	read?: RowSlotReader | undefined;
};
// So a write in place still reads as a moved item.
function itemCopy(item: unknown): unknown {
	try {
		return structuredClone(item);
	} catch {
		return item;
	}
}
function templateSlots(repeat: ResumeKeyedRepeatRecord) {
	const template = repeat.rowTemplate;
	return [...(template?.textSlots ?? []), ...(template?.attributeSlots ?? [])];
}
// Text slots first; compared by value, since a mutation in place keeps the item's identity.
function rowSlotValues(
	repeat: ResumeKeyedRepeatRecord,
	item: unknown,
	index: number,
	graph: Pick<RuntimeGraph, 'read'>,
	read?: RowSlotReader,
): unknown[] {
	return templateSlots(repeat).map((slot) =>
		'itemPath' in slot
			? readItemPath(item, slot.itemPath)
			: 'source' in slot
				? read?.(slot.source, item, index)
				: graph.read(slot.graphNodeId, slot.graphPath),
	);
}
function rowSlotReads(repeat: ResumeKeyedRepeatRecord) {
	return templateSlots(repeat).flatMap((slot) =>
		'source' in slot
			? (slot.reads ?? [])
			: 'graphNodeId' in slot
				? [{ graphNodeId: slot.graphNodeId, path: slot.graphPath }]
				: [],
	);
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
function uniqueRepeatKeys(repeat: ResumeKeyedRepeatRecord, items: ReadonlyArray<unknown>): boolean {
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
