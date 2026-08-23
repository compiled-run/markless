import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { CAPTURE_OPAQUE_PROP_CODE } from '../src/passes/capture-analysis.ts';

// Handler sources are TypeScript, not JavaScript: a `.tsrx` author writes
// parameter annotations and `as` casts inside an event handler, and the
// compiler inlines shared methods that carry their own annotations. Capture
// analysis parses those sources to decide whether an absent callback prop is
// only ever called in a way that no-ops on `undefined`. Parsing them as
// JavaScript throws on the first annotation, and the throw was read as "this
// call is unconditional" — turning every optional `onX?.(event)` beside any
// TypeScript syntax into a fail-closed opaque-prop error.

const compile = (filename: string, source: string) =>
	compileTsrxModule({
		filename,
		source,
		symbols: [] as never,
	});

const opaquePropDiagnostics = (result: Awaited<ReturnType<typeof compile>>) =>
	result.captureAnalysis.diagnostics.filter(
		(diagnostic) => diagnostic.code === CAPTURE_OPAQUE_PROP_CODE,
	);

const handlerSlots = (result: Awaited<ReturnType<typeof compile>>) =>
	result.captureAnalysis.extractedSymbols
		.filter((symbol) => symbol.kind === 'event-handler')
		.flatMap((symbol) => symbol.captureSlots);

test('an optional absent-prop call beside a typed parameter is not reported opaque', async () => {
	const result = await compile(
		'src/TypedParameter.tsrx',
		`
function Child({ onChange }) @{
	<button onClick={() => {
		const choose = (next: string) => onChange?.(next);
		choose('next');
	}}>go</button>
}

export function App() @{
	<Child />
}
`,
	);

	expect(opaquePropDiagnostics(result)).toEqual([]);
	expect(
		handlerSlots(result).find((slot) => slot.propName === 'onChange')?.routes,
	).toEqual([expect.objectContaining({ kind: 'compiler-known-constant', value: undefined })]);
});

test('an optional absent-prop call beside an `as` cast is not reported opaque', async () => {
	const result = await compile(
		'src/AsCast.tsrx',
		`
function Child({ onInput }) @{
	<input onInput={(event) => onInput?.((event.target as HTMLInputElement).value)} />
}

export function App() @{
	<Child />
}
`,
	);

	expect(opaquePropDiagnostics(result)).toEqual([]);
	expect(handlerSlots(result).find((slot) => slot.propName === 'onInput')?.routes).toEqual([
		expect.objectContaining({ kind: 'compiler-known-constant', value: undefined }),
	]);
});

test('an annotated handler parameter does not make an optional absent-prop call opaque', async () => {
	const result = await compile(
		'src/AnnotatedHandlerParameter.tsrx',
		`
function Child({ onSelect }) @{
	<button onClick={(event: MouseEvent) => onSelect?.(event)}>go</button>
}

export function App() @{
	<Child />
}
`,
	);

	expect(opaquePropDiagnostics(result)).toEqual([]);
	expect(handlerSlots(result).find((slot) => slot.propName === 'onSelect')?.routes).toEqual([
		expect.objectContaining({ kind: 'compiler-known-constant', value: undefined }),
	]);
});

test('a genuinely unconditional absent-prop call stays fail-closed beside TypeScript syntax', async () => {
	const result = await compile(
		'src/UnconditionalWithTypes.tsrx',
		`
function Child({ onChange }) @{
	<input onInput={(event: InputEvent) => onChange((event.target as HTMLInputElement).value)} />
}

export function App() @{
	<Child />
}
`,
	);

	expect(handlerSlots(result).find((slot) => slot.propName === 'onChange')?.routes).toEqual([
		expect.objectContaining({ kind: 'unsupported-opaque', expression: 'onChange' }),
	]);

	const diagnostic = opaquePropDiagnostics(result)[0];
	expect(diagnostic?.propName).toBe('onChange');
	expect(diagnostic?.message).toContain('invokes it unconditionally');
});
