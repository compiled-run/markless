import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
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
		for (const [rowIndex, rowRoot] of repeatRowElements(parent, repeat, items.length)) {
			const rowKey = repeatItemKey(items[rowIndex], repeat);
			rowRootsByKey.set(rowKey, rowRoot);
			for (const rowEvent of repeat.rowEvents) {
				const host = rowEventHost(rowRoot, rowEvent.hostPath);
				if (!host) continue;
				input.events.addRowEvent(host, { repeat, parent, rowRoot, rowKey, rowEvent });
			}
		}
		if (!repeat.collectionGraphNodeId) continue;
		input.storeContainerSubscription(
			input.graph.subscribe({
				id: `keyed-repeat:${repeat.id}:${repeat.collectionGraphNodeId}:${repeat.collectionPath.join('.')}`,
				graphNodeId: repeat.collectionGraphNodeId,
				path: repeat.collectionPath,
				run() {
					validateOneRepeat(input.graph, repeat);
					applyKeyedRepeatRowOrder(input.graph, repeat, parent, rowRootsByKey);
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
): void {
	const nextRows: ResumeDomElement[] = [];
	for (const item of readKeyedRepeatCollection(graph, repeat)) {
		const rowRoot = rowRootsByKey.get(repeatItemKey(item, repeat));
		if (!rowRoot) return;
		nextRows.push(rowRoot);
	}
	const mutableParent = parent as ResumeDomElement & {
		readonly appendChild?: (node: ResumeDomElement) => unknown;
		readonly insertBefore?: (node: ResumeDomElement, before: unknown) => unknown;
		readonly removeChild?: (node: ResumeDomElement) => unknown;
	};
	// Compare against every attached row THIS repeat owns, not the first
	// nextRows.length children. A prefix comparison calls [A,B,C] -> [A,B]
	// already-in-order and returns before the removal pass below, so a row
	// dropped off the END of the collection stayed in the document forever
	// while a row dropped from the middle left correctly.
	const knownRows = new Set(rowRootsByKey.values());
	const currentRows = elementChildren(parent).filter((child) => knownRows.has(child));
	if (
		currentRows.length === nextRows.length &&
		currentRows.every((row, index) => row === nextRows[index])
	) return;
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
	for (const rowRoot of nextRows) {
		if (anchor) mutableParent.insertBefore?.(rowRoot, anchor);
		else if (mutableParent.appendChild) mutableParent.appendChild(rowRoot);
		else mutableParent.insertBefore?.(rowRoot, null);
	}
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
