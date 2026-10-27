import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addRow, BLOCKS_START, CARD_LINES, describeBlocks, describeBuild, describeSteps, describeValues, flip, FREE_AT, nextBags, ROW_NAMES, STEP_CHIPS, STEP_LINES, VALUES_START } from './model.ts';
import { drawing as blocksDrawing } from './blocks.ts';
import { drawing as buildDrawing } from './build.ts';
import { drawing as stepsDrawing } from './steps.ts';
import { drawing as valuesDrawing } from './values.ts';

const figures = {
	build: { drawing: buildDrawing, component: 'BuildAnatomy', heading: '## Watch the page get built' },
	values: { drawing: valuesDrawing, component: 'ValuesAnatomy', heading: '## `{ }` holds a value' },
	steps: { drawing: stepsDrawing, component: 'StepsAnatomy', heading: '## `@{ }` holds instructions, run top to bottom' },
	blocks: { drawing: blocksDrawing, component: 'BlocksAnatomy', heading: '## Blocks that start with `@`' },
} as const;

const page = readFileSync(new URL('../../../pages/start/reading-tsrx.mdx', import.meta.url), 'utf8');
const piece = (name: string) => readFileSync(new URL(`./${name}-anatomy.tsrx`, import.meta.url), 'utf8');
const arts = Object.fromEntries(Object.entries(figures).map(([name, figure]) => [name, figure.drawing()]));

describe('the four figures on the reading page', () => {
	it.each(Object.keys(figures))('%s: one margin note, reduced motion respected, a tour that stops on touch, Escape and a live sentence', (name) => {
		const source = piece(name);
		expect(source.match(/class="hand/g)).toHaveLength(1);
		expect(source).toContain('WIRED BEFORE THE PAGE RAN');
		expect(source).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(source).toContain('if (!seen || touched) return;');
		expect(source).toContain("event.key === 'Escape'");
		expect(source).toContain('aria-live="polite"');
		expect(source).toContain('<figcaption class="sr">');
	});

	it.each(Object.entries(figures))('%s: sits under its own heading on the page', (name, figure) => {
		expect(page).toContain(`import ${figure.component} from '../../components/figures/reading/${name}-anatomy.tsrx';`);
		const at = page.indexOf(figure.heading);
		expect(at).toBeGreaterThan(-1);
		expect(at).toBeLessThan(page.indexOf(`<${figure.component} />`));
	});

	it.each(Object.entries(figures))('%s: draws the same scene every time', (name, figure) => {
		expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(arts[name]));
	});

	it('never uses the word slot on the page', () => {
		expect(page).not.toMatch(/\bslots?\b/i);
	});
});

describe('build: the card runs, then the value lands', () => {
	it('has two lines, the last one putting the button on the page', () => {
		expect(CARD_LINES).toHaveLength(2);
		expect(CARD_LINES.at(-1)).toContain('button');
		expect(describeBuild(true)).toContain('top to bottom');
		expect(piece('build')).toContain("{'{bags}'}");
	});
});

describe('values: three holes on one button', () => {
	it('wires the number and the title, and the click runs back into the jar', () => {
		const source = piece('values');
		expect(source.match(/class="pulse to-page"/g)).toHaveLength(2);
		expect(source.match(/class="pulse to-jar"/g)).toHaveLength(1);
		for (const tag of ["{'{bags}'}", "{'title={…}'}", "{'onClick={…}'}"]) expect(source).toContain(tag);
		expect(nextBags(VALUES_START)).toBe(VALUES_START + 1);
		expect(nextBags(9)).toBe(VALUES_START);
		expect(describeValues(3, true)).toBe('Clicked. The button shows 3 bags and its title says Add bag 4.');
		expect(flip('odd')).toBe('even');
	});
});

describe('steps: four lines run in order', () => {
	it('leaves one value on the desk for each of the first three lines, and the last shows the receipt', () => {
		expect(STEP_LINES).toHaveLength(4);
		expect(STEP_CHIPS.map(([name]) => name)).toEqual(['price', 'bags', 'total']);
		expect(Number(STEP_CHIPS[0][1]) * Number(STEP_CHIPS[1][1])).toBe(Number(STEP_CHIPS[2][1]));
		expect(describeSteps(true)).toContain('the last line put the receipt on the page');
	});
});

describe('blocks: rows per bag and a flap at three', () => {
	it('adds a row per press, wraps after the last row, and opens the flap from three bags', () => {
		expect(addRow(BLOCKS_START)).toBe(BLOCKS_START + 1);
		expect(addRow(ROW_NAMES.length)).toBe(1);
		expect(FREE_AT).toBe(3);
		expect(describeBlocks(3, true)).toBe('Added a bag. The list shows 3 rows, and the Free shipping flap is open.');
		expect(describeBlocks(2, false)).toBe('The list shows 2 rows, and the Free shipping flap is shut.');
		const source = piece('blocks');
		expect(source).toContain('>@for</text>');
		expect(source).toContain('>@if</text>');
	});
});

describe('frozen art', () => {
	it.each(Object.keys(figures))('freezes the %s drawing into a plain-data module the compiler can read (run with -u after editing)', async (name) => {
		const module = `// Written by reading.test.ts from ${name}.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './${name}.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(arts[name], null, '\t')};
`;
		await expect(module).toMatchFileSnapshot(`./${name}.art.ts`);
	});
});
