import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');

// The browser render path a client navigation swaps pages with; a handler that only navigates never runs it.
const RENDER_PATH = /(?:^|\/)(?:web\/(?:src|dist)\/(?:render|render-csr|renderer|evaluator|ssr)(?:[-.]|$)|router\/(?:src|dist)\/route-renderer)/;

async function writeApp(root: string, helper: string) {
	await mkdir(join(root, 'pages'));
	await mkdir(join(root, 'lib'));
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	await writeFile(join(root, 'lib/go.ts'), helper);
	await writeFile(
		join(root, 'pages/index.tsrx'),
		[
			"import { state } from '@markless/core';",
			"import { go } from '../lib/go.ts';",
			'export default function Home() @{',
			"\tlet tab = state('a');",
			"\t<main><button data-tab onClick={() => (tab = tab === 'a' ? 'b' : 'a')}>{tab}</button><a data-go href=\"/next\" onClick={(event) => go(event, '/next')}>next</a></main>",
			'}',
		].join('\n'),
	);
	await writeFile(
		join(root, 'pages/next.tsrx'),
		['export default function Next() @{', '\t<main><h1>next</h1></main>', '}'].join('\n'),
	);
}

test.each([
	{
		name: 'from @markless/router',
		helper:
			"import { navigate } from '@markless/router';\nexport function go(event: Event, href: string): void {\n\tevent.preventDefault();\n\tvoid navigate(href);\n}\n",
	},
	{
		name: 'from @markless/core/router',
		helper:
			"import { navigate } from '@markless/core/router';\nexport const go = (event: Event, href: string) => {\n\tevent.preventDefault();\n\treturn navigate(href, { replace: true });\n};\n",
	},
])('a handler that calls navigate() $name takes no browser render code into its first use', async ({ helper }) => {
	const root = await mkdtemp(join(tmpdir(), 'markless-navigate-first-use-'));
	try {
		await writeApp(root, helper);
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		});
		await builder.buildApp();
		const closures = JSON.parse(
			await readFile(join(root, '.output/.markless/public/interaction-closures.json'), 'utf8'),
		) as {
			modules: string[];
			closures: number[][];
			routes: Array<{ route: string; consumers: Array<{ key: string; kind: string; closure: number }> }>;
		};
		const home = closures.routes.find((entry) => entry.route.endsWith('pages/index.tsrx'))!;
		const actions = home.consumers.filter((consumer) => consumer.kind === 'action');
		expect(actions.length).toBeGreaterThan(0);
		const reached = (consumer: { closure: number }) =>
			(closures.closures[consumer.closure] ?? []).map((index) => closures.modules[index]!);
		expect(actions.some((consumer) => reached(consumer).some((id) => id.endsWith('lib/go.ts')))).toBe(true);
		for (const consumer of [...actions, ...home.consumers.filter((consumer) => consumer.kind === 'boot')])
			expect(reached(consumer).filter((id) => RENDER_PATH.test(id)), consumer.key).toEqual([]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120_000);
