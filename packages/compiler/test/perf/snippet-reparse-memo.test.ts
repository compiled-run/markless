import { expect, test, vi } from 'vitest';

/**
 * A build compiles each module once per query variant. The snippet reads a
 * compile makes — printed declarations, handler sources, authored spans — are
 * answered from memos keyed by their exact text, so a repeat compile of the
 * same module does not parse them again and still emits the same bytes. The
 * whole-compile cache is cleared first, as a variant with other link inputs misses it.
 */
const parses = vi.hoisted(() => ({ count: 0, moduleSource: '' }));

vi.mock('../../src/js-ast.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/js-ast.ts')>();
	return {
		...actual,
		parseModule: (
			source: string,
			filename?: string,
			options?: Parameters<typeof actual.parseModule>[2],
		) => {
			if (source !== parses.moduleSource) parses.count += 1;
			return actual.parseModule(source, filename, options);
		},
		parseJavaScriptModule: (source: string, filename?: string) => {
			if (source !== parses.moduleSource) parses.count += 1;
			return actual.parseJavaScriptModule(source, filename);
		},
	};
});

const { compileTsrxModule } = await import('../../src/index.ts');
const { clearCompileCache } = await import('../../src/compile-cache.ts');
const { createSourceMemo, moduleSemantics } =
	await import('../../src/passes/semantic-graph/shared-ast.ts');

const source = [
	"import { state } from '@markless/core';",
	'',
	'const STEP: number = 2;',
	'',
	'function Stepper(props: { onStep?: (by: number) => void }) @{',
	'\t<button onClick={() => props.onStep?.(STEP)}>{"step"}</button>',
	'}',
	'',
	'export function Tally() @{',
	'\tlet total = state(0 as number);',
	'\t<main>',
	'\t\t<Stepper onStep={(by: number) => { total = total + by; }} />',
	'\t\t<output>{total}</output>',
	'\t</main>',
	'}',
	'',
].join('\n');

async function compileCounting() {
	clearCompileCache();
	parses.moduleSource = source;
	parses.count = 0;
	const result = await compileTsrxModule({ filename: 'src/Tally.tsrx', source, symbols: [] });
	return { result, snippetParses: parses.count };
}

test('a repeat compile of the same module skips the snippet parses and emits the same bytes', async () => {
	const first = await compileCounting();
	const again = await compileCounting();

	expect(first.snippetParses).toBeGreaterThan(0);
	expect(again.snippetParses).toBeLessThan(first.snippetParses);
	expect(JSON.stringify(again.result)).toBe(JSON.stringify(first.result));
});

test('the source memo evicts the least recently used entry', () => {
	const memo = createSourceMemo<number>(2);
	let computed = 0;
	const read = (text: string) => memo('file.ts', text, () => (computed += 1));

	read('a');
	read('b');
	read('a');
	read('c');
	expect(computed).toBe(3);
	read('a');
	expect(computed).toBe(3);
	read('b');
	expect(computed).toBe(4);
});

test('the source memo keeps the filename and the source apart', () => {
	const memo = createSourceMemo<string>(8);
	expect(memo('a b', 'c', () => 'first')).toBe('first');
	expect(memo('a', 'b c', () => 'second')).toBe('second');
});

test('module semantics are analyzed once per exact source', () => {
	const view = moduleSemantics('const a = 1; a;', 'memo.ts');
	expect(moduleSemantics('const a = 1; a;', 'memo.ts')).toBe(view);
	expect(moduleSemantics('const b = 1; b;', 'memo.ts')).not.toBe(view);
	expect(view.reference.count).toBeGreaterThan(0);
});
