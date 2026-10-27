import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawings } from './figures.ts';
import { drawing } from './marks.ts';
import { BODY, describeMarks, describeSketch, flip, LINES, SAID, SKETCH_SAID, sketchOf, SOURCE, VALUES } from './model.ts';
import type { Token } from './printout.ts';

// The site's fence renderer runs in a child process: shiki's wasm engine loads under Node but not under the test runner.
const fences = JSON.parse(execFileSync(process.execPath, [new URL('./fence-colours.ts', import.meta.url).pathname], { encoding: 'utf8' })) as { figure: Token[][]; page: Token[][][] };
const tokens = fences.figure;
const page = readFileSync(new URL('../../../pages/start/reading-tsrx.mdx', import.meta.url), 'utf8');
const printout = readFileSync(new URL('./printout-anatomy.tsrx', import.meta.url), 'utf8');
const sketch = readFileSync(new URL('./sketch-anatomy.tsrx', import.meta.url), 'utf8');
const art = drawing(tokens);
const sketches = drawings(tokens);

/** Each character of a line with the light and dark colour it is painted in. */
const painted = (runs: readonly Token[]) => runs.flatMap((run) => [...run.content].map((char) => ({ char, color: run.color, dark: run.dark })));

describe('the marked-up printout', () => {
	it('prints a short file with every kind of { } plus @for and @if', () => {
		expect(LINES.length).toBeLessThanOrEqual(15);
		expect(SOURCE).toContain('@for (');
		expect(SOURCE).toContain('@if (');
		expect(VALUES.map((value) => value.text)).toEqual(["{name === 'Ada' ? 'host' : ''}", '{name}', '{clear}']);
		for (const value of VALUES) expect(LINES[value.line]!.text).toContain(value.text);
		expect(LINES[BODY.from - 1]!.text.endsWith('@{')).toBe(true);
		expect(LINES[BODY.to + 1]!.text).toBe('}');
	});

	it('marks every value and labels each one, with one bracket of instructions', () => {
		const { swipes, notes } = art.marks;
		expect(swipes.filter((swipe) => !swipe.desk)).toHaveLength(VALUES.length);
		expect(notes.filter((note) => note.text === 'value')).toHaveLength(VALUES.length);
		expect(notes.map((note) => note.text)).toContain('instructions');
		expect(describeMarks(true)).toBe('Marked up again. ' + SAID);
		expect(flip('odd')).toBe('even');
	});

	it('crops to the sheet and its legend, with no empty desk above or below', () => {
		expect(art.view.height / art.view.width).toBeLessThan(0.82);
		expect(printout).toContain('overflow: hidden');
	});

	it('respects reduced motion, stops its tour on touch, resets on Escape and speaks each change', () => {
		expect(printout).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(printout).toContain('if (!seen || touched) return;');
		expect(printout).toContain("event.key === 'Escape'");
		expect(printout).toContain('aria-live="polite"');
		expect(printout).toContain('<figcaption class="sr">');
	});
});

describe('the figures are coloured exactly like the page’s code blocks', () => {
	it('reads the same text the fence renderer prints', () => {
		expect(tokens.map((line) => line.map((token) => token.content).join(''))).toEqual(SOURCE.split('\n'));
	});

	it('paints every line the page also shows in a code block in that block’s colours, light and dark', () => {
		const shared = new Map<string, ReturnType<typeof painted>>();
		for (const block of fences.page) for (const line of block) shared.set(line.map((run) => run.content).join('').trim(), painted(line).filter((_, i, all) => i >= all.findIndex((c) => c.char.trim())));
		// A lone closing brace takes the colour of the block it closes, so only lines with more than one character are compared.
		const checked = tokens.filter((line) => line.map((run) => run.content).join('').trim().length > 1 && shared.has(line.map((run) => run.content).join('').trim()));
		expect(checked.length).toBeGreaterThanOrEqual(6);
		for (const line of checked) {
			const ours = painted(line).filter((_, i, all) => i >= all.findIndex((c) => c.char.trim()));
			expect(ours).toEqual(shared.get(line.map((run) => run.content).join('').trim()));
		}
	});

	it('draws each token in the colour the renderer gave it, with no mixing', () => {
		const tinted = art.lines.flatMap((line) => line.pieces).filter((piece) => piece.tint);
		const colours = new Set(tokens.flat().map((token) => token.color).filter(Boolean));
		expect(tinted.length).toBeGreaterThan(10);
		for (const piece of tinted) expect(colours).toContain(piece.tint.replace('--c:', ''));
		const sketched = Object.values(sketches).flatMap((pair) => [pair.wide, pair.tall]).flatMap((layout) => layout.texts).filter((text) => text.style.startsWith('--c:'));
		const pairs = new Set(tokens.flat().filter((token) => token.color).map((token) => `--c:${token.color};--cd:${token.dark || 'var(--ink)'}`));
		expect(sketched.length).toBeGreaterThan(10);
		for (const text of sketched) expect(pairs).toContain(text.style);
		expect(printout).toMatch(/\.tint \{\s*fill: var\(--c\);/);
		expect(sketch).toMatch(/\.tint \{\s*fill: var\(--c\);\s*html\.dark & \{\s*fill: var\(--cd\);/);
	});
});

describe('the three sketches', () => {
	it('pair 2 to 6 lines of the file with a phone, side by side and stacked', () => {
		for (const pair of Object.values(sketches)) {
			for (const layout of [pair.wide, pair.tall]) {
				const rows = new Set(layout.texts.filter((text) => text.cls.startsWith('code') && !text.cls.includes('lift')).map((text) => text.y));
				expect(rows.size).toBeGreaterThanOrEqual(2);
				expect(rows.size).toBeLessThanOrEqual(6);
				expect(layout.shapes.some((shape) => shape.cls === 'screen')).toBe(true);
			}
			expect(pair.tall.width).toBeLessThan(pair.wide.width);
		}
	});

	it('values: each value lands on its spot, host as a style, clear as a hand on the button', () => {
		const texts = sketches.values.wide.texts.map((text) => text.text);
		expect(texts).toEqual(expect.arrayContaining(['Ada', 'Grace', 'host', 'Clear']));
		expect(sketches.values.wide.shapes.filter((shape) => shape.cls === 'socket')).toHaveLength(VALUES.length);
		expect(sketches.values.wide.shapes.some((shape) => shape.cls.includes('land clear'))).toBe(true);
	});

	it('steps: three cards read in order, only the last one shows up', () => {
		const texts = sketches.steps.wide.texts.map((text) => text.text);
		expect(texts).toEqual(expect.arrayContaining(['1', '2', '3', 'what shows up', 'nothing on the page']));
		expect(sketches.steps.wide.texts.filter((text) => text.cls.includes('lift')).length).toBeGreaterThan(0);
	});

	it('blocks: a row traced once per guest and a flap that opens when the list is empty', () => {
		const layout = sketches.blocks.wide;
		expect(layout.strokes.filter((stroke) => stroke.cls === 'pen row')).toHaveLength(2);
		expect(layout.texts.find((text) => text.text === 'No one yet')?.cls).toContain('flap open');
		expect(layout.shapes.some((shape) => shape.cls.includes('flap shut'))).toBe(true);
		expect(describeSketch('blocks', true, true)).toContain('No one yet');
		expect(describeSketch('values', false, false)).toBe('');
		expect(sketchOf('nonsense')).toBe('values');
		for (const name of ['values', 'steps', 'blocks'] as const) expect(SKETCH_SAID[name].length).toBeGreaterThan(40);
		expect(sketch).toContain('(prefers-reduced-motion: reduce)');
		expect(sketch).toContain("event.key === 'Escape'");
	});
});

describe('the page', () => {
	it.each([
		['values', '## `{ }` holds a value'],
		['steps', '## `@{ }` holds instructions, run top to bottom'],
		['blocks', '## Blocks that start with @'],
	])('puts the %s sketch under its heading', (figure, heading) => {
		expect(page.indexOf(`<SketchAnatomy figure="${figure}" />`)).toBeGreaterThan(page.indexOf(heading));
	});

	it('opens with the printout and never says slot', () => {
		expect(page.indexOf('<PrintoutAnatomy />')).toBeGreaterThan(page.indexOf('## Mark up a whole file'));
		expect(page).not.toMatch(/\bslots?\b/i);
	});
});

describe('frozen art', () => {
	it('draws the same scenes every time', () => {
		expect(JSON.stringify(drawing(tokens))).toBe(JSON.stringify(art));
		expect(JSON.stringify(drawings(tokens))).toBe(JSON.stringify(sketches));
	});

	it.each([
		['printout', 'marks', art],
		['figures', 'figures', sketches],
	] as const)('freezes %s.art.ts, a plain-data module the compiler can read (run with -u after editing)', async (name, from, value) => {
		const type = name === 'printout' ? 'ReturnType<typeof drawing>' : 'ReturnType<typeof drawings>';
		const module = `// Written by reading.test.ts from ${from}.ts. Run \`vp test -u\` to refresh.
import type { ${name === 'printout' ? 'drawing' : 'drawings'} } from './${from}.ts';

export const art: ${type} = ${JSON.stringify(value, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot(`./${name}.art.ts`);
	});
});
