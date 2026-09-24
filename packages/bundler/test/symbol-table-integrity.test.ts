import { describe, expect, test } from 'vitest';
import {
	rewriteGeneratedSymbolTableUrls,
	verifyGeneratedSymbolTableRoutes,
} from '../src/build/symbol-table.ts';
import type { MarklessTransformManifest } from '../src/types.ts';

describe('generated symbol-table identity integrity', () => {
	test.each(['local', 'renamed'])(
		'accepts a retained %s symbol namespace inside its direct route chunk',
		(name) => {
			const source = `/components/${name}.tsrx`;
			const resolver = `virtual:markless:resolver:${name}`;
			const symbol = {
				symbolId: 'symbol:0',
				virtualModuleId: `virtual:markless:symbol:${name}:0`,
				exportName: `run_${name}`,
				kind: 'event' as const,
			};
			const manifest = {
				source,
				payload: { virtualModuleId: 'payload' },
				resolver: { virtualModuleId: resolver },
				symbols: [symbol],
			};
			const bundle = {
				'pack.js': {
					...chunk({
						fileName: 'pack.js',
						moduleIds: [source, resolver, `\0${symbol.virtualModuleId}`],
					}),
					modules: {
						[`\0${symbol.virtualModuleId}`]: { renderedExports: [symbol.exportName] },
					},
				},
			};
			expect(verifyGeneratedSymbolTableRoutes(bundle, [manifest])).toEqual({
				verified: 1,
				errors: [],
			});
		},
	);

	test.each(['missing', 'wrong-export', 'wrong-module', 'external', 'table'])(
		'rejects %s evidence for a symbol absent from public exports',
		(mode) => {
			const source = '/components/local.tsrx';
			const resolver = 'virtual:markless:resolver:local';
			const symbol = {
				symbolId: 'symbol:0',
				virtualModuleId: 'virtual:markless:symbol:local:0',
				exportName: 'run_local',
				kind: 'event' as const,
			};
			const manifest = {
				source,
				payload: { virtualModuleId: 'payload' },
				resolver: { virtualModuleId: resolver },
				symbols: [symbol],
			};
			const target = {
				...chunk({
					fileName: 'pack.js',
					moduleIds: [
						symbol.virtualModuleId,
						...(mode === 'external' ? [] : [source, resolver]),
					],
				}),
				modules:
					mode === 'missing'
						? {}
						: {
								[mode === 'wrong-module'
									? 'another-module'
									: symbol.virtualModuleId]: {
									renderedExports: [
										mode === 'wrong-export'
											? 'another_export'
											: symbol.exportName,
									],
								},
							},
			};
			if (mode === 'table')
				target.code = `const table=${JSON.stringify([1, null, resolver, ['./pack.js'], [symbol.exportName], { [symbol.symbolId]: [0, 0] }])};`;
			const bundle =
				mode === 'external'
					? {
							'route.js': chunk({
								fileName: 'route.js',
								moduleIds: [source, resolver],
								dynamicImports: ['pack.js'],
							}),
							'pack.js': target,
						}
					: { 'pack.js': target };
			const result = verifyGeneratedSymbolTableRoutes(bundle, [manifest]);
			expect(result.verified).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toMatchObject({
				symbolId: symbol.symbolId,
				claimedChunk: 'pack.js',
			});
		},
	);

	test.each([
		{ name: 'aliased', bundleExportsInternal: false },
		{ name: 'aliased beside a native member', bundleExportsInternal: true },
	])(
		'routes a bundled symbol the bundler moved into a shared chunk through its bundle facade ($name)',
		({ bundleExportsInternal }) => {
			const source = '/harbor/Dock.tsrx';
			const resolver = 'virtual:markless:resolver:dock';
			const moved = {
				symbolId: 'symbol:4',
				virtualModuleId: 'virtual:markless:symbol:dock:4',
				exportName: 'symbol_4_dock',
				kind: 'async-computed-runner' as const,
			};
			const kept = {
				symbolId: 'symbol:2',
				virtualModuleId: 'virtual:markless:symbol:dock:2',
				exportName: 'symbol_2_dock',
				kind: 'event' as const,
			};
			const manifest = {
				source,
				payload: { virtualModuleId: 'payload' },
				resolver: { virtualModuleId: resolver },
				symbols: [kept, moved],
			};
			const bundleId = '\0virtual:markless:symbol-bundle:dock:0';
			const bundle: Record<string, unknown> = {
				'route.js': {
					...chunk({ fileName: 'route.js', moduleIds: [source, resolver] }),
					code: `const table=${JSON.stringify([1, null, resolver, [kept.virtualModuleId, moved.virtualModuleId], [kept.exportName, moved.exportName], { [kept.symbolId]: [0, 0], [moved.symbolId]: [1, 1] }])};`,
				},
				'shared.js': {
					...chunk({
						fileName: 'shared.js',
						moduleIds: ['/harbor/feed.ts', `\0${moved.virtualModuleId}`],
						exports: ['n', 't'],
					}),
					modules: {
						'/harbor/feed.ts': { renderedExports: ['loadFeed'] },
						[`\0${moved.virtualModuleId}`]: { renderedExports: [moved.exportName] },
					},
				},
				'bundle.js': {
					...chunk({
						fileName: 'bundle.js',
						moduleIds: [bundleId, `\0${kept.virtualModuleId}`],
						exports: [
							kept.exportName,
							moved.exportName,
							...(bundleExportsInternal ? ['q'] : []),
						],
					}),
					facadeModuleId: bundleId,
					imports: ['shared.js'],
					modules: {
						[`\0${kept.virtualModuleId}`]: { renderedExports: [kept.exportName] },
					},
				},
			};

			const rewrite = rewriteGeneratedSymbolTableUrls(bundle);
			expect(rewrite.unresolved).toEqual([]);
			const route = (bundle['route.js'] as { code: string }).code;
			expect(route).not.toContain('./shared.js');
			expect(route).toContain('["./bundle.js"]');
			expect(verifyGeneratedSymbolTableRoutes(bundle, [manifest])).toEqual({
				verified: 2,
				errors: [],
			});
		},
	);

	test('still rejects an aliased symbol chunk no public exporter imports', () => {
		const resolver = 'virtual:markless:resolver:quay';
		const symbol = {
			symbolId: 'symbol:1',
			virtualModuleId: 'virtual:markless:symbol:quay:1',
			exportName: 'symbol_1_quay',
			kind: 'event' as const,
		};
		const manifest = {
			source: '/quay.tsrx',
			payload: { virtualModuleId: 'payload' },
			resolver: { virtualModuleId: resolver },
			symbols: [symbol],
		};
		const bundle: Record<string, unknown> = {
			'route.js': {
				...chunk({ fileName: 'route.js', moduleIds: ['/quay.tsrx', resolver] }),
				code: `const table=${JSON.stringify([1, null, resolver, [symbol.virtualModuleId], [symbol.exportName], { [symbol.symbolId]: [0, 0] }])};`,
			},
			'shared.js': {
				...chunk({
					fileName: 'shared.js',
					moduleIds: [symbol.virtualModuleId],
					exports: ['t'],
				}),
				modules: { [symbol.virtualModuleId]: { renderedExports: [symbol.exportName] } },
			},
		};
		rewriteGeneratedSymbolTableUrls(bundle);
		const result = verifyGeneratedSymbolTableRoutes(bundle, [manifest]);
		expect(result.verified).toBe(0);
		expect(result.errors[0]).toMatchObject({
			symbolId: symbol.symbolId,
			claimedChunk: 'shared.js',
		});
	});

	test('does not confuse resolver tables sharing one transport chunk', () => {
		const resolver = 'virtual:markless:resolver:current';
		const symbol = {
			symbolId: 'symbol:0',
			virtualModuleId: 'virtual:markless:symbol:current:0',
			exportName: 'run',
			kind: 'event' as const,
		};
		const manifest = {
			source: '/current.tsrx',
			payload: { virtualModuleId: 'payload' },
			resolver: { virtualModuleId: resolver },
			symbols: [symbol],
		};
		const table = (id: string, url: string) =>
			JSON.stringify([1, null, id, [url], ['run'], { 'symbol:0': [0, 0] }]);
		const bundle = {
			'pack.js': {
				...chunk({ fileName: 'pack.js', moduleIds: [resolver] }),
				code: `const other=${table('virtual:markless:resolver:other', './wrong.js')};const current=${table(resolver, './correct.js')};`,
			},
			'correct.js': chunk({
				fileName: 'correct.js',
				moduleIds: [symbol.virtualModuleId],
				exports: ['run'],
			}),
		};
		expect(verifyGeneratedSymbolTableRoutes(bundle, [manifest])).toEqual({
			verified: 1,
			errors: [],
		});
	});

	test('rejects unemitted and queried-id-only symbol chunks', () => {
		const source = '/workspace/app/pages/index.tsrx';
		const missingId = 'virtual:markless:symbol:missing';
		const queriedOnlyId = 'virtual:markless:symbol:queried-only';
		const manifest: MarklessTransformManifest = {
			source,
			payload: { virtualModuleId: 'virtual:markless:payload:index' },
			resolver: { virtualModuleId: 'virtual:markless:resolver:index' },
			symbols: [
				{
					symbolId: 'symbol:missing',
					virtualModuleId: missingId,
					exportName: 'missingSymbol',
					kind: 'event',
				},
				{
					symbolId: 'symbol:queried-only',
					virtualModuleId: queriedOnlyId,
					exportName: 'queriedOnlySymbol',
					kind: 'event',
				},
			],
		};
		const bundle = {
			'index.js': chunk({
				fileName: 'index.js',
				moduleIds: [source],
				dynamicImports: ['queried-only.js'],
			}),
			'queried-only.js': chunk({
				fileName: 'queried-only.js',
				moduleIds: [`${queriedOnlyId}?markless-route`],
				exports: ['queriedOnlySymbol'],
			}),
		};

		expect(verifyGeneratedSymbolTableRoutes(bundle, [manifest])).toEqual({
			verified: 0,
			errors: [
				{
					symbolId: 'symbol:missing',
					claimedChunk: '<missing symbol chunk>',
					reason: `generated symbol module ${missingId} was not emitted`,
				},
				{
					symbolId: 'symbol:queried-only',
					claimedChunk: '<missing symbol chunk>',
					reason: `generated symbol module ${queriedOnlyId} was not emitted`,
				},
			],
		});
	});

	test('routes a packed source through the chunk holding it, not its re-export facade', () => {
		const source = '/lantern/Wick.tsrx?markless-symbols';
		const symbol = {
			symbolId: 'symbol:0',
			virtualModuleId: 'virtual:markless:symbol:wick:0',
			exportName: 'symbol_0_wick',
			kind: 'event' as const,
		};
		const manifest = {
			source,
			payload: { virtualModuleId: 'payload' },
			resolver: { virtualModuleId: 'virtual:markless:resolver:wick' },
			symbols: [symbol],
		};
		const bundle = {
			'facade.js': {
				...chunk({ fileName: 'facade.js', moduleIds: [], exports: ['loadSymbol'] }),
				facadeModuleId: source,
				imports: ['pack.js'],
			},
			'pack.js': {
				...chunk({
					fileName: 'pack.js',
					moduleIds: [source, `\0${symbol.virtualModuleId}`],
					exports: ['loadSymbol'],
				}),
				modules: {
					[`\0${symbol.virtualModuleId}`]: { renderedExports: [symbol.exportName] },
				},
			},
		};
		expect(verifyGeneratedSymbolTableRoutes(bundle, [manifest])).toEqual({
			verified: 1,
			errors: [],
		});
	});

	test.each([
		{ name: 'in the resolver chunk', claimed: 'pack.js', loader: true, verified: 1 },
		{ name: 'in a dynamically imported chunk', claimed: 'child.js', loader: true, verified: 1 },
		{ name: 'without a literal loader', claimed: 'pack.js', loader: false, verified: 0 },
	])(
		'a packed table row is satisfied by its literal load of an unexported symbol $name',
		({ claimed, loader, verified }) => {
			const resolver = 'virtual:markless:resolver:ember';
			const symbol = {
				symbolId: 'symbol:0',
				virtualModuleId: 'virtual:markless:symbol:ember:0',
				exportName: 'symbol_0_ember',
				kind: 'event' as const,
			};
			const manifest = {
				source: '/ember.tsrx',
				payload: { virtualModuleId: 'payload' },
				resolver: { virtualModuleId: resolver },
				symbols: [symbol],
			};
			const holder = {
				...chunk({ fileName: claimed, moduleIds: [`\0${symbol.virtualModuleId}`] }),
				modules: {
					[`\0${symbol.virtualModuleId}`]: { renderedExports: [symbol.exportName] },
				},
			};
			const table = `const table=${JSON.stringify([1, null, resolver, [`./${claimed}`], [symbol.exportName], { [symbol.symbolId]: [0, 0] }])};`;
			const loads = loader
				? `const loads={${JSON.stringify(symbol.symbolId)}:()=>import("./${claimed}")};`
				: '';
			const route = {
				...chunk({
					fileName: 'pack.js',
					moduleIds: [
						'/ember.tsrx',
						resolver,
						...(claimed === 'pack.js' ? holder.moduleIds : []),
					],
					dynamicImports: claimed === 'pack.js' ? [] : [claimed],
				}),
				modules: claimed === 'pack.js' ? holder.modules : {},
				code: `${table}${loads}`,
			};
			const bundle =
				claimed === 'pack.js' ? { 'pack.js': route } : { 'pack.js': route, [claimed]: holder };
			expect(verifyGeneratedSymbolTableRoutes(bundle, [manifest]).verified).toBe(verified);
		},
	);
});

function chunk(input: {
	readonly fileName: string;
	readonly moduleIds: readonly string[];
	readonly exports?: readonly string[];
	readonly dynamicImports?: readonly string[];
}) {
	return {
		type: 'chunk' as const,
		fileName: input.fileName,
		code: 'export {};',
		moduleIds: input.moduleIds,
		exports: input.exports ?? [],
		imports: [],
		dynamicImports: input.dynamicImports ?? [],
	};
}
