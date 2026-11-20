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
	'lib/Shell.tsrx': `import type { Children } from '@markless/core';
import { storage } from '@markless/core';

export default function Shell({ children }: { readonly children?: Children }) @{
	let count = storage('shell-count', '0');

	<main>
		<p data-badge>{count}</p>
		{children}
	</main>
}
`,
	'pages/shared.tsrx': `import { storage } from '@markless/core';
import Shell from '../lib/Shell.tsrx';

export default function Shared() @{
	let count = storage('shell-count', '0');

	<Shell>
		<button onClick={() => (count = String(Number(count) + 1))}>Add</button>
	</Shell>
}
`,
	// The writer is the imported child and the reader the page, with a derived value on the reader side.
	'lib/Picker.tsrx': `import { storage } from '@markless/core';

export function Picker() @{
	let flavour = storage('pick', 'plain');

	<div>
		<button onClick={() => (flavour = 'mint')}>Mint</button>
	</div>
}
`,
	'pages/picked.tsrx': `import { computed, storage } from '@markless/core';
import { Picker } from '../lib/Picker.tsrx';

export default function Picked() @{
	let choice = storage('pick', 'plain');
	const loud = computed(() => choice.toUpperCase());

	<section>
		<Picker />
		<h2>{loud}</h2>
	</section>
}
`,
	'pages/index.tsrx': `import { Link } from '@markless/router';

export default function Home() @{
	<nav>
		<Link href="/shared">Shared</Link>
	</nav>
}
`,
};

beforeAll(async () => {
	browser = await launchBrowser(chromium);
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-867-'));
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

test('a storage() value written in a page shows in a component from another module that reads the same key', async () => {
	await visit('/shared', async (page) => {
		await page.getByRole('button', { name: 'Add' }).click();
		await expect.poll(() => page.locator('[data-badge]').textContent()).toBe('1');
	});
});

test('a storage() value written in an imported component updates a value the page derives from the same key', async () => {
	await visit('/picked', async (page) => {
		await page.getByRole('button', { name: 'Mint' }).click();
		await expect.poll(() => page.locator('h2').textContent()).toBe('MINT');
	});
});

test('after a client navigation, a page write shows in a component from another module that reads the same key', async () => {
	await visit('/', async (page) => {
		await page.getByRole('link', { name: 'Shared' }).click();
		await page.waitForURL('**/shared');
		await page.getByRole('button', { name: 'Add' }).click();
		await page.getByRole('button', { name: 'Add' }).click();
		await expect.poll(() => page.locator('[data-badge]').textContent()).toBe('2');
	});
});
