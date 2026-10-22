import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { showcaseApps } from './apps.data.ts';
import { cardInk } from './card-ink.ts';
import { cards, movedShare, progressLine } from './view.ts';
import type { ShowcaseApp } from './types.ts';

const grid = readFileSync(new URL('./showcase-grid.tsrx', import.meta.url), 'utf8');
const sample = showcaseApps[0]!;
const counted = (ported: number, total: number): ShowcaseApp => ({ ...sample, coverage: { ...sample.coverage!, ported, total } });

describe('the showcase cards', () => {
	it('says how many pages moved in words, and draws the same share', () => {
		expect(progressLine(counted(212, 498))).toBe('212 of 498 pages moved');
		expect(movedShare(counted(212, 498))).toBeCloseTo(212 / 498);
		expect(progressLine({ ...sample, coverage: null })).toBe('Pages not counted yet');
		expect(movedShare({ ...sample, coverage: null })).toBe(0);
		for (const card of cards) expect(card.progress).toMatch(/^(\d+ of \d+ pages moved|Pages not counted yet)$/);
	});

	it('stamps only a finished app', () => {
		expect(cardInk('a', 1, true).stamp?.ink).toMatch(/^M/);
		expect(cardInk('a', 1, false).stamp).toBeNull();
		for (const [at, card] of cards.entries()) expect(card.ink.stamp !== null).toBe(showcaseApps[at]!.status === 'done');
	});

	it('fills the bar in proportion and leaves it empty when nothing moved', () => {
		const right = (d: string) => Math.max(...[...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1])));
		expect(cardInk('a', 0, false).bar.fill).toBe('');
		expect(right(cardInk('a', 0.25, false).bar.fill)).toBeLessThan(right(cardInk('a', 0.75, false).bar.fill));
		expect(right(cardInk('a', 0.25, false).bar.fill)).toBeLessThan(80);
	});

	it('draws the same ink for the same app every time', () => {
		expect(cardInk('docusaurus', 0.4, false)).toEqual(cardInk('docusaurus', 0.4, false));
		expect(cardInk('docusaurus', 0.4, false).frame.ink).not.toBe(cardInk('htmx-org', 0.4, false).frame.ink);
	});

	it('keeps the progress as real text and the drawings hidden from screen readers', () => {
		expect(grid).toContain('<span class="progress-text">{card.progress}</span>');
		for (const svg of grid.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
		expect(grid).not.toContain('In progress');
	});
});
