import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { parseModule } from '../../src/js-ast.ts';
import { asNodes, type AnyNode } from '../../src/ast/nodes.ts';
import { collectModuleImports } from '../../src/passes/semantic-graph/imports.ts';

// A type-only binding is erased before anything runs, so a symbol module that
// carries one emits `import { Limit } from "./limits.ts"` for a specifier the
// source module may export nothing for: a throw at module load, before the first
// render, rather than the free-name ReferenceError the value carry fixed.

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;

function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/seed.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function moduleOfKind(compiled: Compiled, kind: string) {
	return compiled.symbolModules.modules.find((one) => one.kind === kind)?.source ?? '';
}

function importLines(source: string) {
	return source.split('\n').filter((line) => line.startsWith('import '));
}

function errors(compiled: Compiled) {
	return [
		...compiled.semanticGraph.diagnostics,
		...compiled.stateLowering.diagnostics,
		...(compiled.symbolModules.diagnostics ?? []),
	].filter((one) => one.severity === 'error');
}

/** A shared() family plus a component whose prop defaults are spliced beside it. */
function sharedSource(options: { readonly imports: string; readonly defaults: string }) {
	return `
import { shared, state } from '@markless/core';
${options.imports}

export const gate = shared(() => {
	const g = state({ minWidth: 1, maxWidth: 2, x: 3 });
	return { ...g, grow() { g.x = g.x + 1; } };
}, { scope: 'widget' });

export function Root({ ${options.defaults} }) @{
	const g = gate();
	g.minWidth = cap;

	<div data-root ui-x={g.x} ui-min={g.minWidth} ui-max={g.maxWidth} />
}
`;
}

test('an `import type` a prop default names is not carried into the shared-seed module', async () => {
	const compiled = await compile(
		sharedSource({
			imports: [
				"import type { Limit } from './limits.ts';",
				"import { WIDTH } from './limits.ts';",
			].join('\n'),
			defaults: 'cap = WIDTH as Limit',
		}),
	);
	const seedModule = moduleOfKind(compiled, 'shared-seed');

	expect(errors(compiled)).toEqual([]);
	// The value the default actually reads still travels; the type name does not.
	expect(importLines(seedModule)).toEqual(['import { WIDTH } from "./limits.ts";']);
	expect(seedModule).toContain('marklessProp_cap === undefined ? WIDTH as Limit');
});

test('an inline `type` specifier in a mixed list is dropped while its value siblings carry', async () => {
	const compiled = await compile(
		sharedSource({
			imports: "import { type Cap, WIDTH } from './limits.ts';",
			defaults: 'cap = WIDTH as Cap',
		}),
	);

	expect(errors(compiled)).toEqual([]);
	expect(importLines(moduleOfKind(compiled, 'shared-seed'))).toEqual([
		'import { WIDTH } from "./limits.ts";',
	]);
});

test('a type-only namespace import a prop default reads through is not carried', async () => {
	const compiled = await compile(
		sharedSource({
			imports: [
				"import type * as limits from './limits.ts';",
				"import { WIDTH } from './limits.ts';",
			].join('\n'),
			defaults: 'cap = WIDTH as limits.Limit',
		}),
	);

	expect(errors(compiled)).toEqual([]);
	expect(importLines(moduleOfKind(compiled, 'shared-seed'))).toEqual([
		'import { WIDTH } from "./limits.ts";',
	]);
});

test('a type-only default import a prop default names is not carried', async () => {
	const compiled = await compile(
		sharedSource({
			imports: [
				"import type Limit from './limits.ts';",
				"import { WIDTH } from './limits.ts';",
			].join('\n'),
			defaults: 'cap = WIDTH as Limit',
		}),
	);

	expect(errors(compiled)).toEqual([]);
	expect(importLines(moduleOfKind(compiled, 'shared-seed'))).toEqual([
		'import { WIDTH } from "./limits.ts";',
	]);
});

test('a file with no type-only import carries exactly what it carried before', async () => {
	const compiled = await compile(
		sharedSource({
			imports: "import { WIDTH } from './limits.ts';",
			defaults: 'cap = WIDTH',
		}),
	);
	const seedModule = moduleOfKind(compiled, 'shared-seed');

	// The byte-equality half: the drop is by `typeOnly`, so a value-only file
	// emits the same import line and the same splice it always did.
	expect(errors(compiled)).toEqual([]);
	expect(importLines(seedModule)).toEqual(['import { WIDTH } from "./limits.ts";']);
	expect(seedModule).toContain('marklessProp_cap === undefined ? WIDTH : marklessProp_cap');
});

test('the state-initializer band drops the type name and keeps the value', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';
import type { Limit } from './limits.ts';
import { type Cap, WIDTH } from './limits.ts';

export function Root({ cap = WIDTH as Limit, w = WIDTH as Cap }) @{
	const g = state({ minWidth: cap, maxWidth: w, x: 1 });

	<div data-root ui-x={g.x} ui-min={g.minWidth} ui-max={g.maxWidth} />
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(importLines(moduleOfKind(compiled, 'state-initializer'))).toEqual([
		'import { WIDTH } from "./limits.ts";',
	]);
});

test('the async-computed-runner band drops the type name and keeps the value', async () => {
	const compiled = await compile(`
import { state, computed } from '@markless/core';
import type { Limit } from './limits.ts';
import { WIDTH } from './limits.ts';

export function Root() @{
	const g = state({ x: 1 });
	const later = computed(async () => { const q: Limit = await Promise.resolve(g.x); return q + WIDTH; });

	@try {
		<div data-root ui-l={later} />
	} @pending {
		<div data-pending />
	} @catch {
		<div data-catch />
	}
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(importLines(moduleOfKind(compiled, 'async-computed-runner'))).toEqual([
		'import { WIDTH } from "./limits.ts";',
	]);
});

const MODULE_SCOPE_SOURCE = `
import { state } from '@markless/core';
import type { Limit } from './limits.ts';
import { WIDTH } from './limits.ts';

const BASE: Limit = WIDTH;

export function Root() @{
	const g = state({ x: BASE });

	<div data-root ui-x={g.x} onClick={() => { g.x = g.x + BASE; }} />
}
`;

test('a carried module-scope declaration brings its value import, not the type it is annotated with', async () => {
	const compiled = await compile(MODULE_SCOPE_SOURCE);

	expect(errors(compiled)).toEqual([]);
	// The declaration keeps its annotation, so the name is present in the emitted
	// text; what must not follow it is a value import for a type-only binding.
	for (const kind of ['event-handler', 'state-initializer']) {
		const emitted = moduleOfKind(compiled, kind);
		expect(emitted).toContain('const BASE: Limit = WIDTH;');
		expect(importLines(emitted)).toEqual(['import { WIDTH } from "./limits.ts";']);
	}
});

test('the SSR module carries the value import and not the type-only one', async () => {
	const compiled = await compile(MODULE_SCOPE_SOURCE);
	const ssr = compiled.publicRenderModule?.ssrModuleSource ?? '';

	expect(errors(compiled)).toEqual([]);
	expect(ssr).toContain('import { WIDTH } from "./limits.ts";');
	expect(ssr).not.toContain('Limit } from "./limits.ts"');
});

test('collectModuleImports flags every type-only shape and leaves value records untouched', () => {
	const source = [
		"import type { Limit } from './limits.ts';",
		"import { type Cap, WIDTH } from './limits.ts';",
		"import type Fallback from './fallback.ts';",
		"import type * as limits from './limits.ts';",
		"import * as runtime from './runtime.ts';",
		'',
	].join('\n');

	expect(
		collectModuleImports(asNodes(parseModule(source, 'x.ts').body as unknown as AnyNode)),
	).toEqual([
		{
			localName: 'Limit',
			importedName: 'Limit',
			source: './limits.ts',
			kind: 'named',
			typeOnly: true,
		},
		{
			localName: 'Cap',
			importedName: 'Cap',
			source: './limits.ts',
			kind: 'named',
			typeOnly: true,
		},
		// No `typeOnly` key at all on a value import: the record a value carry
		// reads is byte-identical to the one it read before the flag existed.
		{ localName: 'WIDTH', importedName: 'WIDTH', source: './limits.ts', kind: 'named' },
		{ localName: 'Fallback', source: './fallback.ts', kind: 'default', typeOnly: true },
		{ localName: 'limits', source: './limits.ts', kind: 'namespace', typeOnly: true },
		{ localName: 'runtime', source: './runtime.ts', kind: 'namespace' },
	]);
});
