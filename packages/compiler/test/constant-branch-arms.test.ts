import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// A test that reads no state or prop can never change, so its arms are never rebuilt.
const UNSUPPORTED = 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED';

const keeper = `function Keeper() @{
	let hits = state(0);
	<button onClick={() => hits++}>{hits}</button>
}`;

async function diagnose(declaration: string, test: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
${declaration}
${keeper}
export default function Page({ route }: { readonly route: string }) @{
	<main>@if (${test}) { <section onClick={() => {}}><Keeper />{route}</section> }</main>
}
`,
		symbols: [],
	});
	return collectTsrxModuleDiagnostics(compiled).filter((entry) => entry.code === UNSUPPORTED);
}

test.each([
	['const SHOWN = true;', 'SHOWN'],
	['const PAGE_VISIBLE = 1;', 'PAGE_VISIBLE > 0'],
	['', 'true'],
])('an @if over a constant (%s %s) that holds a stateful child is not refused', async (declaration, condition) => {
	expect(await diagnose(declaration, condition)).toEqual([]);
});

test('the same arm decided by a prop still warns', async () => {
	const diagnostics = await diagnose('', 'route');
	expect(diagnostics.map((entry) => entry.severity)).toEqual(['warning']);
});
