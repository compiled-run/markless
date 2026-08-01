import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '@markless/compiler';
import { expect, test } from 'vitest';

const fixtures = [
	{
		filename: 'computed-repeat-async-arm.tsrx',
		observe(result: Awaited<ReturnType<typeof compileFixture>>) {
			return {
				diagnostics: collectTsrxModuleDiagnostics(result).map(diagnosticIdentity),
				asyncBoundaryGates: result.publicRenderPlan.asyncBoundaryGates,
				asyncArmRenderCount: result.publicRenderPlan.asyncBoundaryArmRenders.length,
			};
		},
	},
	{
		filename: 'for-call-expression.tsrx',
		observe(result: Awaited<ReturnType<typeof compileFixture>>) {
			return {
				diagnostics: collectTsrxModuleDiagnostics(result).map(diagnosticIdentity),
				keyedRepeatCount: result.payloadArena.view.keyedRepeats.length,
				repeatGateCount: result.publicRenderPlan.repeatGates.length,
			};
		},
	},
] as const;

// DISEASE PIN: these fixtures intentionally preserve today's silent/broken
// compiler behavior. The next architecture package must flip both assertions
// to expected build errors; it must not make the silent output look supported.
for (const fixture of fixtures) {
	test(`pins the current disease for ${fixture.filename}`, async () => {
		const result = await compileFixture(fixture.filename);
		expect(fixture.observe(result)).toMatchSnapshot();
	});
}

async function compileFixture(filename: string) {
	const url = new URL(filename, import.meta.url);
	return await compileTsrxModule({
		filename: `demos/executed-at-load/fixtures/${filename}`,
		source: await readFile(fileURLToPath(url), 'utf8'),
		buildId: `executed-at-load-negative-${filename}`,
		resolverId: `executed-at-load-negative-${filename}-resolver`,
		symbols: [],
	});
}

function diagnosticIdentity(diagnostic: {
	readonly code: string;
	readonly severity: string;
	readonly message: string;
}) {
	return {
		code: diagnostic.code,
		severity: diagnostic.severity,
		message: diagnostic.message,
	};
}
