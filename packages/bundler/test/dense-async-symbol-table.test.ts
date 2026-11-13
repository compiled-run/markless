import { resolve } from 'pathe';
import { describe, expect, test } from 'vitest';
import { build as viteBuild, type Plugin } from 'vite';
import { rewriteGeneratedSymbolFacadeImports } from '../src/build/symbol-facade-cleanup.ts';
import {
	rewriteGeneratedSymbolTableUrls,
	verifyGeneratedSymbolTableRoutes,
} from '../src/build/symbol-table.ts';
import { marklessClient, transformTsrxModule } from '../src/rolldown.ts';
import { denseAsyncSource, type DenseAsyncShape } from './fixtures/dense-async.ts';

const root = resolve(import.meta.dirname, '..');
const symbolPrefix = 'virtual:markless:symbol:';
const builds = new Map<string, Promise<DenseAsyncBuild>>();

describe('dense async generated symbol tables', () => {
	test.each([
		{ computeds: 8, boundaries: 8 },
		{ computeds: 8, boundaries: 9 },
		{ computeds: 16, boundaries: 1 },
		{ computeds: 10, boundaries: 10 },
	] satisfies DenseAsyncShape[])(
		'preserves every compiler symbol for $computeds computeds x $boundaries boundaries',
		async (shape) => {
			const result = await buildDenseAsyncShape(shape);
			const symbolFiles = collectSymbolFiles(result.bundle);
			const missing = result.manifestSymbolIds.filter((id) => !symbolFiles.has(id));

			expect(missing, result.bundleShape).toEqual([]);
			expect(
				result.manifestSymbolIds.map((id) => symbolFiles.get(id)),
				result.bundleShape,
			).toEqual(result.manifestSymbolIds.map(() => expect.stringMatching(/\.js$/)));
			// A packed resolver ships no module URL list, so nothing is left to rewrite after rendering.
			expect(result.tableRewrite, result.bundleShape).toEqual({
				rewritten: 0,
				unresolved: [],
			});
			expect(
				verifyGeneratedSymbolTableRoutes(result.bundle, [result.manifest]),
				result.bundleShape,
			).toEqual({ verified: result.manifest.symbols.length, errors: [] });
		},
	);

	test('resolves all 31 compiler rows for the ten-by-ten shape', async () => {
		const result = await buildDenseAsyncShape({ computeds: 10, boundaries: 10 });

		expect(result.manifest.symbols).toHaveLength(31);
		expect(result.tableRewrite).toEqual({ rewritten: 0, unresolved: [] });
		expect(verifyGeneratedSymbolTableRoutes(result.bundle, [result.manifest])).toEqual({
			verified: 31,
			errors: [],
		});
		expect(result.resolverCode).not.toContain(symbolPrefix);
	});

	test('retains a genuinely missing row from a packed resolver table', async () => {
		const result = await buildDenseAsyncShape({ computeds: 10, boundaries: 10 });
		const bundle = cloneBundle(result.rawBundle);
		// Symbols that wake together ship as one coalesced chunk, so deleting the
		// chunk of an arbitrary symbol takes most of the table with it. What this
		// row pins is ONE missing among many resolved, so drop a chunk that carries
		// a single symbol.
		const [solitaryFile, missingId] = soleOccupantChunk(bundle, result.bundleShape);
		delete bundle[solitaryFile];

		rewriteGeneratedSymbolFacadeImports(bundle);
		const missing = result.manifest.symbols.filter(
			(symbol) => normalizeVirtualId(symbol.virtualModuleId) === missingId,
		);
		expect(missing.length).toBeGreaterThan(0);
		expect(verifyGeneratedSymbolTableRoutes(bundle, [result.manifest])).toEqual({
			verified: result.manifest.symbols.length - missing.length,
			errors: missing.map((symbol) => ({
				symbolId: symbol.symbolId,
				claimedChunk: solitaryFile,
				reason: expect.stringContaining('claimed chunk was not emitted'),
			})),
		});
	});

	test('rejects a resolver row that terminates in another symbol chunk', async () => {
		const result = await buildDenseAsyncShape({ computeds: 8, boundaries: 8 });
		const bundle = cloneBundle(result.bundle);
		const resolver = generatedChunks(bundle).find((chunk) =>
			chunk.moduleIds
				.map(normalizeVirtualId)
				.includes(result.manifest.resolver.virtualModuleId),
		);
		if (!resolver) throw new Error('dense async build emitted no resolver chunk');

		const tableStart = resolver.code.indexOf('[1,');
		expect(tableStart).toBeGreaterThan(-1);
		const tableSource = resolver.code.slice(tableStart);
		const routeSpecifiers = [...tableSource.matchAll(/(["'`])(\.\/[^"'`]+\.js)\1/g)].map(
			(match) => match[2]!,
		);
		expect(routeSpecifiers.length).toBeGreaterThan(1);
		resolver.code =
			resolver.code.slice(0, tableStart) +
			tableSource.replace(routeSpecifiers[0]!, routeSpecifiers[1]!);

		expect(verifyGeneratedSymbolTableRoutes(bundle, [result.manifest])).toEqual({
			verified: result.manifest.symbols.length - 1,
			errors: [
				{
					symbolId: 'symbol:0',
					claimedChunk: expect.stringMatching(/\.js$/),
					reason: expect.stringContaining('does not contain its generated symbol module'),
				},
			],
		});
	});
});

type DenseAsyncBuild = {
	readonly bundle: Record<string, unknown>;
	readonly bundleShape: string;
	readonly manifest: Awaited<ReturnType<typeof transformTsrxModule>>['manifest'];
	readonly manifestSymbolIds: readonly string[];
	readonly rawBundle: Record<string, unknown>;
	readonly resolverCode: string;
	readonly tableRewrite: ReturnType<typeof rewriteGeneratedSymbolTableUrls>;
};

function buildDenseAsyncShape(shape: DenseAsyncShape): Promise<DenseAsyncBuild> {
	const name = `${shape.computeds}x${shape.boundaries}`;
	let pending = builds.get(name);
	if (pending) return pending;

	pending = captureDenseAsyncBuild(shape);
	builds.set(name, pending);
	return pending;
}

async function captureDenseAsyncBuild(shape: DenseAsyncShape): Promise<DenseAsyncBuild> {
	const name = `${shape.computeds}x${shape.boundaries}`;
	const entryId = `dense-async-${name}.tsrx`;
	const sourceId = `\0${entryId}`;
	const source = denseAsyncSource(shape);
	const fixturePlugin: Plugin = {
		name: `dense-async-fixture-${name}`,
		resolveId(id) {
			return id === entryId ? sourceId : null;
		},
		load(id) {
			return id === sourceId ? source : null;
		},
	};
	const markless = marklessClient({ executionLog: 'never', rootDir: root });
	// Capture Rolldown's final chunk shape before Markless post-processing so
	// this test can apply facade cleanup and table rewriting independently.
	delete markless.generateBundle;

	const output = await viteBuild({
		configFile: false,
		root,
		logLevel: 'silent',
		plugins: [fixturePlugin, markless],
		build: {
			write: false,
			minify: 'oxc',
			target: 'es2022',
			rolldownOptions: {
				input: entryId,
				preserveEntrySignatures: 'exports-only',
			},
		},
	});
	const outputs = Array.isArray(output) ? output.flatMap((item) => item.output) : output.output;
	const rawBundle = cloneBundle(Object.fromEntries(outputs.map((item) => [item.fileName, item])));
	const bundle = cloneBundle(rawBundle);
	// The build packs, so its manifest names the module each symbol ships in, grouped or its own.
	const transformed = await transformTsrxModule({
		filename: sourceId,
		source,
		environment: 'client',
		experimentalNativePacking: true,
		executionLog: 'never',
	});
	const manifestSymbolIds = [
		...new Set(
			transformed.manifest.symbols.map((symbol) => normalizeVirtualId(symbol.virtualModuleId)),
		),
	];
	const bundleShape = JSON.stringify(
		generatedChunks(bundle)
			.filter((chunk) =>
				[chunk.facadeModuleId, ...chunk.moduleIds].some((id) =>
					id?.includes('virtual:markless:'),
				),
			)
			.map((chunk) => ({
				fileName: chunk.fileName,
				facadeModuleId: chunk.facadeModuleId,
				moduleIds: chunk.moduleIds,
			})),
		null,
		2,
	);

	rewriteGeneratedSymbolFacadeImports(bundle);
	const tableRewrite = rewriteGeneratedSymbolTableUrls(bundle);
	const resolverCode = generatedChunks(bundle).find((chunk) =>
		chunk.code.includes('symbolManifest'),
	)?.code;
	if (!resolverCode) throw new Error(`dense async ${name} build emitted no symbol resolver`);

	return {
		bundle,
		bundleShape,
		manifest: transformed.manifest,
		manifestSymbolIds,
		rawBundle,
		resolverCode,
		tableRewrite,
	};
}

type CapturedChunk = {
	readonly type: 'chunk';
	readonly fileName: string;
	readonly code: string;
	readonly moduleIds: readonly string[];
	readonly facadeModuleId?: string | null;
};

function generatedChunks(bundle: Record<string, unknown>): CapturedChunk[] {
	return Object.values(bundle).filter(isCapturedChunk);
}

function isCapturedChunk(value: unknown): value is CapturedChunk {
	if (!value || typeof value !== 'object') return false;
	const chunk = value as Partial<CapturedChunk>;
	return (
		chunk.type === 'chunk' &&
		typeof chunk.fileName === 'string' &&
		typeof chunk.code === 'string' &&
		Array.isArray(chunk.moduleIds)
	);
}

/** The one chunk carrying exactly one symbol module, and the id it carries. */
function soleOccupantChunk(
	bundle: Record<string, unknown>,
	bundleShape: string,
): [file: string, symbolId: string] {
	const byFile = new Map<string, string[]>();
	for (const [symbolId, fileName] of collectSymbolFiles(bundle)) {
		const ids = byFile.get(fileName);
		if (ids) ids.push(symbolId);
		else byFile.set(fileName, [symbolId]);
	}
	const solitary = [...byFile].find(([, ids]) => ids.length === 1);
	expect(solitary, bundleShape).toBeDefined();
	return [solitary![0], solitary![1][0]!];
}

function collectSymbolFiles(bundle: Record<string, unknown>): Map<string, string> {
	const files = new Map<string, string>();
	for (const chunk of generatedChunks(bundle)) {
		for (const id of [chunk.facadeModuleId, ...chunk.moduleIds]) {
			if (!id) continue;
			const normalized = normalizeVirtualId(id);
			if (normalized.startsWith(symbolPrefix)) files.set(normalized, chunk.fileName);
		}
	}
	return files;
}

function normalizeVirtualId(id: string): string {
	return id.startsWith('\0') ? id.slice(1) : id;
}

function cloneBundle(bundle: Record<string, unknown>): Record<string, unknown> {
	return JSON.parse(JSON.stringify(bundle)) as Record<string, unknown>;
}
