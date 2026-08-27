import { afterAll, beforeAll, expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/compile-module.ts';
import { buildSemanticGraph } from '../../src/index.ts';
import { parseModule, resetParseCache, setParseTreeFreezing } from '../../src/js-ast.ts';
import { COMPILING_FIXTURES, TEMPLATE_AS_VALUE_FIXTURES } from './fixtures.ts';

/**
 * The parse memo hands the same tree to every pass and to every later compile of
 * the same source, so a pass that writes into a node would leak that write
 * forward. Freezing turns any such write into a `TypeError` here instead of a
 * silently wrong compile later; the pins below are the ones the freeze protects.
 */
beforeAll(() => setParseTreeFreezing(true));
afterAll(() => setParseTreeFreezing(false));

test.for(COMPILING_FIXTURES)(
	'$name compiles end to end against a frozen parse tree',
	async (fixture) => {
		await expect(
			compileTsrxModule({
				filename: fixture.filename,
				source: fixture.source,
				symbols: [],
				importedModuleInterfaces: {},
			}),
		).resolves.toBeTruthy();
	},
);

test.for(TEMPLATE_AS_VALUE_FIXTURES)(
	'$name refuses a template used as a value without writing to the tree',
	async (fixture) => {
		const graph = await buildSemanticGraph({
			filename: fixture.filename,
			source: fixture.source,
		});

		expect(
			graph.diagnostics.filter(
				(diagnostic) => diagnostic.code === 'MARKLESS_TEMPLATE_AS_VALUE',
			),
		).toHaveLength(1);
	},
);

test.for(TEMPLATE_AS_VALUE_FIXTURES)(
	'$name reports the same refusal on a second compile of the same source',
	async (fixture) => {
		const first = await buildSemanticGraph({
			filename: fixture.filename,
			source: fixture.source,
		});
		const second = await buildSemanticGraph({
			filename: fixture.filename,
			source: fixture.source,
		});

		expect(second.diagnostics).toEqual(first.diagnostics);
		expect(second.markup).toEqual(first.markup);
	},
);

// Without this the pins above would pass on a freeze that never took hold.
test('the freeze bites: writing to a node of a shared tree throws', () => {
	resetParseCache();
	const program = parseModule(
		`export function App() @{ <main>ok</main> }`,
		'src/ParseCacheFreezeBites.tsrx',
	) as unknown as { readonly body: ReadonlyArray<{ type: string }> };
	const statement = program.body[0]!;

	expect(() => Object.assign(statement, { type: 'Rewritten' })).toThrow(TypeError);
	expect(statement.type).not.toBe('Rewritten');
});
