import { PROTOCOL_LOCATOR_PATHS_DIGITS } from '../../../serializer/src/protocol-locator-paths-format.ts';
import { PROTOCOL_LOCATOR_PATHS_ATTRIBUTE } from '../../../serializer/src/protocol-locator-paths.ts';
import { pageNodes } from '../resume-anchor-census.ts';

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
 * added, removed, swapped or moved elements first: each located element and
 * its ancestors are matched by tag, and by the children served under them,
 * among their parent's children, then anywhere on the page for one a script
 * moved to another parent; served slots the live page lacks stay null. Runs
 * before any locator is read.
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
	const pageChildren = servedPageChildren(root);
	const served = new Map<Element | null, number>([[root, 0]]);
	const reserved = new Set<number>();
	const kids = new Map<number, ServedLocatorPath[]>();
	for (const entry of entries) kids.set(entry.parent, [...(kids.get(entry.parent) ?? []), entry]);
	// How well an element's children fit the ones served under this entry; 0 when they share nothing, so a same-tag stranger is not taken for it.
	const fit = (candidate: Element, index: number) => {
		const served = kids.get(index);
		if (!served) return 1;
		return (
			served.filter((kid) => candidate.children[kid.child]?.localName === kid.tag).length +
			(candidate.children.length === served[0]!.siblings ? 1 : 0)
		);
	};
	const free = (candidate: Element | undefined, tag: string): candidate is Element =>
		!!candidate && taken.has(candidate) && !served.has(candidate) && candidate.localName === tag;
	for (const { index, parent, siblings, child, tag } of entries) {
		const children = parent ? (located.get(parent)?.children ?? []) : pageChildren;
		// More children than served means insertions, so the match sits further right, fewer further left; a script that also moved it put it anywhere, nearest first.
		const extra = children.length - siblings;
		const step = extra < 0 ? -1 : 1;
		reserved.add(index);
		const order: number[] = [];
		for (let at = child; at !== child + extra + step; at += step) order.push(at);
		for (let distance = 1; distance <= children.length; distance++)
			order.push(child - step * distance, child + step * distance);
		const nearby = order.map((at) => children[at]).filter((candidate) => free(candidate, tag));
		let found = nearby.find((candidate) => fit(candidate, index) > 0);
		// Moved to another parent, as a portal does: the one element on the page whose children fit best, never a guess between equals.
		if (!found && kids.has(index)) {
			let best = 0;
			let tie = false;
			for (const candidate of live) {
				if (!free(candidate ?? undefined, tag)) continue;
				const score = fit(candidate!, index);
				if (score > best) [best, found, tie] = [score, candidate!, false];
				else if (score === best && score > 0) tie = true;
			}
			if (tie) found = undefined;
		}
		// Its own children changed too: the nearest element with its tag, as before any of this.
		found ??= nearby[0];
		if (found) {
			located.set(index, found);
			served.set(found, index);
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

/** The container's element children that are the page's, where served child places count. */
export function servedPageChildren(root: Element): Element[] {
	return pageNodes<Node>(root).filter((node): node is Element => node.nodeType === 1);
}
