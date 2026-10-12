// What a <Code> block's "Try this" steps and update marks read: pure checks over text and mutation records.

/** One "Try this" step that ticks by itself once the reader has done it. Give one of `shows`, `source` or `rewrites`. */
export type CodeStep = {
	/** What to do. Text between backticks prints as code. */
	readonly label: string;
	/** Done once an element in the result shows exactly this text. */
	readonly shows?: string;
	/** Done once the code contains this text, spaces ignored. */
	readonly source?: string;
	/** Done once one update rewrites at least this many places to the same text. */
	readonly rewrites?: number;
};

export type LabelPiece = { readonly id: number; readonly text: string; readonly code: boolean };

/** A step label split at its backticks; odd pieces are code. */
export function labelPieces(label: string): LabelPiece[] {
	return label
		.split('`')
		.map((text, id) => ({ id, text, code: id % 2 === 1 }))
		.filter((piece) => piece.text !== '');
}

// Close counts: case, spaces and emoji never decide whether a step is done.
const plain = (text: string) => text.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '');
const squashed = (text: string) => plain(text).replace(/\s+/g, '').replace(/["`]/g, "'").toLowerCase();
const spoken = (text: string) => plain(text).replace(/\s+/g, ' ').trim().toLowerCase();

export function sourceHas(source: string, code: string): boolean {
	return squashed(source).includes(squashed(code));
}

export function showsText(texts: Iterable<string>, wanted: string): boolean {
	const target = spoken(wanted);
	for (const text of texts) if (spoken(text) === target) return true;
	return false;
}

/** True when at least `count` of the rewritten texts read the same. */
export function rewroteTogether(texts: readonly string[], count: number): boolean {
	const seen = new Map<string, number>();
	for (const text of texts) {
		const key = spoken(text);
		if (key === '') continue;
		const times = (seen.get(key) ?? 0) + 1;
		if (times >= count) return true;
		seen.set(key, times);
	}
	return false;
}

const ELEMENT = 1;
const TEXT = 3;

type Changed = Pick<MutationRecord, 'type' | 'target' | 'addedNodes' | 'removedNodes' | 'oldValue' | 'attributeName'>;

/** The part of `now` that differs from `before`, as [start, end) offsets into `now`. */
export function changedSpan(before: string, now: string): readonly [number, number] {
	let start = 0;
	while (start < before.length && start < now.length && before[start] === now[start]) start++;
	let end = 0;
	while (
		end < before.length - start &&
		end < now.length - start &&
		before[before.length - 1 - end] === now[now.length - 1 - end]
	)
		end++;
	return [start, Math.max(start, now.length - end)];
}

/** A rewritten node; `span` narrows a text node to the characters that changed. */
export type Rewrite = { readonly node: Node; readonly span?: readonly [number, number] };

/**
 * The nodes an update rewrote in place: text whose characters changed, text put into an element
 * that was already there, and attributes whose value changed. Whole elements put in (a new run, a
 * branch opening) are not rewrites.
 */
export function rewrittenNodes(records: readonly Changed[]): Rewrite[] {
	const rewrites = new Map<Node, Rewrite>();
	const firstText = new Map<Node, string>();
	for (const record of records) {
		const { target } = record;
		if (record.type === 'characterData') {
			if (!firstText.has(target)) firstText.set(target, record.oldValue ?? '');
			rewrites.set(target, { node: target });
		} else if (record.type === 'childList') {
			// Text swapped for new text in one write diffs against what it replaced.
			const removed = [...record.removedNodes].filter((node) => node.nodeType === TEXT);
			const before = removed.length > 0 ? removed.map((node) => node.nodeValue).join('') : undefined;
			for (const added of record.addedNodes) {
				const now = added.nodeValue ?? '';
				if (added.nodeType !== TEXT || !now.trim() || now === before) continue;
				rewrites.set(added, before === undefined ? { node: added } : { node: added, span: changedSpan(before, now) });
			}
		} else if (record.type === 'attributes' && target.nodeType === ELEMENT) {
			const now = (target as Element).getAttribute(record.attributeName ?? '');
			if (now !== record.oldValue) rewrites.set(target, { node: target });
		}
	}
	// Several writes to one text in a batch compare its first text with its last.
	for (const [node, before] of firstText) {
		const now = node.nodeValue ?? '';
		if (before === now) rewrites.delete(node);
		else rewrites.set(node, { node, span: changedSpan(before, now) });
	}
	return [...rewrites.values()];
}

export type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

const PAD_X = 3;
const PAD_Y = 1;

/** Where a mark sits in the layer, from a rect in its document's viewport and that document's offset; undefined when the rect has no size. */
export function markBox(
	rect: Box,
	origin: { readonly left: number; readonly top: number },
	layer: { readonly left: number; readonly top: number },
): Box | undefined {
	if (rect.width === 0 || rect.height === 0) return undefined;
	return {
		left: rect.left + origin.left - layer.left - PAD_X,
		top: rect.top + origin.top - layer.top - PAD_Y,
		width: rect.width + 2 * PAD_X,
		height: rect.height + 2 * PAD_Y,
	};
}
