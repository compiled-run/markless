import { SourceMap } from 'node:module';
import { rolldown, type Plugin, type OutputOptions } from 'rolldown';
import { expect, test } from 'vitest';
import { lazyModuleFacadesPlugin } from '../src/build/lazy-module-facades.ts';

const source =
	'export const load = () => import("action").then(module => ({module, location: "original-location"}));';
const outputOptions: OutputOptions = {
	format: 'es',
	sourcemap: true,
	entryFileNames: '[name]-[hash].mjs',
	chunkFileNames: '[name]-[hash].mjs',
	strictExecutionOrder: true,
	minifyInternalExports: false,
	codeSplitting: {
		groups: [{ name: 'pack', test: /^action$/, includeDependenciesRecursively: false }],
	},
};

async function createBuild(alias = 'first', before?: Plugin) {
	const sources: Record<string, string> = {
		entry: source,
		action: 'globalThis.trace.push("action"); export const value = 42;',
	};
	return rolldown({
		input: 'entry',
		preserveEntrySignatures: 'allow-extension',
		experimental: { chunkOptimization: false },
		plugins: [
			before,
			{
				name: 'source-fixture',
				resolveId: (id) => (id in sources ? id : null),
				load: (id) => sources[id],
				renderChunk(code, chunk) {
					if (!chunk.isEntry && chunk.moduleIds.length === 0)
						return {
							code: code.replace(
								/export \{[^}]+\};/,
								`export { value as ${alias} };`,
							),
							map: null,
						};
				},
			} satisfies Plugin,
			lazyModuleFacadesPlugin(),
		],
	});
}

async function output(alias = 'first', minify = false) {
	const build = await createBuild(alias);
	try {
		return await build.generate({ ...outputOptions, minify });
	} finally {
		await build.close();
	}
}

test('packed namespace changes invalidate the pack and its importing entry', async () => {
	const first = (await output('first')).output.filter((chunk) => chunk.type === 'chunk');
	const second = (await output('second')).output.filter((chunk) => chunk.type === 'chunk');
	expect(first).toHaveLength(3);
	expect(second).toHaveLength(3);
	const firstPack = first.find((chunk) => chunk.name === 'pack')!;
	const secondPack = second.find((chunk) => chunk.name === 'pack')!;
	expect(firstPack.code).not.toBe(secondPack.code);
	expect(firstPack.fileName).not.toBe(secondPack.fileName);
	expect(first.find((chunk) => chunk.isEntry)!.fileName).not.toBe(
		second.find((chunk) => chunk.isEntry)!.fileName,
	);
});

test.each([false, true])(
	'packed imports retain source locations with minify=%s',
	async (minify) => {
		const result = await output('value', minify);
		const chunks = result.output.filter((chunk) => chunk.type === 'chunk');
		expect(chunks).toHaveLength(3);
		const entry = chunks.find((chunk) => chunk.isEntry)!;
		expect(entry.dynamicImports).toEqual([
			chunks.find((chunk) => chunk.name === 'pack')!.fileName,
		]);
		const position = entry.code.indexOf('original-location') - 1;
		expect(position).toBeGreaterThan(0);
		const before = entry.code.slice(0, position).split('\n');
		const location = new SourceMap(entry.map!).findEntry(
			before.length - 1,
			before.at(-1)!.length,
		);
		expect(location.originalSource).toMatch(/entry$/);
		expect(location.originalLine).toBe(0);
		expect(location.originalColumn).toBe(source.indexOf('"original-location"'));
		expect(
			result.output.filter(
				(chunk) => chunk.type === 'asset' && chunk.fileName.endsWith('.map'),
			),
		).toHaveLength(2);
	},
);

test('packed generation resets after a failed render and between outputs', async () => {
	let fail = true;
	const build = await createBuild('value', {
		name: 'render-failure',
		async renderChunk(code, chunk) {
			if (fail && chunk.name === 'pack') {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error('render deliberately rejected');
			}
		},
	});
	try {
		await expect(build.generate(outputOptions)).rejects.toThrow('render deliberately rejected');
		fail = false;
		const first = await build.generate(outputOptions);
		const second = await build.generate(outputOptions);
		const describe = (result: typeof first) =>
			result.output.map((chunk) => ({
				fileName: chunk.fileName,
				code: chunk.type === 'chunk' ? chunk.code : chunk.source,
			}));
		expect(describe(first)).toEqual(describe(second));
		expect(first.output.filter((chunk) => chunk.type === 'chunk')).toHaveLength(3);
	} finally {
		await build.close();
	}
});

test.each([false, true])(
	'generated nested imports resolve to their containing pack with minify=%s',
	async (minify) => {
		const sources: Record<string, string> = {
			entry: 'export const load=()=>import("action");',
			action: 'export const nested=()=>import("secondary");',
			secondary: 'export const value=42;',
		};
		const build = await rolldown({
			input: 'entry',
			preserveEntrySignatures: 'allow-extension',
			experimental: { chunkOptimization: false },
			plugins: [
				{
					name: 'nested-source',
					resolveId: (id) => (id in sources ? id : null),
					load: (id) => sources[id],
				},
				lazyModuleFacadesPlugin(),
			],
		});
		try {
			const result = await build.generate({
				...outputOptions,
				minify,
				codeSplitting: {
					groups: [
						{
							name: 'pack',
							test: /^(action|secondary)$/,
							includeDependenciesRecursively: false,
						},
					],
				},
			});
			const chunks = result.output.filter((chunk) => chunk.type === 'chunk');
			const pack = chunks.find((chunk) => chunk.moduleIds.includes('action'))!;
			expect(pack.moduleIds).toContain('secondary');
			expect(pack.code.replaceAll('`', '"')).not.toContain(`import("./${pack.fileName}")`);
			expect(pack.dynamicImports).toEqual([]);
			expect(chunks.find((chunk) => chunk.isEntry)!.dynamicImports).toEqual([pack.fileName]);
		} finally {
			await build.close();
		}
	},
);
