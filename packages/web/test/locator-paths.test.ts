import { expect, test } from 'vitest';
import { decodeLocatorPaths } from '../src/fns/served-census-repair.ts';
import { servedElementTree, servedLocatorPaths } from '../src/locator-paths.ts';
import {
	createSyncPolicyTable,
	withArmEventHostMarks,
	withEventHostMarks,
} from '../src/render-to-string.ts';

function expectedEntries(html: string, indexes: ReadonlyArray<number>) {
	const { elements, childCounts } = servedElementTree(html);
	const chain = new Set<number>();
	for (const index of indexes)
		for (let at = index; at > 0; at = elements[at]!.parent) chain.add(at);
	return [...chain]
		.sort((left, right) => left - right)
		.map((index) => {
			const { tag, parent, child } = elements[index]!;
			return { index, parent, siblings: childCounts[parent]!, child, tag };
		});
}

test('the served paths decode back to every located element and ancestor', () => {
	const html =
		'<header><nav><a href="/">x</a><a href="/b">y</a></nav></header>' +
		'<main><section><p>one</p><p>two</p><button>go</button></section><svg><linearGradient></linearGradient></svg></main>';
	const value = servedLocatorPaths(html, [{ index: 3 }, { index: 9 }, { index: 11 }])!;
	expect(value).not.toMatch(/;/);
	const decoded = decodeLocatorPaths(value);
	expect(decoded.count).toBe(servedElementTree(html).elements.length);
	expect(decoded.entries).toEqual(expectedEntries(html, [3, 9, 11]));
});

test('indexes, places and counts past one digit carry into more digits', () => {
	const rows = Array.from({ length: 1500 }, (_, at) => `<li>${at}</li>`).join('');
	const html = `<ul>${rows}</ul><footer><span>end</span></footer>`;
	const last = servedElementTree(html).elements.length - 1;
	const value = servedLocatorPaths(html, [{ index: 40 }, { index: 1400 }, { index: last }])!;
	expect(decodeLocatorPaths(value).entries).toEqual(expectedEntries(html, [40, 1400, last]));
});

test('each page-level comment anchor records the index the next element takes', () => {
	const html =
		'<p>a</p><!--markless:async:b0--><form><input></form><!--markless:arm-branch:x--><b></b>' +
		'<template><!--inside--><i></i></template><!--/markless:async:b0--><script>"<!--no-->"</script><!--tail-->';
	expect(servedElementTree(html).commentElementIndexes).toEqual([2, 6, 7]);
});

test('each event host is marked with its record and policy, in the shell, a repeat scope and an arm', () => {
	const html =
		'<h1>t</h1><form><input></form><ul></ul><!--markless:async:b0--><form><button>go</button></form><!--/markless:async:b0-->';
	const always = { when: { type: 'constant-truthy', value: true }, actions: ['preventDefault'] };
	const onEnter = {
		when: { type: 'event-equals', field: 'key', value: 'Enter' },
		actions: ['preventDefault'],
	};
	const event = (hostNodeId: string, eventName: string, syncPolicy?: unknown) => ({
		hostNodeId,
		eventName,
		symbolIds: [],
		...(syncPolicy ? { syncPolicy } : {}),
	});
	const view = {
		locators: [
			{ hostNodeId: 'h0', index: 2 },
			{ hostNodeId: 'h9', index: 1 },
			{ hostNodeId: 'list', index: 4 },
		],
		events: [
			event('h0', 'submit', always),
			event('h9', 'keydown', onEnter),
			event('h9', 'click'),
		],
		keyedRepeats: [{ parentHostNodeId: 'list', rowEvents: [event('row', 'click')] }],
		asyncBoundaries: [
			{
				armRecords: {
					locators: [{ hostNodeId: 'a0', index: 0 }],
					events: [event('a0', 'submit', always), event('a0', 'click')],
				},
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
			},
		],
	} as never;
	const table = createSyncPolicyTable();
	expect(withEventHostMarks(view, html, table)).toBe(
		'<h1 m:on="keydown:1!0;click:2">t</h1><form m:on="submit:0!p"><input></form><ul m:on="click"></ul><!--markless:async:b0--><form m:on="submit!p"><button>go</button></form><!--/markless:async:b0-->',
	);
	expect(table.policies).toEqual([onEnter]);
	expect(
		withArmEventHostMarks(
			{
				locators: [{ hostNodeId: 'a0', index: 1 }],
				events: [event('a0', 'submit', always)],
			} as never,
			'<p>x</p><form><b></b></form>',
		),
	).toBe('<p>x</p><form m:on="submit:0"><b></b></form>');
});
