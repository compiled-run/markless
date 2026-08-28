/**
 * An emitted symbol module is named `.js` and is loaded as JavaScript, so its
 * text must BE JavaScript. Every band lifts authored text, and authored text is
 * TypeScript, so each band is parsed here with the parser in `lang: 'js'` —
 * which rejects annotations, `as`, `satisfies`, `!` and `import type` outright.
 *
 * A generic call is the one shape a JS-only parse cannot catch: `pick<Limit>(a)`
 * parses clean as two comparisons, so it is pinned by its stripped text instead.
 */
import { expect, test } from 'vitest';
import { parse } from 'yuku-tsrx';
import { compileTsrxModule } from '../../src/index.ts';

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;

function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/bands.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function moduleOfKind(compiled: Compiled, kind: string): string {
	const found = compiled.symbolModules.modules.find((one) => one.kind === kind);
	expect(found, `no emitted module of kind ${kind}`).toBeDefined();
	return found!.source;
}

/** `authoredSource` is a string literal holding authored text for re-derivation:
 * its contents are data, not code, so they are dropped before reading code. */
function emittedCode(source: string): string {
	return source
		.split('\n')
		.filter((line) => !line.startsWith('export const authoredSource ='))
		.join('\n');
}

/** Parse as JavaScript only. A TypeScript-only construct is a diagnostic here. */
function javaScriptDiagnostics(source: string): ReadonlyArray<string> {
	return parse(source, { lang: 'js' }).diagnostics.map((one) => one.message);
}

function errors(compiled: Compiled) {
	return [
		...compiled.semanticGraph.diagnostics,
		...compiled.stateLowering.diagnostics,
		...(compiled.symbolModules.diagnostics ?? []),
	].filter((one) => one.severity === 'error');
}

// Every TypeScript-only construct the goal names, in one authored file, spread
// so that each band lifts at least one of them.
const BANDS_SOURCE = `
import { computed, element, shared, state } from '@markless/core';
import type { Limit } from './limits.ts';
import { WIDTH, pick } from './limits.ts';

const BASE: Limit = WIDTH;

const install = (label: string) => (host: HTMLElement) => {
	host.dataset.label = label as string;
};

export const gate = shared(() => {
	const g = state({ minWidth: 1, x: 3 });
	return { ...g, grow() { g.x = (g.x as number) + 1; } };
}, { scope: 'widget' });

export function Root({ cap = WIDTH as Limit }) @{
	const g = gate();
	const seat = state((BASE as number) + pick<Limit>(WIDTH)!);
	const doubled = computed(() => (g.x as number) * 2);
	const later = computed(async () => ({ v: (g.x satisfies Limit) }));
	const box = element();
	g.minWidth = cap;

	<div data-root el={box} attach={(host: HTMLElement) => { install('ready')(host); }}
		ui-x={g.x} ui-s={seat} ui-d={doubled}
		onClick={() => { const n: number = (g.x as number); g.x = n + BASE!; }}>
		@try { <span>{later.v}</span> } @pending { <span>wait</span> } @catch { <span>bad</span> }
	</div>
}
`;

const BANDS = [
	'event-handler',
	'state-initializer',
	'shared-seed',
	'sync-computed-derive',
	'async-computed-runner',
	'behavior',
	'dom-update',
	'async-boundary-update',
] as const;

test.each(BANDS)('the emitted %s module parses as JavaScript', async (kind) => {
	const compiled = await compile(BANDS_SOURCE);
	expect(errors(compiled)).toEqual([]);

	const emitted = emittedCode(moduleOfKind(compiled, kind));
	expect(javaScriptDiagnostics(emitted), emitted).toEqual([]);
});

test('no emitted symbol module carries a TypeScript-only spelling', async () => {
	const compiled = await compile(BANDS_SOURCE);
	expect(errors(compiled)).toEqual([]);

	for (const module of compiled.symbolModules.modules) {
		const label = `${module.kind} ${module.symbolId}`;
		const code = emittedCode(module.source);
		expect(javaScriptDiagnostics(code), label).toEqual([]);
		expect(code, label).not.toContain('import type');
		expect(code, label).not.toContain(': Limit');
		expect(code, label).not.toContain('as Limit');
		expect(code, label).not.toContain('satisfies');
	}
});

test('a generic call loses its type arguments, which a JS-only parse cannot see', async () => {
	const compiled = await compile(BANDS_SOURCE);
	const emitted = emittedCode(moduleOfKind(compiled, 'state-initializer'));

	// `pick<Limit>(WIDTH)` parses as `(pick < Limit) > (WIDTH)` in JavaScript, so
	// it survives the parse gate above. The stripped text is the real assertion.
	expect(emitted).toContain('pick(WIDTH)');
	expect(emitted).not.toContain('pick<Limit>');
	// The non-null assertion goes with it.
	expect(emitted).not.toContain('!');
});

test('a band with no TypeScript in its authored text is emitted unchanged', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';

export function Root() @{
	let count = state(0);

	<button onClick={() => { count = count + 1; }}>{count}</button>
}
`);
	expect(errors(compiled)).toEqual([]);
	expect(moduleOfKind(compiled, 'event-handler')).toBe(
		`export function symbol_0(context) {
  context.graph.write({ graphNodeId: "state:count", path: [], value: context.graph.read("state:count") + 1 });
}`,
	);
});

// A parameter property has no JavaScript form, so a carried declaration using
// one refuses by name instead of emitting a module missing the assignment.
// An enum never reaches this path: an enum declaration is not carried into a
// symbol module at all, so its name is left free rather than stripped.
test('a carried parameter property is refused by name', async () => {
	await expect(
		compile(`
import { state } from '@markless/core';

class Rate {
	constructor(private step: number) {}
	read() { return this.step; }
}
const rate = new Rate(2);

export function Root() @{
	let count = state(0);

	<button onClick={() => { count = count + rate.read(); }}>{count}</button>
}
`),
	).rejects.toThrow('parameter properties cannot be stripped to JavaScript');
});

/**
 * The SSR module is NOT emitted through the symbol-module printer: it is
 * assembled as text by `public-render`, so authored TypeScript still survives
 * in it. That is covered downstream — the bundler runs `stripEmittedTypes` over
 * the whole source module before anything loads it — so this pin records the
 * seam that is still string-built rather than asserting a defect.
 */
test('the SSR module is still string-built, so authored TypeScript survives in it', async () => {
	const compiled = await compile(BANDS_SOURCE);
	const ssr = compiled.publicRenderModule.ssrModuleSource;

	expect(ssr).toContain('const BASE: Limit = WIDTH;');
	expect(javaScriptDiagnostics(ssr).length).toBeGreaterThan(0);
});
