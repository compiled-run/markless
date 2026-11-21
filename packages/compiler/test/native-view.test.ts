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
	<input value={text} onKeyUp={() => (text = '')} />
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain(
			'the keyup event has no native meaning yet',
		);
	});

	it("runs a text field's keydown and paste handlers with the key and the pasted text, and preventDefault() as an op", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Tags() @{
	let text = state('');
	let last = state('');
	<input
		value={text}
		onKeyDown={(event) => {
			if (event.key === 'Enter' && !event.isComposing) event.preventDefault();
			last = event.key;
		}}
		onPaste={(event) => {
			event.preventDefault();
			text = (event as ClipboardEvent).clipboardData?.getData('text') ?? '';
		}}
	/>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.events).toEqual([
			{ host: 'h0', event: 'keydown', handler: 'handler:event:0' },
			{ host: 'h0', event: 'paste', handler: 'handler:event:1' },
		]);
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[
				{
					op: 'if',
					test: {
						logical: '&&',
						left: {
							binary: '===',
							left: { event: 'key' },
							right: { literal: 'Enter' },
						},
						right: { unary: '!', value: { literal: false } },
					},
					whenTrue: [{ op: 'preventDefault' }],
					whenFalse: [],
				},
				{ op: 'assign', cell: 'state:last', value: { event: 'key' } },
			],
			[
				{ op: 'preventDefault' },
				{
					op: 'assign',
					cell: 'state:text',
					value: { logical: '??', left: { event: 'text' }, right: { literal: '' } },
				},
			],
		]);
	});

	it("reads a text field's text through its handle or the event's target, and has the field report its edits", async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, state } from '@markless/core';
export function Trip() @{
	const city = element<HTMLInputElement>();
	let shown = state('');
	<div>
		<input el={city} value="Lima" onBlur={(event) => (shown = (event.target as HTMLInputElement).value)} />
		<button onClick={() => (shown = city.value)}>Save</button>
	</div>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[{ op: 'assign', cell: 'state:shown', value: { field: 'h1' } }],
			[{ op: 'assign', cell: 'state:shown', value: { field: 'h1' } }],
			[],
		]);
		expect(payload?.events).toContainEqual({
			host: 'h1',
			event: 'input',
			handler: 'handler:h1/edit',
		});
	});

	it("reads a click's event.detail as the number of presses in a row", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Like() @{
	let note = state('');
	<button onClick={(event) => (note = event.detail === 2 ? 'liked' : 'once')}>Like</button>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{
				op: 'assign',
				cell: 'state:note',
				value: {
					if: { binary: '===', left: { event: 'detail' }, right: { literal: 2 } },
					whenTrue: { literal: 'liked' },
					whenFalse: { literal: 'once' },
				},
			},
		]);
	});

	it("writes a text field's text through its element and selects it, as a helper that lands the caret does", async () => {
		const { payload, diagnostics } = await nativeView(
			`import { element, state } from '@markless/core';
function landCaret(box: HTMLInputElement | undefined, words: string): void {
	if (box === undefined) return;
	box.value = words;
	box.focus();
	box.select();
}
export function Rename() @{
	const field = element<HTMLInputElement>();
	let name = state('Draft');
	<div>
		<button onClick={() => landCaret(field, name)}>Rename</button>
		<input el={field} aria-label="Name" />
	</div>
}`,
			dataOnly,
		);
		expect(diagnostics).toEqual([]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{ op: 'fieldText', node: 'h2', value: { cell: 'state:name' } },
			{ op: 'command', node: 'h2', command: 'focus' },
			{ op: 'command', node: 'h2', command: 'select' },
		]);
	});

	it('leaves out a paste handler on an element a phone does not edit, refuses one on an editable element, and a clipboard read other than plain text', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Paste() @{
	let text = state('');
	<div>
		<span role="spinbutton" tabindex="0" onPaste={() => (text = 'pasted')}>{text}</span>
		<div contenteditable="true" onPaste={() => (text = 'edited')} />
		<input onPaste={(event) => (text = event.clipboardData?.getData('text/html') ?? '')} />
	</div>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => [d.severity, d.message])).toEqual([
			[
				'warning',
				'the paste handler on <span> h1 runs only from a hardware keyboard on a phone; native hosts have none yet, so it is left out',
			],
			[
				'error',
				'a paste handler on an editable <div>; a native build runs one only on a text field',
			],
			[
				'error',
				"the paste handler reads the clipboard other than as plain text (`getData('text')`), which a phone's paste does not give",
			],
		]);
	});

	it("leaves out key and focus handlers on a checkbox or radio button, and runs a text field's focus handler", async () => {
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
		]);
		expect(payload?.events.filter((event) => event.event === 'focus')).toEqual([
			{ host: 'h3', event: 'focus', handler: 'handler:event:5' },
		]);
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
			{
				id: 'handler:event:0',
				ops: [{ op: 'assign', cell: 'state:said', value: { event: 'value' } }],
			},
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

	it('drops preventDefault() in a click handler where a click has no default action, and refuses it where it has one', async () => {
		const quiet = await nativeView(
			`import { state } from '@markless/core';
export function Page() @{
	let count = state(0);
	<main>
		<a onClick={(event) => { event.preventDefault(); count++; }}>Next</a>
		<button onClick={(event) => { event.preventDefault(); count++; }}>Add</button>
		<p>{count}</p>
	</main>
}`,
			dataOnly,
		);
		expect(quiet.diagnostics).toEqual([]);
		expect(quiet.payload?.handlers.map((handler) => handler.ops)).toEqual([
			[
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
			[
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
		]);
		for (const host of [
			'<a href="/next" onClick={(event) => { event.preventDefault(); count++; }}>Next</a>',
			'<input type="checkbox" aria-label="Keep" onClick={(event) => { event.preventDefault(); count++; }} />',
		]) {
			const { payload, diagnostics } = await nativeView(
				`import { state } from '@markless/core';
export function Page() @{
	let count = state(0);
	<main>${host}<p>{count}</p></main>
}`,
				dataOnly,
			);
			expect(payload).toBeNull();
			expect(diagnostics.map((d) => d.message)).toContain(
				'the click handler uses a call to `event.preventDefault`, which needs a script engine',
			);
		}
	});

	it('builds a <textarea> as a text field, and refuses its change handler and its place in a form by name', async () => {
		const shown = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let note = state('');
	<main>
		<textarea aria-label="Notes" value={note} onInput={(event) => (note = event.currentTarget.value)} />
		<p>{note}</p>
	</main>
}`);
		expect(shown.diagnostics).toEqual([]);
		expect(shown.payload?.events).toEqual([
			{ host: 'h1', event: 'input', handler: 'handler:event:0' },
		]);
		const changed = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let note = state('');
	<main><textarea aria-label="Notes" onChange={(event) => (note = event.currentTarget.value)} /><p>{note}</p></main>
}`);
		expect(changed.diagnostics.map((d) => d.message)).toContain(
			'the change handler on the <textarea> h1: a text field raises it when it loses focus, which a native build has no lowering for yet',
		);
		const sent = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let note = state('');
	<form onSubmit={(event) => { event.preventDefault(); note = 'sent'; }}>
		<textarea aria-label="Notes" name="notes" />
		<button>Send</button>
		<p>{note}</p>
	</form>
}`);
		expect(sent.payload).toBeNull();
		expect(sent.diagnostics.map((d) => d.message)).toContain(
			'the <textarea> h1 in the <form> h0, whose text a native build does not submit yet',
		);
	});

	it('reads children that are one run of text as that string, and any children as present in a bare @if test', async () => {
		const source = (badge: string) => `import { computed, type Children } from '@markless/core';
function Badge({ children }: { readonly children?: Children }) @{
	const spoken = computed(() => (typeof children === 'string' ? children : 'none'));
	<div>
		<p>{spoken}</p>
		@if (children) { <span>{children}</span> }
	</div>
}
export function Page() @{
	<main>${badge}</main>
}`;
		const text = await nativeView(source('<Badge>Plain</Badge>'), dataOnly);
		expect(text.diagnostics).toEqual([]);
		const markup = await nativeView(source('<Badge><b>Bold</b></Badge>'), dataOnly);
		expect(markup.payload).toBeNull();
		expect(markup.diagnostics.map((d) => d.message)).toContain(
			'the computed `spoken` reads the callback `children` as a value',
		);
	});

	it('marks live regions as ARIA defines them, and refuses one whose politeness follows state', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let open = state(false);
	<main>
		<output>{open ? 'on' : 'off'}</output>
		<p role="alert">x</p>
		<div aria-live="polite">y</div>
		<div role="status" aria-live="off">z</div>
		<div role={open ? 'region' : undefined}>w</div>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const live = Object.fromEntries(
			(payload?.nodes ?? []).flatMap((node) =>
				node.kind === 'element' ? [[node.element + node.id, node.live ?? null]] : [],
			),
		);
		expect(live).toEqual({
			mainh0: null,
			outputh1: { politeness: 'polite', atomic: true },
			ph2: { politeness: 'assertive', atomic: true },
			divh3: { politeness: 'polite', atomic: false },
			divh4: null,
			divh5: null,
		});
		const dynamic = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let paused = state(false);
	<div aria-live={paused ? 'off' : 'polite'}>news</div>
}`);
		expect(dynamic.diagnostics.map((d) => d.message)).toContain(
			'the `aria-live` of a <div> follows state; a native host makes a live region when it builds the view',
		);
	});

	it('runs only the side of &&, || and ?? that a left side known when the app is built leaves to run', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function check(row: HTMLElement): boolean {
	return !row.hasAttribute('hidden');
}
export function Page() @{
	let open = state(false);
	const none = null as HTMLElement | null;
	<main>
		<p>{none !== null && check(none) ? 'reached' : 'not reached'}</p>
		<p>{true && open ? 'open' : 'shut'}</p>
		<p>{'kept' ?? open}</p>
		<p>{open && 'yes'}</p>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const parts = (payload?.nodes ?? []).flatMap((node) =>
			node.kind === 'text' ? [node.parts] : [],
		);
		expect(parts).toEqual([
			[{ expr: { literal: 'not reached' } }],
			[
				{
					expr: {
						if: { cell: 'state:open' },
						whenTrue: { literal: 'open' },
						whenFalse: { literal: 'shut' },
					},
				},
			],
			[{ expr: { literal: 'kept' } }],
			[{ expr: { logical: '&&', left: { cell: 'state:open' }, right: { literal: 'yes' } } }],
		]);
	});

	it("seeds a row part's state from the row's item, and reads a handle bound in rows only to find the tapped row", async () => {
		const source = (find: string) => `import { element, shared, state } from '@markless/core';
const listState = shared(() => {
	const list = state({ picked: '' });
	const rowEls = element<HTMLElement[]>();
	return { ...list, rowEls };
}, { scope: 'subtree' });
const rowState = shared(() => {
	const row = state({ value: '' });
	return { ...row };
}, { scope: 'subtree' });
function holder(rows: HTMLElement[] | undefined, target: Node | null): HTMLElement | null {
${find}
}
function Row({ value }: { readonly value: string }) @{
	const list = listState();
	const row = rowState();
	row.value = value;
	<li el={list.rowEls} ui-value={row.value}>{row.value}</li>
}
export function Page() @{
	const list = listState();
	const items = state([{ id: 'a' }, { id: 'b' }]);
	<main>
		<ul onClick={(event) => {
			const found = holder(list.rowEls, event.target as Node);
			if (found !== null) list.picked = found.getAttribute('ui-value') ?? '';
		}}>
			@for (const item of items; key item.id) {
				<Row value={item.id} />
			}
		</ul>
		<p>{list.picked}</p>
	</main>
}`;
		const found = await nativeView(
			source(`	for (const row of rows ?? []) if (row.contains(target)) return row;
	return null;`),
		);
		expect(found.diagnostics.filter((d) => d.code === NATIVE_UNSUPPORTED_CODE)).toEqual([]);
		expect(found.payload?.cells.find((cell) => cell.name === 'row.value')).toMatchObject({
			initial: '',
			row: 'repeat:0',
			first: { member: { item: 'repeat:0' }, property: 'id' },
		});
		const counted = await nativeView(
			source(`	return rows && rows.length > 1 ? rows[1]! : null;`),
			dataOnly,
		);
		expect(counted.payload).toBeNull();
		expect(counted.diagnostics.map((d) => d.message).join('\n')).toContain('a @for');
	});

	it("reads a shared() factory's own handle by its name in the factory's methods, and refuses one bound inside an @if arm", async () => {
		const source = (field: string) => `import { element, shared, state } from '@markless/core';
const boxState = shared(() => {
	const box = state({ note: '' });
	const fieldEl = element<HTMLInputElement>();
	return {
		...box,
		fieldEl,
		check() {
			box.note = fieldEl ? 'has field' : 'no field';
		},
	};
}, { scope: 'subtree' });
export function Page() @{
	const box = boxState();
	let shown = state(true);
	<main>
		${field}
		<button onClick={() => box.check()}>{box.note}</button>
	</main>
}`;
		const plain = await nativeView(
			source('<input aria-label="Field" el={box.fieldEl} />'),
			dataOnly,
		);
		expect(plain.diagnostics).toEqual([]);
		expect(plain.payload?.handlers[0]?.ops).toEqual([
			{
				op: 'assign',
				cell: 'shared:src/App.tsrx#boxState/state:box.note',
				value: { literal: 'has field' },
			},
		]);
		const armed = await nativeView(
			source('@if (shown) { <input aria-label="Field" el={box.fieldEl} /> }'),
			dataOnly,
		);
		expect(armed.payload).toBeNull();
		expect(armed.diagnostics.map((d) => d.message)).toContain(
			'the click handler reads `fieldEl`, a handle bound inside an @if arm',
		);
	});

	it('leaves out a <select> hidden from sight and screen readers, and refuses one inside a form by name', async () => {
		const select =
			'<select aria-hidden="true" tabindex={-1} name="size"><option>{size}</option></select>';
		const alone = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let size = state('small');
	<main>${select}<p>{size}</p></main>
}`);
		expect(alone.diagnostics).toEqual([]);
		expect(
			alone.payload?.nodes.some(
				(node) => node.kind === 'element' && node.element === 'select',
			),
		).toBe(false);
		const sent = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let size = state('small');
	<form onSubmit={(event) => { event.preventDefault(); size = 'sent'; }}>${select}<button>Send</button><p>{size}</p></form>
}`);
		expect(sent.payload).toBeNull();
		expect(sent.diagnostics.map((d) => d.message)).toContain(
			'a hidden <select> in the <form> h0, whose value a native build does not submit yet',
		);
		const shown = await nativeView(`export function Page() @{
	<main><select name="size"><option>small</option></select></main>
}`);
		// A <select> in sight is a native select.
		expect(shown.diagnostics).toEqual([]);
		expect(
			shown.payload?.nodes.some(
				(node) => node.kind === 'element' && node.element === 'select',
			),
		).toBe(true);
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
			{
				id: 'handler:event:0',
				ops: [{ op: 'assign', cell: 'state:said', value: { event: 'value' } }],
			},
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

	describe('a component that tests whether it was given children', () => {
		const branches = (payload: { nodes: ReadonlyArray<unknown> } | null | undefined) =>
			(payload?.nodes ?? []).flatMap((node) =>
				(node as { kind: string }).kind === 'branch' ? [(node as { test?: unknown }).test] : [],
			);

		it('shows the @if arm where children are passed and the @else arm where none are', async () => {
			const { payload, diagnostics } = await nativeView(`function Label({ children }) @{
	<span>
		@if (children) {
			<>{children}</>
		} @else {
			<>No label</>
		}
	</span>
}
export function Page() @{
	<main>
		<Label><b>Given</b></Label>
		<Label />
	</main>
}`);
			expect(diagnostics).toEqual([]);
			expect(branches(payload)).toEqual([{ literal: true }, { literal: null }]);
		});

		it('reads `!children`, `children ? a : b` and `children && a` as the truth of whether children were passed', async () => {
			const { payload, diagnostics } = await nativeView(`function Hint({ tone, children }: { readonly tone: string; readonly children?: unknown }) @{
	<p data-given={children ? 'yes' : 'no'} data-tone={children && tone}>
		@if (!children) {
			<>Nothing here</>
		}
		{children}
	</p>
}
export function Page() @{
	<main>
		<Hint tone="warm" />
		<Hint tone="cold"><i>Hello</i> there</Hint>
	</main>
}`);
			expect(diagnostics).toEqual([]);
			expect(branches(payload)).toEqual([
				{ unary: '!', value: { literal: null } },
				{ unary: '!', value: { literal: true } },
			]);
			const bindings = (payload?.nodes ?? []).flatMap((node) =>
				node.kind === 'element' && node.element === 'p' ? [node.bindings] : [],
			);
			// Whether children were passed is known at build time, so each test folds to the side it picks.
			const given = (passed: true | null, tone: string) => [
				{ attribute: 'data-given', value: { literal: passed ? 'yes' : 'no' } },
				{ attribute: 'data-tone', value: { literal: passed && tone } },
			];
			expect(bindings).toEqual([given(null, 'warm'), given(true, 'cold')]);
		});

		it('reads text-only children as their text, as the web passes them', async () => {
			const { payload, diagnostics } = await nativeView(`function Caption({ children }) @{
	<figcaption title={typeof children === 'string' ? children : 'markup'}>{children}</figcaption>
}
export function Page() @{
	<main>
		<Caption>30 of 100 rows</Caption>
	</main>
}`);
			expect(diagnostics).toEqual([]);
			const caption = payload?.nodes.find(
				(node) => node.kind === 'element' && node.element === 'figcaption',
			);
			// The text is known at build time, so `typeof children === 'string'` folds to its branch.
			expect(caption).toMatchObject({
				bindings: [{ attribute: 'title', value: { literal: '30 of 100 rows' } }],
			});
		});
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

	it('keys a @for joined from its row fields by the same text and path pieces as the web', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Seats() @{
	let seats = state([{ row: 'b', seat: { n: 2 } }]);
	<ol>
		@for (const s of seats; key s.row + '-' + s.seat.n) { <li>{s.row}</li> }
	</ol>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.nodes.find((node) => node.kind === 'repeat')).toEqual({
			kind: 'repeat',
			id: 'repeat:0',
			parent: 'h0',
			list: { cell: 'state:seats' },
			key: [],
			keyParts: [['row'], '-', ['seat', 'n']],
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
		// A step known when the app is built (`null ?? 1`) folds to its value; one read from a kept cell stays a `??`.
		const stepOf = (passed: object) =>
			'literal' in passed
				? { literal: 1 }
				: { logical: '??', left: passed, right: { literal: 1 } };
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
						whenTrue: { literal: 'none' },
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
					value: { literal: 'a' },
				},
			],
			[
				{
					op: 'assign',
					cell: picked,
					value: { literal: 'b' },
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

	it('places a @for inside an @if arm, with its @empty, in that arm, and one inside another @for', async () => {
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
		expect(nested.diagnostics).toEqual([]);
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

	it('keys the rows of a @for keyed by its index by position', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Words() @{
	let words = state(['a', 'a']);
	<ul>@for (const word of words; index at; key at) { <li>{word}</li> }</ul>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.nodes.find((node) => node.kind === 'repeat')).toMatchObject({
			list: { cell: 'state:words' },
			key: [],
			byIndex: true,
		});
	});

	it("refuses an element's id reference inside a row of a @for keyed by its index", async () => {
		const { payload, diagnostics } =
			await nativeView(`import { element, state } from '@markless/core';
function Entry({ title }) @{
	const heading = element();
	<section aria-labelledby={heading}>
		<h2 el={heading}>{title}</h2>
	</section>
}
export function Entries() @{
	let titles = state(['A', 'A']);
	<div>
		@for (const title of titles; index at; key at) { <Entry title={title} /> }
	</div>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			expect.stringContaining('names an element in a row of a @for keyed by its index'),
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

	it('lowers fields and submit buttons in an @if arm of their form; a type="button" button is no part of it, in an arm or a row', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Order() @{
	let gift = state(false);
	let sent = state('');
	let tags = state(['a']);
	<form onSubmit={(event) => { event.preventDefault(); sent = String(new FormData(event.currentTarget).get('note')); }}>
		<input name="name" />
		<button>Send</button>
		@if (gift) {
			<>
				<input name="note" />
				<button>Send gift</button>
			</>
		} @else {
			<button type="button" onClick={() => (gift = true)}>Add a note</button>
		}
		@for (const tag of tags; key tag) { <button type="button">{tag}</button> }
		<p>{sent}</p>
	</form>
}`);
		expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		expect(payload!.forms).toEqual([
			{
				node: 'h0',
				fields: [
					{ node: 'h1', kind: 'text' },
					{ node: 'h3', kind: 'text' },
				],
				submitters: ['h2', 'h4'],
			},
		]);
		const submits = payload!.handlers.filter((handler) =>
			handler.ops.some((op) => op.op === 'submit'),
		);
		expect(submits.flatMap((handler) => handler.ops)).toContainEqual({
			op: 'submit',
			form: 'h0',
			submitter: 'h4',
		});
	});

	it('refuses an @if arm that decides which button the return key presses, or whether it submits', async () => {
		const { diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Forms() @{
	let busy = state(false);
	let more = state(false);
	let rows = state(['a']);
	let sent = state('');
	<main>
		<form onSubmit={(event) => { event.preventDefault(); sent = 'one'; }}>
			<input name="q" />
			@if (busy) { <button disabled>Saving</button> } @else { <button>Save</button> }
		</form>
		<form onSubmit={(event) => { event.preventDefault(); sent = 'two'; }}>
			<input name="a" />
			@if (more) { <input name="b" /> }
		</form>
		<form onSubmit={(event) => { event.preventDefault(); sent = 'three'; }}>
			@for (const row of rows; key row) { <input name={row} /> }
			<button>Send</button>
		</form>
		<p>{sent}</p>
	</main>
}`);
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the first submit button of the <form> h1 sits in an @if arm, so which button the return key presses follows what shows; a native build presses one it knows when it builds',
			'the <form> h5 has text fields in an @if arm and no submit button, so whether the return key submits it follows how many show; a native build decides that when it builds',
			'the <input> h9 in the <form> h8 sits in a @for row of its form, which a native build does not submit yet',
		]);
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

describe('navigate() in JavaScript', () => {
	it('needs the app\'s routes, which a build of one component does not have', async () => {
		const text = `import { state } from '@markless/core';
import { navigate } from '@markless/router';
export function Page() @{
	let id = state(1);
	<button onClick={async () => { id++; await navigate(\`/orders/\${id}\`); }}>Next</button>
}`;
		const { payload, diagnostics } = await nativeView(text);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain(
			"the click handler calls `navigate` from @markless/router inside JavaScript that runs on the phone, which needs the app's routes; build the app, not one component",
		);
	});
});

describe('a @for row reading its index', () => {
	it("lowers the index name to the row's position", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let fruits = state(['a', 'b']);
	<main>@for (const fruit of fruits; index i; key fruit) { <p>{i + 1}</p> }</main>
}`);
		expect(diagnostics).toEqual([]);
		const repeat = payload!.nodes.find((node) => node.kind === 'repeat')!;
		expect(payload!.nodes.find((node) => node.kind === 'text' && node.row === repeat.id)).toMatchObject({
			parts: [{ expr: { binary: '+', left: { index: repeat.id }, right: { literal: 1 } } }],
		});
	});
});

describe('<iframe>', () => {
	const frame = async (attributes: string) =>
		nativeView(`import { state } from '@markless/core';
export function Page() @{
	let page = state('https://example.com/');
	<main><iframe ${attributes}></iframe></main>
}`);

	it('keeps an iframe of a fixed http(s) page with its attributes', async () => {
		const { payload, diagnostics } = await frame('src="https://example.com/" title="Example" width="320"');
		expect(diagnostics).toEqual([]);
		expect(payload!.nodes.find((node) => node.kind === 'element' && node.element === 'iframe')).toMatchObject({
			attributes: { src: 'https://example.com/', title: 'Example', width: '320' },
		});
	});

	it("refuses one on the app's own server, one whose src follows state, and srcdoc, by name", async () => {
		const messages = async (attributes: string) =>
			(await frame(attributes)).diagnostics.map((d) => d.message);
		expect(await messages('src="/docs"')).toEqual([
			expect.stringContaining('an <iframe> whose `src` is "/docs"'),
		]);
		expect(await messages('src={page}')).toEqual(['an <iframe> whose `src` follows state']);
		expect(await messages('srcdoc="<p>hi</p>"')).toEqual([
			'an <iframe> with `srcdoc`, which a native web view does not show yet',
		]);
	});
});

describe("a <select>'s change handler", () => {
	it("lowers to the select's input event, reading the chosen value; one that needs JavaScript runs as a script", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
function shout(text: string): string {
	let out = '';
	for (const letter of text) out += letter.toUpperCase();
	return out;
}
export function Page() @{
	let make = state('');
	let size = state('');
	<main>
		<select onChange={(event) => (make = (event.target as HTMLSelectElement).value)}>
			<option>a</option><option>b</option>
		</select>
		<select onChange={(event) => (size = shout(event.currentTarget.value))}>
			<option>c</option><option>d</option>
		</select>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const [first, second] = payload!.nodes.filter(
			(node) => node.kind === 'element' && node.element === 'select',
		);
		const opsOf = (host: string) =>
			payload!.handlers.find(
				(handler) =>
					handler.id ===
					payload!.events.find((event) => event.host === host && event.event === 'input')
						?.handler,
			)?.ops;
		expect(opsOf(first!.id)).toEqual([{ op: 'assign', cell: 'state:make', value: { event: 'value' } }]);
		expect(opsOf(second!.id)).toMatchObject([{ op: 'script', type: 'change' }]);
	});
});

describe('a GET form on another site', () => {
	const form = (attributes: string, button = '<button>Go</button>') =>
		nativeView(`export function Page() @{
	<form ${attributes}>
		<input name="q" aria-label="Query" />
		${button}
	</form>
}`);

	it('opens its action in the browser when it has no submit handler, a scheme-relative action as https', async () => {
		const external = await form('action="https://example.com/search?x=1#top" method="GET"');
		expect(external.diagnostics).toEqual([]);
		expect(external.payload!.forms).toEqual([
			expect.objectContaining({ opens: 'https://example.com/search?x=1#top' }),
		]);
		const relative = await form('action="//hn.algolia.com/"');
		expect(relative.payload!.forms).toEqual([
			expect.objectContaining({ opens: 'https://hn.algolia.com/' }),
		]);
	});

	it("refuses a POST, an action on the app's own server, and a named submit button by name", async () => {
		const messages = async (attributes: string, button?: string) =>
			(await form(attributes, button)).diagnostics.map((d) => d.message);
		expect(await messages('action="https://example.com/login" method="post"')).toEqual([
			expect.stringContaining('has no onSubmit handler'),
		]);
		expect(await messages('action="/search"')).toEqual([
			expect.stringContaining('has no onSubmit handler'),
		]);
		expect(
			await messages('action="https://example.com/"', '<button name="go" value="1">Go</button>'),
		).toEqual([expect.stringContaining('has a `name`, which the web adds to the query')]);
	});
});

describe('@for inside another @for', () => {
	it('lowers an inner list in each outer row, its list read from the outer item and its rows reading both', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function Page() @{
	let groups = state([{ name: 'a', items: ['x', 'y'] }]);
	<main>
		@for (const group of groups; key group.name) {
			<section>
				@for (const item of group.items; key item) {
					<p>{group.name}{item}</p>
				}
			</section>
		}
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const [outer, inner] = payload!.nodes.filter((node) => node.kind === 'repeat');
		expect(inner).toMatchObject({
			row: outer!.id,
			list: { member: { item: outer!.id }, property: 'items' },
			key: [],
		});
		expect(payload!.nodes.find((node) => node.kind === 'text' && node.row === inner!.id)).toMatchObject({
			parts: [{ expr: { member: { item: outer!.id }, property: 'name' } }, { expr: { item: inner!.id } }],
		});
	});

	it("names an inner row's own copy of an element by both rows' keys", async () => {
		const { payload, diagnostics } = await nativeView(`import { element, state } from '@markless/core';
function Entry({ title }) @{
	const heading = element();
	<section aria-labelledby={heading}>
		<h2 el={heading}>{title}</h2>
	</section>
}
export function Page() @{
	let groups = state([{ name: 'a', items: ['x'] }]);
	<main>
		@for (const group of groups; key group.name) {
			<div>
				@for (const item of group.items; key item) { <Entry title={item} /> }
			</div>
		}
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const [outer, inner] = payload!.nodes.filter((node) => node.kind === 'repeat');
		const section = payload!.nodes.find(
			(node) => node.kind === 'element' && node.element === 'section',
		);
		expect(section?.kind === 'element' && section.bindings?.[0]).toMatchObject({
			attribute: 'aria-labelledby',
			value: {
				template: [
					expect.stringMatching(/@$/),
					{ member: { item: outer!.id }, property: 'name' },
					'@',
					{ item: inner!.id },
				],
			},
		});
	});
});

describe('storage() in child components', () => {
	it('keeps one cell per key for a page and every copy of a child component, as the web keeps one value', async () => {
		const { payload, diagnostics } = await nativeView(`import { storage } from '@markless/core';
function Counter({ label }: { label: string }) @{
	let taps = storage('taps', '0');
	<button onClick={() => (taps = taps + '1')}>{label}{taps}</button>
}
export function Page() @{
	let total = storage('taps', '0');
	<main>
		<p>{total}</p>
		<Counter label="Left" />
		<Counter label="Right" />
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const stored = payload!.cells.filter((cell) => cell.storage);
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({ initial: '0', storage: { key: 'taps' } });
		expect(
			payload!.handlers.map((handler) => handler.ops[0]?.op === 'assign' && handler.ops[0].cell),
		).toEqual([stored[0]!.id, stored[0]!.id]);
	});

	it('refuses two first values for one key by name', async () => {
		const { diagnostics } = await nativeView(`import { storage } from '@markless/core';
function Badge() @{
	let theme = storage('theme', 'dark');
	<span>{theme}</span>
}
export function Page() @{
	let theme = storage('theme', 'light');
	<main>
		<p>{theme}</p>
		<Badge />
	</main>
}`);
		expect(diagnostics.map((d) => d.message)).toEqual([
			'storage `theme` of Badge starts at "dark", but another storage() with key "theme" starts at "light"',
		]);
	});
});

describe('@markless/device in JavaScript', () => {
	it("calls the device through the host from a handler's JavaScript", async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
import { haptics, location } from '@markless/device';
export function Page() @{
	let text = state('');
	<button
		onClick={async () => {
			try {
				text = (await location.current()).latitude.toFixed(2);
				haptics.tap();
			} catch (error) {
				text = (error as Error).name;
			}
		}}
	>
		{text}
	</button>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload!.script!.services).toContain('device');
		expect(payload!.script!.source).toContain(
			'globalThis["__marklessHost"]["devices"]["location"].current()',
		);
		expect(payload!.script!.source).toContain(
			'globalThis["__marklessHost"]["devices"]["haptics"].tap()',
		);
	});

	it('refuses a device value read in JavaScript by name', async () => {
		const { diagnostics } = await nativeView(`import { state } from '@markless/core';
import { location } from '@markless/device';
function label(access: string): string {
	let out = '';
	for (const letter of access) out += letter.toUpperCase();
	return out;
}
export function Page() @{
	let text = state('');
	<button onClick={() => { text = label(location.access); }}>{text}</button>
}`);
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the click handler calls `location` from @markless/device inside JavaScript that runs on the phone, which it cannot reach there yet',
		]);
	});
});

describe('element proxies', () => {
	const source = `import { element, shared, state } from '@markless/core';
const pickerState = shared(
	() => {
		const picker = state({ open: false });
		const optionEls = element<HTMLButtonElement[]>();
		return { ...picker, optionEls, setOpen(next: boolean) { picker.open = next; } };
	},
	{ scope: 'subtree' },
);
function focusFirst(options: ReadonlyArray<HTMLElement> | undefined): void {
	if (!options) return;
	for (const option of options) {
		if (option.getAttribute('aria-disabled') !== 'true') { option.focus(); return; }
	}
}
function Trigger() @{
	const picker = pickerState();
	<button onClick={() => { picker.setOpen(true); focusFirst(picker.optionEls); }}>Open</button>
}
function Option() @{
	const picker = pickerState();
	<button el={picker.optionEls}>Option</button>
}
export function Picker() @{
	const picker = pickerState();
	const list = element<HTMLDivElement[]>();
	<main ui-open={picker.open}>
		<Trigger />
		<Option />
		<div el={list} />
		<button onClick={() => { for (const one of list) one.focus(); }}>All</button>
	</main>
}`;

	it('passes element handles to a JavaScript handler as proxies, and a shared object with its methods, which run as JavaScript over its own state', async () => {
		const { payload, diagnostics } = await nativeView(source);
		expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		const [trigger, all] = payload!.handlers;
		expect(trigger?.ops).toMatchObject([
			{
				op: 'script',
				type: 'click',
				bindings: {
					pickerState: {
						shared: {
							open: { cell: expect.any(String) },
							optionEls: {
								elements: {
									array: [
										{
											spread: false,
											value: { literal: 'component-edge:1/h1' },
										},
									],
								},
							},
							setOpen: {
								method: expect.any(String),
								bindings: { picker: { fields: { open: expect.any(String) } } },
							},
						},
					},
				},
			},
		]);
		expect(all?.ops).toEqual([
			{
				op: 'script',
				fn: expect.any(String),
				type: 'click',
				bindings: {
					list: { elements: { array: [{ spread: false, value: { literal: 'h3' } }] } },
				},
			},
		]);
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
			parent: payload!.nodes.find(
				(node) => node.kind === 'element' && node.element === 'select',
			)!.id,
			bindings: [
				{ attribute: 'value', value: { item: 'repeat:0' } },
				{
					property: 'selected',
					value: {
						binary: '===',
						left: { item: 'repeat:0' },
						right: { cell: 'state:size' },
					},
				},
			],
		});
		expect(payload!.forms![0]!.fields).toEqual([{ node: 'h1', kind: 'select' }]);
	});

	it('refuses by name what a native select does not draw or run yet', async () => {
		const { payload, diagnostics } = await nativeView(
			page(`	<main>
		<select multiple onInput={() => (sent = 'x')}><option>A</option></select>
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
			'the input handler on the <select> h1, which a native build does not run yet',
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
		const { payload, diagnostics } =
			await nativeView(`import { element, state } from '@markless/core';
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
				// `track !== undefined` on a bound handle is known when the app is built, so only the side that decides is kept.
				value: { captures: { literal: 'h0' }, pointer: { event: 'pointerId' } },
			},
		]);
		expect(ops(2)).toEqual([
			{
				op: 'capture',
				node: { event: 'currentTarget' },
				pointer: { event: 'pointerId' },
				release: true,
			},
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
