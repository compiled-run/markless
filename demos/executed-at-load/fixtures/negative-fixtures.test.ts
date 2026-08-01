import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '@markless/compiler';
import { expect, test } from 'vitest';

test('computed-repeat-async-arm.tsrx fails the build with the boundary-runner diagnostic', async () => {
	const result = await compileFixture('computed-repeat-async-arm.tsrx');
	expect(collectTsrxModuleDiagnostics(result)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT',
				severity: 'error',
			}),
		]),
	);
});

const diseaseFixtures = [
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

// DISEASE PIN: this fixture intentionally preserves today's silent/broken
// compiler behavior. A later architecture package must flip this assertion
// to an expected build error; it must not make the silent output look supported.
for (const fixture of diseaseFixtures) {
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
