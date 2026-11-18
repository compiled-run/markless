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
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Field() @{
	let text = state('');
	<input value={text} onKeyDown={() => (text = '')} />
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain('the keydown event has no native meaning yet');
	});

	it('lowers the children a caller passes where the component renders {children}, in the caller scope', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function Card({ title, children }) @{
	<section>
		<h2>{title}</h2>
		{children}
	</section>
}
export function Page() @{
	let count = state(0);
	<main>
		<Card title="Totals">
			<p>Count {count}</p>
			<button onClick={() => count++}>Add</button>
		</Card>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.nodes.map((node) => [node.id, node.parent])).toEqual([
			['h2', null],
			['component-edge:0/h0', 'h2'],
			['component-edge:0/h1', 'component-edge:0/h0'],
			['component-edge:0/h1:text0', 'component-edge:0/h1'],
			['h3', 'component-edge:0/h0'],
			['h3:text0', 'h3'],
			['h4', 'component-edge:0/h0'],
			['h4:text0', 'h4'],
		]);
		expect(payload?.events).toEqual([{ host: 'h4', event: 'activate', handler: 'handler:event:0' }]);
	});

	it('inlines each component instance with its props, and resolves a called callback to the writes of its caller', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function Chip({ label, onPick }) @{
	<button onClick={() => onPick()}>{label}</button>
}
export function Bar() @{
	let picked = state('none');
	<nav>
		<Chip label="One" onPick={() => (picked = 'one')} />
		<p>{picked}</p>
	</nav>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.nodes.map((node) => node.id)).toEqual([
			'h1',
			'component-edge:0/h0',
			'component-edge:0/h0:text0',
			'h2',
			'h2:text0',
		]);
		expect(payload?.events).toEqual([
			{ host: 'component-edge:0/h0', event: 'activate', handler: 'handler:component-edge:0/event:0' },
		]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{ op: 'assign', cell: 'state:picked', value: { literal: 'one' } },
		]);
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

	it('reads a handler const as its value where nothing the handler writes changes it', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Steps() @{
	let size = state(2);
	let total = state(0);
	let last = state(0);
	<button onClick={() => { const step = (size * 2) as number; total = total + step; last = step; }}>{total} {last}</button>
}`);
		expect(diagnostics).toEqual([]);
		const step = { binary: '*', left: { cell: 'state:size' }, right: { literal: 2 } };
		expect(payload?.cells.map((cell) => cell.id)).toEqual([
			'state:size',
			'state:total',
			'state:last',
		]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{
				op: 'assign',
				cell: 'state:total',
				value: { binary: '+', left: { cell: 'state:total' }, right: step },
			},
			{ op: 'assign', cell: 'state:last', value: step },
		]);
	});

	it('keeps a handler const at the value it had when declared once the handler writes what it read', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Door() @{
	let open = state(false);
	let closes = state(0);
	<button onClick={() => { const { length } = 'ab'; const wasOpen = open; open = !wasOpen; if (wasOpen) closes = closes + length; }}>{open} {closes}</button>
}`);
		expect(diagnostics).toEqual([]);
		const snapshot = payload?.cells.find((cell) => cell.name === 'wasOpen');
		expect(snapshot).toEqual({ id: 'handler:event:0/kept:0', name: 'wasOpen', initial: null });
		expect(payload?.handlers[0]?.ops).toEqual([
			{ op: 'assign', cell: snapshot!.id, value: { cell: 'state:open' } },
			{
				op: 'assign',
				cell: 'state:open',
				value: { unary: '!', value: { cell: snapshot!.id } },
			},
			{
				op: 'if',
				test: { cell: snapshot!.id },
				whenTrue: [
					{
						op: 'assign',
						cell: 'state:closes',
						value: {
							binary: '+',
							left: { cell: 'state:closes' },
							right: { member: { literal: 'ab' }, property: 'length' },
						},
					},
				],
				whenFalse: [],
			},
		]);
	});

	it('lowers a computed whose block body declares consts, a lambda parameter shadowing one', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { computed, state } from '@markless/core';
export function Sizes() @{
	let count = state(1);
	let names = state(['a']);
	const label = computed(() => {
		const doubled = count * 2;
		const item = '!';
		if (doubled > 4) {
			const big = 'big';
			return big + item;
		}
		return names.map((item) => item + doubled).join(item);
	});
	<p>{label}</p>
}`);
		expect(diagnostics).toEqual([]);
		const doubled = { binary: '*', left: { cell: 'state:count' }, right: { literal: 2 } };
		expect(payload?.nodes[1]).toMatchObject({
			kind: 'text',
			parts: [
				{
					expr: {
						if: { binary: '>', left: doubled, right: { literal: 4 } },
						whenTrue: {
							binary: '+',
							left: { literal: 'big' },
							right: { literal: '!' },
						},
						whenFalse: {
							method: 'join',
							target: {
								method: 'map',
								target: { cell: 'state:names' },
								arguments: [
									{
										lambda: ['item'],
										body: {
											binary: '+',
											left: { local: 'item' },
											right: doubled,
										},
									},
								],
							},
							arguments: [{ literal: '!' }],
						},
					},
				},
			],
		});
	});

	it('names what a handler const or a computed body uses that has no native lowering', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { computed, state } from '@markless/core';
export function Odd() @{
	let count = state(1);
	const label = computed(() => {
		for (const step of [1]) count + step;
		return 'x';
	});
	<button onClick={() => { { const inner = 1; count = inner; } let moving = count; }}>{label}</button>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the computed `label` uses a ForOfStatement, which needs a script engine',
			'the click handler uses a `const` inside a bare block, which needs a script engine',
			'the click handler uses a `let` declaration, which needs a script engine',
		]);
	});

	it('keeps a method argument and a defaulted parameter as they were at the call when the body changes what they read', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { shared, state } from '@markless/core';
const pagerState = shared(() => {
	const pager = state({ page: 1, last: 0 });
	return {
		...pager,
		go(step = 1) {
			const next = pager.page + step;
			pager.page = next;
			pager.last = step;
		},
	};
}, { scope: 'subtree' });
export function Pager() @{
	const pager = pagerState();
	<div>
		<button onClick={() => pager.go()}>{pager.page}</button>
		<button onClick={() => pager.go(pager.page)}>{pager.last}</button>
	</div>
}`);
		expect(diagnostics).toEqual([]);
		const page = { cell: 'shared:src/App.tsrx#pagerState/state:pager.page' };
		const last = 'shared:src/App.tsrx#pagerState/state:pager.last';
		const stepOf = (passed: object) => ({ logical: '??', left: passed, right: { literal: 1 } });
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[
				{
					op: 'assign',
					cell: 'handler:event:0/kept:0',
					value: { binary: '+', left: page, right: stepOf({ literal: null }) },
				},
				{ op: 'assign', cell: page.cell, value: { cell: 'handler:event:0/kept:0' } },
				{ op: 'assign', cell: last, value: stepOf({ literal: null }) },
			],
			[
				{ op: 'assign', cell: 'handler:event:1/kept:0', value: page },
				{
					op: 'assign',
					cell: 'handler:event:1/kept:1',
					value: {
						binary: '+',
						left: page,
						right: stepOf({ cell: 'handler:event:1/kept:0' }),
					},
				},
				{ op: 'assign', cell: page.cell, value: { cell: 'handler:event:1/kept:1' } },
				{ op: 'assign', cell: last, value: stepOf({ cell: 'handler:event:1/kept:0' }) },
			],
		]);
		expect(payload?.cells.slice(2).map((cell) => [cell.id, cell.name, cell.initial])).toEqual([
			['handler:event:0/kept:0', 'next', null],
			['handler:event:1/kept:0', 'step', null],
			['handler:event:1/kept:1', 'next', null],
		]);
	});

	it('inlines a module function where an expression calls it, its own module or an imported one, with parameters bound', async () => {
		const helpers = await buildSemanticGraph({
			filename: 'src/helpers.ts',
			source: `export function firstOf(list: readonly string[], fallback = 'none'): string {
	const first = list[0];
	if (first === undefined) return fallback;
	return first;
}
function hidden() { return 1; }
export { hidden as one };`,
			nativeFacts: NATIVE_FACT_COLLECTORS,
		});
		expect(helpers.moduleFunctions?.map((fn) => [fn.name, fn.exportNames, fn.native.parameters])).toEqual([
			['firstOf', ['firstOf'], ['list', 'fallback']],
			['hidden', ['one'], []],
		]);
		const app = await buildSemanticGraph({
			filename: 'src/App.tsrx',
			source: `import { state } from '@markless/core';
import { firstOf, one } from './helpers.ts';
function isText(value: unknown): boolean {
	return typeof value === 'string';
}
export function Picks() @{
	let list = state<readonly string[]>([]);
	<p>{firstOf(list)} {String(isText(list[0]))} {one()}</p>
}`,
			nativeFacts: NATIVE_FACT_COLLECTORS,
		});
		const { payload, diagnostics } = createNativeViewPayload(app, {
			modules: {
				graphs: new Map([['src/helpers.ts', helpers]]),
				resolve: (specifier) => (specifier === './helpers.ts' ? 'src/helpers.ts' : undefined),
			},
		});
		expect(diagnostics).toEqual([]);
		const first = { member: { cell: 'state:list' }, property: '0' };
		expect(payload?.nodes.find((node) => node.kind === 'text')).toMatchObject({
			parts: [
				{
					expr: {
						if: { binary: '===', left: first, right: { literal: null } },
						whenTrue: { logical: '??', left: { literal: null }, right: { literal: 'none' } },
						whenFalse: first,
					},
				},
				{ text: ' ' },
				{
					expr: {
						call: 'String',
						arguments: [{ binary: '===', left: { unary: 'typeof', value: first }, right: { literal: 'string' } }],
					},
				},
				{ text: ' ' },
				{ expr: { literal: 1 } },
			],
		});
	});

	it('names a module function, call or typeof it cannot inline', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function total(list: readonly number[]): number {
	let sum = 0;
	for (const item of list) sum += item;
	return sum;
}
function again(count: number): number {
	return count > 0 ? again(count - 1) : 0;
}
function Badge({ format }: { readonly format: number }) @{
	<b>{format(1)}</b>
}
export function Odd() @{
	let held = state<unknown>(null);
	<main>
		<p>{total([1])} {again(1)} {typeof held === 'undefined' ? 'none' : 'some'}</p>
		<Badge format={2} />
	</main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the function `total` uses a `let` declaration, which needs a script engine',
			'the function `again` calls `again` inside itself',
			"a text expression uses `typeof` other than compared with 'string', 'number' or 'boolean'; a native value does not tell undefined from null",
			'a text expression calls `format`, a value the build cannot call',
		]);
	});

	it('passes the props a widget root spreads on to its part: declared ones as props, the rest onto its element', async () => {
		const { payload, diagnostics } = await nativeView(`function Box({ tone, children, ...rest }: { readonly tone?: string; readonly children?: unknown }) @{
	<div {...rest} data-tone={tone}>{children}</div>
}
function Root({ children, ...rest }: { readonly children?: unknown }) @{
	<Box {...rest}>{children}</Box>
}
export function App() @{
	<Root tone="calm" aria-label="Group">Hi</Root>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.nodes[0]).toMatchObject({
			element: 'div',
			attributes: { 'aria-label': 'Group' },
			bindings: [{ attribute: 'data-tone', value: { literal: 'calm' } }],
		});
	});
});
