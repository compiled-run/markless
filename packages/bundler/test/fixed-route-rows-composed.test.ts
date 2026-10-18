import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createServer, type Plugin } from 'vite';
import { markless } from '../src/vite/index.ts';
import { marklessSourceAliases } from './helpers.ts';

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

const page = `import { computed, state } from '@markless/core';

export default function List({ label }) @{
	let picked = state('');
	const items = computed(() => [{ id: 'a', text: label }, { id: 'b', text: label }]);
	<ul>
		@for (const item of items; key item.id) {
			<li onClick={() => (picked = item.id)}>{item.text}</li>
		}
	</ul>
}
`;

const parent = `import { state } from '@markless/core';
import List from '../pages/list.tsrx';

export function Shell() @{
	let label = state('x');
	<main>
		<button onClick={() => (label += 'x')}>more</button>
		<List label={label} />
	</main>
}
`;

// A page's rows are compiled as fixed because the router never changes a page's props;
// a parent that renders the page as a child can, so the build refuses the pair.
test.each([
	['page first', ['/pages/list.tsrx', '/components/shell.tsrx']],
	['parent first', ['/components/shell.tsrx', '/pages/list.tsrx']],
])(
	'a page whose rows were compiled as fixed cannot be rendered as a child component (%s)',
	async (_order, ids) => {
		const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-fixed-rows-')));
		cleanupRoots.push(fixtureRoot);
		await mkdir(join(fixtureRoot, 'pages'), { recursive: true });
		await mkdir(join(fixtureRoot, 'components'), { recursive: true });
		await writeFile(join(fixtureRoot, 'index.html'), '<html><head></head><body></body></html>');
		await writeFile(join(fixtureRoot, 'pages/list.tsrx'), page);
		await writeFile(join(fixtureRoot, 'components/shell.tsrx'), parent);
		const plugins = markless({ executionLog: 'never' }) as Plugin[];
		const host = plugins.find(
			(plugin) =>
				typeof (plugin as { api?: { declareRouteModules?: unknown } }).api
					?.declareRouteModules === 'function',
		) as { api: { declareRouteModules(isRoute: (moduleId: string) => boolean): void } };
		host.api.declareRouteModules((moduleId) => moduleId === 'pages/list.tsrx');
		const server = await createServer({
			configFile: false,
			root: fixtureRoot,
			logLevel: 'silent',
			plugins,
			resolve: { alias: marklessSourceAliases(root) },
			server: { middlewareMode: true, ws: false },
		});
		try {
			const failures: string[] = [];
			for (const id of ids) {
				const failure = await server.environments.client.transformRequest(id).then(
					() => undefined,
					(error: unknown) => (error instanceof Error ? error.message : String(error)),
				);
				if (failure) failures.push(failure);
			}
			expect(failures.join('\n')).toContain('MARKLESS_ROUTE_ROWS_COMPOSED');
		} finally {
			await server.close();
		}
	},
);
