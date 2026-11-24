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

const files: Record<string, string> = {
	'pages/prefetched/index.tsrx': `import { storage } from '@markless/core';
import { Link } from '@markless/router';

export default function Writer() @{
	let list = storage('prefetched', '["a"]');

	<main>
		<button onClick={() => (list = JSON.stringify([...(JSON.parse(list) as string[]), 'b']))}>Add</button>
		<Link href="/prefetched/reader">Read</Link>
	</main>
}
`,
	'pages/prefetched/reader.tsrx': `import { computed, storage } from '@markless/core';

export default function Reader() @{
	let list = storage('prefetched', '["a"]');
	const items = computed(() => JSON.parse(list) as string[]);

	<ul>
		@for (const item of items; key item) {
			<li>{item}</li>
		}
	</ul>
}
`,
	'pages/bag/index.tsrx': `import { storage } from '@markless/core';
import { Link } from '@markless/router';

export default function Shop() @{
	let bag = storage('bag-lines', '[]');

	<section>
		<Link href="/bag/summary">Summary</Link>
		<button onClick={() => (bag = JSON.stringify([...(JSON.parse(bag) as number[]), 4]))}>Buy</button>
	</section>
}
`,
	'pages/bag/summary.tsrx': `import { computed, storage } from '@markless/core';

export default function Summary() @{
	let bag = storage('bag-lines', '[]');
	const prices = computed(() => JSON.parse(bag) as number[]);
	const total = computed(() => prices.reduce((sum, price) => sum + price, 0));

	<article>
		<output>{total}</output>
		@if (total === 0) {
			<em>Empty</em>
		}
	</article>
}
`,
};

beforeAll(async () => {
	browser = await launchBrowser(chromium);
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-876-'));
	const all: Record<string, string> = {
		'package.json': '{ "type": "module" }\n',
		'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
`,
		'document.tsrx': document,
		...files,
	};
	for (const [path, source] of Object.entries(all)) {
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

test('a page the router prefetched shows a list derived from a storage() value written after the prefetch', async () => {
	const context = await browser.newContext({ baseURL: app.origin });
	try {
		const page = await context.newPage();
		const prefetched = page.waitForResponse((response) =>
			response.url().includes('/prefetched/reader'),
		);
		await page.goto('/prefetched');
		await prefetched;
		await page.getByRole('button', { name: 'Add' }).click();
		await page.getByRole('link', { name: 'Read' }).click();
		await page.waitForURL('**/prefetched/reader');
		await expect.poll(() => page.locator('li').allTextContents()).toEqual(['a', 'b']);
	} finally {
		await context.close();
	}
});


test('a prefetched page shows a total and a branch derived through two computeds from a storage() value written after the prefetch', async () => {
	const context = await browser.newContext({ baseURL: app.origin });
	try {
		const page = await context.newPage();
		const prefetched = page.waitForResponse((response) =>
			response.url().includes('/bag/summary'),
		);
		await page.goto('/bag');
		await prefetched;
		await page.getByRole('button', { name: 'Buy' }).click();
		await page.getByRole('button', { name: 'Buy' }).click();
		await page.getByRole('link', { name: 'Summary' }).click();
		await page.waitForURL('**/bag/summary');
		await expect.poll(() => page.locator('output').textContent()).toBe('8');
		await expect.poll(() => page.locator('em').count()).toBe(0);
	} finally {
		await context.close();
	}
});

test('a page served with the fallback derives its list from the value saved only in localStorage', async () => {
	await visit('/prefetched', async (page) => {
		await page.getByRole('button', { name: 'Add' }).click();
		await expect
			.poll(() => page.evaluate(() => localStorage.getItem('prefetched')))
			.toBe('["a","b"]');
		await page.context().clearCookies();
		await page.goto('/prefetched/reader');
		await expect.poll(() => page.locator('li').allTextContents()).toEqual(['a', 'b']);
	});
});
