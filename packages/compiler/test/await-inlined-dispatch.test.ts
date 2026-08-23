import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// U162 diagnosed, U165 fixed: `inlineSharedMethodCalls` replaces a call to a
// shared method that dispatches to a consumer callback with an async IIFE, and
// it used to leave that IIFE unawaited. The authored
// `collapsible.toggle(); onClick?.(e);` then became fire-and-forget plus a
// synchronous call, so the two consumer callbacks raced on how long the capture
// import took, and the end-of-dispatch flush - which closes over the awaited leg
// only - silently dropped whichever writes landed late.
//
// These rows pin the fix at the emission level, which is where authored order is
// decided. The browser lane measures that the order holds at runtime; asserting
// it on the emitted text is what makes a regression name its own cause.

const FACTORY = `import { shared, state } from '@markless/core';
export const boxState = shared(
	() => {
		const box = state({ checked: false });
		return {
			...box,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				const next = box.checked === true ? false : true;
				box.checked = next;
				box.onChange?.(next);
			},
			// A method that dispatches to nobody. Awaiting it would buy nothing and
			// would make every plain shared method cost a microtask.
			reset() {
				box.checked = false;
			},
		};
	},
	{ scope: 'widget' },
);

export function BoxRoot({ checked = false, onChange, children }) @{
	const box = boxState();
	box.onChange = onChange;
	box.checked = checked;

	<div ui-checked={box.checked}>{children}</div>
}
`;

function trigger(markup: string) {
	return `${FACTORY}
export function BoxTrigger({ onClick, children }) @{
	const box = boxState();

	${markup}
}`;
}

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/box.tsrx', source, symbols: [] });
}

function handlerSource(compiled: Awaited<ReturnType<typeof compile>>, kind: string) {
	const symbol = compiled.symbolResolver.symbols.find((candidate) => candidate.kind === kind);
	return (symbol as { readonly source?: string } | undefined)?.source ?? '';
}

function handlerModule(compiled: Awaited<ReturnType<typeof compile>>, kind: string) {
	return compiled.symbolModules.modules.find((module) => module.kind === kind)?.source ?? '';
}

function diagnosticCodes(compiled: Awaited<ReturnType<typeof compile>>) {
	return compiled.symbolModules.diagnostics.map((entry) => entry.code);
}

test('a dispatching shared-method call is awaited, so the statement after it runs after it', async () => {
	const compiled = await compile(
		trigger(`<button onClick={(e) => { box.toggle(); onClick?.(e); }}>{children}</button>`),
	);

	const source = handlerSource(compiled, 'event-handler');
	// The inlined body is awaited where the authored call stood. Without this the
	// IIFE is started and abandoned, and the consumer's `onClick` overtakes it.
	expect(source).toContain('await (async () => {');
	// Awaiting is only legal in an async context, so the handler the author wrote
	// carries the marker too. The emitter reads this same leading `async`.
	expect(source.trimStart().startsWith('async ')).toBe(true);

	const emitted = handlerModule(compiled, 'event-handler');
	expect(emitted).toContain('export async function');
	// Authored order, read off the emitted text: the dispatch is awaited strictly
	// before the consumer's own callback is called.
	const dispatch = emitted.indexOf('await (async () => {');
	const consumer = emitted.indexOf('context.graph.read("prop:props", ["onClick"])?.(e)');
	expect(dispatch).toBeGreaterThanOrEqual(0);
	expect(consumer).toBeGreaterThan(dispatch);
	expect(diagnosticCodes(compiled)).toEqual([]);
});

// The same rewrite runs over a callback prop on a component edge
// (symbol-resolver.ts's second `inlineSharedMethodCalls` call site). It must
// reach the same async wrapper, or the `await` it emits would not parse.
test('a callback prop that calls a dispatching shared method awaits it in an async module', async () => {
	const compiled = await compile(
		`${FACTORY}
export function BoxTrigger({ children }) @{
	const box = boxState();

	<BoxRoot onChange={(next) => { box.toggle(); }}>{children}</BoxRoot>
}`,
	);

	const source = handlerSource(compiled, 'callback-prop');
	expect(source).toContain('await (async () => {');
	expect(source.trimStart().startsWith('async ')).toBe(true);
	expect(handlerModule(compiled, 'callback-prop')).toContain('export async function');
	expect(diagnosticCodes(compiled)).toEqual([]);
});

test('a shared method that dispatches to nobody is inlined without await', async () => {
	const compiled = await compile(
		trigger(`<button onClick={(e) => { box.reset(); onClick?.(e); }}>{children}</button>`),
	);

	const source = handlerSource(compiled, 'event-handler');
	expect(source).toContain('(() => {');
	expect(source).not.toContain('await');
	expect(source.trimStart().startsWith('async ')).toBe(false);
	expect(diagnosticCodes(compiled)).toEqual([]);
});

test('an authored async handler keeps its own marker and is awaited once', async () => {
	const compiled = await compile(
		trigger(`<button onClick={async (e) => { box.toggle(); onClick?.(e); }}>{children}</button>`),
	);

	const source = handlerSource(compiled, 'event-handler');
	expect(source.startsWith('async (e) =>')).toBe(true);
	expect(source.startsWith('async async')).toBe(false);
	expect(source).toContain('await (async () => {');
	expect(diagnosticCodes(compiled)).toEqual([]);
});

// An expression-bodied handler has no block to splice into; the await has to sit
// in the expression itself, and the arrow still has to become async.
test('an expression-bodied handler awaits the dispatch in its own expression', async () => {
	const compiled = await compile(trigger(`<button onClick={() => box.toggle()}>{children}</button>`));

	expect(handlerSource(compiled, 'event-handler').trimStart().startsWith('async () =>')).toBe(true);
	expect(handlerModule(compiled, 'event-handler')).toContain('return await (async () => {');
	expect(diagnosticCodes(compiled)).toEqual([]);
});

// The await is parenthesized where it is spliced, so it stays a valid operand of
// whatever expression the author wrote around the call.
test('a dispatching call used as an operand keeps its await a valid operand', async () => {
	const compiled = await compile(
		trigger(
			`<button onClick={() => { const done = box.toggle() ?? true; onClick?.(done); }}>{children}</button>`,
		),
	);

	const source = handlerSource(compiled, 'event-handler');
	expect(source).toContain('const done = (await (async () => {');
	expect(diagnosticCodes(compiled)).toEqual([]);
});

// The one shape the rewrite cannot serve: the call sits inside a nested
// synchronous arrow, where `await` does not parse and where marking that inner
// arrow async would change what its own caller receives. Nothing is inlined, so
// the authored `box.toggle()` survives into the emitted module naming a binding
// nothing there declares - and the existing read-back guard refuses the compile.
// This is the alternative to emitting source that will not parse.
test('a dispatching call inside a nested synchronous arrow fails the compile closed', async () => {
	const compiled = await compile(
		trigger(
			`<button onClick={() => { [1].forEach(() => box.toggle()); onClick?.(); }}>{children}</button>`,
		),
	);

	const source = handlerSource(compiled, 'event-handler');
	expect(source).toContain('box.toggle()');
	expect(source).not.toContain('await');
	expect(diagnosticCodes(compiled)).toContain('MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE');
	expect(
		compiled.symbolModules.diagnostics.every((entry) => entry.severity === 'error'),
	).toBe(true);
});

// Whatever this pass emits is reparsed by later passes and by the emitter, so a
// shape that does not parse is a silent downgrade rather than a loud failure.
test('every emitted handler source parses as the expression it claims to be', async () => {
	for (const markup of [
		`<button onClick={(e) => { box.toggle(); onClick?.(e); }}>{children}</button>`,
		`<button onClick={() => box.toggle()}>{children}</button>`,
		`<button onClick={async (e) => { box.toggle(); onClick?.(e); }}>{children}</button>`,
		`<button onClick={() => { const done = box.toggle() ?? true; onClick?.(done); }}>{children}</button>`,
		`<button onClick={() => { [1].forEach(() => box.toggle()); onClick?.(); }}>{children}</button>`,
	]) {
		const source = handlerSource(await compile(trigger(markup)), 'event-handler');
		expect(source).not.toBe('');
		expect(() => new Function(`return (${source});`)).not.toThrow();
	}
});
