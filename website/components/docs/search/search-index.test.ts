import { describe, expect, it } from 'vitest';
import { searchDocs, searchRows, snippetOf, type SearchIndex } from './search-index.ts';

const index: SearchIndex = {
	pages: [
		{
			href: '/concepts/state',
			title: 'State is a variable the page watches',
			section: 'Core concepts',
			parts: [
				['', '', 'Wrap the starting value in state(), and the page keeps up.'],
				['follow-the-wire', 'Follow the wire', 'It is still a let, read as cart and changed with cart++.'],
			],
		},
		{
			href: '/router/links',
			title: 'Links',
			section: 'Router',
			parts: [['typed-params', 'Typed params', 'A link to a route pattern passes its params, and the build checks the state of both.']],
		},
	],
};

describe('searchDocs', () => {
	it('groups hits by page, best page first, each hit pointing at its heading anchor', () => {
		const groups = searchDocs(index, 'state');
		expect(groups.map((group) => group.href)).toEqual(['/concepts/state', '/router/links']);
		expect(groups[0]!.hits.map((hit) => hit.value)).toContain('/concepts/state');
		expect(groups[1]!.hits[0]!.value).toBe('/router/links#typed-params');
	});

	it('needs every word of the query somewhere in the title, the heading or the text under it', () => {
		expect(searchDocs(index, 'wire cart').flatMap((group) => group.hits.map((hit) => hit.value))).toEqual(['/concepts/state#follow-the-wire']);
		expect(searchDocs(index, 'wire params')).toEqual([]);
	});

	it('flattens into rows that mark the first row of each page and change key with the query', () => {
		const rows = searchRows(index, 'state');
		expect(rows.filter((row) => row.first).map((row) => row.section)).toEqual(['Core concepts', 'Router']);
		expect(rows[0]!.first).toBe(true);
		expect(rows[0]!.key).not.toBe(searchRows(index, 'state page')[0]?.key);
	});

	it('answers nothing for an empty query or before the index has loaded', () => {
		expect(searchDocs(index, '   ')).toEqual([]);
		expect(searchDocs(undefined, 'state')).toEqual([]);
	});
});

describe('snippetOf', () => {
	it('splits the text at the first word searched for, case kept', () => {
		expect(snippetOf('Wrap the starting value in State(), and the page keeps up.', ['page', 'state'])).toEqual({
			before: 'Wrap the starting value in ',
			match: 'State',
			after: '(), and the page keeps up.',
		});
	});

	it('adds an ellipsis where it cut text off', () => {
		const long = 'word '.repeat(80) + 'needle ' + 'word '.repeat(80);
		const { before, match, after } = snippetOf(long, ['needle']);
		expect(before.startsWith('…')).toBe(true);
		expect(match).toBe('needle');
		expect(after.endsWith('…')).toBe(true);
		expect((before + match + after).length).toBeLessThan(160);
	});
});
