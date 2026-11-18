import { expect, test } from 'vitest';
import { findKeyedRepeatRowEventMatch } from '../src/resume-keyed-repeats.ts';

class FakeElement {
	readonly nodeType = 1;
	childNodes: FakeElement[] = [];
	parentElement: FakeElement | null = null;
	constructor(readonly name: string) {}
	append(...children: FakeElement[]) {
		for (const child of children) {
			child.parentElement = this;
			this.childNodes.push(child);
		}
		return this;
	}
}

function table(keys: number[]) {
	const tbody = new FakeElement('tbody');
	for (const key of keys)
		tbody.append(
			new FakeElement(`tr${key}`).append(
				new FakeElement(`td-a${key}`),
				new FakeElement(`td-b${key}`).append(
					new FakeElement(`a${key}`).append(new FakeElement(`span${key}`)),
				),
				new FakeElement(`td-c${key}`).append(new FakeElement(`remove${key}`)),
			),
		);
	new FakeElement('table').append(tbody);
	return tbody;
}

function repeat(id: string, parentHostNodeId: string, collectionGraphNodeId: string) {
	return {
		id,
		itemName: 'row',
		keyPath: ['id'],
		collectionGraphNodeId,
		collectionPath: [],
		parentHostNodeId,
		rowStartOffset: 0,
		rowEvents: [
			{ eventName: 'click', hostPath: [1, 0] },
			{ eventName: 'click', hostPath: [2, 0] },
		],
	};
}

function match(
	target: FakeElement,
	repeats: ReturnType<typeof repeat>[],
	hosts: Record<string, FakeElement>,
	collections: Record<string, unknown[]>,
) {
	return findKeyedRepeatRowEventMatch({
		graph: { read: (graphNodeId: string) => collections[graphNodeId] } as never,
		view: { keyedRepeats: repeats } as never,
		elementsByHostId: new Map(Object.entries(hosts)) as never,
		target: target as never,
		eventName: 'click',
		materializeHost: () => undefined,
	});
}

const items = (keys: number[]) => keys.map((id) => ({ id }));

test('a click inside a handler element answers that element, its row key and its handler', () => {
	const tbody = table([4, 7, 9]);
	const span = tbody.childNodes[1]!.childNodes[1]!.childNodes[0]!.childNodes[0]!;
	const found = match(span, [repeat('r', 'p', 'rows')], { p: tbody }, { rows: items([4, 7, 9]) });
	expect(found?.element).toBe(span.parentElement);
	expect(found?.match.rowKey).toBe(7);
	expect(found?.match.rowEvent).toEqual({ eventName: 'click', hostPath: [1, 0] });
	expect(found?.match.rowRoot).toBe(tbody.childNodes[1]);

	const remove = tbody.childNodes[2]!.childNodes[2]!.childNodes[0]!;
	expect(
		match(remove, [repeat('r', 'p', 'rows')], { p: tbody }, { rows: items([4, 7, 9]) })?.match
			.rowEvent.hostPath,
	).toEqual([2, 0]);
});

test('a click on a row cell no handler owns answers nothing', () => {
	const tbody = table([1, 2]);
	expect(
		match(tbody.childNodes[0]!.childNodes[0]!, [repeat('r', 'p', 'rows')], { p: tbody }, {
			rows: items([1, 2]),
		}),
	).toBe(undefined);
});

test('the handler nearest the target wins across nested lists', () => {
	const outer = table([1]);
	const inner = table([5, 6]);
	outer.childNodes[0]!.childNodes[1]!.childNodes[0]!.append(inner.parentElement!);
	const innerSpan = inner.childNodes[1]!.childNodes[1]!.childNodes[0]!.childNodes[0]!;
	const found = match(
		innerSpan,
		[repeat('outer', 'po', 'outerRows'), repeat('inner', 'pi', 'innerRows')],
		{ po: outer, pi: inner },
		{ outerRows: items([1]), innerRows: items([5, 6]) },
	);
	expect(found?.match.repeat.id).toBe('inner');
	expect(found?.match.rowKey).toBe(6);
});

test('duplicate keys fail the dispatch even when the click is outside the list', () => {
	const tbody = table([1, 1]);
	const outside = new FakeElement('button');
	expect(() =>
		match(outside, [repeat('r', 'p', 'rows')], { p: tbody }, { rows: items([1, 1]) }),
	).toThrow(/MARKLESS_REPEAT_KEY_DUPLICATE/);
});
