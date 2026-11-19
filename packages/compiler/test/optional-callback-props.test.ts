import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const compile = (filename: string, source: string, symbols: unknown[] = []) =>
	compileTsrxModule({
		filename,
		source,
		symbols: symbols as never,
	});

const handlerSlots = (
	result: Awaited<ReturnType<typeof compile>>,
	predicate: (symbol: { readonly kind: string }) => boolean = (symbol) =>
		symbol.kind === 'event-handler',
) => result.captureAnalysis.extractedSymbols.filter(predicate).flatMap((symbol) => symbol.captureSlots);

test('an absent callback prop invoked optionally resolves to a compiler-known undefined', async () => {
	const result = await compile(
		'src/OptionalCall.tsrx',
		`
function Child({ onChange }) @{
	<button onClick={() => onChange?.('next')}>go</button>
}

export function App() @{
	<Child />
}
`,
	);
	const slot = handlerSlots(result).find((candidate) => candidate.propName === 'onChange');

	expect(slot?.routes).toEqual([
		expect.objectContaining({
			kind: 'compiler-known-constant',
			componentEdgeId: 'component-edge:0',
			value: undefined,
		}),
	]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
});

test('an absent callback prop invoked behind an if guard resolves to a compiler-known undefined', async () => {
	const result = await compile(
		'src/GuardedCall.tsrx',
		`
function Child({ onChange }) @{
	<button onClick={() => { if (onChange) { onChange('next'); } }}>go</button>
}

export function App() @{
	<Child />
}
`,
	);
	const slot = handlerSlots(result).find((candidate) => candidate.propName === 'onChange');

	expect(slot?.routes).toEqual([
		expect.objectContaining({ kind: 'compiler-known-constant', value: undefined }),
	]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
});

test('an absent callback prop invoked unconditionally stays fail-closed with an absent-prop message', async () => {
	const result = await compile(
		'src/UnconditionalCall.tsrx',
		`
function Child({ onChange }) @{
	<button onClick={() => onChange('next')}>go</button>
}

export function App() @{
	<Child />
}
`,
	);
	const slot = handlerSlots(result).find((candidate) => candidate.propName === 'onChange');

	expect(slot?.routes).toEqual([
		expect.objectContaining({ kind: 'unsupported-opaque', expression: 'onChange' }),
	]);

	const diagnostic = result.captureAnalysis.diagnostics.find(
		(item) => item.code === 'MARKLESS_CAPTURE_OPAQUE_PROP',
	);
	expect(diagnostic?.propName).toBe('onChange');
	expect(diagnostic?.message).toContain('passes no "onChange"');
	expect(diagnostic?.suggestions.map((suggestion) => suggestion.message).join(' ')).toContain(
		'onChange?.(',
	);
});

test('a passed callback keeps its callback route when the child invokes it optionally', async () => {
	const result = await compile(
		'src/PresentOptionalCall.tsrx',
		`
import { state } from '@markless/core';

function Child({ onChange }) @{
	<button onClick={() => onChange?.('next')}>go</button>
}

export function App() @{
	let picked = state('none');
	<Child onChange={(value) => picked = value} />
}
`,
	);
	const slot = handlerSlots(result).find((candidate) => candidate.propName === 'onChange');

	expect(slot?.routes).toEqual([
		expect.objectContaining({
			kind: 'callback-route',
			callbackSymbolId: expect.stringMatching(/^symbol:/),
		}),
	]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
});

test('a passed non-callback expression keeps the opaque diagnostic', async () => {
	const result = await compile(
		'src/PresentOpaque.tsrx',
		`
function Child({ onChange }) @{
	<button onClick={() => onChange?.('next')}>go</button>
}

export function App() @{
	<Child onChange={window.reportChange} />
}
`,
	);
	const slot = handlerSlots(result).find((candidate) => candidate.propName === 'onChange');

	expect(slot?.routes).toEqual([
		expect.objectContaining({ kind: 'unsupported-opaque', expression: 'window.reportChange' }),
	]);
	expect(
		result.captureAnalysis.diagnostics.some(
			(item) => item.code === 'MARKLESS_CAPTURE_OPAQUE_PROP',
		),
	).toBe(true);
});

test('a forwarded optional callback resolves to undefined at the terminal edge', async () => {
	const child = await compile(
		'src/ForwardChild.tsrx',
		`
export function ForwardChild({ onChange }) @{
	<button onClick={() => onChange?.('next')}>go</button>
}
`,
	);
	const childHandler = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const parent = await compile(
		'src/ForwardParent.tsrx',
		`
import { ForwardChild } from './ForwardChild.tsrx';

export function ForwardParent({ onChange }) @{
	<ForwardChild onChange={onChange} />
}
`,
		[
			{
				id: 'imported:ForwardChild:symbol:0',
				chunk: 'virtual:markless:symbol:ForwardChild:0',
				exportName: 'forwardChildHandler',
				componentEdgeId: 'component-edge:0',
				captureSymbol: childHandler,
			},
		],
	);
	const forwarded = parent.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.loaderSymbolId === 'imported:ForwardChild:symbol:0',
	)!;

	expect(forwarded.captureSlots[0]?.routes).toEqual([
		expect.objectContaining({ kind: 'passthrough-route', propName: 'onChange' }),
	]);

	const app = await compile(
		'src/ForwardApp.tsrx',
		`
import { ForwardParent } from './ForwardParent.tsrx';

export default function ForwardApp() @{
	<ForwardParent />
}
`,
		[
			{
				id: 'imported:ForwardParent:symbol:0',
				chunk: 'virtual:markless:symbol:ForwardParent:0',
				exportName: 'forwardChildHandler',
				componentEdgeId: 'component-edge:0',
				captureSymbol: forwarded,
			},
		],
	);
	const terminal = app.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.loaderSymbolId === 'imported:ForwardParent:symbol:0',
	);

	expect(terminal?.captureSlots[0]?.routes).toEqual([
		expect.objectContaining({
			kind: 'compiler-known-constant',
			componentEdgeId: 'component-edge:0',
			value: undefined,
		}),
	]);
	expect(app.captureAnalysis.diagnostics).toEqual([]);
});

const guardedChild = (name: string, body: string) => `
function Child({ onChange }) @{
	<button onClick={() => { ${body} }}>go</button>
}

export function App() @{
	<Child />
}
`;

// A presence guard must be false when the prop is absent. A comparison that
// stays true for `undefined`, and a fallback whose right side runs precisely
// because the prop is absent, prove nothing: those call sites stay fail-closed.
const unsafeGuards: ReadonlyArray<readonly [name: string, body: string]> = [
	['NullComparison', `if (onChange !== null) { onChange('next'); }`],
	['ArbitraryComparison', `if (onChange !== 'none') { onChange('next'); }`],
	['TypeofUndefinedConsequent', `if (typeof onChange === 'undefined') { onChange('next'); }`],
	['NullishFallbackCall', `onChange ?? onChange('next')`],
	['OrFallbackCall', `onChange || onChange('next')`],
];

for (const [name, body] of unsafeGuards)
	test(`an absent callback prop tested by ${name} stays fail-closed`, async () => {
		const result = await compile(`src/${name}.tsrx`, guardedChild(name, body));
		const slot = handlerSlots(result).find((candidate) => candidate.propName === 'onChange');

		expect(slot?.routes).toEqual([
			expect.objectContaining({ kind: 'unsupported-opaque', expression: 'onChange' }),
		]);
		expect(result.captureAnalysis.diagnostics.map((item) => item.code)).toContain(
			'MARKLESS_CAPTURE_OPAQUE_PROP',
		);
	});

const safeGuards: ReadonlyArray<readonly [name: string, body: string]> = [
	['UndefinedComparison', `if (onChange !== undefined) { onChange('next'); }`],
	['TypeofDefined', `if (typeof onChange !== 'undefined') { onChange('next'); }`],
	['TypeofUndefinedAlternate', `typeof onChange === 'undefined' ? null : onChange('next')`],
	['NullishGuardAlternate', `onChange == null ? null : onChange('next')`],
	['NegatedGuardAlternate', `if (!onChange) { } else { onChange('next'); }`],
	['AndGuard', `onChange && onChange('next')`],
];

for (const [name, body] of safeGuards)
	test(`an absent callback prop proven absent-safe by ${name} folds to undefined`, async () => {
		const result = await compile(`src/${name}.tsrx`, guardedChild(name, body));
		const slot = handlerSlots(result).find((candidate) => candidate.propName === 'onChange');

		expect(slot?.routes).toEqual([
			expect.objectContaining({ kind: 'compiler-known-constant', value: undefined }),
		]);
		expect(result.captureAnalysis.diagnostics).toEqual([]);
	});

const optionalObject = `
import { state } from '@markless/core';
export default function OptionalObject({ item }) @{
	let said = state('');
	<div>
		<button onClick={() => (said = item ? item.name : 'none')}>Say</button>
		<p>{said}</p>
	</div>
}
`;

test('an absent object prop a handler reads behind a guard is undefined there, not refused', async () => {
	const result = await compile(
		'src/OptionalObjectPage.tsrx',
		`${optionalObject.replace('export default function', 'function')}
export function Page() @{
	<OptionalObject />
}
`,
	);
	const slots = handlerSlots(result).filter((candidate) => candidate.propName === 'item');

	expect(slots.map((slot) => [slot.source, slot.routes])).toEqual([
		['item', [expect.objectContaining({ kind: 'compiler-known-constant', value: undefined })]],
		[
			'item.name',
			[expect.objectContaining({ kind: 'compiler-known-constant', value: undefined })],
		],
	]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
});

test('a child from another file reading an absent object prop behind a guard builds in the page that leaves it out', async () => {
	const child = await compile('src/optional-object.tsrx', optionalObject);
	const handler = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const page = await compile(
		'src/page.tsrx',
		`
import OptionalObject from './optional-object.tsrx';
export default function Page() @{
	<OptionalObject />
}
`,
		[
			{
				id: 'imported:OptionalObject:symbol:say',
				chunk: 'virtual:markless:symbol:OptionalObject:say',
				exportName: 'say',
				componentEdgeId: 'component-edge:0',
				captureSymbol: handler,
			},
		],
	);

	expect(page.captureAnalysis.diagnostics).toEqual([]);
});

test('an absent object prop a handler reads a field of with no guard stays refused, naming the read', async () => {
	const result = await compile(
		'src/UnguardedRead.tsrx',
		`
import { state } from '@markless/core';
function Card({ item }) @{
	let said = state('');
	<div>
		<button onClick={() => (said = item.name.toUpperCase())}>Say</button>
		<p>{said}</p>
	</div>
}
export function Page() @{
	<Card />
}
`,
	);
	const diagnostic = result.captureAnalysis.diagnostics.find(
		(item) => item.code === 'MARKLESS_CAPTURE_OPAQUE_PROP',
	);

	expect(diagnostic?.message).toBe(
		'"Card" reads into its prop "item" in `item.name` (src/UnguardedRead.tsrx:6:34) without checking that it was passed, and this <Card> passes no "item", so that code would throw when it runs in the browser.',
	);
	expect(diagnostic?.primarySpan).toBeDefined();
	expect(diagnostic?.suggestions[0]?.message).toContain('item?.');
});

// Each handler below runs with no `item`: a use JavaScript would throw on refuses, one it would pass through builds.
async function absentItem(handler: string) {
	const result = await compile(
		'src/Absent.tsrx',
		`
import { state } from '@markless/core';
function Card({ item }) @{
	let said = state('');
	<div>
		<button onClick={${handler}}>Say</button>
		<p>{said}</p>
	</div>
}
export function Page() @{
	<Card />
}
`,
	);
	return result.captureAnalysis.diagnostics
		.filter((item) => item.code === 'MARKLESS_CAPTURE_OPAQUE_PROP')
		.map((item) => item.message);
}

test.each([
	['a plain field read', '() => (said = item.name)', 'reads into', 'item.name'],
	['an alias read later', '() => { const it = item; said = it.name; }', 'uses', 'it = item'],
	['destructuring', '() => { const { name } = item; said = name; }', 'uses', '{ name } = item'],
	['for...of', '() => { for (const part of item) said = part; }', 'uses', 'for (const part of item) said = part;'],
	['an in check', "() => (said = 'name' in item ? 'y' : 'n')", 'uses', "'name' in item"],
	['a call', "() => item('x')", 'calls', "item('x')"],
])('an absent prop refuses %s, naming the code and its line', async (_name, handler, action, code) => {
	const [message, ...rest] = await absentItem(handler);
	expect(rest).toEqual([]);
	expect(message).toContain(`"Card" ${action} its prop "item" in \`${code}\` (src/Absent.tsrx:6:`);
});

test.each([
	['a guard', "() => (said = item ? item.name : 'none')"],
	['optional reads', "() => (said = item?.name ?? 'none')"],
	['an early return', '() => { if (!item) return; said = item.name; }'],
	['an early return over a block', "() => { if (item === undefined) { said = 'none'; return; } said = item.name; }"],
	['a bare read', '() => (said = item)'],
	['a typeof check', "() => (said = typeof item === 'undefined' ? 'none' : item.name)"],
	['a parameter that shadows the prop', '(item) => (said = String(item.type))'],
])('an absent prop builds behind %s', async (_name, handler) => {
	expect(await absentItem(handler)).toEqual([]);
});

test('every handler in one module is placed at its own line and column', async () => {
	const result = await compile(
		'src/buttons.tsrx',
		`import { state } from '@markless/core';
export default function Buttons() @{
	let count = state(0);
	<div>
		<button onClick={() => count++}>One</button>
		<p>
			<button onClick={() => {
				count = 0;
			}}>Reset</button>
		</p>
			<i onClick={() => count--}>{count}</i>
	</div>
}
`,
	);
	const starts = result.captureAnalysis.extractedSymbols
		.filter((symbol) => symbol.kind === 'event-handler')
		.map((symbol) => symbol.sourceStart);
	expect(starts).toEqual([
		{ filename: 'src/buttons.tsrx', line: 5, column: 20 },
		{ filename: 'src/buttons.tsrx', line: 7, column: 21 },
		{ filename: 'src/buttons.tsrx', line: 11, column: 16 },
	]);
});

test('a child from another file names its own line when the page leaves the prop out', async () => {
	const child = await compile(
		'src/card.tsrx',
		`import { state } from '@markless/core';
export default function Card({ item }) @{
	let said = state('');
	<div>
		<button onClick={() => {
			said = item.name;
		}}>Say</button>
		<p>{said}</p>
	</div>
}
`,
	);
	const handler = child.captureAnalysis.extractedSymbols.find((symbol) => symbol.kind === 'event-handler')!;
	expect(handler.sourceStart).toEqual({ filename: 'src/card.tsrx', line: 5, column: 20 });
	const page = await compile(
		'src/page.tsrx',
		`import Card from './card.tsrx';
export default function Page() @{
	<Card />
}
`,
		[{ id: 'imported:Card:symbol:say', chunk: 'c', exportName: 'say', componentEdgeId: 'component-edge:0', captureSymbol: handler }],
	);
	const [diagnostic] = page.captureAnalysis.diagnostics;
	expect(diagnostic?.message).toContain('in `item.name` (src/card.tsrx:6:11) without checking');
	expect(diagnostic?.primarySpan?.filename).toBe('src/page.tsrx');
});
