import { expect, test } from 'vitest';
import { createProjectGraph } from '../../packages/analyzer/test-support/project-graph.ts';
import { checkInWorkerBuilds, inWorkerBuilds } from './in-worker-builds.ts';

const apis = [{ from: ['vite'], names: ['build', 'createBuilder'] }];
const scope = ['packages/router/test/'];

async function found(files: Record<string, string>) {
	const graph = await createProjectGraph({
		files: new Map(Object.entries(files)),
		tracked: new Set(Object.keys(files)),
		packages: [],
	});
	const tests = Object.keys(files).filter((path) => path.endsWith('.test.ts'));
	return Object.assign(inWorkerBuilds(graph, tests, apis, scope), { graph });
}

test('a test that imports the build API, directly or through a helper or a re-export, builds in its worker', async () => {
	const result = await found({
		'packages/router/test/direct.test.ts': "import { createBuilder } from 'vite';\nawait createBuilder({});\n",
		'packages/router/test/support/helper.ts': "import { build } from 'vite';\nexport const run = () => build({});\n",
		'packages/router/test/support/barrel.ts': "export { run } from './helper.ts';\n",
		'packages/router/test/helper.test.ts': "import { run } from './support/barrel.ts';\nawait run();\n",
	});
	expect(Object.fromEntries(result)).toEqual({
		'packages/router/test/direct.test.ts': [
			'packages/router/test/direct.test.ts',
			"packages/router/test/direct.test.ts imports { createBuilder } from 'vite'",
		],
		'packages/router/test/helper.test.ts': [
			'packages/router/test/helper.test.ts',
			'packages/router/test/support/barrel.ts',
			'packages/router/test/support/helper.ts',
			"packages/router/test/support/helper.ts imports { build } from 'vite'",
		],
	});
});

test('a build in a script the test spawns by path, a type import and a test outside the scope do not count', async () => {
	const result = await found({
		'packages/router/test/support/child.ts': "import { createBuilder } from 'vite';\nawait createBuilder({});\n",
		'packages/router/test/support/spawn.ts': [
			"import { spawn } from 'node:child_process';",
			"import { resolve } from 'node:path';",
			"export const run = () => spawn(process.execPath, [resolve(import.meta.dirname, 'child.ts')]);",
		].join('\n'),
		'packages/router/test/spawned.test.ts': "import { run } from './support/spawn.ts';\nrun();\n",
		'packages/router/test/typed.test.ts': "import type { run } from './support/child.ts';\nexport type Run = typeof run;\n",
		'packages/web/test/outside.test.ts': "import { build } from 'vite';\nawait build({});\n",
	});
	expect(result.graph.dependenciesOf('packages/router/test/support/spawn.ts')).toContain(
		'packages/router/test/support/child.ts',
	);
	expect([...result.keys()]).toEqual([]);
});

test('an unnamed in-worker build and a named test that no longer builds in its worker are problems', () => {
	const rule = {
		scope,
		tests: [{ test: 'packages/router/test/gone.test.ts', why: 'reads pids' }],
	};
	const inWorker = new Map([
		['packages/router/test/new.test.ts', ['packages/router/test/new.test.ts', 'imports { build }']],
	]);
	expect(checkInWorkerBuilds(rule, inWorker)).toEqual([
		{ kind: 'unlisted', path: 'packages/router/test/new.test.ts', detail: 'imports { build }' },
		{
			kind: 'stale',
			path: 'packages/router/test/gone.test.ts',
			detail: 'it no longer builds in its worker',
		},
	]);
});
