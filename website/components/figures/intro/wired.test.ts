import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, CAP, describe as say, flip, PRODUCT, SHOTS, START } from './model.ts';
import { drawing } from './wired.ts';

const cupArt = drawing();

const page = readFileSync(new URL('../../../pages/index.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./intro-anatomy.tsrx', import.meta.url), 'utf8');
const between = (from: string, to: string) => {
	const at = piece.indexOf(from);
	return piece.slice(at, piece.indexOf(to, at));
};

describe('the Beanshop cup', () => {
	it('starts at three shots and adds one per press, starting a fresh cup once every box is ticked', () => {
		expect(START).toBe(3);
		expect(add(3)).toBe(4);
		expect(add(CAP)).toBe(0);
		expect(CAP).toBe(cupArt.shots.boxes.length);
	});

	it('flips the beat on every press so the press animations replay', () => {
		expect(flip('rest')).toBe('odd');
		expect(flip('odd')).toBe('even');
		expect(flip('even')).toBe('odd');
	});

	it('shows the count on the sticker once: one crossed-out number and one live number', () => {
		expect(piece.match(/class="crossed/g)).toHaveLength(1);
		expect(piece.match(/class="digit now/g)).toHaveLength(1);
		expect(between('{SHOTS}</text>', '</g>\n\t\t\t\t\t</g>')).toMatch(/<text class="digit now" x=\{SLOTS\[1\]\}>\{count\}<\/text>/);
	});

	it('speaks a plain sentence after each change', () => {
		expect(say(4, true)).toBe('Added a shot. The label now says 4 extra shots.');
		expect(say(1, true)).toBe('Added a shot. The label now says 1 extra shot.');
		expect(say(3, false)).toBe('The label now says 3 extra shots.');
		expect(say(0, true)).toBe('A fresh cup. The label now says 0 extra shots.');
	});

	it('plays nothing by itself: the name is already written and only a press moves anything', () => {
		expect(piece).not.toContain('setInterval');
		expect(piece).not.toContain('onVisible');
		expect(piece).not.toContain('data-written');
	});

	it('never ties the name or the product line to the count', () => {
		const once = between('class="once"', '</g>');
		expect(once).toContain('{PRODUCT}');
		expect(once).not.toMatch(/(?<![.\w])count\b|newest|beat/);
		const name = between('class="name"', '<g class="shots">');
		expect(name).toContain('art.name.markless');
		expect(name).not.toMatch(/(?<![.\w])count\b|newest|beat/);
		expect(PRODUCT).toBe('LATTE · 12 OZ');
		expect(SHOTS).toBe('EXTRA SHOTS');
	});

	it('writes Marcus, doodles him, strikes him out, then writes Markless, in that order', () => {
		const { marcus, doodle, strike, markless } = cupArt.name;
		expect(marcus.map((g) => g.ch).join('')).toBe('Marcus');
		expect(markless.map((g) => g.ch).join('')).toBe('Markless');
		expect(doodle[0]!.delay).toBeGreaterThan(marcus.at(-1)!.delay);
		expect(strike.delay).toBeGreaterThan(doodle.at(-1)!.delay);
		expect(markless[0]!.delay).toBeGreaterThan(strike.delay);
	});

	it('draws no wires, no sheet and no margin note', () => {
		expect(piece).not.toMatch(/class="(pulse|cord|hand)/);
		expect(piece).not.toContain('WIRED BEFORE');
	});

	it('is on the intro page, after the subtitle and before the counter', () => {
		expect(page).toContain("import IntroAnatomy from '../components/figures/intro/intro-anatomy.tsrx';");
		const at = page.indexOf('<IntroAnatomy />');
		expect(at).toBeGreaterThan(page.indexOf('<Subtitle'));
		expect(at).toBeLessThan(page.indexOf('Here is an order like the one in the drawing, as code.'));
	});

	it('inks every part: the cup, the doodle, the boxes, the sticker and the steam', () => {
		expect(cupArt.cup.body.ink.length).toBeGreaterThan(500);
		expect(cupArt.cup.body.tone.length).toBeGreaterThan(200);
		expect(cupArt.cup.lid.ink.length).toBeGreaterThan(300);
		expect(cupArt.name.doodle.length).toBeGreaterThanOrEqual(5);
		expect(cupArt.name.strike.length).toBeGreaterThan(10);
		expect(cupArt.shots.boxes.every((box) => box.length > 3 && box.ink.length > 50)).toBe(true);
		expect(cupArt.sticker.ink.length).toBeGreaterThan(100);
		expect(cupArt.steam).toHaveLength(3);
		expect(cupArt.cup.pencil.length).toBeGreaterThan(100);
	});

	it('draws the same scene every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(cupArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by wired.test.ts from wired.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './wired.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(cupArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./wired.art.ts');
	});
});
