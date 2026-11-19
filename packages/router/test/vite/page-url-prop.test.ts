import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root: string;
let browser: Browser;
let app: BuiltServer;

const files: Record<string, string> = {
	'package.json': '{ "type": "module" }\n',
	'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
`,
	'document.tsrx': `import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
		</head>
		<body>{children}</body>
	</Html>
}
`,
	'pages/notice.tsrx': `import type { PageProps } from '@markless/router';

export default function Notice({ url }: PageProps) @{
	<main>
		<p role="status" hidden={url.searchParams.get('saved') !== '1'}>Saved</p>
	</main>
}
`,
	'pages/filter.tsrx': `import { state } from '@markless/core';
import type { PageProps } from '@markless/router';

export default function Filter(props: PageProps) @{
	let opened = state(0);
	const tab = props.url.searchParams.get('tab') ?? 'all';

	<section>
		<h2 data-path>{props.url.pathname}</h2>
		<span data-tab>{tab}</span>
		<button data-has-sort={props.url.searchParams.has('sort') ? 'yes' : 'no'} onClick={() => (opened = opened + props.url.searchParams.getAll('sort').length)}>
			Count sorts
		</button>
		<output>{opened}</output>
	</section>
}
`,
	'pages/index.tsrx': `import { Link } from '@markless/router';

export default function Home() @{
	<nav>
		<Link href="/notice?saved=1">Notice</Link>
		<Link href="/filter?tab=done&sort=a&sort=b">Filter</Link>
	</nav>
}
`,
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-865-'));
	for (const [path, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), source);
	}
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
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
	browser = await launchBrowser(chromium);
	app = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}, 240_000);

afterAll(async () => {
	await app?.close();
	await browser?.close();
	if (root) await rm(root, { recursive: true, force: true });
}, 60_000);

async function visit(path: string, run: (page: Page) => Promise<void>) {
	const context = await browser.newContext({ baseURL: app.origin });
	try {
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

test('a page that reads url.searchParams in an attribute renders', async () => {
	const saved = await fetch(new URL('/notice?saved=1', app.origin));
	expect(saved.status).toBe(200);
	expect(await saved.text()).toMatch(/<p role="status">Saved<\/p>/);
	await visit('/notice?saved=1', async (page) => {
		await page.getByRole('status').waitFor({ state: 'visible' });
	});
	await visit('/notice', async (page) => {
		await page.getByText('Saved').waitFor({ state: 'hidden' });
	});
});

test('a page reads url.searchParams and url.pathname as text, and a handler reads them after resuming', async () => {
	await visit('/filter?tab=done&sort=a&sort=b', async (page) => {
		await expect.poll(() => page.locator('[data-path]').textContent()).toBe('/filter');
		await expect.poll(() => page.locator('[data-tab]').textContent()).toBe('done');
		await expect.poll(() => page.getByRole('button').getAttribute('data-has-sort')).toBe('yes');
		await page.getByRole('button').click();
		await expect.poll(() => page.locator('output').textContent()).toBe('2');
	});
});

test('a client navigation to a page that reads url.searchParams renders it', async () => {
	await visit('/', async (page) => {
		await page.getByRole('link', { name: 'Notice' }).click();
		await page.waitForURL(/\/notice\?saved=1$/);
		await page.getByRole('status').waitFor({ state: 'visible' });
		await page.goBack();
		await page.getByRole('link', { name: 'Filter' }).click();
		await expect.poll(() => page.locator('[data-tab]').textContent()).toBe('done');
		await expect.poll(() => page.locator('[data-path]').textContent()).toBe('/filter');
		await page.getByRole('button').click();
		await expect.poll(() => page.locator('output').textContent()).toBe('2');
	});
});
