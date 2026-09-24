import { expect, test } from 'vitest';
import {
	createSymbolResolverModuleManifest,
	emitSymbolResolverModule,
} from '../src/passes/symbol-resolver-module.ts';

test.each([false, true])(
	'literal import tables expose dependencies with bound symbols: %s',
	(bound) => {
		const source = emitSymbolResolverModule({
			literalImports: true,
			boundSymbols: bound
				? [
						{
							id: 'bound',
							baseSymbolId: 'action:0',
							componentEdgePath: [],
							ancestry: [],
							captureSlots: [],
						},
					]
				: undefined,
			symbols: Array.from({ length: 9 }, (_, index) => ({
				id: `action:${index}`,
				chunk: `./action-${index}.js`,
				exportName: `run${index}`,
			})),
		});
		for (let index = 0; index < 9; index++)
			expect(source).toContain(`import("./action-${index}.js")`);
		expect(source).not.toContain('import(/* @vite-ignore */ moduleUrls[row[0]])');
	},
);

test('coalescing transport URLs does not change which logical module a symbol loads', async () => {
	const input = {
		literalImports: true,
		symbols: Array.from({ length: 9 }, (_, index) => ({
			id: `action:${index}`,
			chunk: `data:text/javascript,export const run${index}=${index}`,
			exportName: `run${index}`,
		})),
	};
	const manifest = createSymbolResolverModuleManifest(input);
	const coalesced = [...manifest];
	coalesced[3] = ['./packed.js'];
	coalesced[5] = Object.fromEntries(
		Object.entries(manifest[5]).map(([id, row]) => [id, [0, row[1]]]),
	);
	const source = emitSymbolResolverModule(input).replace(
		JSON.stringify(manifest),
		JSON.stringify(coalesced),
	);
	const resolver = await import(`data:text/javascript,${encodeURIComponent(source)}`);
	expect(await resolver.loadSymbol('action:8')).toBe(8);
});

test.each([false, true])(
	'small resolvers expose imports to the bundler only when asked: %s',
	(visible) => {
		const source = emitSymbolResolverModule({
			bundlerVisibleImports: visible,
			symbols: [
				{ id: 'tap:0', chunk: './tap-0.js', exportName: 'tap0' },
				{ id: 'tap:1', chunk: './tap-1.js', exportName: 'tap1' },
			],
		});
		for (const chunk of ['./tap-0.js', './tap-1.js'])
			expect(source).toContain(
				visible
					? `import(${JSON.stringify(chunk)})`
					: `import(/* @vite-ignore */ ${JSON.stringify(chunk)})`,
			);
	},
);
