import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function staticWarnings(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Sheet.tsrx', source, symbols: [] });
	return collectTsrxModuleDiagnostics(result)
		.filter((diagnostic) => diagnostic.code === 'MARKLESS_TEMPLATE_EXPRESSION_STATIC')
		.map((diagnostic) => diagnostic.source);
}

const sheet = (declaration: string, markup: string) => `import { computed, state } from '@markless/core';
import { layout } from './layout.ts';
export function Sheet() @{
	${declaration}
	<svg>${markup}</svg>
}
`;

test.each([
	['an index on a state array', `let lines = state(['e4']);`, `<text>{lines[0]}</text>`],
	['an index on a computed array', `const lines = computed(() => ['e4']);`, `<text>{lines[0]}</text>`],
	['an optional member after an index', `let rows = state([{ name: 'a' }]);`, `<text>{rows[1]?.name ?? ''}</text>`],
	['an optional member on a computed row', `const rows = computed(() => [{ name: 'a' }]);`, `<text>{rows[1]?.name}</text>`],
	['nested members on a state object', `let board = state({ sheet: { title: 'x' } });`, `<text>{board.sheet.title}</text>`],
	['an index under nested members', `let board = state({ sheet: { lines: ['e4'] } });`, `<text>{board.sheet.lines[0]}</text>`],
])('%s does not warn that it never updates', async (_, declaration, markup) => {
	expect(await staticWarnings(sheet(declaration, markup))).toEqual([]);
});

test.each([
	['text', `<text>{layout.sheet.lines[0]}</text>`],
	['an attribute', `<text transform={layout.sheet.lines[0]!}>{lines[0]}</text>`],
	['an optional chain', `<path d={layout.hits?.lines[1] ?? ''} />`],
])('a module value whose property shares a state name does not read that state, in %s', async (_, markup) => {
	expect(await staticWarnings(sheet(`const lines = computed(() => ['e4']);`, markup))).toEqual([]);
});

test('a name bound inside the expression does not read the state it shadows', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Sheet.tsrx',
		source: sheet(`let lines = state(['e4']);`, `<text>{layout.sheet.lines.map((lines) => lines).join(' ')}</text>`),
		symbols: [],
	});
	expect(collectTsrxModuleDiagnostics(result).map((diagnostic) => diagnostic.code)).toEqual([]);
});

test('an expression that reads state and cannot follow it still warns', async () => {
	expect(
		await staticWarnings(sheet(`let lines = state(['e4']);\n\tlet last = '';`, `<text>{last = lines[0]}</text>`)),
	).toEqual(['last = lines[0]']);
});
