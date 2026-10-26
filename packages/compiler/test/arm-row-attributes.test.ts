import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

test('a keyed @for in an @if arm whose rows bind attributes rebuilds them on a flip', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		symbols: [],
		source: `
import { state } from '@markless/core';

export function App() @{
	let items = state([{ id: 'a', tone: 'x' }]);
	let theme = state('dark');
	let open = state(true);
	<main>
		<button onClick={() => (open = !open)}>toggle</button>
		@if (open) { @for (const item of items; key item.id) { <p id={item.id} data-theme={theme}>{item.id}</p> } }
	</main>
}
`,
	});
	expect(
		collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		),
	).toEqual([]);
	const flip = compiled.symbolModules.modules.find((module) => module.kind === 'branch-update');
	expect(flip?.source).toContain('marklessAttributeHtml');
	expect(flip?.source).toMatch(/itemPath"?:\s*\[\s*"id"/);
});
