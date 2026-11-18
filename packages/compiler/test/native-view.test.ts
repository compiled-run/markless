import { describe, expect, it } from 'vitest';
import {
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
	NATIVE_UNSUPPORTED_CODE,
} from '../src/index.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const nativeView = async (source: string) =>
	createNativeViewPayload(
		await buildSemanticGraph({
			filename: 'src/App.tsrx',
			source,
			nativeFacts: NATIVE_FACT_COLLECTORS,
		}),
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
		expect(diagnostics.map((d) => d.message)).toContain(
			'the keydown event has no native meaning yet',
		);
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
		expect(payload?.events).toEqual([
			{ host: 'h4', event: 'activate', handler: 'handler:event:0' },
		]);
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
			{
				host: 'component-edge:0/h0',
				event: 'activate',
				handler: 'handler:component-edge:0/event:0',
			},
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
			{
				kind: 'repeat',
				id: 'repeat:0',
				parent: 'h2',
				list: { cell: 'state:items' },
				key: ['id'],
			},
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
		expect(
			helpers.moduleFunctions?.map((fn) => [fn.name, fn.exportNames, fn.native.parameters]),
		).toEqual([
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
				resolve: (specifier) =>
					specifier === './helpers.ts' ? 'src/helpers.ts' : undefined,
			},
		});
		expect(diagnostics).toEqual([]);
		const first = { member: { cell: 'state:list' }, property: '0' };
		expect(payload?.nodes.find((node) => node.kind === 'text')).toMatchObject({
			parts: [
				{
					expr: {
						if: { binary: '===', left: first, right: { literal: null } },
						whenTrue: {
							logical: '??',
							left: { literal: null },
							right: { literal: 'none' },
						},
						whenFalse: first,
					},
				},
				{ text: ' ' },
				{
					expr: {
						call: 'String',
						arguments: [
							{
								binary: '===',
								left: { unary: 'typeof', value: first },
								right: { literal: 'string' },
							},
						],
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
function sumWhile(list: readonly number[]): number {
	let sum = 0;
	while (sum < 3) sum += list.length;
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
	let numbers = state<readonly number[]>([]);
	<main>
		<p>{total(numbers)} {sumWhile(numbers)} {total([1, 2])} {again(1)} {typeof held === 'undefined' ? 'none' : 'some'}</p>
		<Badge format={2} />
	</main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the function `total` loops over a list known only while the app runs',
			'the function `sumWhile` uses a WhileStatement, which needs a script engine',
			'the function `again` calls `again` inside itself',
			"a text expression uses `typeof` other than compared with 'string', 'number' or 'boolean'; a native value does not tell undefined from null",
			'a text expression calls `format`, a value the build cannot call',
		]);
	});

	it('passes the props a widget root spreads on to its part: declared ones as props, the rest onto its element', async () => {
		const { payload, diagnostics } =
			await nativeView(`function Box({ tone, children, ...rest }: { readonly tone?: string; readonly children?: unknown }) @{
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

	it('runs a handler that reads where a tap landed once per element a handle names inside its host', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, shared, state } from '@markless/core';
const listState = shared(() => {
	const list = state({ picked: '' });
	const rowEls = element<HTMLDivElement[]>();
	return { ...list, rowEls };
}, { scope: 'subtree' });
function rowAt(rows: readonly HTMLElement[], target: Node): HTMLElement | null {
	for (const row of rows) if (row.contains(target)) return row;
	return null;
}
function Row({ value, children }: { readonly value: string; readonly children?: unknown }) @{
	const list = listState();
	<div el={list.rowEls} data-value={value}><span>{children}</span></div>
}
export function List() @{
	const list = listState();
	<main
		onClick={(event) => {
			if (event.shiftKey) return;
			const row = rowAt(list.rowEls, event.target as HTMLElement);
			if (row === null) return;
			list.picked = row.getAttribute('data-value') ?? '';
		}}
	>
		<Row value="a">A</Row>
		<Row value="b">B</Row>
		<p>{list.picked}</p>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const picked = 'shared:src/App.tsrx#listState/state:list.picked';
		expect(payload?.events).toEqual([
			{
				host: 'component-edge:0/h0',
				event: 'activate',
				handler: 'handler:event:0@component-edge:0/h0',
			},
			{
				host: 'component-edge:1/h0',
				event: 'activate',
				handler: 'handler:event:0@component-edge:1/h0',
			},
		]);
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[
				{
					op: 'assign',
					cell: picked,
					value: { logical: '??', left: { literal: 'a' }, right: { literal: '' } },
				},
			],
			[
				{
					op: 'assign',
					cell: picked,
					value: { logical: '??', left: { literal: 'b' }, right: { literal: '' } },
				},
			],
		]);
	});

	it('lowers focus() and scrollIntoView() on an element handle to command ops, and names event fields a tap lacks', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, state } from '@markless/core';
export function Find() @{
	let count = state(0);
	const field = element<HTMLInputElement>();
	const missing = element<HTMLElement>();
	<main>
		<input el={field} />
		<button onClick={() => { count++; field.focus(); missing?.scrollIntoView(); }}>Go</button>
		<button onClick={(event) => (count = event.clientX)}>Where</button>
	</main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the click handler reads `event.clientX`, which a tap on a phone does not have',
		]);
		const { payload: ok } = await nativeView(`import { element, state } from '@markless/core';
export function Find() @{
	let count = state(0);
	const field = element<HTMLInputElement>();
	<main>
		<input el={field} />
		<button onClick={() => { count++; field.scrollIntoView(); field.focus(); field.focus({ preventScroll: true }); }}>Go</button>
	</main>
}`);
		expect(ok?.handlers[0]?.ops).toEqual([
			{ op: 'assign', cell: 'state:count', value: expect.anything() },
			{ op: 'command', node: 'h1', command: 'scrollIntoView' },
			{ op: 'command', node: 'h1', command: 'focus' },
			{ op: 'command', node: 'h1', command: 'focus', preventScroll: true },
		]);
	});

	it('lowers a form: its fields and submit buttons, a press that submits after its own click, and the return key', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Signup() @{
	let sent = state('');
	let presses = state(0);
	<form
		onSubmit={(event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget);
			sent = \`\${String(data.get('email'))} \${data.getAll('tag').length} \${String(data.has('code'))}\`;
		}}
	>
		<input name="email" required />
		<input type="hidden" name="tag" value="a" />
		<input type="checkbox" aria-hidden="true" name="code" checked={presses > 0} />
		<button type="button">Help</button>
		<button onClick={() => presses++}>Join</button>
		<p>{sent}</p>
	</form>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.forms).toEqual([
			{
				node: 'h0',
				fields: [
					{ node: 'h1', kind: 'text', missing: 'Please fill out this field.' },
					{ node: 'h2', kind: 'hidden', missing: '' },
					{
						node: 'h3',
						kind: 'checkbox',
						missing: 'Please check this box if you want to proceed.',
					},
				],
				submitters: ['h5'],
			},
		]);
		const handler = (host: string, event: string) =>
			payload!.handlers.find(
				(entry) =>
					entry.id ===
					payload!.events.find((one) => one.host === host && one.event === event)
						?.handler,
			)?.ops;
		expect(handler('h5', 'activate')).toEqual([
			{
				op: 'assign',
				cell: 'state:presses',
				value: {
					binary: '+',
					left: { unary: '+', value: { cell: 'state:presses' } },
					right: { literal: 1 },
				},
			},
			{ op: 'submit', form: 'h0', submitter: 'h5' },
		]);
		// The return key clicks the default button, unless it is disabled; the field's edits reach the runtime.
		expect(handler('h1', 'enter')).toEqual([
			{
				op: 'if',
				test: { binary: '===', left: { literal: null }, right: { literal: null } },
				whenTrue: handler('h5', 'activate'),
				whenFalse: [],
			},
		]);
		expect(handler('h1', 'input')).toEqual([]);
		expect(handler('h4', 'activate')).toBeUndefined();
		expect(payload!.nodes.find((node) => node.id === 'h3')).toMatchObject({
			bindings: [
				{
					property: 'checked',
					value: { binary: '>', left: { cell: 'state:presses' }, right: { literal: 0 } },
				},
			],
		});
		const submit = handler('h0', 'submit')!;
		expect(submit).toHaveLength(1);
		expect(JSON.stringify(submit)).not.toContain('prevent');
	});

	it('submits a form with no submit button from the return key only when it has one text field', async () => {
		const { payload } = await nativeView(`import { state } from '@markless/core';
export function Search() @{
	let sent = state('');
	<main>
		<form onSubmit={(event) => { event.preventDefault(); sent = 'one'; }}>
			<input name="q" />
		</form>
		<form onSubmit={(event) => { event.preventDefault(); sent = 'two'; }}>
			<input name="a" />
			<input name="b" />
		</form>
		<p>{sent}</p>
	</main>
}`);
		const enters = payload!.events.filter((event) => event.event === 'enter');
		expect(enters.map((event) => event.host)).toEqual(['h2']);
		expect(payload!.handlers.find((handler) => handler.id === enters[0]!.handler)!.ops).toEqual(
			[{ op: 'submit', form: 'h1', submitter: null }],
		);
	});

	it('names a form the web would send to its action, and fields and calls no native host checks', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Forms() @{
	let sent = state('');
	<main>
		<form action="/api/join" method="post">
			<input name="email" />
			<button>Join</button>
		</form>
		<form onSubmit={(event) => { if (sent === '') return; event.preventDefault(); }}>
			<button>Send</button>
		</form>
		<form onSubmit={(event) => { event.preventDefault(); sent = String(new FormData(event.currentTarget, null).get('x')); }}>
			<input type="email" name="x" />
			<input name="code" pattern="[0-9]+" />
			<input type="checkbox" name="agree" />
			<button type="reset">Clear</button>
			<button formaction="/elsewhere">Go</button>
		</form>
	</main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the submit handler builds FormData with a submitter, which a native build does not read yet',
			'the <form> h1 has no onSubmit handler: the web sends it to its action and loads the answer (or sends a POST to an API route in place), and a phone app has no server or page to load',
			'the submit handler on the <form> h4 does not call `event.preventDefault()` on every path before it awaits or returns: the web then sends the form to its action and loads a new page, which a phone app has no server or page for',
			'the <input> h7 in the <form> h6 is an <input type="email">, which no native host draws or checks yet',
			'the <input> h8 in the <form> h6 has `pattern`, which the web checks before a submit and no native host checks yet',
			"the <input> h9 in the <form> h6 is a checkbox a person ticks, which no native host draws yet; the checkbox and toggle families' field parts work",
			'the <button> h10 in the <form> h6 is a reset button, which a native build has no lowering for yet',
			'the <button> h11 in the <form> h6 has `formaction`, which says where the web sends the form; a phone app has no server to send it to',
		]);
	});

	it('lowers an await of a timer promise to an after op that captures what the rest reads, with try, catch and finally', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function later(name: string, wait: number) {
	return new Promise<string>((resolve, reject) => {
		setTimeout(() => {
			if (name === '') reject(new Error('No name'));
			else resolve(\`Kept \${name}\`);
		}, wait);
	});
}
export function Save() @{
	let status = state('Idle');
	let runs = state(0);
	<form
		onSubmit={async (event) => {
			event.preventDefault();
			const who = String(new FormData(event.currentTarget).get('who'));
			status = 'Saving';
			try {
				const kept = await later(who, 100);
				status = kept;
			} catch (error) {
				status = (error as Error).message;
			} finally {
				runs++;
			}
		}}
	>
		<input name="who" />
		<p>{status} {runs}</p>
	</form>
}`);
		expect(diagnostics).toEqual([]);
		const submit = payload!.handlers.find((handler) => handler.id === 'handler:event:0')!.ops;
		const who = 'handler:event:0/await:0';
		const runs = {
			op: 'assign',
			cell: 'state:runs',
			value: {
				binary: '+',
				left: { unary: '+', value: { cell: 'state:runs' } },
				right: { literal: 1 },
			},
		};
		expect(submit[0]).toEqual({
			op: 'assign',
			cell: 'state:status',
			value: { literal: 'Saving' },
		});
		expect(submit[1]).toMatchObject({
			op: 'after',
			ms: { literal: 100 },
			ops: [
				{
					op: 'if',
					test: { binary: '===', left: { local: who }, right: { literal: '' } },
					whenTrue: [
						{
							op: 'assign',
							cell: 'state:status',
							value: { call: 'String', arguments: [{ literal: 'No name' }] },
						},
						runs,
					],
					whenFalse: [
						{
							op: 'assign',
							cell: 'state:status',
							value: { template: ['Kept ', { local: who }, ''] },
						},
						runs,
					],
				},
			],
		});
		const after = submit[1] as Extract<(typeof submit)[number], { op: 'after' }>;
		expect(after.capture.map(([name]) => name)).toEqual([who]);
		expect(after.capture[0]![1]).toMatchObject({ call: 'String' });
		expect(submit).toHaveLength(2);
	});

	it('names an await that cannot be lowered: inside an if, in an expression, or failing outside a catch', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function later(wait: number) {
	return new Promise<string>((resolve, reject) => {
		setTimeout(() => reject(new Error('late')), wait);
	});
}
export function Waits() @{
	let status = state('');
	<main>
		<form onSubmit={async (event) => { event.preventDefault(); if (status === '') { status = await later(1); } }}><button>A</button></form>
		<form onSubmit={async (event) => { event.preventDefault(); status = 'x' + (await later(1)); }}><button>B</button></form>
		<form onSubmit={async (event) => { event.preventDefault(); status = await later(1); }}><button>C</button></form>
	</main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the submit handler awaits inside an `if`, a loop or a called function; a native build awaits only at the top of a handler or of its `try`',
			'the submit handler awaits inside an expression; a native build awaits only the whole value of a statement',
			'the submit handler awaits a promise that can fail outside a `try` with a `catch`; on the web the failure shows in the nearest @catch, which a native build has no lowering for yet',
		]);
	});
});
