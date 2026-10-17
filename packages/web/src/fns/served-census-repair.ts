import { PROTOCOL_LOCATOR_PATHS_DIGITS } from '../../../serializer/src/protocol-locator-paths-format.ts';
import { PROTOCOL_LOCATOR_PATHS_ATTRIBUTE } from '../../../serializer/src/protocol-locator-paths.ts';

type ShiftedRoot = Element & {
	__marklessCensus?: Array<Element | null>;
	__marklessShifted?: number;
};

/** One located element or ancestor as the server measured it. */
export type ServedLocatorPath = {
	readonly index: number;
	readonly parent: number;
	readonly siblings: number;
	readonly child: number;
	readonly tag: string;
};

export function decodeLocatorPaths(value: string): {
	readonly count: number;
	readonly entries: ServedLocatorPath[];
} {
	const [head = '', body = '', counts = ''] = value.split('|');
	const count = parseInt(head);
	const tags = head.slice(String(count).length).split(',');
	let at = 0;
	const read = (text: string) => {
		let number = 0;
		let scale = 1;
		let digit;
		while ((digit = PROTOCOL_LOCATOR_PATHS_DIGITS.indexOf(text[at++]!)) > 31) {
			number += (digit - 32) * scale;
			scale *= 32;
		}
		return number + digit * scale;
	};
	const entries: Array<ServedLocatorPath & { siblings: number }> = [];
	const parents: number[] = [];
	const stack = [0];
	for (let index = 0; at < body.length;) {
		stack.length -= read(body);
		const parent = stack[stack.length - 1]!;
		stack.push((index += read(body)));
		let place = parents.indexOf(parent);
		if (place < 0) place = parents.push(parent) - 1;
		entries.push({ index, parent, siblings: place, child: read(body), tag: tags[read(body)]! });
	}
	at = 0;
	const siblings = parents.map(() => read(counts));
	for (const entry of entries) entry.siblings = siblings[entry.siblings]!;
	return { count, entries };
}

/**
 * Renumbers the census the inline boot took when a script outside Markless
 * added, removed or swapped elements first: each located element and its
 * ancestors are matched by tag among their parent's children, so a change
 * moves nothing outside the parent it happened in; served slots the live page
 * lacks stay null. Runs before any locator is read.
 */
export function marklessRepairCensus(root: ShiftedRoot): void {
	if (!root.__marklessShifted) return;
	root.__marklessShifted = 0;
	const live = root.__marklessCensus;
	const value = root.getAttribute(PROTOCOL_LOCATOR_PATHS_ATTRIBUTE);
	if (!live || !value) return;
	const { count, entries } = decodeLocatorPaths(value);
	const taken = new Set(live);
	const located = new Map<number, Element>([[0, root]]);
	const served = new Map<Element | null, number>([[root, 0]]);
	const reserved = new Set<number>();
	for (const { index, parent, siblings, child, tag } of entries) {
		const children = located.get(parent)?.children ?? [];
		// More children than served means insertions, so the match can only sit further right; fewer, further left.
		const extra = children.length - siblings;
		reserved.add(index);
		for (let at = child; extra < 0 ? at >= child + extra : at <= child + extra;) {
			const candidate = children[at];
			if (!candidate) break;
			if (taken.has(candidate) && !served.has(candidate) && candidate.localName === tag) {
				located.set(index, candidate);
				served.set(candidate, index);
				break;
			}
			at += extra < 0 ? -1 : 1;
		}
	}
	const census: Array<Element | null> = Array(count).fill(null);
	let next = 0;
	for (const element of live) {
		const index = served.get(element);
		if (index !== undefined) next = index;
		else {
			while (reserved.has(next) && !located.has(next)) next++;
			if (next >= census.length || located.has(next)) continue;
		}
		census[next++] = element;
	}
	live.length = 0;
	for (const element of census) live.push(element);
}
