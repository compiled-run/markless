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
	expect(diagnostic?.message).toContain('is not passed by');
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
