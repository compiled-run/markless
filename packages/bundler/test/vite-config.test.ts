import type { EnvironmentOptions } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { markless } from '../src/vite/index.ts';
import type { MarklessManifest } from '../src/types.ts';
import {
	callConfigEnvironment,
	callConfigResolved,
	callConfig,
	callGenerateBundle,
	callOutputOptions,
	createViteHookContext,
	getPlugin,
} from './helpers.ts';

describe('Vite config integration', () => {
	test('shares plugin state across app build environments', () => {
		expect(getMarklessPlugin().sharedDuringBuild).toBe(true);
	});

	test('sets output defaults on Vite client and server environments', () => {
		const plugin = getMarklessPlugin();
		const clientConfig: EnvironmentOptions = {
			build: {
				rolldownOptions: {
					output: { dir: 'dist/client' },
				},
			},
		};
		const serverConfig: EnvironmentOptions = {
			build: {
				rolldownOptions: {
					output: { dir: 'dist/server' },
				},
			},
		};

		expect(callConfigEnvironment(plugin, 'client', clientConfig)).toMatchObject({
			build: {
				rolldownOptions: {
					output: {
						dir: 'dist/client',
						entryFileNames: 'build/chunk-[hash].js',
						chunkFileNames: 'build/chunk-[hash].js',
						hoistTransitiveImports: false,
					},
				},
			},
		});
		expect(callConfigEnvironment(plugin, 'ssr', serverConfig)).toMatchObject({
			build: {
				outDir: 'dist/server',
				rolldownOptions: {
					output: {
						dir: 'dist/server',
						entryFileNames: '[name].js',
						chunkFileNames: 'chunk-[hash].js',
						hoistTransitiveImports: false,
					},
				},
			},
		});
	});

	test('does not apply production output defaults while starting Vite dev server', () => {
		const plugin = getMarklessPlugin();
		callConfig(plugin, {}, { command: 'serve' });

		expect(
			callConfigEnvironment(plugin, 'client', {
				build: {
					rolldownOptions: {
						output: {
							codeSplitting: false,
						},
					},
				},
			}),
		).toBeUndefined();
	});

	test('disables Vite modulepreload only for client environment builds', () => {
		const plugin = getMarklessPlugin();

		expect(callConfigEnvironment(plugin, 'client', {})).toMatchObject({
			build: {
				modulePreload: false,
			},
		});
		expect(callConfigEnvironment(plugin, 'ssr', {})).toMatchObject({
			build: expect.not.objectContaining({
				modulePreload: false,
			}),
		});
	});

	test('adds the SSR TSRX artifact as a client symbol root', () => {
		const plugin = getMarklessPlugin();
		const config = {
			build: {
				rolldownOptions: {
					input: 'index.html',
				},
			},
			environments: {
				ssr: {
					build: {
						rolldownOptions: {
							input: 'src/App.tsrx',
						},
					},
				},
			},
		};

		callConfig(plugin, config, { command: 'build' });

		expect(config.build.rolldownOptions.input).toEqual({
			index: 'index.html',
			symbols: 'src/App.tsrx',
		});
	});

	test('defaults SSR environment output from only the TSRX artifact input', () => {
		const plugin = getMarklessPlugin();

		expect(
			callConfigEnvironment(plugin, 'ssr', {
				build: {
					rolldownOptions: {
						input: 'src/root.tsrx',
					},
				},
			}),
		).toMatchObject({
			build: {
				outDir: 'dist/server',
				rolldownOptions: {
					input: 'src/root.tsrx',
					output: {
						entryFileNames: '[name].js',
						chunkFileNames: 'chunk-[hash].js',
						hoistTransitiveImports: false,
					},
				},
			},
		});
	});

	test('defaults custom server-like environments without requiring consumer config', () => {
		const plugin = getMarklessPlugin();

		expect(
			callConfigEnvironment(plugin, 'edge', {
				build: {
					rolldownOptions: {
						input: 'src/root.tsrx',
					},
				},
			}),
		).toMatchObject({
			build: {
				outDir: 'dist/server',
				rolldownOptions: {
					input: 'src/root.tsrx',
					output: {
						entryFileNames: '[name].js',
						chunkFileNames: 'chunk-[hash].js',
						hoistTransitiveImports: false,
					},
				},
			},
		});
	});

	test('leaves Nitro environment output owned by Nitro', () => {
		const plugin = getMarklessPlugin();
		const nitroConfig: EnvironmentOptions = {
			build: {
				rolldownOptions: {
					output: { entryFileNames: 'index.mjs' },
				},
			},
		};

		expect(callConfigEnvironment(plugin, 'nitro', nitroConfig)).toBeUndefined();
		expect(
			callOutputOptions(
				plugin,
				{ entryFileNames: 'index.mjs' },
				{ environment: { name: 'nitro', config: {} } },
			),
		).toEqual({ entryFileNames: 'index.mjs' });
	});

	test('dispatches output defaults by Vite environment context', () => {
		const plugin = getMarklessPlugin();
		const clientOutput = callOutputOptions(
			plugin,
			{ dir: 'dist/client' },
			createViteHookContext(),
		) as { codeSplitting?: { groups?: Array<{ name: string }> } };

		expect(clientOutput).toMatchObject({
			dir: 'dist/client',
			entryFileNames: 'build/chunk-[hash].js',
			chunkFileNames: 'build/chunk-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'markless-runtime',
			'markless-symbols',
		]);
		expect(
			callOutputOptions(plugin, { dir: 'dist/server' }, createViteHookContext('server')),
		).toMatchObject({
			dir: 'dist/server',
			chunkFileNames: 'chunk-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(
			callOutputOptions(
				plugin,
				{ entryFileNames: '[name].js' },
				createViteHookContext('client', { lib: true }),
			),
		).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('uses Vite base for stylesheet manifest injections', () => {
		let manifest: MarklessManifest | undefined;
		const plugin = getMarklessPlugin({ onManifest: (next) => (manifest = next) });

		callConfigResolved(plugin, {
			base: '/docs/',
			command: 'build',
			root: '/workspace/app',
		});
		callGenerateBundle(
			plugin,
			{
				'assets/root.css': {
					type: 'asset',
					fileName: 'assets/root.css',
					name: 'root.css',
					names: ['root.css'],
					source: 'body{}',
				},
			},
			vi.fn(),
			createViteHookContext('client'),
		);

		expect(manifest?.injections).toContainEqual({
			tag: 'link',
			location: 'head',
			attributes: {
				rel: 'stylesheet',
				href: '/docs/assets/root.css',
			},
		});
	});
});

function getMarklessPlugin(options: Parameters<typeof markless>[0] = {}) {
	return getPlugin(markless(options), 'vite-plugin-markless') as ReturnType<
		typeof markless
	>[number] & {
		sharedDuringBuild?: boolean;
	};
}
