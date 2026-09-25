import type { RuntimeGraph } from '@markless/runtime';
import {
	findRepeatItemByKey,
	readKeyedRepeatCollection,
	wireKeyedRepeats,
} from '../resume-keyed-repeats.ts';
import type {
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
	ResumeRepeatRowHook,
} from '../resume-types.ts';

type WireInput = Parameters<typeof wireKeyedRepeats>[0];
// `locals` answers the items of the rows enclosing an instance, for its row handlers;
// `rowOuter` the enclosing row, by its authored repeat id, for its row slots.
type NestedRecord = ResumeKeyedRepeatRecord & {
	readonly locals?: () => object;
	readonly authoredId?: string;
	readonly rowOuter?: () => RowOuter;
};
type RowOuter = {
	readonly repeatId: string;
	readonly repeatItem: unknown;
	readonly repeatIndex: number;
	readonly repeatOuter: RowOuter | undefined;
};
type Scoped = { readonly graphNodeId: string; readonly path?: ReadonlyArray<string> };

/**
 * Keyed repeats written inside another repeat's rows. Every enclosing row wires its
 * own instance of a nested record: the record, reading its collection through that
 * row's item wherever the enclosing collection has moved it. An instance subscribes
 * at the outermost collection, since a reorder moves the path its rows live at, and
 * stands still while its enclosing item is out of the collection.
 */
export function wireNestedRepeats(
	input: WireInput,
	rowComponentHost?: Parameters<typeof wireKeyedRepeats>[1],
): void | Promise<void> {
	const repeats = input.view.keyedRepeats ?? [],
		nested = new Map<string, ResumeKeyedRepeatRecord[]>();
	for (const repeat of repeats) {
		const authoredId = repeat.enclosingRow?.repeatId;
		if (!authoredId) continue;
		// Composition prefixes ids but not the enclosing id a record names: the enclosing
		// record is the one whose prefix is the longest this record's id also carries.
		let enclosingId: string | undefined;
		for (const { id } of repeats)
			if (
				id.endsWith(authoredId) &&
				repeat.id.startsWith(id.slice(0, id.length - authoredId.length)) &&
				id.length > (enclosingId?.length ?? -1)
			)
				enclosingId = id;
		if (enclosingId) nested.set(enclosingId, [...(nested.get(enclosingId) ?? []), repeat]);
	}
	const wired = new WeakMap<ResumeKeyedRepeatRecord, Map<unknown, () => void>>(),
		roots = new WeakMap<ResumeKeyedRepeatRecord, Scoped>();
	let serial = 0;
	const onRow: ResumeRepeatRowHook = (enclosing, rowRoot, rowKey) => {
		const records = nested.get(enclosing.id);
		if (!records) return;
		let rows = wired.get(enclosing);
		if (!rows) {
			const own = (rows = new Map());
			wired.set(enclosing, own);
			input.storeContainerSubscription(() => {
				for (const release of own.values()) release();
			});
		}
		// A rebuilt row's new root replaces the instances its old root carried.
		rows.get(rowKey)?.();
		const releases: Array<() => void> = [];
		for (const record of records) {
			const parent = nodeAt(rowRoot, record.enclosingRow!.parentHostPath);
			if (!parent) continue;
			const item = () => findRepeatItemByKey(input.graph, enclosing, rowKey);
			const instance = nestedInstance(input.graph, record, enclosing, item);
			const root = record.enclosingRow!.itemPath
				? (roots.get(enclosing) ?? {
						graphNodeId: enclosing.collectionGraphNodeId ?? '',
						path: enclosing.collectionPath,
					})
				: undefined;
			if (root) roots.set(instance, root);
			void wireKeyedRepeats(
				{
					...input,
					graph: instanceGraph(input.graph, root, () => item() === undefined, ++serial),
					view: { ...input.view, keyedRepeats: [instance] },
					elementsByHostId: new Map([[instance.parentHostNodeId, parent]]),
					storeContainerSubscription: (release) => releases.push(release),
				},
				rowComponentHost,
				onRow,
			);
		}
		rows.set(rowKey, () => {
			for (const release of releases.splice(0)) release();
		});
	};
	const topLevel = repeats.filter((repeat) => !repeat.enclosingRow);
	return wireKeyedRepeats(
		{ ...input, view: { ...input.view, keyedRepeats: topLevel } },
		rowComponentHost,
		onRow,
	);
}

function nestedInstance(
	graph: RuntimeGraph,
	record: ResumeKeyedRepeatRecord,
	enclosing: NestedRecord,
	item: () => unknown,
): NestedRecord {
	const { enclosingRow, ...own } = record;
	const enclosingId = enclosingRow?.repeatId ?? enclosing.id,
		prefix = enclosing.id.endsWith(enclosingId)
			? enclosing.id.slice(0, enclosing.id.length - enclosingId.length)
			: '';
	const instance: NestedRecord = {
		...own,
		locals: () => ({ ...enclosing.locals?.(), [enclosing.itemName]: item() }),
		authoredId: record.id.startsWith(prefix) ? record.id.slice(prefix.length) : record.id,
		rowOuter: () => ({
			repeatId: enclosingId,
			repeatItem: item(),
			repeatIndex: readKeyedRepeatCollection(graph, enclosing).indexOf(item()),
			repeatOuter: enclosing.rowOuter?.(),
		}),
	};
	const itemPath = enclosingRow?.itemPath;
	if (!itemPath) return instance;
	return Object.defineProperties(instance, {
		collectionGraphNodeId: { value: enclosing.collectionGraphNodeId, enumerable: true },
		collectionPath: {
			enumerable: true,
			get: () => [
				...enclosing.collectionPath,
				String(readKeyedRepeatCollection(graph, enclosing).indexOf(item())),
				...itemPath,
			],
		},
	});
}

// The instance's own collection reads subscribe at the outermost collection and hold
// while its enclosing item is gone; its ids stay apart from its sibling instances'.
function instanceGraph(
	graph: RuntimeGraph,
	root: Scoped | undefined,
	gone: () => boolean,
	serial: number,
): RuntimeGraph {
	const own = (entry: Scoped) => root !== undefined && entry.graphNodeId === root.graphNodeId;
	return {
		...graph,
		subscribe: (subscription) =>
			graph.subscribe({
				...subscription,
				id: `${subscription.id}@${serial}`,
				...(own(subscription)
					? { path: root!.path, run: (value) => (gone() ? undefined : subscription.run(value)) }
					: {}),
			}),
		...(graph.subscribeWrite
			? {
					subscribeWrite: (observer) =>
						graph.subscribeWrite!(
							own(observer)
								? { ...observer, path: root!.path, run: () => gone() || observer.run() }
								: observer,
						),
				}
			: {}),
	};
}

function nodeAt(
	rowRoot: ResumeDomElement,
	path: ReadonlyArray<number>,
): ResumeDomElement | undefined {
	let node: ResumeDomNode | undefined = rowRoot;
	for (const index of path) node = node?.childNodes?.[index];
	return node?.nodeType === 1 ? (node as ResumeDomElement) : undefined;
}
