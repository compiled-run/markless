import { describe, expect, it } from 'vitest';
import { createNativeViewPayload, NATIVE_UNSUPPORTED_CODE } from '../src/index.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const nativeView = async (source: string) =>
	createNativeViewPayload(await buildSemanticGraph({ filename: 'src/App.tsrx', source }));

describe('native view payload', () => {
	it('lowers a counter to nodes, a semantic event and an add op', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Counter() @{
	let count = state(0);
	<main class="screen">
		<h1 class="title">Counter</h1>
		<button class="tap" onClick={() => count++}>Count {count}</button>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload).toEqual({
			version: 'markless.native-view/0',
			component: 'Counter',
			cells: [{ id: 'state:count', name: 'count', initial: 0 }],
			nodes: [
				{ kind: 'element', id: 'h0', element: 'main', parent: null, attributes: { class: 'screen' } },
				{ kind: 'element', id: 'h1', element: 'h1', parent: 'h0', attributes: { class: 'title' } },
				{ kind: 'text', id: 'h1:text0', parent: 'h1', parts: [{ text: 'Counter' }] },
				{ kind: 'element', id: 'h2', element: 'button', parent: 'h0', attributes: { class: 'tap' } },
				{
					kind: 'text',
					id: 'h2:text0',
					parent: 'h2',
					parts: [{ text: 'Count ' }, { cell: 'state:count' }],
				},
			],
			events: [{ host: 'h2', event: 'activate', handler: 'handler:event:0' }],
			handlers: [{ id: 'handler:event:0', ops: [{ op: 'add', cell: 'state:count', value: 1 }] }],
		});
	});

	it('keeps text runs apart around an element and orders siblings as authored', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Tally() @{
	let left = state(9);
	let right = state(3);
	<section>
		<p>{left} before <b>bold</b> after {right}</p>
		<button onClick={() => { left--; right++; }}>Move</button>
	</section>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.nodes).toEqual([
			{ kind: 'element', id: 'h0', element: 'section', parent: null },
			{ kind: 'element', id: 'h1', element: 'p', parent: 'h0' },
			{ kind: 'text', id: 'h1:text0', parent: 'h1', parts: [{ cell: 'state:left' }, { text: ' before ' }] },
			{ kind: 'element', id: 'h2', element: 'b', parent: 'h1' },
			{ kind: 'text', id: 'h2:text0', parent: 'h2', parts: [{ text: 'bold' }] },
			{ kind: 'text', id: 'h1:text1', parent: 'h1', parts: [{ text: ' after ' }, { cell: 'state:right' }] },
			{ kind: 'element', id: 'h3', element: 'button', parent: 'h0' },
			{ kind: 'text', id: 'h3:text0', parent: 'h3', parts: [{ text: 'Move' }] },
		]);
		expect(payload?.handlers).toEqual([
			{
				id: 'handler:event:0',
				ops: [
					{ op: 'add', cell: 'state:left', value: -1 },
					{ op: 'add', cell: 'state:right', value: 1 },
				],
			},
		]);
	});

	it('carries static attributes, with the scope class a <style> block adds', async () => {
		const { payload } = await nativeView(`export function Card() @{
	<article class="card" title="Hello">
		<style>.card { color: red; }</style>
		<span>Plain</span>
	</article>
}`);
		const elements = payload?.nodes.filter((node) => node.kind === 'element') ?? [];
		const [article, span] = elements.map((node) => (node.kind === 'element' ? node.attributes : undefined));
		expect(article?.title).toBe('Hello');
		expect(article?.class).toMatch(/^card mk-[a-z0-9]+$/);
		expect(span?.class).toBe(article?.class.split(' ')[1]);
	});

	it('lowers literal assignments and self-negation to set and toggle', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Panel() @{
	let open = state(false);
	let tab = state('a');
	let size = state(1);
	<div>
		<p>{tab} {open} {size}</p>
		<button onClick={() => { open = !open; tab = 'b'; size = 3; size = -4; }}>Go</button>
	</div>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{ op: 'toggle', cell: 'state:open' },
			{ op: 'set', cell: 'state:tab', value: 'b' },
			{ op: 'set', cell: 'state:size', value: 3 },
			{ op: 'set', cell: 'state:size', value: -4 },
		]);
	});

	it('refuses an assignment whose value needs evaluating', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Sum() @{
	let total = state(1);
	<button onClick={() => (total = total * 2)}>Total {total}</button>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual(['a assign write to `total` needs a script engine']);
	});

	it('refuses a handler that does more than write state', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Logger() @{
	let count = state(0);
	<button onClick={() => { count++; console.log(count); }}>Count {count}</button>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
			[NATIVE_UNSUPPORTED_CODE, 'the click handler does more than write state'],
		]);
	});

	it('refuses constructs with no native lowering yet', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function List() @{
	let items = state([{ id: 1, name: 'a' }]);
	<ul>
		@for (const item of items; key item.id) { <li>{item.name}</li> }
	</ul>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain('@for');
	});

	it('lowers @if to a branch whose arms carry their place, and bindings to expressions', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Toggle() @{
	let open = state(false);
	<div>
		<button aria-expanded={open} onClick={() => (open = !open)}>{open ? 'Hide' : 'Show'}</button>
		@if (open) { <p>Open</p> } @else { <p>Closed</p> }
	</div>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.nodes).toEqual([
			{ kind: 'element', id: 'h0', element: 'div', parent: null },
			{
				kind: 'element',
				id: 'h1',
				element: 'button',
				parent: 'h0',
				bindings: [{ attribute: 'aria-expanded', value: { cell: 'state:open' } }],
			},
			{
				kind: 'text',
				id: 'h1:text0',
				parent: 'h1',
				parts: [
					{ expr: { if: { cell: 'state:open' }, whenTrue: { literal: 'Hide' }, whenFalse: { literal: 'Show' } } },
				],
			},
			{ kind: 'branch', id: 'branch-site:0', parent: 'h0', test: { cell: 'state:open' }, arms: 2 },
			{ kind: 'element', id: 'h2', element: 'p', parent: 'h0', arm: { branch: 'branch-site:0', index: 0 } },
			{ kind: 'text', id: 'h2:text0', parent: 'h2', parts: [{ text: 'Open' }], arm: { branch: 'branch-site:0', index: 0 } },
			{ kind: 'element', id: 'h3', element: 'p', parent: 'h0', arm: { branch: 'branch-site:0', index: 1 } },
			{ kind: 'text', id: 'h3:text0', parent: 'h3', parts: [{ text: 'Closed' }], arm: { branch: 'branch-site:0', index: 1 } },
		]);
	});
});
