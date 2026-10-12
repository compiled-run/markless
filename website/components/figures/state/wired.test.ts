import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, describe as say, describeUnplugged, fill, flip, JAR_CAP, SHOP, START, TOUR } from './model.ts';
import { drawing } from './wired.ts';

const wiredArt = drawing();

const page = readFileSync(new URL('../../../pages/concepts/state.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./state-anatomy.tsrx', import.meta.url), 'utf8');

describe('the wired shop page', () => {
	it('starts with three bags and adds one per press, wrapping after 99', () => {
		expect(START).toBe(3);
		expect(add(3)).toBe(4);
		expect(add(99)).toBe(0);
	});

	it('flips the beat on every press so the press animations replay', () => {
		expect(flip('rest')).toBe('odd');
		expect(flip('odd')).toBe('even');
		expect(flip('even')).toBe('odd');
	});

	it('crosses out one previous number per wired spot, no more', () => {
		expect(piece.match(/class="crossed/g)).toHaveLength(2);
	});

	it('wires exactly two spots to the jar, both pulsed on each press', () => {
		expect(piece.match(/class="digit now/g)).toHaveLength(2);
		expect(piece.match(/class="pulse to-page"/g)).toHaveLength(2);
	});

	it('keeps the live number inline, in the same text run as its label row', () => {
		const row = piece.slice(piece.indexOf('transform={art.page.rowMatrix}'), piece.indexOf('</g>\n\t\t\t\t</g>', piece.indexOf('transform={art.page.rowMatrix}')));
		expect(row).toContain('In your cart:');
		expect(row).toMatch(/<text class="digit now" x=\{SLOTS\[1\]\}>\s*\{cart\}\s*<tspan/);
	});

	it('speaks a plain sentence after each change', () => {
		expect(say(4, true)).toBe('Added a bag. The cart badge and the cart line now show 4.');
		expect(say(3, false)).toBe('The cart badge and the cart line now show 3.');
		expect(say(0, true)).toBe('The cart badge and the cart line now show 0.');
	});

	it('tours a couple of presses and resets', () => {
		expect(TOUR.filter((beat) => beat === 'add')).toHaveLength(2);
		expect(TOUR.at(-1)).toBe('reset');
	});

	it('never wires the shop name, product or price: nothing there reads the count', () => {
		const once = piece.slice(piece.indexOf('class="once"'), piece.indexOf('</g>', piece.indexOf('class="once"')));
		expect(once.length).toBeGreaterThan(0);
		expect(once).not.toMatch(/(?<![.\w])cart\b|newest|beat/);
		expect(once).toContain('{SHOP}');
		expect(SHOP).toBe('Beanshop');
		expect(once).toContain('{PRICE}');
	});

	it('shows no visible readout outside the sheet besides the margin note', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain('WIRED BEFORE THE PAGE RAN');
	});

	it('is on the State page', () => {
		expect(page).toContain("import StateAnatomy from '../../components/figures/state/state-anatomy.tsrx';");
		expect(page).toContain('<StateAnatomy />');
	});

	it('inks every part and fits beans enough for a long tour', () => {
		expect(wiredArt.sheet.ink.length).toBeGreaterThan(500);
		expect(wiredArt.jar.glass.ink.length).toBeGreaterThan(500);
		expect(wiredArt.wires.main.length).toBeGreaterThan(100);
		expect(wiredArt.wires.branch.length).toBeGreaterThan(20);
		expect(wiredArt.wires.toLine.length).toBeGreaterThan(wiredArt.wires.branch.length);
		expect(wiredArt.wires.thin.length).toBeGreaterThan(100);
		expect(wiredArt.beans.length).toBeGreaterThanOrEqual(20);
		expect(wiredArt.sheet.pencil.length).toBeGreaterThan(100);
	});

	it('unplugged: the jar fills only when pressed, to a drawable cap, while the page keeps saying 0', () => {
		expect(JAR_CAP).toBeLessThan(wiredArt.beans.length);
		expect(fill(0)).toBe(1);
		expect(fill(JAR_CAP)).toBe(0);
		expect(describeUnplugged(3, true)).toBe('Added a bag. The jar holds 3, but the page still shows 0.');
		expect(describeUnplugged(0, false)).toBe('The jar is empty, and the page still shows 0.');
		expect(piece).toContain("if (!plugged || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;");
	});

	it('unplugged: only the jar pulse runs, and the note says NOT WIRED', () => {
		const end = piece.indexOf('<path class="pencil" d={art.jar.pencil} />');
		const loose = piece.slice(piece.lastIndexOf('} @else {', end), end);
		expect(loose).toContain('art.loose.clips.badge.ink');
		expect(loose).not.toContain('to-page');
		expect(piece).toContain("'NOT WIRED'");
		expect(piece).toMatch(/data-wired=\{plugged \? 'yes' : 'no'\}/);
		expect(page).toContain('<StateAnatomy wired={false} />');
		expect(page.indexOf('<StateAnatomy wired={false} />')).toBeLessThan(page.indexOf('<StateAnatomy />'));
	});

	it('inks the loose wires and clips as fully as the wired ones', () => {
		expect(wiredArt.loose.main.ink.length).toBeGreaterThan(100);
		expect(wiredArt.loose.branch.ink.length).toBeGreaterThan(20);
		expect(wiredArt.loose.main.shadowHatch.length).toBeGreaterThan(20);
		expect(wiredArt.loose.clips.badge.ink.length).toBeGreaterThan(100);
		expect(wiredArt.loose.clips.line.cast.length).toBeGreaterThan(20);
	});

	it('draws the same scene every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(wiredArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by wired.test.ts from wired.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './wired.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(wiredArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./wired.art.ts');
	});
});
