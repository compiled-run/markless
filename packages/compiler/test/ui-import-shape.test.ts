import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const component = `
export function App() @{
	<main>App</main>
}`;

async function diagnostics(importLine: string) {
	const source = `
${importLine}
${component}`;
	const graph = await buildSemanticGraph({ filename: 'src/App.tsrx', source });
	return graph.diagnostics.filter((item) => item.code === 'MARKLESS_UI_IMPORT_SHAPE');
}

test('a value import from a @markless/ui subpath is an error with the root import fix', async () => {
	const [diagnostic] = await diagnostics("import * as select from '@markless/ui/select';");

	expect(diagnostic).toMatchObject({
		code: 'MARKLESS_UI_IMPORT_SHAPE',
		severity: 'error',
		phase: 'semantic-graph',
		message: expect.stringContaining(
			"Line 2 imports from `@markless/ui/select` with an unsupported shape; use `import { select } from '@markless/ui'`.",
		),
		primarySpan: { filename: 'src/App.tsrx' },
	});
});

test('a side-effect import from a @markless/ui subpath is an error', async () => {
	const [diagnostic] = await diagnostics("import '@markless/ui/select';");

	expect(diagnostic?.code).toBe('MARKLESS_UI_IMPORT_SHAPE');
});

test('a namespace import from the @markless/ui root asks for named families once', async () => {
	const [diagnostic] = await diagnostics("import * as controls from '@markless/ui';");

	expect(diagnostic?.message).toContain(
		"import each family by name, for example `import { accordion, select } from '@markless/ui'`",
	);
	// The local name is not an export, so the fix must not suggest importing it.
	expect(diagnostic?.message).not.toContain('controls');
	expect(diagnostic?.message?.match(/Line 2/g)).toHaveLength(1);
});

test('a named value import from the @markless/ui root is allowed', async () => {
	expect(await diagnostics("import { select } from '@markless/ui';")).toEqual([]);
});

test('a type-only import from a @markless/ui subpath is allowed because it erases', async () => {
	expect(await diagnostics("import type { SelectProps } from '@markless/ui/select';")).toEqual(
		[],
	);
});

test('compileTsrxModule surfaces the import-shape diagnostic', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { select } from '@markless/ui/select';${component}`,
		symbols: [],
	});

	expect(collectTsrxModuleDiagnostics(compiled)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ code: 'MARKLESS_UI_IMPORT_SHAPE', severity: 'error' }),
		]),
	);
});
