import { describe, expect, it } from 'vitest';
import { marklessSsrComposeView } from '../src/fns/ssr.ts';
import { materializeDomLocators } from '../src/resume-locators.ts';

type FakeElement = {
	nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly parentElement?: FakeElement | null;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node = { nodeType: 1 as const, tagName, childNodes };
	for (const child of childNodes) {
		(child as { parentElement?: FakeElement }).parentElement = node;
	}
	return node;
}

// A PROJECTING child (Shell-style: wrapper elements around the parent's
// projected content) interleaves with parent hosts in DOM order. The compose
// must place child locators at the child's true walk position and shift the
// parent's post-child locators by the child's element count — the emitted
// localIndex (static parent locator count) cannot know this for projection
// (dashboard-migration need 13).
describe('marklessSsrComposeView with projecting children', () => {
	it('offsets parent in-projection event hosts by the child wrapper count', () => {
		// Final DOM: <div app-root> <div shell> <header/> <main> <button/> </main> </div> </div>
		// Walk:      0 app-root    1 shell     2 header   3 main  4 button
		const childHtml =
			'<div class="shell"><header></header><main><button data-h="h2"></button></main></div>';
		const html = `<div class="app-root">${childHtml}</div>`;
		// Parent-only walk (component invisible): app-root=0, button=1.
		const hostLocators = [
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 0 },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 1 },
		];
		const view = {
			locators: hostLocators,
			events: [{ hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:0'] }],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
		};
		const children = [
			{
				hostPrefix: 'c0:',
				symbolPrefix: 'c0:',
				localIndex: hostLocators.length, // the (wrong for projection) emitted value
				graphProps: [],
				output: {
					html: childHtml,
					elementCount: 3, // shell, header, main — projection content NOT counted
					view: {
						locators: [
							{ hostNodeId: 's1', strategy: 'dom-order', index: 0 },
							{ hostNodeId: 's2', strategy: 'dom-order', index: 2 },
						],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				},
			},
		];

		const composed = marklessSsrComposeView(html, view, hostLocators, children);
		const byId = new Map(
			composed.view.locators.map((l: { hostNodeId: string; index: number }) => [
				l.hostNodeId,
				l.index,
			]),
		);

		// Child wrappers occupy walk indexes 1..3; the projected button lands at 4.
		expect(byId.get('c0:s1')).toBe(1);
		expect(byId.get('c0:s2')).toBe(3);
		expect(byId.get('h2')).toBe(4);
		expect(byId.get('h1')).toBe(0);
	});

	// PINNED RED (sibling-shift bug): blocks the branch picker + dark mode
	// relanding. Crew investigation: marklessSsrComposeView sibling offsets use
	// compiled hostCount; the rendered extent must flow in — but naive rendered
	// counts double-count NESTED composed children (their own entries offset
	// too). The fix needs the projection model: rendered extent MINUS nested
	// child extents already accounted.
	it.fails('sibling children after a dynamic-option child keep their locators (rendered extent offsets)', () => {
		// First child: rendered options exceed its compiled locator count (the
		// compiled plan knows 1 select locator; the render emitted 3 options).
		const shellHtml =
			'<select data-actors><option>one</option><option>two</option><option>three</option></select>';
		// Second child: an interactive button whose locator must still resolve.
		const panelHtml = '<div data-panel><button data-go></button></div>';
		const html = `<header data-chrome>${shellHtml}${panelHtml}</header>`;
		const hostLocators = [{ hostNodeId: 'hChrome', strategy: 'dom-order', index: 0, tagName: 'header' }];
		const view = { locators: hostLocators, events: [], domUpdates: [], behaviors: [], elementHandles: [] };
		const children = [
			{
				hostPrefix: 'c0:',
				symbolPrefix: 'c0:',
				localIndex: 1,
				graphProps: [],
				output: {
					html: shellHtml,
					view: {
						locators: [{ hostNodeId: 'hSel', strategy: 'dom-order', index: 0, tagName: 'select' }],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				},
			},
			{
				hostPrefix: 'c1:',
				symbolPrefix: 'c1:',
				localIndex: 1,
				graphProps: [],
				output: {
					html: panelHtml,
					view: {
						locators: [
							{ hostNodeId: 'hPanel', strategy: 'dom-order', index: 0, tagName: 'div' },
							{ hostNodeId: 'hGo', strategy: 'dom-order', index: 1, tagName: 'button' },
						],
						events: [{ hostNodeId: 'hGo', eventName: 'click', symbolIds: ['symbol:go'] }],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				},
			},
		];
		const root = element('HEADER', [
			element('SELECT', [element('OPTION'), element('OPTION'), element('OPTION')]),
			element('DIV', [element('BUTTON')]),
		]);
		const composed = marklessSsrComposeView(html, view, hostLocators, children);
		const resolved = materializeDomLocators(wrapRoot(root), composed.locators);
		// The c1 panel/button locators must land on the real elements despite
		// the preceding child's extra rendered option extent.
		expect(resolved.get('c1:hGo')?.tagName).toBe('BUTTON');
		expect(resolved.get('c1:hPanel')?.tagName).toBe('DIV');
	});

	it('resolves a composed child button after rendered select options', () => {
		const childHtml =
			'<select data-cargo><option value="van">Van</option><option value="rail">Rail</option><option value="air">Air</option></select><div data-note></div><button data-send></button>';
		const html = `<section data-page>${childHtml}<output data-after></output></section>`;
		const hostLocators = [
			{ hostNodeId: 'hPage', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'hAfter', strategy: 'dom-order', index: 1, tagName: 'output' },
		];
		const view = {
			locators: hostLocators,
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
		};
		const children = [
			{
				hostPrefix: 'c1:',
				symbolPrefix: 'c1:',
				localIndex: 1,
				graphProps: [],
				output: {
					html: childHtml,
					elementCount: 6,
					view: {
						locators: [
							{ hostNodeId: 'hSelect', strategy: 'dom-order', index: 0, tagName: 'select' },
							{ hostNodeId: 'hNote', strategy: 'dom-order', index: 1, tagName: 'div' },
							{ hostNodeId: 'hSend', strategy: 'dom-order', index: 2, tagName: 'button' },
						],
						events: [{ hostNodeId: 'hSend', eventName: 'click', symbolIds: ['symbol:send'] }],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				},
			},
		];
		const root = element('SECTION', [
			element('SELECT', [element('OPTION'), element('OPTION'), element('OPTION')]),
			element('DIV'),
			element('BUTTON'),
			element('OUTPUT'),
		]);

		const composed = marklessSsrComposeView(html, view, hostLocators, children);
		const elements = materializeDomLocators(root, composed.view.locators);

		expect(elements.get('c1:hSend')?.tagName).toBe('BUTTON');
		expect(composed.view.events).toEqual([
			{ hostNodeId: 'c1:hSend', eventName: 'click', symbolIds: ['c1:symbol:send'] },
		]);
	});

	it('keeps the resume mismatch loud when rendered repeat tags are ambiguous', () => {
		const childHtml =
			'<select data-cargo><option value="van">Van</option><option value="rail">Rail</option></select><option value="static">Static</option><button data-send></button>';
		const html = `<section data-page>${childHtml}</section>`;
		const hostLocators = [
			{ hostNodeId: 'hPage', strategy: 'dom-order', index: 0, tagName: 'section' },
		];
		const view = {
			locators: hostLocators,
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
		};
		const children = [
			{
				hostPrefix: 'c1:',
				symbolPrefix: 'c1:',
				localIndex: 1,
				graphProps: [],
				output: {
					html: childHtml,
					elementCount: 5,
					view: {
						locators: [
							{ hostNodeId: 'hSelect', strategy: 'dom-order', index: 0, tagName: 'select' },
							{
								hostNodeId: 'hStaticOption',
								strategy: 'dom-order',
								index: 1,
								tagName: 'option',
							},
							{ hostNodeId: 'hSend', strategy: 'dom-order', index: 2, tagName: 'button' },
						],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				},
			},
		];
		const root = element('SECTION', [
			element('SELECT', [element('OPTION'), element('OPTION')]),
			element('OPTION'),
			element('BUTTON'),
		]);

		const composed = marklessSsrComposeView(html, view, hostLocators, children);

		expect(() => materializeDomLocators(root, composed.view.locators)).toThrow(
			'Resume locator c1:hSend expected <button>',
		);
	});
});
