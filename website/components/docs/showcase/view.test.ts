import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { showcaseApps } from './apps.data.ts';
import { pileCounts, pileHeight, PILES } from './sketch.ts';
import { appView, cards, progressLine } from './view.ts';
import type { ShowcaseApp } from './types.ts';

const grid = readFileSync(new URL('./showcase-grid.tsrx', import.meta.url), 'utf8');
const sample = showcaseApps[0]!;
const counted = (ported: number, total: number): ShowcaseApp => ({ ...sample, coverage: { ...sample.coverage!, ported, total } });

describe('the showcase cards', () => {
	it('says how many pages moved in words', () => {
		expect(progressLine(counted(212, 498))).toBe('212 of 498 pages moved');
		expect(progressLine({ ...sample, coverage: null })).toBe('Pages not counted yet');
		for (const card of cards) expect(card.progress).toMatch(/^(\d+ of \d+ pages moved|Pages not counted yet)$/);
	});

	it('piles the pages in proportion, never taller than the cap, and at least one sheet when a pile holds any', () => {
		expect(pileCounts(counted(10, 491))).toEqual({ old: 481, moved: 10 });
		expect(pileHeight(481, 491)).toBeCloseTo((PILES.max * 481) / 491);
		expect(pileHeight(491, 491)).toBe(PILES.max);
		expect(pileHeight(1, 10000)).toBeGreaterThan(2);
		expect(pileHeight(0, 491)).toBe(0);
		expect(pileCounts({ ...sample, coverage: null })).toBeNull();
	});

	it('hides the JavaScript figure when the home page was not measured, rather than showing 0 kB', () => {
		expect(appView({ ...sample, headline: null }).headline).toBeNull();
		for (const card of cards) expect(card.before === '0.0 kB' && card.after === '0.0 kB').toBe(false);
		expect(grid).toContain('@if (card.before && card.after)');
	});

	it('points at the Markless port when the front door and the original are no longer hosted', () => {
		const retired = appView({ ...sample, links: { ...sample.links, frontDoor: null, old: null, report: null } });
		const ids = retired.links.map((link) => link.id);
		expect(ids).not.toContain('front');
		expect(ids).not.toContain('old');
		expect(ids).not.toContain('report');
		expect(retired.links.find((link) => link.main)?.href).toBe(sample.links.markless);
		expect(retired.hostName).toBe(new URL(sample.links.markless).host);
	});

	it('keeps the progress as real text and loads the drawing as a file, with no drawing code in the component', () => {
		expect(grid).toContain('<span class="progress">{card.progress}</span>');
		expect(grid).toContain('aria-label={card.alt}');
		expect(grid).not.toMatch(/figures\/ink|showcase-sketch/);
	});
});
