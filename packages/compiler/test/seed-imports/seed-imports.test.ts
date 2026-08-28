import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import {
	SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	unresolvedModuleDeclarationDiagnostics,
} from '../../src/passes/symbol-modules.ts';

// A symbol module is fetched and evaluated on its own, so every name the authored
// text it splices still uses has to travel with it. The plan chose the imports to
// carry from the symbol's own source alone, and a component's destructuring
// default is spliced beside that source without being part of it — so a default
// naming an import emitted a module with a free name. The server render hid it:
// SSR evaluates the authored module, where the import is in scope, so the only
// signal was a client-side ReferenceError on first render.

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;

function source(options: {
	readonly imports?: string;
	readonly seedValue: string;
	readonly capDefault: string;
}) {
	return `
import { shared, state } from '@markless/core';
${options.imports ?? ''}

export const gate = shared(() => {
	const g = state({ minWidth: 1, maxWidth: ${options.seedValue}, x: 2 });
	return { ...g, grow() { g.x = g.x + 1; } };
}, { scope: 'widget' });

export function Root({ cap = ${options.capDefault} }) @{
	const g = gate();
	g.minWidth = cap;

	<div data-root ui-x={g.x} ui-min={g.minWidth} ui-max={g.maxWidth} />
}
`;
}

function compile(options: Parameters<typeof source>[0]) {
	return compileTsrxModule({
		filename: 'src/seed.tsrx',
		source: source(options),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function moduleOfKind(compiled: Compiled, kind: string) {
	return compiled.symbolModules.modules.find((one) => one.kind === kind)?.source ?? '';
}

function errors(compiled: Compiled) {
	return [
		...compiled.semanticGraph.diagnostics,
		...compiled.stateLowering.diagnostics,
		...(compiled.symbolModules.diagnostics ?? []),
	].filter((one) => one.severity === 'error');
}

const LIMITS_IMPORT = "import { LIMIT } from './limits.ts';";

test('an imported constant a state() seed names is carried into the seed module', async () => {
	const compiled = await compile({
		imports: LIMITS_IMPORT,
		seedValue: 'LIMIT',
		capDefault: '1',
	});

	expect(errors(compiled)).toEqual([]);
	expect(moduleOfKind(compiled, 'state-initializer')).toContain(
		'import { LIMIT } from "./limits.ts";',
	);
});

test('an imported constant a default parameter names is carried into the shared-seed module', async () => {
	const compiled = await compile({
		imports: LIMITS_IMPORT,
		seedValue: '9',
		capDefault: 'LIMIT',
	});
	const seedModule = moduleOfKind(compiled, 'shared-seed');

	expect(errors(compiled)).toEqual([]);
	// The splice and its import, in the one module that evaluates them.
	expect(seedModule).toContain('import { LIMIT } from "./limits.ts";');
	expect(seedModule).toContain('marklessProp_cap === undefined ? LIMIT : marklessProp_cap');
});

test('a namespace import a default parameter reads through is carried whole', async () => {
	const compiled = await compile({
		imports: "import * as limits from './limits.ts';",
		seedValue: '9',
		capDefault: 'limits.LIMIT',
	});

	expect(errors(compiled)).toEqual([]);
	expect(moduleOfKind(compiled, 'shared-seed')).toContain(
		'import * as limits from "./limits.ts";',
	);
});

test('a default parameter that names no import carries none', async () => {
	const compiled = await compile({ imports: LIMITS_IMPORT, seedValue: '9', capDefault: '0.25' });
	const seedModule = moduleOfKind(compiled, 'shared-seed');

	expect(errors(compiled)).toEqual([]);
	// The carry is by name, so an unrelated import in the file stays behind and
	// the emitted bytes are the ones this module emitted before the carry existed.
	expect(seedModule).not.toContain('import');
	expect(seedModule).toContain('marklessProp_cap === undefined ? 0.25 : marklessProp_cap');
});

test('an import the seed value itself names is refused at compile time, not carried', async () => {
	const compiled = await compile({ imports: LIMITS_IMPORT, seedValue: '9', capDefault: '1' });
	const refusing = await compileTsrxModule({
		filename: 'src/seed.tsrx',
		source: source({ imports: LIMITS_IMPORT, seedValue: '9', capDefault: '1' }).replace(
			'g.minWidth = cap;',
			'g.minWidth = LIMIT;',
		),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const refusal = errors(refusing).find(
		(one) => one.code === 'MARKLESS_SHARED_SEED_UNSUPPORTED',
	);

	expect(errors(compiled)).toEqual([]);
	// Named: the binding, and the seed it was written into.
	expect(refusal?.message).toContain('LIMIT');
	expect(refusal?.message).toContain('g.minWidth');
});

test('a same-file const a default parameter names is refused, naming the binding and the symbol', async () => {
	// The shared-seed band carries imports but not declarations, and this is the
	// refusal that keeps the gap a build error rather than a browser crash.
	const compiled = await compile({ imports: 'const MIN = 3;', seedValue: '9', capDefault: 'MIN' });
	const refusal = errors(compiled).find(
		(one) => one.code === SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);

	expect(refusal).toBeDefined();
	expect(refusal?.title).toContain('MIN');
	expect(refusal?.title).toMatch(/symbol:\d+/);
	expect(refusal?.message).toContain('ReferenceError');
	expect(refusal?.message).toContain('server render');
});

test('an emitted module that leaves an import free is reported', () => {
	// Unreachable from an authored file once the carry is right, so it is pinned
	// by construction against the same private filter production runs.
	const reported = unresolvedModuleDeclarationDiagnostics(
		[
			{
				symbolId: 'sym:free-import',
				kind: 'shared-seed',
				exportName: 'sym_free_import',
				source: 'export function sym_free_import(context) {\n\treturn CLOSE_THRESHOLD;\n}\n',
			},
		],
		new Set(),
		new Set(['CLOSE_THRESHOLD']),
	);

	expect(reported).toHaveLength(1);
	expect(reported[0]!.code).toBe(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
	expect(reported[0]!.severity).toBe('error');
	expect(reported[0]!.title).toContain('CLOSE_THRESHOLD');
	expect(reported[0]!.title).toContain('import');
	// The message has to say why the server stayed green, or a passing SSR render
	// reads as evidence the module is fine.
	expect(reported[0]!.message).toContain('ReferenceError');
	expect(reported[0]!.message).toContain('server render');
});

test('a module that imports the name it uses is not reported', () => {
	expect(
		unresolvedModuleDeclarationDiagnostics(
			[
				{
					symbolId: 'sym:carried-import',
					kind: 'shared-seed',
					exportName: 'sym_carried_import',
					source: 'import { CLOSE_THRESHOLD } from "./swipe.ts";\nexport function sym_carried_import(context) {\n\treturn CLOSE_THRESHOLD;\n}\n',
				},
			],
			new Set(),
			new Set(['CLOSE_THRESHOLD']),
		),
	).toEqual([]);
});
