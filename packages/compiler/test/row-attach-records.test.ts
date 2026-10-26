import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function compile(rows: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		symbols: [],
		source: `
import { state } from '@markless/core';
import { tip } from './tip.ts';

export function App() @{
	let rows = state([{ id: 1, label: 'a', on: true }]);
	let theme = state('dark');
	<ul>@for (const row of rows; key row.id) { ${rows} }</ul>
}
`,
	});
	return {
		repeat: compiled.protocolView.keyedRepeats?.[0],
		refusals: collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_ROW_ATTACH_UNSUPPORTED',
		),
		modules: compiled.symbolModules.modules,
	};
}

test('a row attach rides the list record with the item paths its inputs read', async () => {
	const { repeat, refusals } = await compile(`<li attach={tip(row.label, row)}>{row.label}</li>`);
	expect(repeat?.rowBehaviors).toEqual([
		{ hostPath: [], symbolId: expect.any(String), inputPaths: [['label'], []] },
	]);
	expect(refusals).toEqual([]);
});

test('an inline row attach reads the row item from the row it runs on', async () => {
	const { repeat, refusals, modules } = await compile(
		`<li attach={(el) => void (el.title = row.label)}>{row.label}</li>`,
	);
	const symbolId = repeat?.rowBehaviors?.[0]?.symbolId;
	expect(modules.find((module) => module.symbolId === symbolId)?.source).toContain(
		'const row = context.locals?.row;',
	);
	expect(refusals).toEqual([]);
});

test('a row attach whose input reads page state is refused at build time', async () => {
	const { repeat, refusals } = await compile(`<li attach={tip(row.label, theme)}>{row.label}</li>`);
	expect(repeat?.rowBehaviors).toBeUndefined();
	expect(refusals).toEqual([expect.objectContaining({ severity: 'error' })]);
});

test('a row attach inside an @if arm in the row is refused at build time', async () => {
	const { refusals } = await compile(
		`<li>@if (row.on) { <b attach={tip(row.label)}>on</b> }</li>`,
	);
	expect(refusals).toEqual([expect.objectContaining({ severity: 'error' })]);
});
