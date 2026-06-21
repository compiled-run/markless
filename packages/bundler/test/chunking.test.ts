import { describe, expect, test } from 'vitest';
import { arcadeClient, arcadeLib, arcadeServer } from '../src/rolldown.ts';
import { callOutputOptions } from './helpers.ts';

type ArcadeOutputOptions = {
	codeSplitting?: {
		groups?: Array<{ name: string }>;
	};
};

describe('arcade chunking defaults', () => {
	test('uses explicit output defaults for each environment', () => {
		const clientOutput = callOutputOptions(arcadeClient(), {
			dir: 'dist/client',
		}) as ArcadeOutputOptions;

		expect(clientOutput).toMatchObject({
			dir: 'dist/client',
			entryFileNames: 'build/chunk-[hash].js',
			chunkFileNames: 'build/chunk-[hash].js',
			hoistTransitiveImports: false,
			minifyInternalExports: false,
			strictExecutionOrder: true,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'arcade-runtime',
			'arcade-symbols',
		]);
		expect(callOutputOptions(arcadeServer(), { dir: 'dist/server' })).toMatchObject({
			dir: 'dist/server',
			chunkFileNames: 'chunk-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(callOutputOptions(arcadeLib(), { entryFileNames: '[name].js' })).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('appends user code splitting groups after framework groups', () => {
		const userGroup = { name: 'vendor', test: /vendor/ };
		const output = callOutputOptions(arcadeClient(), {
			codeSplitting: { groups: [userGroup] },
		}) as ArcadeOutputOptions;

		expect(output.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'arcade-runtime',
			'arcade-symbols',
			'vendor',
		]);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => callOutputOptions(arcadeClient(), { codeSplitting: true })).toThrow(
			'@arcade/bundler requires output.codeSplitting to be an object',
		);
	});
});
