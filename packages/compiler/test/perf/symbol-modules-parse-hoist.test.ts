import { expect, test, vi } from 'vitest';

/**
 * `emitSymbolModules` reads every module it just printed back twice — once for
 * the divergent-instance check, once for the free-identifier check — and each
 * read used to reparse the printed source. These pin the parse count, because
 * the emitted bytes are identical either way and no output test can see it.
 *
 * Only parses of a printed module's own source are counted, so the snippet
 * parses the emitters make while generating that source do not move the number.
 * Both entry points count: the readers reach the parser through
 * `parseJavaScriptModule`, the shared tree through `parseModule`.
 */
const parses = vi.hoisted(() => ({ bySource: new Map<string, number>() }));

vi.mock('../../src/js-ast.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/js-ast.ts')>();
	const count = (source: string) => {
		parses.bySource.set(source, (parses.bySource.get(source) ?? 0) + 1);
	};
	return {
		...actual,
		parseModule: (
			source: string,
			filename?: string,
			options?: Parameters<typeof actual.parseModule>[2],
		) => {
			count(source);
			return actual.parseModule(source, filename, options);
		},
		parseJavaScriptModule: (source: string, filename?: string) => {
			count(source);
			return actual.parseJavaScriptModule(source, filename);
		},
	};
});

const { compileTsrxModule } = await import('../../src/index.ts');

/** Each row mints an event-handler module — the kind both readers ask about. */
function rowsSource(rows: number): string {
	const lines = ["import { state } from '@markless/core';", '', 'export function App() @{'];
	lines.push('\tlet count = state(0);');
	lines.push('\t<main>');
	for (let row = 0; row < rows; row += 1) {
		lines.push(
			`\t\t<button onClick={(event) => { event.preventDefault(); count = count + ${row}; }}>{count}</button>`,
		);
	}
	lines.push('\t</main>', '}');
	return `${lines.join('\n')}\n`;
}

async function printedModuleParses(rows: number): Promise<{ parses: number; modules: number }> {
	parses.bySource.clear();
	const result = await compileTsrxModule({
		filename: `src/Rows${rows}.tsrx`,
		source: rowsSource(rows),
		symbols: [],
	});
	const emitted = result.symbolModules?.modules ?? [];
	expect(emitted.length).toBeGreaterThanOrEqual(rows);
	return {
		parses: emitted.reduce(
			(total, module) => total + (parses.bySource.get(module.source) ?? 0),
			0,
		),
		modules: emitted.length,
	};
}

test('a printed symbol module is parsed once, not once per reader', async () => {
	const small = await printedModuleParses(2);
	const large = await printedModuleParses(16);

	expect(small.parses).toBe(small.modules);
	expect(large.parses).toBe(large.modules);
});

test('the parses per printed module stay flat as the page grows', async () => {
	const small = await printedModuleParses(2);
	const large = await printedModuleParses(16);

	expect(large.modules).toBeGreaterThan(small.modules);
	expect(large.parses / large.modules).toBe(small.parses / small.modules);
});
