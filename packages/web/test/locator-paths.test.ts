import { expect, test } from 'vitest';
import { decodeLocatorPaths } from '../src/fns/served-census-repair.ts';
import { servedElementTree, servedLocatorPaths } from '../src/locator-paths.ts';

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
