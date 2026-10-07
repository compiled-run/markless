import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createServer, createServerModuleRunner, type ViteDevServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import { marklessSourceAliases } from './helpers.ts';

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

const RUNTIME_SPECIFIER = /^@markless\/web\/(?:fns|inline)\//;

// Runtime helper specifiers stay unaliased so they reach the dev server as an install has them.
function aliasesWithBareRuntimeHelpers() {
	return marklessSourceAliases(root)
		.filter((alias) =>
			typeof alias.find === 'string'
				? !RUNTIME_SPECIFIER.test(alias.find)
				: !alias.find.test('@markless/web/fns/ssr-data') &&
					!alias.find.test('@markless/web/inline/resumer'),
		)
		.map((alias) =>
			alias.find === '@markless/web' ? { ...alias, find: /^@markless\/web$/ } : alias,
		);
}

// pnpm strict layout: only packages under node_modules/.pnpm can see the hoisted @markless/web.
async function createStrictLayoutApp() {
	const appRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-strict-layout-')));
	cleanupRoots.push(appRoot);
	const store = join(appRoot, 'node_modules/.pnpm');

	const hoistedWeb = join(store, 'node_modules/@markless/web');
	await mkdir(join(hoistedWeb, 'fns'), { recursive: true });
	await mkdir(join(hoistedWeb, 'inline'), { recursive: true });
	await writeFile(
		join(hoistedWeb, 'package.json'),
		JSON.stringify({
			name: '@markless/web',
			type: 'module',
			exports: { './fns/*': './fns/*.js', './inline/*': './inline/*.js' },
		}),
	);
	for (const folder of ['fns', 'inline']) {
		for (const file of await readdir(join(root, 'packages/web/src', folder))) {
			await writeFile(
				join(hoistedWeb, folder, file.replace(/\.ts$/, '.js')),
				"throw new Error('the hoisted @markless/web copy was loaded');\n",
			);
		}
	}

	const card = join(store, '@acme+card@1.0.0/node_modules/@acme/card');
	await mkdir(card, { recursive: true });
	await writeFile(
		join(card, 'package.json'),
		JSON.stringify({ name: '@acme/card', type: 'module', exports: './index.ts' }),
	);
	await writeFile(join(card, 'index.ts'), "export { Card } from './card.tsrx';\n");
	await writeFile(
		join(card, 'card.tsrx'),
		'export function Card({ title }: { readonly title: string }) @{\n' +
			'\t<article class="card">{title}</article>\n}\n',
	);
	await mkdir(join(appRoot, 'node_modules/@acme'), { recursive: true });
	await symlink(card, join(appRoot, 'node_modules/@acme/card'), 'dir');

	await mkdir(join(appRoot, 'pages'), { recursive: true });
	await writeFile(
		join(appRoot, 'pages/index.tsrx'),
		"import { Card } from '@acme/card';\n\n" +
			'export default function Home() @{\n' +
			'\t<main>\n\t\t<h1>Home</h1>\n\t\t<Card title="Shipping" />\n\t</main>\n}\n',
	);
	return { appRoot, cardModule: join(card, 'card.tsrx') };
}

test('a page in a pnpm-strict app loads the runtime helpers a dependency component also imports', async () => {
	const app = await createStrictLayoutApp();
	let server: ViteDevServer | undefined;
	try {
		server = await createServer({
			configFile: false,
			root: app.appRoot,
			logLevel: 'error',
			plugins: [markless({ executionLog: 'never' })],
			resolve: { alias: aliasesWithBareRuntimeHelpers() },
			server: { middlewareMode: true, ws: false },
		});
		const ssr = server.environments.ssr;

		// Compiled first, the dependency makes Vite cache the helpers as external for the page too.
		await ssr.transformRequest(app.cardModule);
		const page = await ssr.transformRequest('/pages/index.tsrx');
		expect(page?.code).toMatch(/__vite_ssr_import__\("@markless\/web\/fns\//);

		const runner = createServerModuleRunner(ssr, { hmr: false });
		try {
			const module = (await runner.import('/pages/index.tsrx')) as { default?: unknown };
			expect(module.default).toBeDefined();
		} finally {
			await runner.close();
		}
	} finally {
		await server?.close();
	}
}, 120_000);
