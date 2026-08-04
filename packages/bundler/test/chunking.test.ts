import { describe, expect, test } from 'vitest';
import { outputDefaults } from '../src/build/chunking.ts';

type MarklessGroup = {
	name: string;
	test?: RegExp;
};
type MarklessOutputOptions = {
	codeSplitting?: {
		groups?: MarklessGroup[];
	};
};

const runtimeGroupNames = [
	'markless-direct-renderer',
	'markless-resume-branches',
	'markless-resume-behaviors',
	'markless-resume-repeats',
	'markless-resume-async',
	'markless-resume-shared-patch',
	'markless-resume-runtime',
	'markless-resume-runtime-start',
	'markless-resume-runtime-shared',
	'markless-resume-events',
	'markless-resume-handoff',
	'markless-resume-locators',
	'markless-resume-errors',
	'markless-resume-sync-computed',
	'markless-resume-sync-demand',
	'markless-payload-full',
	'markless-payload-resume',
	'markless-inline-payload-document',
	'markless-payload-document',
	'markless-payload-graph-construct',
	'markless-dom-journal',
	'markless-protocol-decode',
	'markless-value-decode',
	'markless-payload-leaves',
	'markless-dev-log',
	'markless-resume-core',
	'markless-runtime-graph-core',
	'markless-runtime-graph-collections',
	'markless-runtime-graph-computed',
	'markless-runtime-graph-async',
	'markless-runtime-graph-scheduler',
	'markless-runtime-graph-shared',
	'markless-graph',
	'markless-serializer',
	'markless-runtime',
];

describe('markless chunking defaults', () => {
	test('uses explicit output defaults for each environment', () => {
		const clientOutput = outputDefaults(
			{ dir: 'dist/client' },
			'client',
		) as MarklessOutputOptions;

		expect(clientOutput).toMatchObject({
			dir: 'dist/client',
			entryFileNames: 'build/chunk-[hash].js',
			chunkFileNames: 'build/chunk-[hash].js',
			hoistTransitiveImports: false,
			minifyInternalExports: true,
			strictExecutionOrder: true,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual(
			runtimeGroupNames,
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
		const output = outputDefaults(
			{ codeSplitting: { groups: [userGroup] } },
			'client',
		) as MarklessOutputOptions;

		expect(output.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			...runtimeGroupNames,
			'vendor',
		]);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('does not force-merge virtual symbol modules into one chunk group', () => {
		const groups = runtimeGroups();
		expect(groups.has('markless-symbols')).toBe(false);
		expect(
			firstMatchingGroupName(groups, 'virtual:markless:symbol:/src/root.tsrx:symbol:0'),
		).toBe(undefined);
	});

	test('maps resume capabilities to their historical bounded runtime groups', () => {
		const groups = runtimeGroups();

		expect(
			groups
				.get('markless-resume-runtime')
				?.test?.test('/repo/packages/web/src/resume-runtime.ts'),
		).toBe(true);
		expect(
			groups
				.get('markless-resume-branches')
				?.test?.test('/repo/packages/web/src/resume-branches.ts'),
		).toBe(true);
		expect(
			groups
				.get('markless-payload-resume')
				?.test?.test('/repo/packages/web/src/payload-resume.ts'),
		).toBe(true);
		expect(
			groups
				.get('markless-direct-renderer')
				?.test?.test('/repo/packages/web/src/fns/direct.ts'),
		).toBe(true);
		expect(firstMatchingGroupName(groups, '/repo/packages/web/src/fns/write-scalar.ts')).toBe(
			undefined,
		);
		expect(
			groups
				.get('markless-protocol-decode')
				?.test?.test('/repo/packages/serializer/src/protocol-client.ts'),
		).toBe(true);
	});

	test('maps runtime graph planes to separate bounded groups', () => {
		const groups = runtimeGroups();

		for (const plane of ['core', 'collections', 'computed', 'async', 'scheduler', 'shared'])
			expect(
				groups
					.get(`markless-runtime-graph-${plane}`)
					?.test?.test(`/repo/packages/runtime/src/graph-${plane}.ts`),
			).toBe(true);
		expect(
			groups.get('markless-graph')?.test?.test('/repo/packages/runtime/src/graph-core.ts'),
		).toBe(false);
		expect(
			groups.get('markless-graph')?.test?.test('/repo/packages/core/src/runtime/index.ts'),
		).toBe(true);
		expect(
			groups
				.get('markless-runtime')
				?.test?.test('/repo/node_modules/@markless/runtime/dist/index.js'),
		).toBe(true);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => outputDefaults({ codeSplitting: true }, 'client')).toThrow(
			'@markless/bundler requires output.codeSplitting to be an object',
		);
	});
});

function runtimeGroups(): ReadonlyMap<string, MarklessGroup> {
	const output = outputDefaults({}, 'client') as MarklessOutputOptions;
	return new Map(output.codeSplitting?.groups?.map((group) => [group.name, group]) ?? []);
}

function firstMatchingGroupName(
	groups: ReadonlyMap<string, MarklessGroup>,
	id: string,
): string | undefined {
	for (const [name, group] of groups) {
		if (group.test?.test(id)) return name;
	}
	return undefined;
}
