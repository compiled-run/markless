import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'pathe';
import { describe, expect, test } from 'vitest';
import { build as viteBuild, type Plugin } from 'vite';
import { stripEmptyVitePreloadWrappers } from '../src/build/preload-cleanup.ts';
import { rewriteGeneratedSymbolFacadeImports } from '../src/build/symbol-facade-cleanup.ts';
import {
	rewriteGeneratedSymbolTableUrls,
	verifyGeneratedSymbolTableRoutes,
} from '../src/build/symbol-table.ts';
import { transformTsrxModule } from '../src/rolldown.ts';
import { markless } from '../src/vite/index.ts';
import {
	bundleSizeDefinitions,
	createBundleSizeCodeSplitting,
} from '../../../demos/bundle-size/run.mjs';

const fixtureRoot = bundleSizeDefinitions.find((definition) => definition.name === 'todomvc')?.root;
if (!fixtureRoot) throw new Error('bundle-size benchmark has no todomvc definition');
let pendingBuild: ReturnType<typeof captureBundleSizeTodoMvcBuild> | undefined;

describe('bundle-size generated symbol tables', () => {
	test('captures rewritten routes when Rolldown dynamic-import edges do not reach symbol facades', async () => {
		const result = await buildBundleSizeTodoMvc();
		const chunks = generatedChunks(result.bundle);
		const resolverChunk = chunks.find((chunk) =>
			chunk.moduleIds
				.map(normalizeVirtualId)
				.includes(result.manifest.resolver.virtualModuleId),
		);
		if (!resolverChunk)
			throw new Error('bundle-size shape has no resolver implementation chunk');
		const symbolFacades = result.manifest.symbols.map((symbol) => {
			const facade = chunks.find(
				(chunk) =>
					!!chunk.facadeModuleId &&
					normalizeVirtualId(chunk.facadeModuleId) === symbol.virtualModuleId,
			);
			if (!facade) throw new Error(`bundle-size shape has no facade for ${symbol.symbolId}`);
			return facade;
		});

		expect(
			resolverChunk.dynamicImports.filter((fileName) =>
				symbolFacades.some((facade) => facade.fileName === fileName),
			),
			result.shape,
		).toEqual([]);
		for (const facade of symbolFacades) {
			const specifier = relativeChunkSpecifier(resolverChunk.fileName, facade.fileName);
			expect(resolverChunk.code, result.shape).toContain(JSON.stringify(specifier));
		}
	});

	test('uses retained public facades when a shared implementation chunk also owns the symbols', async () => {
		const result = await buildBundleSizeTodoMvc();
		const chunks = generatedChunks(result.bundle);
		const sharedImplementation = chunks.find((chunk) =>
			result.manifest.symbols.every((symbol) =>
				chunk.moduleIds.map(normalizeVirtualId).includes(symbol.virtualModuleId),
			),
		);
		if (!sharedImplementation)
			throw new Error('bundle-size shape has no shared symbol implementation chunk');

		expect(
			result.manifest.symbols.some(
				(symbol) => !sharedImplementation.exports.includes(symbol.exportName),
			),
			result.shape,
		).toBe(true);
		for (const symbol of result.manifest.symbols) {
			const facade = chunks.find(
				(chunk) =>
					!!chunk.facadeModuleId &&
					normalizeVirtualId(chunk.facadeModuleId) === symbol.virtualModuleId,
			);
			expect(facade?.moduleIds, result.shape).toEqual([]);
			expect(facade?.exports, result.shape).toContain(symbol.exportName);
		}
	});

	test('preserves route and containment evidence after facade cleanup', async () => {
		const result = await buildBundleSizeTodoMvc();

		expect(result.tableRewrite.unresolved, result.shape).toEqual([]);
		expect(result.tableRewrite.rewritten, result.shape).toBe(result.manifest.symbols.length);
		expect(
			verifyGeneratedSymbolTableRoutes(result.bundle, [result.manifest]),
			result.shape,
		).toEqual({ verified: result.manifest.symbols.length, errors: [] });
	});

	test('hard-errors when a rewritten route claims a missing symbol facade', async () => {
		const result = await buildBundleSizeTodoMvc();
		const bundle = cloneBundle(result.bundle);
		const first = result.manifest.symbols[0]!;
		const facade = generatedChunks(bundle).find(
			(chunk) =>
				!!chunk.facadeModuleId &&
				normalizeVirtualId(chunk.facadeModuleId) === first.virtualModuleId,
		);
		if (!facade) throw new Error('bundle-size shape has no first symbol facade');
		delete bundle[facade.fileName];

		expect(verifyGeneratedSymbolTableRoutes(bundle, [result.manifest])).toEqual({
			verified: result.manifest.symbols.length - 1,
			errors: [
				{
					symbolId: first.symbolId,
					claimedChunk: facade.fileName,
					reason:
						'claimed chunk was not emitted. markless debugging playbook: see AGENTS.md, or run pnpm doctor',
				},
			],
		});
	});

	test('hard-errors when a rewritten route terminates at another symbol facade', async () => {
		const result = await buildBundleSizeTodoMvc();
		const bundle = cloneBundle(result.bundle);
		const [first, second] = result.manifest.symbols;
		if (!first || !second) throw new Error('bundle-size shape requires two symbols');
		const chunks = generatedChunks(bundle);
		const resolver = chunks.find((chunk) =>
			chunk.moduleIds
				.map(normalizeVirtualId)
				.includes(result.manifest.resolver.virtualModuleId),
		);
		const firstFacade = chunks.find(
			(chunk) =>
				!!chunk.facadeModuleId &&
				normalizeVirtualId(chunk.facadeModuleId) === first.virtualModuleId,
		);
		const secondFacade = chunks.find(
			(chunk) =>
				!!chunk.facadeModuleId &&
				normalizeVirtualId(chunk.facadeModuleId) === second.virtualModuleId,
		);
		if (!resolver || !firstFacade || !secondFacade)
			throw new Error('bundle-size shape is missing resolver or symbol facades');
		resolver.code = resolver.code.replace(
			relativeChunkSpecifier(resolver.fileName, firstFacade.fileName),
			relativeChunkSpecifier(resolver.fileName, secondFacade.fileName),
		);

		expect(verifyGeneratedSymbolTableRoutes(bundle, [result.manifest])).toEqual({
			verified: result.manifest.symbols.length - 1,
			errors: [
				{
					symbolId: first.symbolId,
					claimedChunk: secondFacade.fileName,
					reason: expect.stringMatching(
						/does not contain its generated symbol module.*markless debugging playbook: see AGENTS\.md, or run pnpm doctor/,
					),
				},
			],
		});
	});
});

function buildBundleSizeTodoMvc() {
	pendingBuild ??= captureBundleSizeTodoMvcBuild();
	return pendingBuild;
}

async function captureBundleSizeTodoMvcBuild() {
	const plugins = markless({ executionLog: 'never' });
	for (const plugin of plugins) {
		if (plugin.name === 'vite-plugin-markless') delete plugin.generateBundle;
	}
	let capturedBundle: Record<string, unknown> | undefined;
	const capturePlugin: Plugin = {
		name: 'capture-bundle-size-chunks',
		generateBundle: {
			order: 'post',
			handler(_options, bundle) {
				capturedBundle = cloneBundle(bundle);
			},
		},
	};

	await viteBuild({
		configFile: false,
		root: fixtureRoot,
		logLevel: 'silent',
		plugins: [...plugins, capturePlugin],
		build: {
			write: false,
			minify: 'oxc',
			target: 'es2022',
			rollupOptions: {
				output: {
					codeSplitting: createBundleSizeCodeSplitting(),
				},
			},
		},
	});
	if (!capturedBundle) throw new Error('bundle-size test captured no generated bundle');
	const rawBundle = capturedBundle;
	const bundle = cloneBundle(rawBundle);
	const filename = resolve(fixtureRoot, 'app.tsrx');
	const transformed = await transformTsrxModule({
		filename,
		source: await readFile(filename, 'utf8'),
		environment: 'client',
	});

	for (const chunk of Object.values(bundle).filter(isCapturedChunk)) {
		chunk.code = stripEmptyVitePreloadWrappers(chunk.code);
	}
	rewriteGeneratedSymbolFacadeImports(bundle);
	const tableRewrite = rewriteGeneratedSymbolTableUrls(bundle);
	return {
		rawBundle,
		bundle,
		manifest: transformed.manifest,
		tableRewrite,
		shape: JSON.stringify(
			{
				raw: describeGeneratedChunks(rawBundle),
				cleaned: describeGeneratedChunks(bundle),
			},
			null,
			2,
		),
	};
}

type CapturedChunk = {
	readonly type: 'chunk';
	readonly fileName: string;
	code: string;
	readonly exports: readonly string[];
	readonly imports: readonly string[];
	readonly dynamicImports: readonly string[];
	readonly moduleIds: readonly string[];
	readonly facadeModuleId?: string | null;
};

function describeGeneratedChunks(bundle: Record<string, unknown>) {
	return generatedChunks(bundle)
		.filter((chunk) =>
			[chunk.facadeModuleId, ...chunk.moduleIds].some((id) =>
				id?.includes('virtual:markless:'),
			),
		)
		.map((chunk) => ({
			fileName: chunk.fileName,
			facadeModuleId: chunk.facadeModuleId,
			moduleIds: chunk.moduleIds.filter((id) => id.includes('virtual:markless:')),
			exports: chunk.exports.filter((name) => /^(?:init_|loadSymbol|symbol)/.test(name)),
			imports: chunk.imports,
			dynamicImports: chunk.dynamicImports,
		}));
}

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
		Array.isArray(chunk.exports) &&
		Array.isArray(chunk.imports) &&
		Array.isArray(chunk.dynamicImports) &&
		Array.isArray(chunk.moduleIds)
	);
}

function cloneBundle(bundle: Record<string, unknown>): Record<string, unknown> {
	return JSON.parse(JSON.stringify(bundle)) as Record<string, unknown>;
}

function normalizeVirtualId(id: string): string {
	return id.startsWith('\0') ? id.slice(1) : id;
}

function relativeChunkSpecifier(importerFileName: string, targetFileName: string): string {
	const value = relative(dirname(importerFileName), targetFileName).replaceAll('\\', '/');
	return value.startsWith('.') ? value : `./${value}`;
}
