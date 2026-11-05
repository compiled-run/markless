import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARRIVED, describeTicker, HEADING, PENDING, SLOW_MS, TICKER_TOUR } from './model.ts';
import { drawing } from './ticker.ts';

const tickerArt = drawing();

const page = readFileSync(new URL('../../../pages/router/data.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./ticker-anatomy.tsrx', import.meta.url), 'utf8');

describe('one tape, two parts', () => {
	it('prints the heading and the pencilled wait first, then the orders on the same tape', () => {
		expect([HEADING, PENDING, ARRIVED]).toEqual(['Orders', 'Loading…', '3 orders']);
		expect(describeTicker(1, false)).toContain('Loading… in pencil');
		expect(describeTicker(2, false)).toContain('same tape carried on');
		expect(describeTicker(2, true)).toContain('will not tear');
		expect(describeTicker(0, false)).toBe('');
		expect(SLOW_MS).toBeGreaterThan(1000);
		expect(TICKER_TOUR[0]).toBe('print');
	});

	it('draws two objects, and only the tape moves', () => {
		expect(Object.keys(tickerArt)).toEqual(['width', 'height', 'desk', 'machine', 'tape']);
		expect(piece.match(/<text /g)).toHaveLength(3);
		expect(piece).toContain(".scene[data-step='1'] .tape");
		expect(piece).not.toMatch(/\.machine \{[^}]*transform/);
	});

	it('hides what is still inside the machine behind its slot', () => {
		expect(tickerArt.tape.clip).toMatch(/^clip-path: polygon\(.+\) view-box$/);
		expect(tickerArt.tape.moves).toContain('--first-y');
	});

	it('is a toy: hover, keys, and a tape that stretches but never tears', () => {
		expect(piece).toContain('.tape:hover .lift');
		expect(piece).toContain('.machine:hover .button');
		expect(piece).toContain("event.key === 'ArrowDown'");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain("[data-tug='yes'] .tape");
	});

	it('uses no wires, cords, parcels or blocks, and keeps reduced motion and a live region', () => {
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile/i);
		expect(piece).not.toMatch(/@for|@if/);
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part and draws the same scene every time', () => {
		expect(tickerArt.machine.ink.length).toBeGreaterThan(300);
		expect(tickerArt.tape.ink.length).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(tickerArt));
	});

	it('is on the Page data page under its own heading', () => {
		expect(page).toContain("import TickerAnatomy from '../../components/figures/ticker/ticker-anatomy.tsrx';");
		expect(page.indexOf('## One response, in two parts')).toBeLessThan(page.indexOf('<TickerAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by ticker.test.ts from ticker.ts. Refresh with the figure test's -u flag.
import type { drawing } from './ticker.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(tickerArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./ticker.art.ts');
	});
});
