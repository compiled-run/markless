import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { showcaseApps } from './apps.data.ts';
import { cardInkFiles, movedShare } from './ink-files.ts';
import { appView, cards, progressLine } from './view.ts';
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

	it('stamps only a finished app, and fills the bar only once a page has moved', () => {
		expect(cardInkFiles(0, 'a', 1, true).stamp).toMatch(/stamp\.svg$/);
		expect(cardInkFiles(0, 'a', 1, false).stamp).toBeNull();
		expect(cardInkFiles(0, 'a', 0, false).barFill).toBeNull();
		for (const [at, card] of cards.entries()) expect(card.ink.stamp !== null).toBe(showcaseApps[at]!.status === 'done');
	});

	it('hides the JavaScript figure when the home page was not measured, rather than showing 0 kB', () => {
		const unmeasured = { ...sample, headline: null };
		expect(appView(unmeasured).headline).toBeNull();
		for (const card of cards) expect(card.before === null || card.before !== '0.0 kB' || card.after !== '0.0 kB').toBe(true);
		expect(grid).toContain('@if (card.before && card.after)');
	});

	it('keeps the progress as real text, the drawings hidden from screen readers, and no drawing code in the component', () => {
		expect(grid).toContain('<span class="progress-text">{card.progress}</span>');
		for (const ink of grid.match(/<span class="ink[^>]*>/g) ?? []) expect(ink.includes('aria-hidden="true"') || /bar-(fill|hatch|ink)/.test(ink)).toBe(true);
		expect(grid).toContain('<span class="bar" aria-hidden="true">');
		expect(grid).not.toContain('In progress');
		expect(grid).not.toMatch(/figures\/ink|showcase-ink/);
	});
});
