import type { EnvironmentOptions } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { arcade } from '../src/vite/index.ts';
import type { ArcadeManifest } from '../src/types.ts';
import {
	callConfigEnvironment,
	callConfigResolved,
	callGenerateBundle,
	callOutputOptions,
	createViteHookContext,
	getPlugin,
} from './helpers.ts';

describe('Vite config integration', () => {
	test('shares plugin state across app build environments', () => {
		expect(getArcadePlugin().sharedDuringBuild).toBe(true);
	});

	test('sets output defaults on Vite client and server environments', () => {
		const plugin = getArcadePlugin();
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

	test('disables Vite modulepreload only for client environment builds', () => {
		const plugin = getArcadePlugin();

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

	test('defaults SSR environment output from only the server entry input', () => {
		const plugin = getArcadePlugin();

		expect(
			callConfigEnvironment(plugin, 'ssr', {
				build: {
					rolldownOptions: {
						input: 'src/entry-server.ts',
					},
				},
			}),
		).toMatchObject({
			build: {
				outDir: 'dist/server',
				rolldownOptions: {
					input: 'src/entry-server.ts',
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
		const plugin = getArcadePlugin();

		expect(
			callConfigEnvironment(plugin, 'edge', {
				build: {
					rolldownOptions: {
						input: 'src/entry-server.ts',
					},
				},
			}),
		).toMatchObject({
			build: {
				outDir: 'dist/server',
				rolldownOptions: {
					input: 'src/entry-server.ts',
					output: {
						entryFileNames: '[name].js',
						chunkFileNames: 'chunk-[hash].js',
						hoistTransitiveImports: false,
					},
				},
			},
		});
	});

	test('dispatches output defaults by Vite environment context', () => {
		const plugin = getArcadePlugin();
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
			'arcade-runtime',
			'arcade-symbols',
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
		let manifest: ArcadeManifest | undefined;
		const plugin = getArcadePlugin({ onManifest: (next) => (manifest = next) });

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

function getArcadePlugin(options: Parameters<typeof arcade>[0] = {}) {
	return getPlugin(arcade(options), 'vite-plugin-arcade') as ReturnType<typeof arcade>[number] & {
		sharedDuringBuild?: boolean;
	};
}
