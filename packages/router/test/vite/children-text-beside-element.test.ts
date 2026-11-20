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
	'pages/boxed.tsrx': `import type { Children } from '@markless/core';
import { state } from '@markless/core';

function Box({ children }: { readonly children?: Children }) @{
	<p data-box>{children}</p>
}

export default function Boxed() @{
	let site = state('North');

	<main>
		<Box>
			{site}
			<span>▾</span>
		</Box>
		<button onClick={() => (site = 'South')}>South</button>
	</main>
}
`,
	'pages/shapes.tsrx': `import type { Children } from '@markless/core';
import { state } from '@markless/core';

function Frame({ children }: { readonly children?: Children }) @{
	<div data-frame>{children}</div>
}

function Outer({ children }: { readonly children?: Children }) @{
	<section data-outer>
		<Frame>{children}</Frame>
	</section>
}

export default function Shapes() @{
	let size = state(1);
	let label = state('small');

	<article>
		<Frame>
			<b>Size</b>
			{size}
		</Frame>
		<Outer>
			{label}
			<i>:</i>
			{size}
		</Outer>
		<button onClick={() => {
			size = size + 1;
			label = 'large';
		}}>Grow</button>
	</article>
}
`,
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-864-'));
	for (const [path, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), source);
	}
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(join(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
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

test('live text next to an element in a component’s children updates', async () => {
	await visit('/boxed', async (page) => {
		await page.getByRole('button', { name: 'South' }).click();
		await expect.poll(() => page.locator('[data-box]').textContent()).toBe('South▾');
	});
});

test('live text after an element, and around one through a nested component, updates', async () => {
	await visit('/shapes', async (page) => {
		const frame = page.locator('article > [data-frame]');
		const outer = page.locator('[data-outer] [data-frame]');
		expect(await frame.textContent()).toBe('Size1');
		expect(await outer.textContent()).toBe('small:1');
		await page.getByRole('button', { name: 'Grow' }).click();
		await expect.poll(() => frame.textContent()).toBe('Size2');
		await expect.poll(() => outer.textContent()).toBe('large:2');
	});
});
