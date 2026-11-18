import { describe, expect, it } from 'vitest';
import { flatNav } from '../../nav.ts';
import { ENTRIES, LETTERS } from './glossary-entries.ts';
import { ICONS } from './ink-icons.ts';
import { GLOSSARY, glossaryHref } from './term-glossary.ts';

const ids = new Set(ENTRIES.map((entry) => entry.id));
const pages = new Set<string>(flatNav.map((entry) => entry.href));

describe('glossary index', () => {
	it('gives every word one card, in alphabetical order, with a unique id', () => {
		expect(ids.size).toBe(ENTRIES.length);
		const terms = ENTRIES.map((entry) => entry.term.toLowerCase());
		expect(terms).toEqual([...terms].sort());
	});

	it('has a card for every word a term tooltip explains, so the tooltip link lands', () => {
		for (const word of Object.keys(GLOSSARY)) expect(ids.has(glossaryHref(word).split('#')[1]!)).toBe(true);
	});

	it('links each card to real pages, and draws a real mark or sketch', () => {
		for (const entry of ENTRIES) {
			expect(entry.usedIn.length).toBeGreaterThan(0);
			for (const page of entry.usedIn) expect(pages.has(page.href)).toBe(true);
			expect(entry.icon in ICONS).toBe(true);
		}
	});

	it('points every letter of the rail at the first card that starts with it', () => {
		for (const { letter, to } of LETTERS) {
			const first = ENTRIES.find((entry) => entry.term[0]!.toUpperCase() === letter);
			expect(to).toBe(first?.id ?? '');
		}
	});
});
