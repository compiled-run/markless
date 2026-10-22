import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing as boxesDrawing } from './boxes.ts';
import { drawing as flowDrawing } from './flow.ts';
import { addBag, BAGS, BOXES_CODE, describeBoxes, describeFlow, describeParts, FLOW_CODE, FREE, MARGIN_NOTE, PARTS, PARTS_CODE, PARTS_START, plain, STEPS, type Tok } from './model.ts';
import { drawing as partsDrawing } from './parts.ts';

const parts = partsDrawing();
const boxes = boxesDrawing();
const flow = flowDrawing();
const page = readFileSync(new URL('../../../pages/start/reading-tsrx.mdx', import.meta.url), 'utf8');
const piece = (name: string) => readFileSync(new URL(`./${name}-anatomy.tsrx`, import.meta.url), 'utf8');
const typed = (art: { type: readonly { cls: string; text: string }[] }) =>
	art.type
		.filter((t) => t.cls.startsWith('tok'))
		.map((t) => t.text)
		.join('');
const squash = (lines: readonly (readonly Tok[])[]) => lines.map(plain).join('').replaceAll(' ', '');
const layouts = <T,>(art: { wide: T; tall: T }) => [art.wide, art.tall];

describe('the element figure', () => {
	it('types one button element, every part on its own line, exactly as the code reads', () => {
		expect(PARTS_CODE.map(plain)).toEqual(['<button', '  class="buy"', '  onClick={() => bags++}', '>', '  Add to cart: {bags}', '</button>']);
		for (const art of layouts(parts)) expect(typed(art).replaceAll(' ', '')).toBe(squash(PARTS_CODE));
	});

	it('names each part in pencil beside the code it points at', () => {
		expect(PARTS.map((p) => p.name)).toEqual(['tag', 'attribute', 'event handler', 'text', 'value']);
		for (const part of PARTS) expect(plain(PARTS_CODE[part.row]!)).toContain(part.at);
		for (const art of layouts(parts)) expect(art.type.filter((t) => t.cls === 'note').map((t) => t.text)).toEqual(PARTS.map((p) => p.name));
	});

	it('wires the value to the one number on the button, which is the only live text', () => {
		const source = piece('parts');
		expect(source.match(/class="digit now"/g)).toHaveLength(2);
		expect(source.match(/class="pulse"/g)).toHaveLength(2);
		for (const art of layouts(parts)) {
			expect(art.ink.filter((p) => p.cls === 'cord')).toHaveLength(1);
			expect(art.ink.filter((p) => p.cls === 'boot')).toHaveLength(2);
			expect(art.pulse.length).toBeGreaterThan(50);
		}
	});

	it('carries the one margin note, and no readout', () => {
		expect(MARGIN_NOTE).toBe('WIRED BEFORE THE PAGE RAN');
		for (const art of layouts(parts)) expect(art.note.lines.map((l) => l.text).join(' ')).toBe(MARGIN_NOTE);
		expect(piece('parts')).not.toMatch(/readout|redrawn/i);
	});

	it('adds a bag a press, wraps after nine, and says what changed', () => {
		expect(PARTS_START).toBe(3);
		expect(addBag(3)).toBe(4);
		expect(addBag(9)).toBe(1);
		expect(describeParts(4)).toBe('Pressed the button. Its onClick ran bags++, and the wired value on the button now reads 4.');
	});
});

describe('the containers figure', () => {
	it('types a component whose body is the statement container and whose paragraph holds one expression', () => {
		expect(BOXES_CODE.map(plain)).toEqual(['export default function Cart() @{', '  let bags = state(2);', '  let price = state(14);', '', '  <p>Total: {bags * price}</p>', '}']);
		for (const art of layouts(boxes)) expect(typed(art).replaceAll(' ', '')).toBe(squash(BOXES_CODE));
	});

	it('numbers the statements in the order they run, and the element last', () => {
		expect(STEPS.map((row) => plain(BOXES_CODE[row]!).trim())).toEqual(['let bags = state(2);', 'let price = state(14);', '<p>Total: {bags * price}</p>']);
		for (const art of layouts(boxes)) expect(art.type.filter((t) => t.cls.startsWith('step-text')).map((t) => t.text)).toEqual(['1', '2', '3']);
		const source = piece('boxes');
		const delay = (name: string) => Number(new RegExp(`\\.${name} \\{\\s*animation: var\\(--appear\\) \\d+ms (\\d+)ms`).exec(source)![1]);
		expect(delay('step-0')).toBeLessThan(delay('step-1'));
		expect(delay('step-1')).toBeLessThan(delay('step-2'));
		expect(delay('step-2')).toBeLessThan(delay('working'));
	});

	it('labels both containers in pencil and wires the one expression to the total', () => {
		for (const art of layouts(boxes)) {
			const notes = art.type.filter((t) => t.cls.startsWith('note')).map((t) => t.text);
			expect(notes.join(' ')).toContain('@{ } holds statements');
			expect(notes.join(' ')).toContain('{ } holds one expression');
			expect(art.ink.filter((p) => p.cls === 'cord')).toHaveLength(1);
		}
		expect(describeBoxes(true)).toContain('gave one value, 28');
	});
});

describe('the control-flow figure', () => {
	it('types the loop and the branch, keyed', () => {
		expect(FLOW_CODE.map(plain)).toContain('    @for (const bag of bags; key bag.id) {');
		expect(FLOW_CODE.map(plain)).toContain('  @if (bags.length > 2) {');
		for (const art of layouts(flow)) expect(typed(art).replaceAll(' ', '')).toBe(squash(FLOW_CODE));
	});

	it('wires one clip per row and one to the note, and only the third row and the note come and go', () => {
		for (const art of layouts(flow)) {
			const rows = art.type.filter((t) => t.cls.startsWith('row'));
			expect(rows.map((r) => r.text)).toEqual([...BAGS, FREE]);
			expect(rows.filter((r) => /\b(third|free)\b/.test(r.cls)).map((r) => r.text)).toEqual([BAGS[2], FREE]);
			expect(art.ink.filter((p) => p.cls.startsWith('boot')).length).toBe(2 + BAGS.length + 1 + 2);
			expect(art.pulses).toHaveLength(4);
		}
		expect(piece('flow')).toContain(".scene[data-flow='two'] :is(.third, .free)");
	});

	it('says what each press did', () => {
		expect(describeFlow('three')).toMatch(/^Added Decaf\./);
		expect(describeFlow('two')).toMatch(/^Back to two bags\./);
	});
});

describe('all three figures', () => {
	it('wait for a press, speak each change, and snap under reduced motion', () => {
		for (const name of ['parts', 'boxes', 'flow']) {
			const source = piece(name);
			expect(source).toContain('aria-live="polite"');
			expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
			expect(source).toMatch(/if \(!seen \|\| touched/);
			expect(source).toContain("event.key === 'Escape'");
			expect(source).toContain('@container anatomy (max-width: 520px)');
		}
	});

	it('are on the reading page in order, each after its section heading', () => {
		const at = (text: string) => page.indexOf(text);
		expect(at('## Write an element')).toBeLessThan(at('<PartsAnatomy />'));
		expect(at('## Statements go in `@{ }`')).toBeLessThan(at('<BoxesAnatomy />'));
		expect(at('## Show and repeat with @if and @for')).toBeLessThan(at('<FlowAnatomy />'));
		expect(at('<PartsAnatomy />')).toBeLessThan(at('<BoxesAnatomy />'));
		expect(at('<BoxesAnatomy />')).toBeLessThan(at('<FlowAnatomy />'));
	});

	it('use no em dashes on the page or in the figures', () => {
		for (const text of [page, piece('parts'), piece('boxes'), piece('flow')]) expect(text).not.toContain('—');
	});

	it('ink every part with enough strokes', () => {
		for (const art of [...layouts(parts), ...layouts(boxes), ...layouts(flow)]) {
			const ink = art.ink.filter((p) => p.cls === 'ink').reduce((n, p) => n + p.d.length, 0);
			const hatch = art.ink.filter((p) => p.cls.startsWith('hatch')).reduce((n, p) => n + p.d.length, 0);
			expect(ink).toBeGreaterThan(5000);
			expect(hatch).toBeGreaterThan(3000);
			expect(art.ink.some((p) => p.cls === 'pencil')).toBe(true);
		}
	});

	it('draw the same scenes every time', () => {
		expect(JSON.stringify(partsDrawing())).toBe(JSON.stringify(parts));
		expect(JSON.stringify(boxesDrawing())).toBe(JSON.stringify(boxes));
		expect(JSON.stringify(flowDrawing())).toBe(JSON.stringify(flow));
	});
});

describe('frozen art', () => {
	const freeze = (name: string, art: unknown) => `// Written by reading.test.ts from ${name}.ts. Run \`pnpm test run components/figures/reading -u\` to refresh.
import type { drawing } from './${name}.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;

	it('freezes each drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		await expect(freeze('parts', parts)).toMatchFileSnapshot('./parts.art.ts');
		await expect(freeze('boxes', boxes)).toMatchFileSnapshot('./boxes.art.ts');
		await expect(freeze('flow', flow)).toMatchFileSnapshot('./flow.art.ts');
	});
});
