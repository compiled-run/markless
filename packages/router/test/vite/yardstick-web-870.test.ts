import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { storageCookieName } from '../../../serializer/src/storage-slot.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A state() whose initial value is a storage() value builds, starts from the saved value, and then moves on its own.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
let browser: Browser | undefined;
let app: BuiltServer | undefined;

const document = `import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
		</head>
		<body>{children}</body>
	</Html>
}
`;

async function build(pages: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-yardstick-870-'));
	roots.push(root);
	const files: Record<string, string> = {
		'package.json': '{ "type": "module" }\n',
		'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { ui } from '@markless/ui/vite';

export default { plugins: [ui(), markless(), router()] };
`,
		'document.tsrx': document,
		...Object.fromEntries(Object.entries(pages).map(([path, source]) => [`pages/${path}`, source])),
	};
	for (const [path, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), source);
	}
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		join(packagesRoot, 'headless/components'),
		join(root, 'node_modules/@markless/ui'),
		'dir',
	);
	await symlink(
		join(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root, configFile: join(root, 'vite.config.ts') });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	return root;
}

async function buildError(pages: Record<string, string>): Promise<string | undefined> {
	const inOneProcess = process.env.MARKLESS_CLIENT_BUILD_PROCESS;
	// One process puts the compiler's error in the thrown message.
	process.env.MARKLESS_CLIENT_BUILD_PROCESS = '0';
	try {
		await build(pages);
		return undefined;
	} catch (error) {
		const { message, errors = [] } = error as Error & { errors?: readonly Error[] };
		return [message, ...errors.map((entry) => entry.message)].join('\n');
	} finally {
		if (inOneProcess === undefined) delete process.env.MARKLESS_CLIENT_BUILD_PROCESS;
		else process.env.MARKLESS_CLIENT_BUILD_PROCESS = inOneProcess;
	}
}

beforeAll(async () => {
	browser = await launchBrowser(chromium);
	const root = await build({
		'index.tsrx': `import { state, storage } from '@markless/core';

export default function Page() @{
	let saved = storage('site', 'North');
	let site = state(saved);

	<main>
		<p>{site}</p>
		<span data-saved>{saved}</span>
		<button onClick={() => (site = 'South')}>South</button>
	</main>
}
`,
		'draft.tsrx': `import { computed, state, storage } from '@markless/core';

export default function Draft() @{
	const label = storage('draft-label', 'untitled');
	const shouted = computed(() => label.toUpperCase());
	let heading = state({ text: shouted + '!' });

	<section>
		<button onClick={() => (heading.text = 'renamed')}>Rename</button>
		<h1>{heading.text}</h1>
		<em>{label}</em>
	</section>
}
`,
	});
	app = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}, 240_000);

afterAll(async () => {
	await app?.close();
	await browser?.close();
	for (const root of roots) await rm(root, { recursive: true, force: true });
}, 60_000);

async function visit(
	path: string,
	cookies: Record<string, string>,
	run: (page: import('@playwright/test').Page) => Promise<void>,
) {
	const context = await browser!.newContext({ baseURL: app!.origin });
	try {
		await context.addCookies(
			Object.entries(cookies).map(([key, value]) => ({
				name: storageCookieName(key),
				value: encodeURIComponent(value),
				url: app!.origin,
			})),
		);
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await page.waitForLoadState('networkidle');
		await run(page);
		expect(errors).toEqual([]);
	} finally {
		await context.close();
	}
}

test('a state() started from a storage() value renders the saved value, then moves on its own', { timeout: 60_000 }, async () => {
	await visit('/', { site: 'West' }, async (page) => {
		expect(await page.locator('p').textContent()).toBe('West');
		expect(await page.locator('[data-saved]').textContent()).toBe('West');
		await page.getByRole('button', { name: 'South' }).click();
		await expect.poll(() => page.locator('p').textContent()).toBe('South');
		expect(await page.locator('[data-saved]').textContent()).toBe('West');
	});
});

test('a state() object can start from a computed() over a storage() value', { timeout: 60_000 }, async () => {
	await visit('/draft', { 'draft-label': 'notes' }, async (page) => {
		expect(await page.locator('h1').textContent()).toBe('NOTES!');
		await page.getByRole('button', { name: 'Rename' }).click();
		await expect.poll(() => page.locator('h1').textContent()).toBe('renamed');
		expect(await page.locator('em').textContent()).toBe('notes');
	});
});

test('a state() can start from a storage() value (build)', { timeout: 240_000 }, async () => {
	expect(
		(await buildError({
			'index.tsrx': `import { state, storage } from '@markless/core';

export default function Page() @{
	let saved = storage('site', 'North');
	let site = state(saved);

	<main>
		<p>{site}</p>
		<button onClick={() => (site = 'South')}>South</button>
	</main>
}
`,
		})) ?? '',
	).not.toContain('MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE');
});
