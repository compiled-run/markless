import { describe, expect, it } from 'vitest';
import {
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
	NATIVE_UNSUPPORTED_CODE,
} from '../src/index.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const nativeView = async (source: string) =>
	createNativeViewPayload(
		await buildSemanticGraph({ filename: 'src/App.tsrx', source, nativeFacts: NATIVE_FACT_COLLECTORS }),
	);

describe('native view payload', () => {
	it('lowers a counter to nodes, a semantic event and an assignment', async () => {
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
				{
					kind: 'element',
					id: 'h0',
					element: 'main',
					parent: null,
					attributes: { class: 'screen' },
				},
				{
					kind: 'element',
					id: 'h1',
					element: 'h1',
					parent: 'h0',
					attributes: { class: 'title' },
				},
				{ kind: 'text', id: 'h1:text0', parent: 'h1', parts: [{ text: 'Counter' }] },
				{
					kind: 'element',
					id: 'h2',
					element: 'button',
					parent: 'h0',
					attributes: { class: 'tap' },
				},
				{
					kind: 'text',
					id: 'h2:text0',
					parent: 'h2',
					parts: [{ text: 'Count ' }, { cell: 'state:count' }],
				},
			],
			events: [{ host: 'h2', event: 'activate', handler: 'handler:event:0' }],
			handlers: [
				{
					id: 'handler:event:0',
					ops: [
						{
							op: 'assign',
							cell: 'state:count',
							value: {
								binary: '+',
								left: { unary: '+', value: { cell: 'state:count' } },
								right: { literal: 1 },
							},
						},
					],
				},
			],
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
			{
				kind: 'text',
				id: 'h1:text0',
				parent: 'h1',
				parts: [{ cell: 'state:left' }, { text: ' before ' }],
			},
			{ kind: 'element', id: 'h2', element: 'b', parent: 'h1' },
			{ kind: 'text', id: 'h2:text0', parent: 'h2', parts: [{ text: 'bold' }] },
			{
				kind: 'text',
				id: 'h1:text1',
				parent: 'h1',
				parts: [{ text: ' after ' }, { cell: 'state:right' }],
			},
			{ kind: 'element', id: 'h3', element: 'button', parent: 'h0' },
			{ kind: 'text', id: 'h3:text0', parent: 'h3', parts: [{ text: 'Move' }] },
		]);
		expect(payload?.handlers).toEqual([
			{
				id: 'handler:event:0',
				ops: [
					{
						op: 'assign',
						cell: 'state:left',
						value: {
							binary: '-',
							left: { unary: '+', value: { cell: 'state:left' } },
							right: { literal: 1 },
						},
					},
					{
						op: 'assign',
						cell: 'state:right',
						value: {
							binary: '+',
							left: { unary: '+', value: { cell: 'state:right' } },
							right: { literal: 1 },
						},
					},
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
		const [article, span] = elements.map((node) =>
			node.kind === 'element' ? node.attributes : undefined,
		);
		expect(article?.title).toBe('Hello');
		expect(article?.class).toMatch(/^card mk-[a-z0-9]+$/);
		expect(span?.class).toBe(article?.class.split(' ')[1]);
	});

	it('lowers assignments, compound assignments and builtin calls to expression trees', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Panel() @{
	let open = state(false);
	let tab = state('a');
	let size = state(1);
	<div>
		<p>{tab} {open} {size}</p>
		<button onClick={() => { open = !open; tab = \`t\${size}\`; size *= 2; size = Math.max(size, -4); }}>Go</button>
	</div>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{
				op: 'assign',
				cell: 'state:open',
				value: { unary: '!', value: { cell: 'state:open' } },
			},
			{
				op: 'assign',
				cell: 'state:tab',
				value: { template: ['t', { cell: 'state:size' }, ''] },
			},
			{
				op: 'assign',
				cell: 'state:size',
				value: { binary: '*', left: { cell: 'state:size' }, right: { literal: 2 } },
			},
			{
				op: 'assign',
				cell: 'state:size',
				value: {
					call: 'Math.max',
					arguments: [{ cell: 'state:size' }, { unary: '-', value: { literal: 4 } }],
				},
			},
		]);
	});

	it('refuses a value that calls author code, naming the call', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Sum() @{
	let total = state(1);
	<button onClick={() => (total = double(total))}>Total {total}</button>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the click handler uses a call to `double`, which needs a script engine',
		]);
	});

	it('lowers an input field: its value binding and the event value its handler reads', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Field() @{
	let text = state('a');
	<div>
		<input aria-label="Text" value={text} onInput={(e) => (text = e.target.value + '!')} />
	</div>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.nodes[1]).toMatchObject({
			element: 'input',
			bindings: [{ property: 'value', value: { cell: 'state:text' } }],
		});
		expect(payload?.events).toEqual([
			{ host: 'h1', event: 'input', handler: 'handler:event:0' },
		]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{
				op: 'assign',
				cell: 'state:text',
				value: { binary: '+', left: { event: 'value' }, right: { literal: '!' } },
			},
		]);
	});

	it('refuses a handler that does more than write state', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Logger() @{
	let count = state(0);
	<button onClick={() => { count++; console.log(count); }}>Count {count}</button>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
			[
				NATIVE_UNSUPPORTED_CODE,
				'the click handler uses a call to `console.log`, which needs a script engine',
			],
		]);
	});

	it('refuses constructs with no native lowering yet', async () => {
		const { payload, diagnostics } = await nativeView(`function Label({ text }) @{
	<span>{text}</span>
}
export function Page() @{
	<div><Label text="a" /></div>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain('child components');
	});

	it('lowers a keyed @for to a list region whose rows read their item, and array writes to methods', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function List() @{
	let items = state([{ id: 1, name: 'a' }]);
	<section>
		<button onClick={() => (items = items.filter((item) => item.id !== 1))}>Drop</button>
		<ul>
			@for (const row of items; key row.id) { <li>{row.name}</li> }
		</ul>
	</section>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.cells[0]?.initial).toEqual([{ id: 1, name: 'a' }]);
		expect(payload?.nodes.slice(4)).toEqual([
			{ kind: 'repeat', id: 'repeat:0', parent: 'h2', list: { cell: 'state:items' }, key: ['id'] },
			{ kind: 'element', id: 'h3', element: 'li', parent: 'h2', row: 'repeat:0' },
			{
				kind: 'text',
				id: 'h3:text0',
				parent: 'h3',
				parts: [{ expr: { member: { item: 'repeat:0' }, property: 'name' } }],
				row: 'repeat:0',
			},
		]);
		expect(payload?.handlers[0]?.ops[0]?.value).toEqual({
			method: 'filter',
			target: { cell: 'state:items' },
			arguments: [
				{
					lambda: ['item'],
					body: {
						binary: '!==',
						left: { member: { local: 'item' }, property: 'id' },
						right: { literal: 1 },
					},
				},
			],
		});
	});

	it('refuses reversing a state array in place', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function List() @{
	let items = state([1, 2]);
	<button onClick={() => (items = items.reverse())}>Flip {items.length}</button>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the click handler reverses an array in place; reverse a copy (`[...list].reverse()`)',
		]);
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
					{
						expr: {
							if: { cell: 'state:open' },
							whenTrue: { literal: 'Hide' },
							whenFalse: { literal: 'Show' },
						},
					},
				],
			},
			{
				kind: 'branch',
				id: 'branch-site:0',
				parent: 'h0',
				test: { cell: 'state:open' },
				arms: 2,
			},
			{
				kind: 'element',
				id: 'h2',
				element: 'p',
				parent: 'h0',
				arm: { branch: 'branch-site:0', index: 0 },
			},
			{
				kind: 'text',
				id: 'h2:text0',
				parent: 'h2',
				parts: [{ text: 'Open' }],
				arm: { branch: 'branch-site:0', index: 0 },
			},
			{
				kind: 'element',
				id: 'h3',
				element: 'p',
				parent: 'h0',
				arm: { branch: 'branch-site:0', index: 1 },
			},
			{
				kind: 'text',
				id: 'h3:text0',
				parent: 'h3',
				parts: [{ text: 'Closed' }],
				arm: { branch: 'branch-site:0', index: 1 },
			},
		]);
	});
});
