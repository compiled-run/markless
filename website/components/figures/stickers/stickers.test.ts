import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEAD, CHILD, cycle, describeBack, describeDial, describePlace, flip, MAX, NAMES, nameOf, PROP, PROP_SOURCE, START, TAG, turn } from './model.ts';
import { drawing, HOMES, SPOTS } from './stickers.ts';

const stickerArt = drawing();

const page = readFileSync(new URL('../../../pages/build/components.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./stickers-anatomy.tsrx', import.meta.url), 'utf8');

describe('the sticker sheet and the page', () => {
	it('places an Avatar per sticker, and every placed one reads the page name live', () => {
		expect(CHILD).toBe('Avatar');
		expect(TAG).toBe('<Avatar>');
		expect(PROP).toBe('name');
		expect(PROP_SOURCE).toBe('name={name}');
		expect(NAMES).toEqual(['Ada', 'Grace', 'Linus']);
		expect(describePlace(1, 1)).toBe("Placed an Avatar. It shows Grace, read from the page's name.");
		expect(describePlace(3, 2)).toBe("Placed an Avatar. All 3 show Linus, read from the page's name.");
		expect(describeDial(1, 2)).toContain('none was placed again');
		expect(describeBack(1)).toContain('1 left on the page');
		expect(BEAD).toContain('only the page that passes it can');
		expect(turn(MAX, 1)).toBe(MAX);
		expect(turn(0, -1)).toBe(0);
		expect(cycle(MAX)).toBe(0);
		expect(nameOf(START)).toBe('Ada');
		expect(flip('odd')).toBe('even');
	});

	it('has four sticker slots that sit on the sheet and drop onto the page', () => {
		expect(HOMES).toHaveLength(4);
		expect(SPOTS).toHaveLength(4);
		expect(piece.match(/class="sticker"/g)).toHaveLength(4);
		expect(piece.match(/>\{name\}<\/text>/g)).toHaveLength(4);
		for (const [x, y] of SPOTS) {
			const [x0, y0, x1, y1] = stickerArt.page.box;
			expect(x > x0 && x < x1 && y > y0 && y < y1).toBe(true);
		}
	});

	it('keeps the words to the component name, name and the three names', () => {
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(new Set(words)).toEqual(new Set(['{TAG}', '{name}', '{PROP}', '{PROP_SOURCE}', '{NAMES[0]}', '{NAMES[1]}', '{NAMES[2]}']));
		expect(piece).not.toMatch(/\bbags\b|counter/);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|@for|@if/i);
	});

	it('plays: hover lifts a corner, drags, selector keys, and ink that beads off', () => {
		expect(piece).toContain('.sticker:hover .curl');
		expect(piece).toContain('.scene:has(.sticker[data-on]:hover) .tip');
		expect(piece.match(/class="tip"/g)).toHaveLength(1);
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'ArrowUp'");
		expect(piece).toContain("event.key === 'Delete'");
		expect(piece).toContain('@keyframes roll-a');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
		expect(piece).toContain('if (!seen || touched) return;');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(stickerArt.sheet.ink.length).toBeGreaterThan(300);
		expect(stickerArt.sticker.ink.length).toBeGreaterThan(300);
		expect(stickerArt.dial.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(stickerArt));
	});

	it('is on the Components page under its own heading', () => {
		expect(page).toContain("import StickersAnatomy from '../../components/figures/stickers/stickers-anatomy.tsrx';");
		expect(page.indexOf('## A prop is a live read')).toBeLessThan(page.indexOf('<StickersAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by stickers.test.ts from stickers.ts. Refresh with the figure test's -u flag.
import type { drawing } from './stickers.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(stickerArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./stickers.art.ts');
	});
});
