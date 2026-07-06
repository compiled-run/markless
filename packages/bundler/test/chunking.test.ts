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
			chunkFileNames: 'build/chunk-[hash].js',
			hoistTransitiveImports: false,
			minifyInternalExports: false,
			strictExecutionOrder: true,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual(
			expect.arrayContaining([
				'markless-resume-branches',
				'markless-resume-repeats',
				'markless-resume-behaviors',
				'markless-resume-runtime-shared',
				'markless-resume-events',
				'markless-resume-locators',
				'markless-resume-sync-demand',
				'markless-runtime-graph-core',
				'markless-runtime-graph-collections',
				'markless-runtime-graph-computed',
				'markless-runtime-graph-async',
				'markless-runtime-graph-scheduler',
				'markless-runtime-graph-shared',
				'markless-payload-resume',
				'markless-payload-graph-construct',
				'markless-inline-payload-document',
				'markless-payload-document',
				'markless-runtime',
				'markless-symbols',
			]),
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
			expect.arrayContaining([
				'markless-resume-branches',
				'markless-resume-repeats',
				'markless-resume-behaviors',
				'markless-resume-runtime-shared',
				'markless-resume-events',
				'markless-resume-locators',
				'markless-resume-sync-demand',
				'markless-runtime-graph-core',
				'markless-runtime-graph-collections',
				'markless-runtime-graph-computed',
				'markless-runtime-graph-async',
				'markless-runtime-graph-scheduler',
				'markless-runtime-graph-shared',
				'markless-payload-resume',
				'markless-payload-graph-construct',
				'markless-inline-payload-document',
				'markless-payload-document',
				'markless-runtime',
				'markless-symbols',
				'vendor',
			]),
		);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('maps split resume capability files to bounded runtime groups', () => {
		const output = outputDefaults({}, 'client') as MarklessOutputOptions;
		const groups = new Map(
			output.codeSplitting?.groups?.map((group) => [group.name, group.test]) ?? [],
		);

		expect(groups.get('markless-resume-async')?.test('/repo/packages/web/src/resume-async-wiring.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-branches')?.test('/repo/packages/core/src/web/resume-branches.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-repeats')?.test('/repo/packages/web/src/resume-keyed-repeats.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-behaviors')?.test('/repo/packages/core/src/web/resume-behaviors.ts')).toBe(
			true,
		);
		expect(
			groups.get('markless-payload-resume')?.test('/repo/packages/web/src/payload-resume.ts'),
		).toBe(true);
		expect(
			groups.get('markless-payload-graph-construct')?.test(
				'/repo/packages/web/src/payload-graph-construct.ts',
			),
		).toBe(true);
		expect(groups.get('markless-payload-document')?.test('/repo/packages/web/src/payload-document.ts')).toBe(
			true,
		);
		expect(
			groups.get('markless-payload-document')?.test(
				'/repo/packages/web/src/payload-resume-registry.ts',
			),
		).toBe(true);
		expect(
			firstMatchingGroupName(groups, '/repo/packages/web/src/inline/payload-document.ts'),
		).toBe('markless-inline-payload-document');
		expect(groups.get('markless-resume-shared-patch')?.test('/repo/packages/web/src/resume-shared-patch.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-runtime-shared')?.test('/repo/packages/web/src/resume-runtime-shared.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-events')?.test('/repo/packages/web/src/resume-events.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-locators')?.test('/repo/packages/web/src/resume-locators.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-errors')?.test('/repo/packages/web/src/inline/resume-errors.ts')).toBe(
			true,
		);
		expect(groups.get('markless-resume-sync-demand')?.test('/repo/packages/web/src/resume-sync-demand.ts')).toBe(
			true,
		);
	});

	test('maps runtime graph planes to separate bounded groups', () => {
		const output = outputDefaults({}, 'client') as MarklessOutputOptions;
		const groups = new Map(
			output.codeSplitting?.groups?.map((group) => [group.name, group.test]) ?? [],
		);

		expect(groups.get('markless-runtime-graph-core')?.test('/repo/packages/runtime/src/graph-core.ts')).toBe(
			true,
		);
		expect(
			groups.get('markless-runtime-graph-collections')?.test(
				'/repo/packages/runtime/src/graph-collections.ts',
			),
		).toBe(true);
		expect(
			groups.get('markless-runtime-graph-computed')?.test(
				'/repo/packages/runtime/src/graph-computed.ts',
			),
		).toBe(true);
		expect(groups.get('markless-runtime-graph-async')?.test('/repo/packages/runtime/src/graph-async.ts')).toBe(
			true,
		);
		expect(
			groups.get('markless-runtime-graph-scheduler')?.test(
				'/repo/packages/runtime/src/graph-scheduler.ts',
			),
		).toBe(true);
		expect(groups.get('markless-runtime-graph-shared')?.test('/repo/packages/runtime/src/graph-shared.ts')).toBe(
			true,
		);
		expect(groups.get('markless-graph')?.test('/repo/packages/runtime/src/graph-core.ts')).toBe(
			false,
		);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => outputDefaults({ codeSplitting: true }, 'client')).toThrow(
			'@markless/bundler requires output.codeSplitting to be an object',
		);
	});
});

function firstMatchingGroupName(
	groups: ReadonlyMap<string, RegExp | undefined>,
	id: string,
): string | undefined {
	for (const [name, test] of groups) {
		if (test?.test(id)) return name;
	}
	return undefined;
}
