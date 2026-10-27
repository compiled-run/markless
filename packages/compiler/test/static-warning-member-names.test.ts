import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function staticWarnings(markup: string) {
	const result = await compileTsrxModule({
		filename: 'src/Figure.tsrx',
		symbols: [],
		source: `import { computed, state } from '@markless/core';
const art = { report: { routes: [{ served: 'a' }] }, note: { lines: [3] } };
export function Figure() @{
	let run = state(0);
	const report = computed(() => run * 2);
	let lines = state([1]);
	<svg onClick={() => run++}>${markup}</svg>
}
`,
	});
	return collectTsrxModuleDiagnostics(result)
		.filter((diagnostic) => diagnostic.code === 'MARKLESS_TEMPLATE_EXPRESSION_STATIC')
		.map((diagnostic) => diagnostic.statePath);
}

// A module constant whose property shares a state's name reads no state.
test('a property named like a state binding is not a read of that binding', async () => {
	expect(
		await staticWarnings(
			`<text transform={art.report.routes[0]!.served} y={art.note.lines[0]}>x</text>`,
		),
	).toEqual([]);
});
