import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// A mutating call on a fresh copy of a collection (`[...rows].sort()`) changes
// only the copy, so it is not a write to `rows` and needs no graph target.

const moduleSource = (derive: string, collection = 'rows') => `
import { state, computed } from '@markless/core';

export function Table() @{
	const ${collection} = state([{ id: 'b', n: 2 }, { id: 'a', n: 1 }]);
	const sorted = computed(() => ${derive.replaceAll('rows', collection)});

	<ul>
		@for (const row of sorted; key row.id) {
			<li>{row.id}</li>
		}
	</ul>
}
`;

async function writeDiagnostics(derive: string, collection?: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/Table.tsrx',
		source: moduleSource(derive, collection),
		symbols: [],
	});
	return {
		compiled,
		diagnostics: collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) => diagnostic.severity === 'error' || diagnostic.code.includes('WRITE'),
		),
	};
}

const freshCopies = [
	'[...rows].sort((a, b) => a.n - b.n)',
	'[...rows].reverse()',
	'rows.slice().sort((a, b) => a.n - b.n)',
	'rows.slice().reverse()',
	'Array.from(rows).sort((a, b) => a.n - b.n)',
	'Array.from(rows).reverse()',
	'Array.of(...rows).reverse()',
	'rows.concat().sort((a, b) => a.n - b.n)',
	'rows.map((row) => row).reverse()',
	'rows.filter(Boolean).sort((a, b) => a.n - b.n)',
	'[...rows, ...rows].sort((a, b) => a.n - b.n)',
	'(([...rows])).reverse()',
];

for (const derive of freshCopies) {
	test(`\`${derive}\` sorts a fresh copy, not the state`, async () => {
		const { diagnostics, compiled } = await writeDiagnostics(derive);

		expect(diagnostics).toEqual([]);
		expect(compiled.stateLowering.writes).toEqual([]);
	});
}

test('a fresh copy of a differently named collection is not a write either', async () => {
	const { diagnostics } = await writeDiagnostics('[...items].sort((a, b) => b.n - a.n)', 'items');

	expect(diagnostics).toEqual([]);
});

for (const derive of ['rows.sort((a, b) => a.n - b.n)', 'rows.reverse()']) {
	test(`\`${derive}\` mutates the state itself and is still reported`, async () => {
		const { diagnostics } = await writeDiagnostics(derive);

		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics.every((diagnostic) => diagnostic.severity === 'error')).toBe(true);
	});
}

test('a copy that is not fresh (an alias) still reports the write', async () => {
	const { diagnostics } = await writeDiagnostics('(rows || []).sort((a, b) => a.n - b.n)');

	expect(diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
});

test('the server render lists the sorted copy and leaves the state order alone', async () => {
	const { compiled } = await writeDiagnostics('[...rows].sort((a, b) => a.n - b.n)');
	const moduleSource = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		compiled.publicRenderModule.renderDataModuleSource,
		compiled.publicRenderModule.ssrModuleSource.replace(
			/from (['"])@markless\/web\/fns\/([^'"]+)\1/g,
			(_match, _quote: string, helperModule: string) =>
				`from '${new URL(`../../web/src/fns/${helperModule}.ts`, import.meta.url).href}'`,
		),
		'export { marklessRenderSsr };',
	].join('\n');
	const ssrModule = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`
	)) as { marklessRenderSsr: () => Promise<{ html: string }> };
	const { html } = await ssrModule.marklessRenderSsr();

	expect(html.match(/<li>(\w)<\/li>/g)).toEqual(['<li>a</li>', '<li>b</li>']);
	expect(JSON.stringify(compiled.protocolState)).toMatch(/"b".*"a"/);
});
