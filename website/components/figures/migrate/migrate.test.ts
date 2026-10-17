import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buttonLabel, describe as say, move, NOTE, PAGES, pageAt, TOUR } from './model.ts';
import { drawing, ROWS } from './migrate.ts';

const scene = drawing();
const piece = readFileSync(new URL('./migrate-anatomy.tsrx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../../pages/start/migrate.mdx', import.meta.url), 'utf8');

describe('the migrate figure', () => {
	it('moves one page per press, the rightmost first, and starts over after the last', () => {
		expect(PAGES.map((p) => p.path)).toEqual(['/', '/pricing', '/account', '/blog']);
		expect(PAGES.map((p) => p.rank)).toEqual([3, 2, 1, 0]);
		expect([0, 1, 2, 3, 4].map(move)).toEqual([1, 2, 3, 4, 0]);
		expect([0, 3, 4].map(buttonLabel)).toEqual(['Move a page', 'Move a page', 'Start over']);
		expect(PAGES.filter((p) => p.miss).map((p) => p.path)).toEqual(['/account']);
		expect(pageAt(1).path).toBe('/account');
		expect(TOUR.filter((s) => s === 'move')).toHaveLength(PAGES.length);
	});

	it('speaks one plain sentence per change, naming the page, the catch and the count', () => {
		expect(say(0)).toBe('Every page of beanshop.dev goes to the old app. Press to move the next page.');
		expect(say(0, true)).toBe('Every page goes to the old app again.');
		expect(say(1)).toBe('The new /blog matched the old one part for part, so the front door now sends /blog to the new app. 1 of 4 pages now go to the new app.');
		expect(say(2)).toContain('missing its settings button');
		expect(say(2)).toContain('2 of 4 pages');
	});

	it('draws a tile on each sheet, a wire to each sheet and both cards for every page, and the missing part only on the account page', () => {
		expect(scene.pages).toHaveLength(PAGES.length);
		for (const p of scene.pages) {
			expect(p.oldTile.ink.length).toBeGreaterThan(300);
			expect(p.newTile.ink.length).toBeGreaterThan(300);
			expect(p.oldWire.ink.length).toBeGreaterThan(400);
			expect(p.newWire.length).toBeGreaterThan(50);
			expect(p.oldCard.ink.length).toBeGreaterThan(300);
		}
		expect(scene.pages.filter((p) => p.newCard.extra !== '').map((p) => PAGES[p.key]!.path)).toEqual(['/account']);
		expect(scene.pages.filter((p) => p.late === 'yes').map((p) => p.key)).toEqual([2]);
		expect(scene.marks).toHaveLength(ROWS.length);
		expect(scene.door.sockets).toHaveLength(PAGES.length);
	});

	it('has one margin note, no readout, keyboard, reduced motion and an offscreen-paused tour', () => {
		expect(piece.match(/class="hand"/g)).toHaveLength(1);
		expect(piece).toContain('{NOTE}');
		expect(NOTE).toBe('LIVE ONLY WHEN IT MATCHES');
		expect(piece.match(/aria-live="polite"/g)).toHaveLength(1);
		expect(piece.match(/<button/g)).toHaveLength(1);
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('IntersectionObserver');
		expect(piece).toContain('@media (prefers-reduced-motion: reduce)');
		expect(piece).toContain("import { art } from './migrate.art.ts';");
		expect(piece).not.toMatch(/@for \([^)]*computed/);
	});

	it('is placed on the migrate page', () => {
		expect(page).toContain("import MigrateAnatomy from '../../components/figures/migrate/migrate-anatomy.tsrx';");
		expect(page).toContain('<MigrateAnatomy />');
	});

	it('inks the same way every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(scene));
		for (const sheet of [scene.old, scene.fresh, scene.door]) {
			expect(sheet.ink.length).toBeGreaterThan(500);
			expect(sheet.desk.length).toBeGreaterThan(200);
		}
		expect(scene.parcels.old.tone.length).toBeGreaterThan(scene.parcels.fresh.tone.length);
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by migrate.test.ts from migrate.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './migrate.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(scene, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./migrate.art.ts');
	});
});
