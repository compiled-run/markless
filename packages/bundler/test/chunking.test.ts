import { describe, expect, test } from 'vitest';
import { outputDefaults } from '../src/build/chunking.ts';

type MarklessOutputOptions = {
	codeSplitting?: {
		groups?: Array<{ name: string; test?: RegExp }>;
	};
};

describe('markless chunking defaults', () => {
	test('uses explicit output defaults for each environment', () => {
		const clientOutput = outputDefaults({
			dir: 'dist/client',
		}, 'client') as MarklessOutputOptions;

		expect(clientOutput).toMatchObject({
			dir: 'dist/client',
			entryFileNames: 'build/chunk-[hash].js',
			chunkFileNames: 'build/[name]-[hash].js',
			hoistTransitiveImports: false,
			minifyInternalExports: false,
			strictExecutionOrder: true,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual(
			expect.arrayContaining(['markless-runtime', 'markless-symbols']),
		);
		expect(outputDefaults({ dir: 'dist/server' }, 'server')).toMatchObject({
			dir: 'dist/server',
			chunkFileNames: 'chunk-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(outputDefaults({ entryFileNames: '[name].js' }, 'lib')).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('appends user code splitting groups after framework groups', () => {
		const userGroup = { name: 'vendor', test: /vendor/ };
		const output = outputDefaults({
			codeSplitting: { groups: [userGroup] },
		}, 'client') as MarklessOutputOptions;

		expect(output.codeSplitting?.groups?.map((group) => group.name)).toEqual(
			expect.arrayContaining(['markless-runtime', 'markless-symbols', 'vendor']),
		);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('maps split resume capability files to bounded runtime groups', () => {
		const output = outputDefaults({}, 'client') as MarklessOutputOptions;
		const groups = new Map(
			output.codeSplitting?.groups?.map((group) => [group.name, group.test]) ?? [],
		);

		expect(groups.get('markless-resume-async')?.test('/repo/packages/web/src/resume-async-wiring.ts')).toBe(true);
		expect(groups.get('markless-resume-shared-patch')?.test('/repo/packages/web/src/resume-shared-patch.ts')).toBe(true);
		expect(groups.get('markless-resume-wiring')?.test('/repo/packages/web/src/resume-sync-demand.ts')).toBe(true);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => outputDefaults({ codeSplitting: true }, 'client')).toThrow(
			'@markless/bundler requires output.codeSplitting to be an object',
		);
	});
});
