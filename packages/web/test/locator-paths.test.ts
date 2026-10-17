import { expect, test } from 'vitest';
import { decodeLocatorPaths } from '../src/fns/served-census-repair.ts';
import { servedElementTree, servedLocatorPaths } from '../src/locator-paths.ts';
import { withArmSyncPolicyHostMarks, withSyncPolicyHostMarks } from '../src/render-to-string.ts';

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

test('each element whose event carries a sync policy is marked with its record, in the shell and in an arm', () => {
	const html =
		'<h1>t</h1><form><input></form><!--markless:async:b0--><form><button>go</button></form><!--/markless:async:b0-->';
	const policy = { when: { type: 'constant-truthy', value: true }, actions: ['preventDefault'] };
	const submit = (hostNodeId: string, syncPolicy?: unknown) => ({
		hostNodeId,
		eventName: 'submit',
		symbolIds: [],
		...(syncPolicy ? { syncPolicy } : {}),
	});
	const view = {
		locators: [
			{ hostNodeId: 'h0', index: 2 },
			{ hostNodeId: 'h9', index: 1 },
		],
		events: [submit('h0', policy), submit('h9')],
		asyncBoundaries: [
			{
				armRecords: { locators: [{ hostNodeId: 'a0', index: 0 }], events: [submit('a0', policy)] },
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
			},
		],
	} as never;
	expect(withSyncPolicyHostMarks(view, html)).toBe(
		'<h1>t</h1><form data-markless-sync="h0"><input></form><!--markless:async:b0--><form data-markless-sync="a0"><button>go</button></form><!--/markless:async:b0-->',
	);
	expect(
		withArmSyncPolicyHostMarks(
			{ locators: [{ hostNodeId: 'a0', index: 1 }], events: [submit('a0', policy)] } as never,
			'<p>x</p><form><b></b></form>',
		),
	).toBe('<p>x</p><form data-markless-sync="a0"><b></b></form>');
});
