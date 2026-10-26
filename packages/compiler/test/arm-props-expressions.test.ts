import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

const EXPRESSION = `import { state } from '@markless/core';
export default function Item({ path }: { readonly path: string }) @{
	let open = state(true);
	<div><button onClick={() => (open = !open)}>t</button>@if (open) { <><a href="/a" class={path === "/a" ? "x" : "y"}>a</a></> }</div>
}
`;

const TABLE = EXPRESSION.replace(
	'export default',
	'const VALUES: Record<string, Record<string, string>> = { "/a": { v0: "x" } };\nexport default',
)
	.replace('\tlet open', '\tconst values = VALUES[path] ?? {};\n\tlet open')
	.replace('class={path === "/a" ? "x" : "y"}', 'class={values["v0"]}');

// Both are pure functions of the same prop, so an arm rebuilds either from a graph read.
test.each([
	['an expression of a prop', EXPRESSION],
	['a table read keyed by a prop', TABLE],
])('an @if arm attribute computed from %s rebuilds on a flip', async (_, source) => {
	const compiled = await compileTsrxModule({ filename: 'Item.tsrx', source, symbols: [] });
	expect(
		collectTsrxModuleDiagnostics(compiled).filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
});
