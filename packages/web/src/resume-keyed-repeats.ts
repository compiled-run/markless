import type { RuntimeGraph } from '@markless/runtime';
import type {
	ResumeDomElement,
	ResumeKeyedRepeatRecord,
	ResumeViewRecord,
} from './resume-types.ts';
import type { ResumeEventWiring } from './resume-events.ts';

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
			for (const [rowIndex, rowRoot] of elementChildren(parent)
				.slice(0, items.length)
				.entries()) {
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
		for (const [rowIndex, rowRoot] of elementChildren(parent)
			.slice(0, items.length)
			.entries()) {
			const rowKey = repeatItemKey(items[rowIndex], repeat);
			rowRootsByKey.set(rowKey, rowRoot);
			for (const rowEvent of repeat.rowEvents) {
				const host = rowEventHost(rowRoot, rowEvent.hostPath);
				if (!host) continue;
				input.events.addRowEvent(host, { repeat, parent, rowRoot, rowKey, rowEvent });
			}
		}
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
	};
	for (const rowRoot of nextRows) {
		if (mutableParent.appendChild) mutableParent.appendChild(rowRoot);
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
