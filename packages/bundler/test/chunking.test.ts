import { describe, expect, test } from 'vitest';
import { marklessClient, marklessLib, marklessServer } from '../src/rolldown.ts';
import { callOutputOptions } from './helpers.ts';

type MarklessOutputOptions = {
	codeSplitting?: {
		groups?: Array<{ name: string }>;
	};
};

describe('markless chunking defaults', () => {
	test('uses explicit output defaults for each environment', () => {
		const clientOutput = callOutputOptions(marklessClient(), {
			dir: 'dist/client',
		}) as MarklessOutputOptions;

		expect(clientOutput).toMatchObject({
			dir: 'dist/client',
			entryFileNames: 'build/chunk-[hash].js',
			chunkFileNames: 'build/chunk-[hash].js',
			hoistTransitiveImports: false,
			minifyInternalExports: false,
			strictExecutionOrder: true,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'markless-runtime',
			'markless-symbols',
		]);
		expect(callOutputOptions(marklessServer(), { dir: 'dist/server' })).toMatchObject({
			dir: 'dist/server',
			chunkFileNames: 'chunk-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(callOutputOptions(marklessLib(), { entryFileNames: '[name].js' })).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('appends user code splitting groups after framework groups', () => {
		const userGroup = { name: 'vendor', test: /vendor/ };
		const output = callOutputOptions(marklessClient(), {
			codeSplitting: { groups: [userGroup] },
		}) as MarklessOutputOptions;

		expect(output.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'markless-runtime',
			'markless-symbols',
			'vendor',
		]);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => callOutputOptions(marklessClient(), { codeSplitting: true })).toThrow(
			'@markless/bundler requires output.codeSplitting to be an object',
		);
	});
});
