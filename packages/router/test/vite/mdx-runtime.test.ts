import { describe, expect, it } from 'vitest';
import {
	composeMdxState,
	composeMdxView,
	loadMdxSymbol,
	renderMdxChild,
} from '../../src/vite/runtime/mdx-route.ts';

describe('Markless Router MDX route runtime helpers', () => {
	it('composes child state payloads for one MDX route container', () => {
		const state = composeMdxState([
			{
				componentIndex: 0,
				hostPrefix: 'm0:',
				symbolPrefix: 'm0:',
				output: {
					state: {
						version: 1,
						cells: [{ id: 'count' }],
						computed: [],
					},
				},
			},
		]);

		expect(state).toEqual({
			version: 1,
			cells: [{ id: 'count' }],
			computed: [],
		});
	});

	it('offsets and prefixes child view records inside markdown element order', () => {
		const view = composeMdxView(
			[
				{ kind: 'html', elementCount: 2 },
				{ kind: 'component', componentIndex: 0 },
			],
			[
				{
					componentIndex: 0,
					hostPrefix: 'm0:',
					symbolPrefix: 'm0:',
					output: {
						view: {
							version: 1,
							locators: [
								{
									hostNodeId: 'h0',
									strategy: 'dom-order',
									index: 0,
									tagName: 'button',
								},
							],
							events: [
								{
									hostNodeId: 'h0',
									eventName: 'click',
									symbolIds: ['symbol:click'],
								},
							],
							domUpdates: [
								{
									hostNodeId: 'h0',
									graphNodeId: 'count',
									path: [],
									symbolId: 'symbol:text',
								},
							],
							behaviors: [],
							elementHandles: [],
						},
					},
				},
			],
			0,
		);

		expect(view?.locators).toEqual([
			expect.objectContaining({ hostNodeId: 'm0:h0', index: 2 }),
		]);
		expect(view?.events).toEqual([
			expect.objectContaining({
				hostNodeId: 'm0:h0',
				symbolIds: ['m0:symbol:click'],
			}),
		]);
		expect(view?.domUpdates).toEqual([
			expect.objectContaining({
				hostNodeId: 'm0:h0',
				symbolId: 'm0:symbol:text',
			}),
		]);
		expect(view?.asyncBoundaries).toEqual([]);
	});

	it('loads symbols from live CSR children before falling back to static MDX loaders', () => {
		expect(
			loadMdxSymbol(
				'm0:symbol:click',
				[
					{
						componentIndex: 0,
						hostPrefix: 'm0:',
						symbolPrefix: 'm0:',
						output: {
							loadSymbol(symbolId) {
								return `live:${symbolId}`;
							},
						},
					},
				],
				[
					{
						prefix: 'm0:',
						loadSymbol(symbolId) {
							return `static:${symbolId}`;
						},
					},
				],
			),
		).toBe('live:symbol:click');
	});
});

describe('renderMdxChild with async compiled artifacts', () => {
	it('awaits an async renderSsr and returns its html', async () => {
		// Compiled marklessRenderSsr is async since the initial-render awaiting
		// work. The unawaited Promise passed the truthy guard while .html read
		// undefined — the MDX child (counter AND home Link) silently dropped,
		// which broke both router-dev-routes and router-preload-strategy.
		const children: unknown[] = [];
		const html = await renderMdxChild(
			children as never,
			{
				renderSsr: async () => ({
					html: '<div data-mdx-counter>MDX Count 0</div>',
					state: { version: 1, cells: [], computed: [] },
				}),
			} as never,
			{},
			{ componentIndex: 0, hostPrefix: 'm0:', symbolPrefix: 'm0:' } as never,
		);

		expect(html).toBe('<div data-mdx-counter>MDX Count 0</div>');
		expect(children).toHaveLength(1);
		expect((children[0] as { output: { html: string } }).output.html).toBe(
			'<div data-mdx-counter>MDX Count 0</div>',
		);
	});
});
