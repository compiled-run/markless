import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import type { CompileTsrxModuleResult } from '../src/index.ts';

const parseErrorSource = `export function Counter({ count }: { count: number }) @{
	<button onClick={() => count++}>{count ?? 10}</button>>
}`;

const readOnlyPropWriteSource = `export function Counter({ count }: { count: number }) @{
	<button onClick={() => count++}>{count ?? 10}</button>
}`;

async function compile(filename: string, source: string) {
	return await compileTsrxModule({
		filename,
		source,
		buildId: 'test-build',
		resolverId: 'test-resolver',
		symbols: [],
	});
}

test('collectTsrxModuleDiagnostics includes parse diagnostics', async () => {
	const result = await compile('src/Counter.tsrx', parseErrorSource);

	expect(collectTsrxModuleDiagnostics(result)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_PARSE_ERROR',
				severity: 'error',
			}),
		]),
	);
});

test('collectTsrxModuleDiagnostics includes state-lowering diagnostics', async () => {
	const result = await compile('src/Counter.tsrx', readOnlyPropWriteSource);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(collectTsrxModuleDiagnostics(result)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_STATE_READ_ONLY_WRITE',
				severity: 'error',
			}),
		]),
	);
});

test('collectTsrxModuleDiagnostics returns an empty array for clean source', async () => {
	const result = await compile(
		'src/Greeting.tsrx',
		`export function Greeting({ name }: { name: string }) @{
			<p>Hello {name}</p>
		}`,
	);

	expect(collectTsrxModuleDiagnostics(result)).toEqual([]);
});

test('collectTsrxModuleDiagnostics finds alternate-shaped state-lowering diagnostics', async () => {
	const result = await compile(
		'src/Inventory.tsrx',
		`export function Inventory({ remaining }: { remaining: number }) @{
			<a onClick={() => --remaining}>{remaining}</a>
		}`,
	);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(collectTsrxModuleDiagnostics(result)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_STATE_READ_ONLY_WRITE',
				severity: 'error',
			}),
		]),
	);
});

test('collectTsrxModuleDiagnostics structurally discovers and deduplicates future diagnostics', () => {
	const first = {
		code: 'MARKLESS_FUTURE_ERROR',
		severity: 'error',
		message: 'A future compiler pass failed.',
		primarySpan: { filename: 'src/Future.tsrx', start: 10, end: 16 },
	};
	const sameIdentity = { ...first, ignoredIdentityField: 'different' };
	const differentSpan = {
		...first,
		primarySpan: { filename: 'src/Future.tsrx', start: 20, end: 26 },
	};
	const result: Record<string, unknown> = {
		futureArtifact: {
			nested: [{ diagnostics: [first, sameIdentity, differentSpan] }],
		},
	};
	result.cycle = result;

	expect(
		collectTsrxModuleDiagnostics(result as unknown as CompileTsrxModuleResult),
	).toEqual([first, differentSpan]);
});

test('collectTsrxModuleDiagnostics keeps diagnostics that differ only by severity', () => {
	const warning = {
		code: 'MARKLESS_FUTURE_SEVERITY',
		severity: 'warning',
		message: 'The same diagnostic text.',
		primarySpan: { filename: 'src/Future.tsrx', start: 10, end: 16 },
	};
	const error = { ...warning, severity: 'error' };
	const result = { diagnostics: [warning, error] };

	expect(
		collectTsrxModuleDiagnostics(result as unknown as CompileTsrxModuleResult),
	).toEqual([warning, error]);
});

test('collectTsrxModuleDiagnostics inspects class instance diagnostics without recursing', () => {
	const direct = {
		code: 'MARKLESS_CLASS_ARTIFACT',
		severity: 'error',
		message: 'A class artifact exposed this diagnostic.',
		primarySpan: { filename: 'src/ClassArtifact.tsrx', start: 0, end: 1 },
	};
	const hiddenNested = {
		...direct,
		code: 'MARKLESS_CLASS_NESTED',
	};
	class FutureArtifact {
		diagnostics = [direct];
		nested = { diagnostics: [hiddenNested] };
	}

	expect(
		collectTsrxModuleDiagnostics({
			futureArtifact: new FutureArtifact(),
		} as unknown as CompileTsrxModuleResult),
	).toEqual([direct]);
});
