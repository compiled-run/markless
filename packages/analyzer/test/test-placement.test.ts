import { describe, expect, test } from 'vitest';
import {
	checkPlacement,
	closureOf,
	heavyTests,
	type HeavyEntry,
	type HeavyTestsManifest,
} from '../test-support/test-placement.ts';

const ENTRIES: HeavyEntry[] = [
	{ module: 'scripts/test-utils/browser.ts', why: 'launches a browser' },
	{ from: ['@playwright/test'], names: ['chromium', 'webkit'], why: 'a browser type' },
	{ from: ['vite'], names: ['build'], why: 'builds an app' },
];

const closureFor = (files: Record<string, string>, extra: string[] = []) => {
	const sources = new Map(Object.entries(files).map(([path, text]) => [path, Buffer.from(text)]));
	return closureOf(
		{
			read: (path) => sources.get(path) ?? null,
			tracked: new Set([...Object.keys(files), ...extra]),
			packages: [],
		},
		Object.keys(files).filter((path) => path.endsWith('.test.ts')),
	);
};

const heavyOf = async (files: Record<string, string>) => {
	const closure = await closureFor(files);
	const tests = Object.keys(files).filter((path) => path.endsWith('.test.ts'));
	return heavyTests(closure, tests, ENTRIES);
};

describe('heavy tests', () => {
	test('a test reaching an entry module through a helper is heavy, with the chain that makes it so', async () => {
		const heavy = await heavyOf({
			'scripts/test-utils/browser.ts': 'export const launchBrowser = () => 1;',
			'pkg/test/helper.ts':
				"export { launchBrowser } from '../../scripts/test-utils/browser.ts';",
			'pkg/test/page.test.ts':
				"import { launchBrowser } from './helper.ts'; launchBrowser();",
			'pkg/test/pure.test.ts': 'export const x = 1;',
		});
		expect([...heavy]).toEqual([
			[
				'pkg/test/page.test.ts',
				['pkg/test/page.test.ts', 'pkg/test/helper.ts', 'scripts/test-utils/browser.ts'],
			],
		]);
	});

	test('a named or namespace import of a listed package is heavy; other names and type-only imports are not', async () => {
		const heavy = await heavyOf({
			'pkg/test/named.test.ts': "import { chromium } from '@playwright/test'; chromium;",
			'pkg/test/namespace.test.ts': "import * as pw from '@playwright/test'; pw;",
			'pkg/test/other-name.test.ts': "import { expect } from '@playwright/test'; expect;",
			'pkg/test/type-only.test.ts':
				"import type { build } from 'vite'; export type B = typeof build;",
			'pkg/test/build.test.ts': "import { build } from 'vite'; build;",
		});
		expect([...heavy.keys()]).toEqual([
			'pkg/test/build.test.ts',
			'pkg/test/named.test.ts',
			'pkg/test/namespace.test.ts',
		]);
		expect(heavy.get('pkg/test/build.test.ts')).toEqual([
			'pkg/test/build.test.ts',
			"pkg/test/build.test.ts imports { build } from 'vite'",
		]);
	});

	test('follows a script a test spawns by path from import.meta.dirname', async () => {
		const heavy = await heavyOf({
			'pkg/test/helpers/build-fixture.ts': "import { build } from 'vite'; await build();",
			'pkg/test/spawns.test.ts':
				"import { resolve } from 'node:path'; const script = resolve(import.meta.dirname, 'helpers/build-fixture.ts'); script;",
			'pkg/test/local-resolve.test.ts':
				"const resolve = (...parts: string[]) => parts.join('/'); resolve(import.meta.dirname, 'helpers/build-fixture.ts');",
		});
		expect([...heavy.keys()]).toEqual(['pkg/test/spawns.test.ts']);
	});

	test('parses only the modules the tests reach, round by round', async () => {
		const closure = await closureFor({
			'pkg/src/a.ts': "import { b } from './b.ts'; export const a = b;",
			'pkg/src/b.ts': 'export const b = 1;',
			'pkg/src/unreached.ts': 'export const u = 1;',
			'pkg/test/a.test.ts': "import { a } from '../src/a.ts'; a;",
		});
		expect([...closure.edges.keys()].sort()).toEqual([
			'pkg/src/a.ts',
			'pkg/src/b.ts',
			'pkg/test/a.test.ts',
		]);
		expect(closure.rounds).toBe(3);
	});
});

describe('placement check', () => {
	const manifest = (overrides: Partial<HeavyTestsManifest>): HeavyTestsManifest => ({
		entries: ENTRIES,
		tests: [],
		declared: [],
		...overrides,
	});
	const tracked = new Set(['scripts/test-utils/browser.ts']);
	const heavy = new Map([['a.test.ts', ['a.test.ts', 'scripts/test-utils/browser.ts']]]);
	const tests = ['a.test.ts', 'b.test.ts', 'spawns.test.ts'];

	test('passes when the listed tests are exactly the heavy ones', () => {
		expect(
			checkPlacement(
				manifest({
					tests: ['a.test.ts'],
					declared: [{ test: 'spawns.test.ts', why: 'runs pnpm build' }],
				}),
				heavy,
				tests,
				tracked,
			),
		).toEqual([]);
	});

	test('a heavy test missing from the manifest fails with its chain', () => {
		expect(checkPlacement(manifest({}), heavy, tests, tracked)).toEqual([
			{ kind: 'missing', path: 'a.test.ts', detail: 'scripts/test-utils/browser.ts' },
		]);
	});

	test('a listed test that no longer reaches an entry, or no longer exists, is stale', () => {
		expect(
			checkPlacement(
				manifest({ tests: ['a.test.ts', 'b.test.ts', 'gone.test.ts'] }),
				heavy,
				tests,
				tracked,
			),
		).toEqual([
			{
				kind: 'stale',
				path: 'b.test.ts',
				detail: 'its import closure no longer reaches a heavy entry',
			},
			{ kind: 'stale', path: 'gone.test.ts', detail: 'not a node-project test file' },
		]);
	});

	test('a declared test the graph reaches, a removed entry module and a duplicate all fail', () => {
		expect(
			checkPlacement(
				manifest({
					entries: [...ENTRIES, { module: 'scripts/test-utils/removed.ts', why: 'gone' }],
					tests: ['spawns.test.ts'],
					declared: [
						{ test: 'a.test.ts', why: 'runs pnpm build' },
						{ test: 'spawns.test.ts', why: 'runs pnpm build' },
					],
				}),
				heavy,
				tests,
				tracked,
			).map((problem) => `${problem.kind}: ${problem.path}`),
		).toEqual([
			'stale entry: scripts/test-utils/removed.ts',
			'duplicate: spawns.test.ts',
			'declared but reached: a.test.ts',
			'stale: spawns.test.ts',
		]);
	});
});
