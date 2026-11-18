import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '@markless/compiler';
import { expect, test } from 'vitest';

test('computed-repeat-async-arm.tsrx emits native async and repeat chunks', async () => {
	const result = await compileFixture('computed-repeat-async-arm.tsrx');
	expect(collectTsrxModuleDiagnostics(result).filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
	expect(result.renderData.chunks.map((chunk) => chunk.kind)).toEqual(
		expect.arrayContaining(['async-arm', 'repeat-row']),
	);
});

test('for-call-expression.tsrx keys its rows on a derived collection the browser re-runs', async () => {
	const result = await compileFixture('for-call-expression.tsrx');
	expect(collectTsrxModuleDiagnostics(result)).toEqual([]);
	expect(result.payloadArena.view.keyedRepeats).toHaveLength(1);
	expect(result.renderData.repeats.map((repeat) => repeat.directSupported)).toEqual([true]);
});

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
