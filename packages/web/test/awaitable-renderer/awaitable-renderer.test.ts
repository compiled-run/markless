import { describe, expect, test } from 'vitest';
import {
	renderSsrData,
	type RenderSsrDataInput,
	type RenderSsrDataOutput,
	type SsrDataSlot,
} from '../../src/ssr-data/renderer.ts';

// A minted `@for` row has to exist by the handler's NEXT statement, so the only
// thing these rows measure is whether the renderer yields when nothing made it
// wait. `await` would hide exactly that: it settles a plain value one microtask
// late, which reads the same in a test and is the whole defect in a handler.
const isPromise = (value: unknown): value is Promise<unknown> =>
	typeof (value as { readonly then?: unknown } | null | undefined)?.then === 'function';

const settle = async (value: unknown): Promise<RenderSsrDataOutput> =>
	(await value) as RenderSsrDataOutput;

const rowSlot: SsrDataSlot = {
	kind: 'repeat',
	repeatId: 'repeat:days',
	staticIndex: 0,
	coordinate: { kind: 'comment-anchor', path: [0, 0] },
	rowTemplateId: 'template:day',
};

function pageInput(read: RenderSsrDataInput['read']): RenderSsrDataInput {
	return {
		renderData: {
			root: { componentName: 'Grid', templateId: 'template:Grid' },
			chunks: [
				{
					id: 'template:Grid',
					kind: 'template',
					componentName: 'Grid',
					statics: ['<div><!--markless-slot:0-->', '</div>'],
					hosts: [{ hostNodeId: 'h0', tagName: 'div', coordinate: { kind: 'child-index', path: [0] } }],
					slots: [rowSlot],
				},
				{
					id: 'template:day',
					kind: 'template',
					componentName: 'Grid',
					statics: ['<button', '><!--markless-slot:1-->', '</button>'],
					hosts: [{ hostNodeId: 'h1', tagName: 'button', coordinate: { kind: 'child-index', path: [0] } }],
					slots: [
						{
							kind: 'attribute',
							name: 'value',
							staticIndex: 0,
							coordinate: { kind: 'child-index', path: [0] },
							residue: { kind: 'repeat-item', repeatId: 'repeat:days', path: [] },
						},
						{
							kind: 'text',
							staticIndex: 1,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							residue: { kind: 'repeat-item', repeatId: 'repeat:days', path: [] },
						},
					],
				},
			],
			boundaries: [],
			repeats: [
				{
					repeatId: 'repeat:days',
					collectionGraphNodeId: 'state:days',
					rowTemplateId: 'template:day',
				},
			],
		},
		read,
	} as RenderSsrDataInput;
}

const days = ['2026-09-13', '2026-09-14'];
const warmRead: RenderSsrDataInput['read'] = (residue, context) =>
	residue.kind === 'repeat-item' ? context.repeatItem : days;
const expectedHtml =
	'<div><button value="2026-09-13">2026-09-13</button><button value="2026-09-14">2026-09-14</button></div>';

describe('renderSsrData answers without yielding when every input is warm', () => {
	test('a fully synchronous render returns the output itself, not a promise', () => {
		const rendered = renderSsrData(pageInput(warmRead));

		expect(isPromise(rendered)).toBe(false);
		expect((rendered as RenderSsrDataOutput).html).toBe(expectedHtml);
		expect((rendered as RenderSsrDataOutput).structure.elementCount).toBe(3);
	});

	test('one promised read makes the whole render a promise, with the same bytes', async () => {
		const rendered = renderSsrData(
			pageInput((residue, context) =>
				residue.kind === 'repeat-item'
					? Promise.resolve(context.repeatItem)
					: Promise.resolve(days),
			),
		);

		expect(isPromise(rendered)).toBe(true);
		expect((await settle(rendered)).html).toBe(expectedHtml);
	});

	test('a promise on one row alone does not reorder the rows around it', async () => {
		const rendered = renderSsrData(
			pageInput((residue, context) => {
				if (residue.kind !== 'repeat-item') return days;
				// The FIRST row waits and the second does not, which is the ordering
				// a per-row `Promise.all` used to guarantee and a plain loop would lose.
				return context.repeatItem === days[0]
					? Promise.resolve(context.repeatItem)
					: context.repeatItem;
			}),
		);

		expect(isPromise(rendered)).toBe(true);
		expect((await settle(rendered)).html).toBe(expectedHtml);
	});

	test('a synchronous render is byte-identical to the promised one', async () => {
		const warm = renderSsrData(pageInput(warmRead)) as RenderSsrDataOutput;
		const cold = await settle(
			renderSsrData(pageInput((residue, context) =>
				Promise.resolve(residue.kind === 'repeat-item' ? context.repeatItem : days),
			)),
		);

		expect(warm.html).toBe(cold.html);
		expect(warm.structureTokens).toEqual(cold.structureTokens);
		expect(warm.structure).toEqual(cold.structure);
		expect(warm.coordinates).toEqual(cold.coordinates);
	});
});
