import { describe, expect, it } from 'vitest';
import {
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
	NATIVE_UNSUPPORTED_CODE,
	type NativeViewOptions,
} from '../src/native.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const nativeView = async (source: string, options: NativeViewOptions = {}) =>
	createNativeViewPayload(
		await buildSemanticGraph({
			filename: 'src/App.tsrx',
			source,
			nativeFacts: NATIVE_FACT_COLLECTORS,
		}),
		{ readSource: (file) => (file === 'src/App.tsrx' ? source : undefined), ...options },
	);
/** The data vocabulary alone, as before handlers could fall back to JavaScript. */
const dataOnly: NativeViewOptions = { scriptHandlers: 'never' };

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
					defaultStyle: { bold: true, size: 2 },
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
			{
				kind: 'element',
				id: 'h2',
				element: 'b',
				parent: 'h1',
				defaultStyle: { flow: 'inline', bold: true },
			},
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

	it('refuses a value that calls author code, naming the call when handlers are data only', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { state } from '@markless/core';
export function Sum() @{
	let total = state(1);
	<button onClick={() => (total = double(total))}>Total {total}</button>
}`,
			dataOnly,
		);
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

	it('refuses a handler that does more than write state when handlers are data only', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { state } from '@markless/core';
export function Logger() @{
	let count = state(0);
	<button onClick={() => { count++; console.log(count); }}>Count {count}</button>
}`,
			dataOnly,
		);
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

	it('leaves out key and focus handlers on a checkbox or radio button, which a tap ticks and no soft keyboard types in', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Choice() @{
	let note = state('');
	<main>
		<input type="radio" aria-label="Small" onFocus={() => (note = 'focus')} onKeyDown={() => (note = 'key')} onChange={() => (note = 'small')} />
		<input type="checkbox" aria-label="News" onBlur={() => (note = 'blur')} onChange={() => (note = 'news')} />
		<input type="text" aria-label="Name" onFocus={() => (note = 'typing')} />
		<p>{note}</p>
	</main>
}`);
		expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
			[
				'MARKLESS_NATIVE_KEYBOARD_ONLY',
				'the focus handler on <input> h1 runs only from a hardware keyboard on a phone; native hosts have none yet, so it is left out',
			],
			[
				'MARKLESS_NATIVE_KEYBOARD_ONLY',
				'the keydown handler on <input> h1 runs only from a hardware keyboard on a phone; native hosts have none yet, so it is left out',
			],
			[
				'MARKLESS_NATIVE_KEYBOARD_ONLY',
				'the blur handler on <input> h2 runs only from a hardware keyboard on a phone; native hosts have none yet, so it is left out',
			],
			[NATIVE_UNSUPPORTED_CODE, 'the focus event has no native meaning yet'],
		]);
		expect(payload).toBeNull();
	});

	it('gives a state field whose first value is undefined a null cell, as a native expression spells undefined', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { shared, state } from '@markless/core';
const pickState = shared(() => {
	const pick = state({ chosen: undefined as string | undefined, count: 0 });
	return { ...pick };
}, { scope: 'subtree' });
function Picker() @{
	const pick = pickState();
	<p>{pick.chosen === undefined ? 'unset' : pick.chosen}</p>
}
export function Page() @{
	let note = state({ text: undefined as string | undefined });
	<main>
		<Picker />
		<p>{note.text ?? 'no note'}</p>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.cells.map((cell) => [cell.name, cell.initial])).toEqual([
			['note.text', null],
			['pick.chosen', null],
			['pick.count', 0],
		]);
	});

	it('refuses a strict comparison that would tell undefined from null where a native cell cannot', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { state } from '@markless/core';
export function Page() @{
	let draft = state({ given: undefined as string | undefined, held: null as string | null });
	<main>
		<p>{draft.given === null ? 'null' : 'not null'}</p>
		<p>{draft.held === undefined ? 'undefined' : 'defined'}</p>
		<p>{draft.given === undefined && draft.held === null ? 'both as written' : 'no'}</p>
	</main>
}`,
			dataOnly,
		);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'a text expression compares with `null` a value whose first value is `undefined`; a native value does not tell undefined from null',
			'a text expression compares with `undefined` a value whose first value is `null`; a native value does not tell undefined from null',
		]);
	});

	it("reads an input event's target as the field typed into, whose value is the typed text, only in that handler", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function textOf(from: EventTarget | null): string {
	const control = from as HTMLInputElement | null;
	if (!control) return '';
	return control.value;
}
export function Page() @{
	let said = state('');
	<main>
		<input aria-label="Name" onInput={(event) => (said = textOf(event.target))} />
		<p>{said}</p>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.handlers).toEqual([
			{ id: 'handler:event:0', ops: [{ op: 'assign', cell: 'state:said', value: { event: 'value' } }] },
		]);
		const elsewhere = await nativeView(`import { state } from '@markless/core';
function textOf(from: EventTarget | null): string {
	const control = from as HTMLInputElement | null;
	return control ? control.value : '';
}
export function Page() @{
	let said = state('');
	<main>
		<button onClick={(event) => (said = textOf(event.target))}>Read</button>
		<p>{said}</p>
	</main>
}`);
		expect(elsewhere.payload).toBeNull();
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

	it('passes a prop that follows state as the live expression it was written as: a computed, a sum, a prop passed on', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { computed, state } from '@markless/core';
function Badge({ total }) @{
	<span hidden={total === 0}>{total}</span>
}
function Header({ heading, size }) @{
	<header><h1>{heading}</h1><Badge total={size} /></header>
}
export function Page() @{
	let picks = state(0);
	const heading = computed(() => (picks > 2 ? 'Many' : 'Few'));
	<main>
		<Header heading={heading} size={picks * 2} />
		<button onClick={() => picks++}>Pick</button>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const elementOf = (tag: string) =>
			payload?.nodes.find((node) => node.kind === 'element' && node.element === tag);
		const textIn = (tag: string) =>
			payload?.nodes.find(
				(node) => node.kind === 'text' && node.parent === elementOf(tag)?.id,
			);
		const doubled = { binary: '*', left: { cell: 'state:picks' }, right: { literal: 2 } };
		expect(textIn('h1')).toMatchObject({
			parts: [
				{
					expr: {
						if: { binary: '>', left: { cell: 'state:picks' }, right: { literal: 2 } },
						whenTrue: { literal: 'Many' },
						whenFalse: { literal: 'Few' },
					},
				},
			],
		});
		expect(textIn('span')).toMatchObject({ parts: [{ expr: doubled }] });
		expect(elementOf('span')).toMatchObject({
			bindings: [
				{
					attribute: 'hidden',
					value: { binary: '===', left: doubled, right: { literal: 0 } },
				},
			],
		});
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

	it('refuses reversing a state array in place when handlers are data only', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { state } from '@markless/core';
export function List() @{
	let items = state([1, 2]);
	<button onClick={() => (items = items.reverse())}>Flip {items.length}</button>
}`,
			dataOnly,
		);
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

	it('lowers <native.sheet> to a sheet node whose content is the markup between its tags, under any import name', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
import { native as platformUi } from '@markless/device';
export function Picker() @{
	let choosing = state(false);
	let fruit = state('none');
	<section>
		<p>Fruit {fruit}</p>
		<platformUi.sheet open={choosing} onChange={(shown) => (choosing = shown)} snapPoints={[1, 0.4]}>
			<button onClick={() => { fruit = 'fig'; choosing = false; }}>Fig</button>
		</platformUi.sheet>
	</section>
}`);
		expect(diagnostics).toEqual([]);
		const sheet = payload?.nodes.find((node) => node.kind === 'sheet');
		expect(sheet).toEqual({
			kind: 'sheet',
			id: 'sheet:component-edge:0',
			parent: 'h0',
			open: { cell: 'state:choosing' },
			snapPoints: [0.4, 1],
			dismissible: true,
			modal: true,
		});
		expect(
			payload?.nodes.filter((node) => node.parent === sheet?.id).map((node) => node.id),
		).toEqual(['h2']);
		expect(payload?.events).toContainEqual({
			host: sheet?.id,
			event: 'dismiss',
			handler: `handler:${sheet?.id}`,
		});
		expect(
			payload?.handlers.find((handler) => handler.id === `handler:${sheet?.id}`)?.ops,
		).toEqual([{ op: 'assign', cell: 'state:choosing', value: { literal: false } }]);
	});

	it('refuses a <native.sheet> the platforms cannot all present, naming the reason', async () => {
		const refusal = async (props: string) =>
			(
				await nativeView(`import { state } from '@markless/core';
import { native } from '@markless/device';
export function App() @{
	let open = state(false);
	<main>
		<native.sheet open={open} ${props}><p>Hi</p></native.sheet>
	</main>
}`)
			).diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message]);
		expect(await refusal('')).toEqual([
			[
				NATIVE_UNSUPPORTED_CODE,
				expect.stringContaining('dismissible <native.sheet> without `onChange`'),
			],
		]);
		expect(await refusal('dismissible={false}')).toEqual([]);
		expect(await refusal('dismissible={false} snapPoints={[0.3, 0.6, 1]}')).toEqual([
			[NATIVE_UNSUPPORTED_CODE, expect.stringContaining('`snapPoints` of <native.sheet>')],
		]);
		expect(await refusal('dismissible={false} snapPoints={[0.5]}')).toEqual([
			[NATIVE_UNSUPPORTED_CODE, expect.stringContaining('the largest 1')],
		]);
		expect(await refusal('dismissible={false} modal={false}')).toEqual([
			[NATIVE_UNSUPPORTED_CODE, expect.stringContaining('`modal={false}`')],
		]);
		expect(await refusal('dismissible={false} class="frame"')).toEqual([
			[
				NATIVE_UNSUPPORTED_CODE,
				expect.stringContaining('the `class` prop of <native.sheet>'),
			],
		]);
		expect(await refusal('dismissible={open}')).toEqual([
			[NATIVE_UNSUPPORTED_CODE, expect.stringContaining('must be fixed at build time')],
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

	it('names what a handler const or a computed body uses that has no native lowering when handlers are data only', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { computed, state } from '@markless/core';
export function Odd() @{
	let count = state(1);
	const label = computed(() => {
		for (const step of [1]) count + step;
		return 'x';
	});
	<button onClick={() => { { const inner = 1; count = inner; } let moving = count; }}>{label}</button>
}`,
			dataOnly,
		);
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

	it('names a module function, call or typeof it cannot inline when values are data only', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { state } from '@markless/core';
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
}`,
			dataOnly,
		);
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

	it('places a @for inside an @if arm, with its @empty, in that arm, and still refuses one inside another @for', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Shelf() @{
	let showing = state(true);
	let books = state([{ isbn: '1', title: 'One' }]);
	<section>
		@if (showing) {
			<ol>
				@for (const book of books; key book.isbn) { <li>{book.title}</li> } @empty { <li>None</li> }
			</ol>
		}
	</section>
}`);
		expect(diagnostics).toEqual([]);
		const branch = payload!.nodes.find(
			(node) => node.kind === 'branch' && !node.id.endsWith(':empty'),
		)!;
		const repeat = payload!.nodes.find((node) => node.kind === 'repeat')!;
		expect(repeat.arm).toEqual({ branch: branch.id, index: 0 });
		expect(payload!.nodes.find((node) => node.id === `${repeat.id}:empty`)?.arm).toEqual({
			branch: branch.id,
			index: 0,
		});
		const nested = await nativeView(`import { state } from '@markless/core';
export function Shelves() @{
	let shelves = state([{ id: 'a', books: [{ isbn: '1', title: 'One' }] }]);
	<section>
		@for (const shelf of shelves; key shelf.id) {
			<ol>@for (const book of shelf.books; key book.isbn) { <li>{book.title}</li> }</ol>
		}
	</section>
}`);
		expect(nested.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
			'@for inside another @for',
		);
	});

	it('lowers @empty to a branch shown while the list has no rows', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function List() @{
	let items = state([{ id: 1, name: 'a' }]);
	<ul>
		@for (const row of items; key row.id) { <li>{row.name}</li> } @empty { <li>Nothing</li> }
	</ul>
}`);
		expect(diagnostics).toEqual([]);
		const repeat = payload?.nodes.find((node) => node.kind === 'repeat');
		const empty = payload?.nodes.find((node) => node.kind === 'branch');
		expect(empty).toEqual({
			kind: 'branch',
			id: `${repeat?.id}:empty`,
			parent: 'h0',
			test: {
				binary: '===',
				left: { member: { cell: 'state:items' }, property: 'length' },
				right: { literal: 0 },
			},
			arms: 1,
		});
		const nothing = payload?.nodes.filter((node) => node.arm?.branch === empty?.id);
		expect(nothing?.map((node) => node.kind)).toEqual(['element', 'text']);
		expect(nothing?.every((node) => !node.row)).toBe(true);
	});

	it('runs a handler inside a row with that row item', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Basket() @{
	let fruits = state([{ id: 'a', name: 'Apple' }]);
	<ul>
		@for (const fruit of fruits; key fruit.id) {
			<li><button onClick={() => (fruits = fruits.filter((other) => other.id !== fruit.id))}>Drop {fruit.name}</button></li>
		}
	</ul>
}`);
		expect(diagnostics).toEqual([]);
		const button = payload?.nodes.find(
			(node) => node.kind === 'element' && node.element === 'button',
		);
		expect(button?.row).toBe('repeat:0');
		const event = payload?.events.find((candidate) => candidate.host === button?.id);
		expect(payload?.handlers.find((handler) => handler.id === event?.handler)?.ops).toEqual([
			{
				op: 'assign',
				cell: 'state:fruits',
				value: {
					method: 'filter',
					target: { cell: 'state:fruits' },
					arguments: [
						{
							lambda: ['other'],
							body: {
								binary: '!==',
								left: { member: { local: 'other' }, property: 'id' },
								right: { member: { item: 'repeat:0' }, property: 'id' },
							},
						},
					],
				},
			},
		]);
	});

	it('gives a component rendered in a row its own state per row, and its props from the row item', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function Line({ label }) @{
	let picked = state(false);
	<button aria-pressed={picked} onClick={() => (picked = !picked)}>{label}</button>
}
export function Lines() @{
	let lines = state([{ id: 'x', title: 'X' }]);
	<div>
		@for (const line of lines; key line.id) { <Line label={line.title} /> }
	</div>
}`);
		expect(diagnostics).toEqual([]);
		const repeat = payload!.nodes.find((node) => node.kind === 'repeat')!;
		const rowCell = payload?.cells.find((cell) => cell.name === 'picked');
		expect(rowCell).toMatchObject({ initial: false, row: repeat.id });
		expect(payload?.cells.find((cell) => cell.name === 'lines')?.row).toBeUndefined();
		expect(payload?.nodes.find((node) => node.kind === 'text')).toMatchObject({
			row: repeat.id,
			parts: [{ expr: { member: { item: repeat.id }, property: 'title' } }],
		});
		expect(payload?.handlers[0]?.ops).toEqual([
			{
				op: 'assign',
				cell: rowCell!.id,
				value: { unary: '!', value: { cell: rowCell!.id } },
			},
		]);
	});

	it("points an element's id reference inside a row at the same row's copy", async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, state } from '@markless/core';
function Entry({ title }) @{
	const heading = element();
	<section aria-labelledby={heading}>
		<h2 el={heading}>{title}</h2>
	</section>
}
export function Entries() @{
	let entries = state([{ slug: 'a', title: 'A' }]);
	<div>
		@for (const entry of entries; key entry.slug) { <Entry title={entry.title} /> }
	</div>
}`);
		expect(diagnostics).toEqual([]);
		const section = payload?.nodes.find(
			(node) => node.kind === 'element' && node.element === 'section',
		);
		const heading = payload?.nodes.find(
			(node) => node.kind === 'element' && node.element === 'h2',
		);
		expect(section?.kind === 'element' && section.bindings).toEqual([
			{
				attribute: 'aria-labelledby',
				value: {
					template: [
						`${heading?.id}@`,
						{ member: { item: 'repeat:0' }, property: 'slug' },
					],
				},
			},
		]);
	});

	it('refuses an id reference from outside a row to an element inside one', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, shared, state } from '@markless/core';
const panel = shared(() => {
	const contentEl = element();
	return { contentEl };
}, { scope: 'subtree' });
function Root({ children }) @{
	const own = panel();
	<div>{children}</div>
}
function Trigger() @{
	const own = panel();
	<button aria-controls={own.contentEl}>Show</button>
}
function Content({ children }) @{
	const own = panel();
	<section el={own.contentEl}>{children}</section>
}
export function Entries() @{
	let entries = state([{ slug: 'a', title: 'A' }]);
	<Root>
		<Trigger />
		<ul>
			@for (const entry of entries; key entry.slug) { <Content>{entry.title}</Content> }
		</ul>
	</Root>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the `aria-controls` attribute of component-edge:1/h1 names an element inside a @for row it is not in',
		]);
	});

	it('lowers a @for over a shared() field or a computed to a list of that expression', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { computed, shared, state } from '@markless/core';
const listState = shared(() => {
	const list = state({ tags: ['a', 'b'] });
	return { ...list };
}, { scope: 'subtree' });
export function Tags() @{
	const list = listState();
	let extra = state(['c']);
	const all = computed(() => [...list.tags, ...extra]);
	<div>
		<ul>@for (const tag of list.tags; key tag) { <li>{tag}</li> }</ul>
		<ol>@for (const tag of all; key tag) { <li>{tag}</li> }</ol>
	</div>
}`);
		expect(diagnostics).toEqual([]);
		const tags = payload!.cells.find((cell) => cell.name === 'list.tags')!;
		expect(
			payload?.nodes.flatMap((node) =>
				node.kind === 'repeat' ? [[node.list, node.key]] : [],
			),
		).toEqual([
			[{ cell: tags.id }, []],
			[
				{
					array: [
						{ spread: true, value: { cell: tags.id } },
						{ spread: true, value: { cell: 'state:extra' } },
					],
				},
				[],
			],
		]);
	});

	it('refuses a @for keyed by its index by name, and not again as markup it left out', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Words() @{
	let words = state(['a', 'b']);
	<ul>@for (const word of words; index at; key at) { <li>{word}</li> }</ul>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'a @for keyed by its index; a native list keys each row by its item',
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
					{ node: 'h1', kind: 'text' },
					{ node: 'h2', kind: 'hidden' },
					{ node: 'h3', kind: 'checkbox' },
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

	describe('a submit handler calling an app function that is not data', () => {
		const payloadOf = async (files: Record<string, string>, entry: string) => {
			const graphs = new Map<string, Awaited<ReturnType<typeof buildSemanticGraph>>>();
			for (const [filename, source] of Object.entries(files))
				graphs.set(
					filename,
					await buildSemanticGraph({
						filename,
						source,
						nativeFacts: NATIVE_FACT_COLLECTORS,
					}),
				);
			return createNativeViewPayload(graphs.get(entry)!, {
				modules: {
					graphs,
					resolve: (specifier) => `src/${specifier.replace('./', '')}`,
				},
				readSource: (file) => files[file],
			});
		};
		const scriptCalls = (tree: unknown): unknown[] =>
			!tree || typeof tree !== 'object'
				? []
				: 'script' in tree
					? [tree]
					: Object.values(tree).flatMap(scriptCalls);

		it('runs an imported helper (a method on a number, JSON) as JavaScript once, from the data handler', async () => {
			const { payload, diagnostics } = await payloadOf(
				{
					'src/entries.ts': `export function addEntry(text: string, entry: { readonly site: string }): { saved: string; id: string } {
	const id = Date.now().toString(36);
	return { saved: JSON.stringify([{ ...entry, id }, ...JSON.parse(text)]), id };
}`,
					'src/App.tsrx': `import { state } from '@markless/core';
import { addEntry } from './entries.ts';
export function Entries() @{
	let saved = state('[]');
	let last = state('');
	<form
		onSubmit={(event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget);
			const added = addEntry(saved, { site: String(data.get('site')) });
			saved = added.saved;
			last = added.id;
		}}
	>
		<input name="site" />
		<button>Add</button>
		<p>{last}</p>
	</form>
}`,
				},
				'src/App.tsrx',
			);
			expect(diagnostics).toEqual([]);
			const submit = payload!.handlers.find(
				(handler) =>
					handler.id ===
					payload!.events.find((event) => event.event === 'submit')?.handler,
			)!.ops;
			expect(submit.map((op) => op.op)).toEqual(['assign', 'assign', 'assign']);
			expect(scriptCalls(submit)).toEqual([
				{
					script: 'fn:0',
					bindings: {
						args: {
							value: {
								array: [
									{ spread: false, value: { cell: 'state:saved' } },
									{
										spread: false,
										value: expect.objectContaining({
											object: expect.anything(),
										}),
									},
								],
							},
						},
					},
				},
			]);
			expect(payload!.script!.source).toContain('toString(36)');
		});

		it('runs a same-file helper called straight into state, with other names and a method on a number', async () => {
			const { payload, diagnostics } = await payloadOf(
				{
					'src/Tally.tsrx': `import { state } from '@markless/core';
function encodeCount(previous: string, count: number): string {
	return JSON.stringify({ previous, hex: count.toString(16) });
}
export function Tally() @{
	let record = state('');
	<form
		onSubmit={(submitEvent) => {
			submitEvent.preventDefault();
			record = encodeCount(record, Number(new FormData(submitEvent.currentTarget).get('count')));
		}}
	>
		<button>Encode</button>
		<input name="count" />
		<p>{record}</p>
	</form>
}`,
				},
				'src/Tally.tsrx',
			);
			expect(diagnostics).toEqual([]);
			const submit = payload!.handlers.find(
				(handler) =>
					handler.id ===
					payload!.events.find((event) => event.event === 'submit')?.handler,
			)!.ops;
			expect(submit).toEqual([
				{
					op: 'assign',
					cell: 'state:record',
					value: expect.objectContaining({ script: 'fn:0' }),
				},
			]);
			expect(payload!.script!.source).toContain('toString(16)');
		});

		it('keeps a helper value read twice, so the script runs once as the web calls it once', async () => {
			const { payload, diagnostics } = await payloadOf(
				{
					'src/stamp.ts': `export const makeStamp = () => ({ code: Date.now().toString(36), label: JSON.stringify('x') });`,
					'src/Stamps.tsrx': `import { state } from '@markless/core';
import { makeStamp } from './stamp.ts';
export function Stamps() @{
	let first = state('');
	let second = state('');
	<form
		onSubmit={(event) => {
			event.preventDefault();
			const made = makeStamp();
			first = made.code;
			second = made.code + made.label;
		}}
	>
		<button>Stamp</button>
		<p>{first} {second}</p>
	</form>
}`,
				},
				'src/Stamps.tsrx',
			);
			expect(diagnostics).toEqual([]);
			const submit = payload!.handlers.find(
				(handler) =>
					handler.id ===
					payload!.events.find((event) => event.event === 'submit')?.handler,
			)!.ops;
			expect(scriptCalls(submit)).toHaveLength(1);
			expect(submit[0]).toMatchObject({ op: 'assign', value: { script: 'fn:0' } });
		});
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
			<input type="radio" name={sent} />
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
			'the <input> h9 in the <form> h6 binds the `name` of a radio button, which a native build reads only as written',
			'the <button> h10 in the <form> h6 is a reset button, which a native build has no lowering for yet',
			'the <button> h11 in the <form> h6 has `formaction`, which says where the web sends the form; a phone app has no server to send it to',
		]);
	});

	it("keeps a text field's maxlength, written or bound, and carries Chromium's too-long messages only for a form that has one", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Codes() @{
	let limit = state(4);
	let sent = state('');
	<main>
		<form onSubmit={(event) => { event.preventDefault(); sent = String(new FormData(event.currentTarget).get('pin')); }}>
			<input name="name" maxlength="20" />
			<input name="pin" maxlength={limit} />
			<button>Send</button>
		</form>
		<p>{sent}</p>
	</main>
}`);
		expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		expect(payload!.nodes.find((node) => node.id === 'h2')).toMatchObject({
			attributes: { name: 'name', maxlength: '20' },
		});
		expect(payload!.tooLong?.['en']).toEqual({
			text: 'Please shorten this text to {max} characters or less (you are currently using {length} characters).',
		});
		expect(payload!.tooLong?.['fa']?.digits).toBe('۰۱۲۳۴۵۶۷۸۹');
		const plain = await nativeView(`export function Plain() @{
	<form onSubmit={(event) => event.preventDefault()}>
		<input name="name" />
		<button>Send</button>
	</form>
}`);
		expect(plain.payload!.valueMissing).toBeDefined();
		expect(plain.payload!.tooLong).toBeUndefined();
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

	it('ticks a checkbox or radio button before its click, input and change handlers, and reads its checkedness', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Ticks() @{
	let note = state('');
	<main>
		<input type="checkbox" onClick={() => (note = 'click')} onChange={(event) => (note = \`\${note} \${String(event.currentTarget.checked)} \${event.currentTarget.value}\`)} />
		<input type="radio" name="size" value="S" onInput={() => (note = 'S')} />
		<p>{note}</p>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const ops = (host: string) =>
			payload!.handlers.find(
				(handler) =>
					handler.id === payload!.events.find((event) => event.host === host)?.handler,
			)!.ops;
		expect(payload!.events.map((event) => [event.host, event.event])).toEqual([
			['h1', 'activate'],
			['h2', 'activate'],
		]);
		const click = { op: 'assign', cell: 'state:note', value: { literal: 'click' } };
		expect(ops('h1')).toEqual([
			{ op: 'tick', node: 'h1' },
			click,
			{
				op: 'assign',
				cell: 'state:note',
				value: {
					template: [
						'',
						{ cell: 'state:note' },
						' ',
						{ call: 'String', arguments: [{ checked: 'h1' }] },
						' ',
						{ logical: '??', left: { literal: null }, right: { literal: 'on' } },
						'',
					],
				},
			},
		]);
		// A radio button already checked is not ticked again, and its input and change handlers do not run.
		expect(ops('h2')).toEqual([
			{
				op: 'if',
				test: { checked: 'h2' },
				whenTrue: [],
				whenFalse: [
					{ op: 'tick', node: 'h2' },
					{ op: 'assign', cell: 'state:note', value: { literal: 'S' } },
				],
			},
		]);
	});
});

describe('the element vocabulary', () => {
	const source = (markup: string) => `import { state } from '@markless/core';
export function Page() @{
	let n = state(1);
	<main>
${markup}
		<button onClick={() => n++}>Add</button>
	</main>
}`;
	const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

	it('gives phrase elements a flow inside their paragraph and blocks their default look', async () => {
		const { payload, diagnostics } = await nativeView(
			source(`		<p>Run <code>{n}</code><br /><kbd>K</kbd></p>
		<pre>{'a\\n  b'}</pre>
		<abbr title="x">X</abbr>`),
		);
		expect(diagnostics).toEqual([]);
		const styles = payload!.nodes.flatMap((node) =>
			node.kind === 'element' ? [[node.element, node.defaultStyle]] : [],
		);
		expect(styles).toEqual([
			['main', undefined],
			['p', undefined],
			['code', { flow: 'inline', monospace: true, size: 0.8125 }],
			['br', { flow: 'break' }],
			['kbd', { flow: 'inline', monospace: true, size: 0.8125 }],
			['pre', { monospace: true, size: 0.8125, preformatted: true }],
			['abbr', { flow: 'inline', line: 'underline' }],
			['button', undefined],
		]);
	});

	it('keeps a phrase element out of the text flow when it needs a view of its own', async () => {
		const { payload } = await nativeView(
			source(
				`		<p><span onClick={() => n++}>tap</span> <em hidden>gone</em> <strong><div>block</div></strong> <b>kept</b></p>`,
			),
		);
		const flows = Object.fromEntries(
			payload!.nodes.flatMap((node) =>
				node.kind === 'element' ? [[node.element, node.defaultStyle?.flow ?? null]] : [],
			),
		);
		expect(flows).toMatchObject({ span: null, em: null, strong: null, b: 'inline' });
	});

	it('shows nothing for metadata, hints, data scripts, templates and noscript, as the web does', async () => {
		const { payload, diagnostics } = await nativeView(
			source(`		<meta name="description" content="d" />
		<link rel="preload" as="image" href="/a.png" />
		<script type="application/ld+json">{'{}'}</script>
		<template><p>inert</p></template>
		<noscript><p>no script</p></noscript>`),
		);
		expect(diagnostics).toEqual([]);
		expect(
			payload!.nodes.flatMap((node) => (node.kind === 'element' ? [node.element] : [])),
		).toEqual(['main', 'button']);
	});

	it('refuses scripts, loaded stylesheets and unknown elements with their own code and place', async () => {
		const text = source(`		<script>{'run()'}</script>
		<link rel="stylesheet" href="/site.css" />
		<marquee>old</marquee>`);
		const { payload, diagnostics } = await nativeView(text);
		expect(payload).toBeNull();
		expect(
			diagnostics.map((d) => [
				d.code,
				d.message,
				d.primarySpan && lineOf(text, d.primarySpan.start),
			]),
		).toEqual([
			[
				'MARKLESS_NATIVE_SCRIPT',
				'a <script> runs code in the browser, and a native app has no browser to run it',
				5,
			],
			[
				'MARKLESS_NATIVE_STYLESHEET',
				'<link rel="stylesheet" href="/site.css"> loads styles while the page runs',
				6,
			],
			['MARKLESS_NATIVE_ELEMENT', 'the <marquee> element has no native view yet', 7],
		]);
		expect(diagnostics.every((d) => d.primarySpan?.filename === 'src/App.tsrx')).toBe(true);
	});

	it("takes the page's first <title> as the screen's title and shows no <title> in the page", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function Layout({ children }) @{
	<div><title>From the layout</title>{children}</div>
}
export function Page() @{
	let n = state(1);
	<Layout><title>Second</title><p>Body</p><button onClick={() => n++}>Add</button></Layout>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.title).toEqual([{ text: 'From the layout' }]);
		expect(
			payload!.nodes.some((node) => node.kind === 'element' && node.element === 'title'),
		).toBe(false);
	});

	it('shows text written at the top of a page, outside any element', async () => {
		const { payload, diagnostics } = await nativeView(`export function Page() @{
	<>{'Only text'}</>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.nodes).toEqual([
			{ kind: 'text', id: 'text0', parent: null, parts: [{ text: 'Only text' }] },
		]);
	});
});

describe('inline svg', () => {
	it("compiles an svg's shapes into a drawing, with its <title> as its name", async () => {
		const { payload, diagnostics } = await nativeView(`export function Icon() @{
	<svg viewBox="0 0 20 10" width="40" height="20" fill="currentColor">
		<title>Logo</title>
		<path d="M0 0h10v10z" />
		<g transform="translate(10 0)" stroke="red" stroke-width="2" fill="none">
			<circle cx="5" cy="5" r="5" />
		</g>
	</svg>
}`);
		expect(diagnostics).toEqual([]);
		const svg = payload!.nodes[0]!;
		expect(payload!.nodes).toHaveLength(1);
		expect(svg).toMatchObject({
			kind: 'element',
			element: 'svg',
			attributes: { 'aria-label': 'Logo' },
		});
		if (svg.kind !== 'element') throw new Error('not an element');
		expect(svg.drawing).toMatchObject({ viewBox: [0, 0, 20, 10], width: 40, height: 20 });
		const [path, circle] = svg.drawing!.shapes;
		expect(path).toEqual({
			path: [0, 0, 0, 1, 10, 0, 1, 10, 10, 4],
			fill: 'currentColor',
			fillRule: 'nonzero',
			stroke: null,
			width: 1,
			cap: 'butt',
			join: 'miter',
			miterLimit: 4,
		});
		expect(circle).toMatchObject({
			fill: null,
			stroke: { r: 255, g: 0, b: 0, alpha: 255 },
			width: 2,
			transform: [1, 0, 0, 1, 10, 0],
		});
		expect(circle!.path.slice(0, 3)).toEqual([0, 10, 5]);
	});

	it('reads hex, rgb() and named colours with their alpha', async () => {
		const { payload } = await nativeView(`export function Swatches() @{
	<svg viewBox="0 0 4 1">
		<rect width="1" height="1" fill="#e63946" />
		<rect width="1" height="1" fill="#0f08" />
		<rect width="1" height="1" fill="rgb(10 20 30 / 50%)" />
		<rect width="1" height="1" fill="teal" />
	</svg>
}`);
		const svg = payload!.nodes[0]!;
		if (svg.kind !== 'element') throw new Error('not an element');
		expect(svg.drawing!.shapes.map((shape) => shape.fill)).toEqual([
			{ r: 230, g: 57, b: 70, alpha: 255 },
			{ r: 0, g: 255, b: 0, alpha: 136 },
			{ r: 10, g: 20, b: 30, alpha: 128 },
			{ r: 0, g: 128, b: 128, alpha: 255 },
		]);
	});

	it('keeps a size in ems as ems and turns absolute units into CSS pixels', async () => {
		const sizes = async (width: string, height: string) => {
			const { payload } = await nativeView(`export function Icon() @{
	<svg viewBox="0 0 10 10" width="${width}" height="${height}"><rect width="10" height="10" /></svg>
}`);
			const svg = payload!.nodes[0]!;
			if (svg.kind !== 'element') throw new Error('not an element');
			const { shapes: _shapes, viewBox: _viewBox, ...size } = svg.drawing!;
			return size;
		};
		expect(await sizes('1em', '1.5em')).toEqual({ width: 1, height: 1.5, em: true });
		expect(await sizes('12pt', '1in')).toEqual({ width: 16, height: 96 });
		expect(await sizes('100%', '2rem')).toEqual({ height: 32 });
	});

	it('draws a <use> of a <symbol> in the same svg, fitted to the size the use gives it', async () => {
		const { payload, diagnostics } = await nativeView(`export function Stars() @{
	<svg viewBox="0 0 20 10">
		<defs><symbol id="dot" viewBox="0 0 2 2"><rect width="2" height="2" /></symbol></defs>
		<use href="#dot" x="10" width="10" height="10" />
	</svg>
}`);
		expect(diagnostics).toEqual([]);
		const svg = payload!.nodes[0]!;
		if (svg.kind !== 'element') throw new Error('not an element');
		expect(svg.drawing!.shapes).toHaveLength(1);
		expect(svg.drawing!.shapes[0]!.transform).toEqual([5, 0, 0, 5, 10, 0]);
	});

	it('turns arcs and quadratics into cubics that end where the web ends them', async () => {
		const { payload } = await nativeView(`export function Arc() @{
	<svg viewBox="0 0 20 20"><path d="M0 10A10 10 0 0 1 20 10Q20 20 10 20" /></svg>
}`);
		const svg = payload!.nodes[0]!;
		if (svg.kind !== 'element') throw new Error('not an element');
		const outline = svg.drawing!.shapes[0]!.path;
		expect(outline.filter((verb, index) => index === 0 || verb === 3).length).toBeGreaterThan(
			2,
		);
		expect(outline.slice(-2)).toEqual([10, 20]);
		const halfway = outline.indexOf(3, outline.indexOf(3) + 1);
		expect(
			outline.slice(halfway + 5, halfway + 7).map((value) => Math.round(value * 1e6) / 1e6),
		).toEqual([20, 10]);
	});

	it('refuses what a drawing cannot hold by name, at the shape that holds it', async () => {
		const text = `import { state } from '@markless/core';
export function Chart() @{
	let w = state(4);
	<svg viewBox="0 0 10 10">
		<path d="M0 0h10" stroke-dasharray="2 2" />
		<rect width={w} height="2" fill="url(#g)" />
		<text x="0" y="5">label</text>
	</svg>
}`;
		const { payload, diagnostics } = await nativeView(text);
		expect(payload).toBeNull();
		expect(diagnostics.every((d) => d.code === 'MARKLESS_NATIVE_SVG')).toBe(true);
		expect(
			diagnostics.map((d) => [
				d.message,
				text.slice(0, d.primarySpan!.start).split('\n').length,
			]),
		).toEqual([
			['`stroke-dasharray` on <path>: dashed strokes are not drawn natively yet', 5],
			[
				'`width` on <rect> follows state; a native drawing is compiled when the app is built',
				6,
			],
			[
				'`fill="url(#g)"` on <rect>, a paint a native drawing does not have (gradients and patterns are not drawn yet)',
				6,
			],
			['the SVG <text> element, which a native drawing does not draw yet', 7],
		]);
	});

	it('renders a text, an attribute and a @for list that call app code through the script, and keeps a plain page free of it', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function shout(text: string): string {
	let out = '';
	for (const char of text) out += char.toUpperCase();
	return out;
}
function sorted(list: readonly string[]): string[] {
	return [...list].sort((a, b) => (a < b ? -1 : 1));
}
export function Page() @{
	let name = state('ada');
	let items = state(['b', 'a']);
	<main>
		<p aria-label={shout(name)}>{shout(name)}</p>
		<ul>@for (const item of sorted(items); key item) { <li>{item}</li> }</ul>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const element = (id: string) =>
			payload!.nodes.find((node) => node.id === id) as { bindings?: unknown[] };
		expect(element('h1').bindings).toEqual([
			{
				attribute: 'aria-label',
				value: { script: expect.any(String), bindings: { name: { cell: 'state:name' } } },
			},
		]);
		expect(payload!.nodes.find((node) => node.kind === 'repeat')).toMatchObject({
			list: { script: expect.any(String), bindings: { items: { cell: 'state:items' } } },
		});
		expect(payload!.script!.source).toContain('function shout(text)');
		const plain = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let name = state('ada');
	<p aria-label={name.toUpperCase()}>{name.toUpperCase()}</p>
}`);
		expect(plain.payload!.script).toBeUndefined();
	});

	it('passes a component a prop that calls app code through the script', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function total(text: string): number {
	return (JSON.parse(text) as number[]).reduce((sum, n) => sum + n, 0);
}
function Badge({ count }: { count: number }) @{
	<span>{count}</span>
}
export function Page() @{
	let cart = state('[1,2]');
	<Badge count={total(cart)} />
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.nodes.find((node) => node.kind === 'text')).toMatchObject({
			parts: [{ expr: { script: expect.any(String), bindings: { cart: { cell: 'state:cart' } } } }],
		});
		expect(payload!.script!.source).toContain('function total(text)');
	});
});

describe('overlays', () => {
	it('lowers an overlay sheet: its mark, dismiss and pointer events, element values, focus and a module set its helpers keep', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, state } from '@markless/core';
const pressing = new WeakSet<HTMLElement>();
function begin(box: HTMLElement | undefined, target: EventTarget | null) {
	if (!box) return;
	if (target === box) {
		pressing.add(box);
		return;
	}
	pressing.delete(box);
}
function finish(box: HTMLElement | undefined, target: EventTarget | null) {
	const was = box !== undefined && pressing.has(box);
	if (box) pressing.delete(box);
	return was && target === box;
}
export function Sheet() @{
	let shown = state(false);
	const panel = element<HTMLDivElement>();
	const opener = element<HTMLButtonElement>();
	<section>
		<button el={opener} onClick={() => (shown = true)}>Open</button>
		<div
			overlay
			el={panel}
			hidden={shown !== true}
			onDismiss={(event) => {
				if (event.detail.reason === 'escape' && panel !== undefined && panel.contains(document.activeElement)) opener?.focus();
				shown = false;
			}}
			onPointerdown={(event) => begin(panel, event.target)}
			onPointerup={(event) => {
				const done = finish(panel, event.target);
				if (done) shown = false;
			}}
		><p>Body</p></div>
	</section>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.nodes.find((node) => node.id === 'h2')).toMatchObject({
			element: 'div',
			attributes: { overlay: '' },
		});
		expect(payload!.events.map((event) => [event.host, event.event])).toEqual([
			['h1', 'activate'],
			['h2', 'dismiss'],
			['h2', 'pointerdown'],
			['h2', 'pointerup'],
		]);
		expect(payload!.cells).toContainEqual({
			id: 'module:src/App.tsrx#pressing',
			name: 'pressing',
			initial: [],
		});
		const ops = (event: number) => payload!.handlers[event]!.ops;
		expect(ops(1)).toEqual([
			{
				op: 'if',
				test: {
					logical: '&&',
					left: {
						logical: '&&',
						left: {
							binary: '===',
							left: { event: 'reason' },
							right: { literal: 'escape' },
						},
						right: { binary: '!==', left: { literal: 'h2' }, right: { literal: null } },
					},
					right: { contains: { literal: 'h2' }, node: { focused: true } },
				},
				whenTrue: [{ op: 'command', node: 'h1', command: 'focus' }],
				whenFalse: [],
			},
			{ op: 'assign', cell: 'state:shown', value: { literal: false } },
		]);
		const members = { cell: 'module:src/App.tsrx#pressing' };
		expect(JSON.stringify(ops(2))).toContain(
			JSON.stringify({ binary: '===', left: { event: 'target' }, right: { literal: 'h2' } }),
		);
		expect(JSON.stringify(ops(2))).toContain(
			JSON.stringify({
				method: 'concat',
				target: members,
				arguments: [{ array: [{ spread: false, value: { literal: 'h2' } }] }],
			}),
		);
		// The helper's value is left in a cell its ops write first, then read by the `if` after it.
		expect(ops(3)[0]).toEqual({
			op: 'assign',
			cell: 'handler:event:3/returned:0',
			value: { literal: null },
		});
		expect(ops(3).at(-1)).toEqual({
			op: 'if',
			test: { cell: 'handler:event:3/returned:0' },
			whenTrue: [{ op: 'assign', cell: 'state:shown', value: { literal: false } }],
			whenFalse: [],
		});
	});

	it('reads the overlay focus origin, instanceof and the document body as element values', async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, state } from '@markless/core';
function openerOf(layer: HTMLElement | undefined) {
	const seen = (layer as { __marklessOverlayFocusOrigin?: Element } | undefined)?.__marklessOverlayFocusOrigin;
	return seen instanceof HTMLElement && seen !== seen.ownerDocument.body ? seen : undefined;
}
export function Tray() @{
	let open = state(true);
	const layer = element<HTMLDivElement>();
	<div overlay el={layer} hidden={open !== true}>
		<button onClick={() => {
			open = false;
			openerOf(layer)?.focus();
		}}>Close</button>
	</div>
}`);
		expect(diagnostics).toEqual([]);
		const origin = { focusOrigin: { literal: 'h0' } };
		expect(payload!.handlers[0]!.ops).toEqual([
			{ op: 'assign', cell: 'state:open', value: { literal: false } },
			{
				op: 'command',
				command: 'focus',
				node: {
					if: {
						logical: '&&',
						left: { isElement: origin },
						right: { binary: '!==', left: origin, right: { literal: '#body' } },
					},
					whenTrue: origin,
					whenFalse: { literal: null },
				},
			},
		]);
	});

	it('refuses a hint surface by name; a set method it has no lowering for runs as JavaScript', async () => {
		const { diagnostics } = await nativeView(`import { state } from '@markless/core';
const seen = new Set<string>();
export function Tip() @{
	let open = state(false);
	<div>
		<button onClick={() => { seen.clear(); open = true; }}>Show</button>
		<div overlay overlay-hint hidden={open !== true}>Tip</div>
	</div>
}`);
		expect(diagnostics.map((d) => d.message)).toEqual([
			'an `overlay-hint` surface (a tooltip or hovercard), which phones do not show yet',
		]);
	});
});

describe('selects', () => {
	const page = (markup: string) => `import { state } from '@markless/core';
export function Page() @{
	let size = state('M');
	let sent = state('');
${markup}
}`;

	it('lowers a select of listed options, their `selected` binding, and its place in a form', async () => {
		const { payload, diagnostics } = await nativeView(
			page(`	<form onSubmit={(event) => { event.preventDefault(); sent = String(new FormData(event.currentTarget).get('size')); }}>
		<select name="size" aria-label="Size">
			@for (const option of ['S', 'M']; key option) {
				<option value={option} selected={option === size}>{option}</option>
			}
		</select>
		<button>Send</button>
		<p>{sent}</p>
	</form>`),
		);
		expect(diagnostics).toEqual([]);
		const option = payload!.nodes.find(
			(node) => node.kind === 'element' && node.element === 'option',
		);
		expect(option).toMatchObject({
			parent: payload!.nodes.find((node) => node.kind === 'element' && node.element === 'select')!.id,
			bindings: [
				{ attribute: 'value', value: { item: 'repeat:0' } },
				{
					property: 'selected',
					value: { binary: '===', left: { item: 'repeat:0' }, right: { cell: 'state:size' } },
				},
			],
		});
		expect(payload!.forms![0]!.fields).toEqual([{ node: 'h1', kind: 'select' }]);
	});

	it('refuses by name what a native select does not draw or run yet', async () => {
		const { payload, diagnostics } = await nativeView(
			page(`	<main>
		<select multiple onChange={() => (sent = 'x')}><option>A</option></select>
		<select value={size}><option>B</option><hr /></select>
		<select><option><b>C</b></option></select>
		<option>Loose</option>
		<form onSubmit={(event) => { event.preventDefault(); sent = 'y'; }}>
			<select name="r" required><option>D</option></select>
			<button>Send</button>
		</form>
	</main>`),
		);
		expect(payload).toBeNull();
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			'the change handler on the <select> h1, which a native build does not run yet',
			'the <select> h1 has `multiple`, a list box a native build does not draw yet',
			'the <select> h3 binds `value`; a native build chooses an option through its `selected`',
			'the <hr> h5 sits inside a <select>, which a native build shows only <option>s of',
			'the <b> h8 sits inside an <option>, which a native build shows only text of',
			'the <option> h9 is not inside a <select>, which a native build does not show yet',
			'the <select> h11 in the <form> h10 has `required`, which the web checks before a submit and no native host checks yet',
		]);
	});
});

describe('pointer events', () => {
	it('lowers each pointer event a touch raises, the fields its handler reads, and capture', async () => {
		const { payload, diagnostics } = await nativeView(`import { element, state } from '@markless/core';
export function Drag() @{
	let x = state(0);
	let held = state(false);
	const track = element<HTMLDivElement>();
	<div
		el={track}
		onPointerdown={(event) => {
			track?.setPointerCapture(event.pointerId);
			held = track !== undefined && track.hasPointerCapture(event.pointerId);
		}}
		onPointermove={(event) => (x = event.clientX + event.clientY + event.timeStamp)}
		onPointerup={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
		onPointercancel={(event) => (held = event.isPrimary && event.pointerType === 'touch' && event.buttons === 0)}
		onPointerover={(event) => (held = event.relatedTarget === null)}
		onPointerout={() => (x = 0)}
		onPointerenter={() => (x = 1)}
		onPointerleave={() => (x = 2)}
	>{x}</div>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.events.map((event) => event.event)).toEqual([
			'pointerdown',
			'pointermove',
			'pointerup',
			'pointercancel',
			'pointerover',
			'pointerout',
			'pointerenter',
			'pointerleave',
		]);
		const ops = (event: number) => payload!.handlers[event]!.ops;
		expect(ops(0)).toEqual([
			{ op: 'capture', node: 'h0', pointer: { event: 'pointerId' } },
			{
				op: 'assign',
				cell: 'state:held',
				value: {
					logical: '&&',
					left: { binary: '!==', left: { literal: 'h0' }, right: { literal: null } },
					right: { captures: { literal: 'h0' }, pointer: { event: 'pointerId' } },
				},
			},
		]);
		expect(ops(2)).toEqual([
			{ op: 'capture', node: { event: 'currentTarget' }, pointer: { event: 'pointerId' }, release: true },
		]);
		for (const field of ['clientX', 'clientY', 'timeStamp'])
			expect(JSON.stringify(ops(1))).toContain(JSON.stringify({ event: field }));
		for (const field of ['isPrimary', 'pointerType', 'buttons'])
			expect(JSON.stringify(ops(3))).toContain(JSON.stringify({ event: field }));
		expect(JSON.stringify(ops(4))).toContain(JSON.stringify({ event: 'relatedTarget' }));
	});

	it('gives a pointer handler that runs as JavaScript the touch fields, but not the elements it names', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Drag() @{
	let log = state('');
	<div
		onPointermove={(event) => {
			for (const part of [event.clientX, event.clientY, event.pointerId, event.pointerType]) log = log + part;
		}}
	>{log}</div>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.handlers[0]!.ops.map((op) => op.op)).toEqual(['script']);
		const related = await nativeView(`import { state } from '@markless/core';
export function Drag() @{
	let log = state('');
	<div
		onPointerout={(event) => {
			for (const part of [event.relatedTarget]) log = log + String(part);
		}}
	>{log}</div>
}`);
		expect(related.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			'the pointerout handler reads `event.relatedTarget`, an element, which JavaScript on a phone cannot hold yet',
		]);
	});

	it('refuses by name a field a touch does not report yet', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Pressure() @{
	let p = state(0);
	<div onPointermove={(event) => (p = event.pressure)}>{p}</div>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			'the pointermove handler reads `event.pressure`, which a touch on a phone does not have',
		]);
	});
});
