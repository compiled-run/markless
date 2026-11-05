import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeDough, DOUGH_TOUR, flip, next, ORDER, previous, TINS } from './model.ts';
import { drawing } from './dough.ts';

const doughArt = drawing();

const page = readFileSync(new URL('../../../pages/router/deploying.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./dough-anatomy.tsrx', import.meta.url), 'utf8');

describe('one dough, one tin', () => {
	it('cycles the tin through the three hosts and says the dough never changes', () => {
		expect(ORDER).toEqual(['node', 'vercel', 'cloudflare']);
		expect(next('cloudflare')).toBe('node');
		expect(previous('node')).toBe('cloudflare');
		expect(describeDough('vercel', false)).toContain('The same dough came out as');
		expect(describeDough('node', true)).toContain('the same dough');
		expect(TINS.vercel.out).toContain('.vercel/output/');
		expect(DOUGH_TOUR[0]).toBe('switch');
		expect(flip('odd')).toBe('even');
	});

	it('draws one dough ball and one tin at a time, each tin a different shape', () => {
		expect(piece.match(/class="ball"/g)).toHaveLength(1);
		expect(piece.match(/class="tin (node|vercel|cloudflare)"/g)).toHaveLength(3);
		expect(piece).toContain(".scene[data-preset='node'] .node");
		expect(new Set(Object.values(doughArt.tins).map((t) => t.paper)).size).toBe(3);
	});

	it('keeps the words in the drawing to the tin label', () => {
		const texts = [...piece.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
		expect(texts).toEqual(['{TINS.node.name}', '{TINS.vercel.name}', '{TINS.cloudflare.name}']);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile/i);
	});

	it('is a toy: press or arrow keys switch the tin, the dough can be dragged in or poked, hover lifts both', () => {
		expect(piece).toContain("event.key === 'ArrowRight'");
		expect(piece).toContain('setPointerCapture(event.pointerId)');
		expect(piece).toContain('.frame:has(.dough-hit:hover) .ball-body');
		expect(piece).toContain('.frame:has(.tin-hit:hover) .tin');
		expect(piece).toContain('animation: var(--squish)');
	});

	it('stops its tour on touch, resets on Escape, snaps under reduced motion and speaks each change', () => {
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/@for|@if/);
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(doughArt.ball.ink.length).toBeGreaterThan(200);
		expect(doughArt.tins.cloudflare.loafInk.length).toBeGreaterThan(200);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(doughArt));
	});

	it('is on the Deploying page under its own heading', () => {
		expect(page).toContain("import DoughAnatomy from '../../components/figures/dough/dough-anatomy.tsrx';");
		expect(page.indexOf('## Pick another host with a preset')).toBeLessThan(page.indexOf('<DoughAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by dough.test.ts from dough.ts. Refresh with the figure test's -u flag.
import type { drawing } from './dough.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(doughArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./dough.art.ts');
	});
});
