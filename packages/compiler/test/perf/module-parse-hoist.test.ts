import { expect, test, vi } from 'vitest';

/**
 * Two element collectors and three emit helpers used to parse the whole module
 * again on every candidate they resolved, which made a compile quadratic in a
 * page's element count. These pin the parse count itself, because the emitted
 * bytes are identical either way and no output test can see the difference.
 *
 * Only parses of the module's own source are counted. The emitters also parse
 * the code they generate, and that work is meant to grow with the module.
 */
const parses = vi.hoisted(() => ({ source: '', count: 0 }));

vi.mock('../../src/js-ast.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/js-ast.ts')>();
	return {
		...actual,
		parseModule: (
			source: string,
			filename?: string,
			options?: Parameters<typeof actual.parseModule>[2],
		) => {
			if (source === parses.source) parses.count += 1;
			return actual.parseModule(source, filename, options);
		},
	};
});

const { buildSemanticGraph } = await import('../../src/index.ts');
const { moduleScopeDeclarations } = await import('../../src/passes/public-render/shared.ts');
const { ownedModuleAst } = await import('../../src/passes/semantic-graph/shared-ast.ts');

/**
 * Every row writes a spread whose object must be resolved back to its
 * declaration and a handler whose arrow must be, which is exactly the pair of
 * lookups that used to reparse.
 */
function rowsSource(rows: number): string {
	const lines = ["import { state } from '@markless/core';", '', 'export function App() @{'];
	lines.push('\tlet count = state(0);');
	for (let row = 0; row < rows; row += 1) {
		lines.push(`\tconst attrs${row} = { id: 'row-${row}' };`);
		lines.push(`\tconst press${row} = () => @{ count = count + ${row}; };`);
	}
	lines.push('\t<main>');
	for (let row = 0; row < rows; row += 1) {
		lines.push(`\t\t<button {...attrs${row}} onClick={press${row}}>{count}</button>`);
	}
	lines.push('\t</main>', '}');
	return `${lines.join('\n')}\n`;
}

async function moduleParsesFor(rows: number): Promise<number> {
	const source = rowsSource(rows);
	parses.source = source;
	parses.count = 0;
	await buildSemanticGraph({ filename: `src/Rows${rows}.tsrx`, source });
	return parses.count;
}

test('the semantic graph parses a module the same number of times at any element count', async () => {
	const small = await moduleParsesFor(2);
	const large = await moduleParsesFor(24);

	expect(small).toBeGreaterThan(0);
	expect(large).toBe(small);
});

test('module-scope declarations are read from one parse however many emitters ask', () => {
	const source = rowsSource(3);
	parses.source = source;
	parses.count = 0;

	const first = moduleScopeDeclarations(source, 'src/Memo.tsrx');
	const second = moduleScopeDeclarations(source, 'src/Memo.tsrx');

	expect(parses.count).toBe(1);
	expect(second).toBe(first);
});

test('one owner holds one tree, and a source it did not parse gets its own', () => {
	const source = rowsSource(5);
	parses.source = source;
	parses.count = 0;
	const owner = {};

	const first = ownedModuleAst(owner, source, 'src/Owned.tsrx');

	expect(ownedModuleAst(owner, source, 'src/Owned.tsrx')).toBe(first);
	expect(parses.count).toBe(1);
	expect(ownedModuleAst({}, source, 'src/Owned.tsrx')).not.toBe(first);
	expect(parses.count).toBe(2);
});
