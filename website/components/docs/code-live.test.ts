import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findCodeBlocks } from '../../tooling/code-blocks.ts';
import {
	changedSpan,
	labelPieces,
	markBox,
	rewroteTogether,
	rewrittenNodes,
	showsText,
	sourceHas,
} from './playground/checklist.ts';

const text = (value: string) => ({ nodeType: 3, nodeValue: value }) as unknown as Node;
const element = (attributes: Record<string, string>) =>
	({ nodeType: 1, getAttribute: (name: string) => attributes[name] ?? null }) as unknown as Node;
const added = (...nodes: Node[]) => nodes as unknown as NodeList;
const none = added();

describe('the steps a <Code> block ticks by itself', () => {
	it('ticks a source step once the code holds the text, spaces ignored', () => {
		expect(sourceHas('onClick={() => shots++}', 'shots += 2')).toBe(false);
		expect(sourceHas('onClick={() => shots+=2}', 'shots += 2')).toBe(true);
		expect(sourceHas('onClick={() => shots  +=\n 2}', 'shots += 2')).toBe(true);
	});

	it('ticks a shows step only for an element whose whole text matches', () => {
		expect(showsText(['Latte for Marcus', 'Add a shot'], 'One more')).toBe(false);
		expect(showsText(['One more and more'], 'One more')).toBe(false);
		expect(showsText(['\n\t One  more \n'], 'One more')).toBe(true);
	});

	it('ticks a rewrites step when one update writes the same text in enough places', () => {
		expect(rewroteTogether(['5'], 2)).toBe(false);
		expect(rewroteTogether(['5', '6'], 2)).toBe(false);
		expect(rewroteTogether(['5', ' 5 '], 2)).toBe(true);
		expect(rewroteTogether(['', ''], 2)).toBe(false);
	});

	it('counts close as done: case, emoji and quote style never matter', () => {
		expect(showsText(['Done'], 'Done 🎉')).toBe(true);
		expect(showsText(['done 🎉'], 'Done 🎉')).toBe(true);
		expect(sourceHas(`let status = state("Queued");`, "state('Queued 📋')")).toBe(true);
		expect(sourceHas(`let status = state('Brewing ⏳');`, "state('Queued 📋')")).toBe(false);
	});

	it('prints backticked label text as code', () => {
		expect(labelPieces('Change `shots++` to `shots += 2`.')).toEqual([
			{ id: 0, text: 'Change ', code: false },
			{ id: 1, text: 'shots++', code: true },
			{ id: 2, text: ' to ', code: false },
			{ id: 3, text: 'shots += 2', code: true },
			{ id: 4, text: '.', code: false },
		]);
	});
});

describe('the update marks', () => {
	it('marks text rewritten in place and changed attributes, not whole new elements', () => {
		const number = text('Extra shots: 10');
		const replaced = text('Total: 4');
		const pressed = element({ 'aria-pressed': 'true' });
		const same = element({ class: 'a' });
		const nodes = rewrittenNodes([
			{ type: 'characterData', target: number, addedNodes: none, removedNodes: none, oldValue: 'Extra shots: 8', attributeName: null },
			{ type: 'characterData', target: number, addedNodes: none, removedNodes: none, oldValue: 'Extra shots: 9', attributeName: null },
			{ type: 'characterData', target: text('x'), addedNodes: none, removedNodes: none, oldValue: 'x', attributeName: null },
			{ type: 'childList', target: element({}), addedNodes: added(replaced, element({}), text('  ')), removedNodes: none, oldValue: null, attributeName: null },
			{ type: 'attributes', target: pressed, addedNodes: none, removedNodes: none, oldValue: 'false', attributeName: 'aria-pressed' },
			{ type: 'attributes', target: same, addedNodes: none, removedNodes: none, oldValue: 'a', attributeName: 'class' },
		]);
		expect(nodes).toEqual([
			{ node: number, span: [13, 15] },
			{ node: replaced },
			{ node: pressed },
		]);
	});

	it('diffs text that replaced text in one write against what it replaced', () => {
		const swapped = text('Extra shots: 5');
		const same = text('Latte');
		const nodes = rewrittenNodes([
			{ type: 'childList', target: element({}), addedNodes: added(swapped), removedNodes: added(text('Extra shots: 4')), oldValue: null, attributeName: null },
			{ type: 'childList', target: element({}), addedNodes: added(same), removedNodes: added(text('Latte')), oldValue: null, attributeName: null },
		]);
		expect(nodes).toEqual([{ node: swapped, span: [13, 14] }]);
	});

	it('narrows a text rewrite to the characters that changed', () => {
		expect(changedSpan('Extra shots: 3', 'Extra shots: 4')).toEqual([13, 14]);
		expect(changedSpan('Count 9', 'Count 10')).toEqual([6, 8]);
		expect(changedSpan('11', '111')).toEqual([2, 3]);
	});

	it('places a mark over the rect in the layer, framed results shifted by the frame', () => {
		const rect = { left: 10, top: 20, width: 8, height: 16 };
		expect(markBox(rect, { left: 100, top: 50 }, { left: 90, top: 40 })).toEqual({
			left: 17,
			top: 29,
			width: 14,
			height: 18,
		});
		expect(markBox({ ...rect, width: 0 }, { left: 0, top: 0 }, { left: 0, top: 0 })).toBeUndefined();
	});
});

describe('the What is Markless demo', () => {
	const page = readFileSync(new URL('../../pages/index.mdx', import.meta.url), 'utf8');
	const [first] = findCodeBlocks(page, 'index.mdx');

	it('opts into a three-step checklist, with no update marks', () => {
		expect(first?.attributes).toMatch(/^steps=\{\[/);
		const steps = new Function(`return ${first!.attributes.replace(/^steps=\{/, '').replace(/\}$/, '')}`)() as Array<Record<string, unknown>>;
		expect(steps.map(({ label: _label, ...check }) => Object.keys(check))).toEqual([['shows'], ['source'], ['rewrites']]);
	});

	it('starts from code each step can be checked against', () => {
		const order = first!.files[0]!.code;
		expect(order).toContain('Mark ready');
		expect(sourceHas(order, "state('Queued 📋')")).toBe(false);
		expect(sourceHas(order.replace("'Brewing ⏳'", "'Queued'"), "state('Queued 📋')")).toBe(true);
	});
});
