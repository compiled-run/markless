import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// Defects a web developer hit writing the yardstick apps (packages/mobile/apps), each reduced to a page or two and pinned
// as an expected failure naming its issue; a fix turns its test red until `.fails` is removed.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
const servers: BuiltServer[] = [];
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

async function build(pages: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-yardstick-defects-'));
	roots.push(root);
	const files: Record<string, string> = {
		'package.json': '{ "type": "module" }\n',
		'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { ui } from '@markless/ui/vite';

export default { plugins: [ui(), markless(), router()] };
`,
		'document.tsrx': document,
		...Object.fromEntries(
			Object.entries(pages).map(([path, source]) => [
				path.startsWith('lib/') ? path : `pages/${path}`,
				source,
			]),
		),
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

async function serve(root: string): Promise<BuiltServer> {
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	servers.push(server);
	return server;
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

const pages: Record<string, string> = {
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
	'empty.tsrx': `import { computed, state } from '@markless/core';

export default function Empty() @{
	let query = state('');
	const shown = computed(() => ['apple', 'banana'].filter((fruit) => fruit.includes(query)));

	<main>
		<input aria-label="Search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const fruit of shown; key fruit) {
				<li>{fruit}</li>
			} @empty {
				<li>No match for {query}</li>
			}
		</ul>
	</main>
}
`,
	'notice.tsrx': `import type { PageProps } from '@markless/router';

export default function Notice({ url }: PageProps) @{
	<main>
		<p role="status" hidden={url.searchParams.get('saved') !== '1'}>Saved</p>
	</main>
}
`,
	'shared.tsrx': `import { storage } from '@markless/core';
import Shell from '../lib/Shell.tsrx';

export default function Shared() @{
	let count = storage('shell-count', '0');

	<Shell>
		<button onClick={() => (count = String(Number(count) + 1))}>Add</button>
	</Shell>
}
`,
	'guarded.tsrx': `import { computed, storage } from '@markless/core';

export default function Guarded() @{
	let saved = storage('guarded', '{"title":"First"}');
	const note = computed(() => (saved ? (JSON.parse(saved) as { title: string }) : undefined));

	<main>
		@if (note) {
			<section>
				<h1>{note.title.toUpperCase()}</h1>
				<button onClick={() => (saved = '')}>Delete</button>
			</section>
		} @else {
			<p>Deleted</p>
		}
	</main>
}
`,
	'boxed.tsrx': `import type { Children } from '@markless/core';
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
	'prefetched/index.tsrx': `import { storage } from '@markless/core';
import { Link } from '@markless/router';

export default function Writer() @{
	let list = storage('prefetched', '["a"]');

	<main>
		<button onClick={() => (list = JSON.stringify([...(JSON.parse(list) as string[]), 'b']))}>Add</button>
		<Link href="/prefetched/reader">Read</Link>
	</main>
}
`,
	'prefetched/reader.tsrx': `import { computed, storage } from '@markless/core';

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
	'size.tsrx': `import { state } from '@markless/core';

export default function Size() @{
	let size = state('m');

	<main>
		<select aria-label="Size" value={size} onChange={(event) => (size = event.currentTarget.value)}>
			<option value="s">Small</option>
			<option value="m">Medium</option>
		</select>
	</main>
}
`,
};

beforeAll(async () => {
	browser = await launchBrowser(chromium);
	app = await serve(await build(pages));
}, 240_000);

afterAll(async () => {
	for (const server of servers) await server.close();
	await browser?.close();
	for (const root of roots) await rm(root, { recursive: true, force: true });
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

test.fails('an @if arm can hold a modal (#869)', { timeout: 240_000 }, async () => {
	expect(
		(await buildError({
			'index.tsrx': `import { state } from '@markless/core';
import { modal } from '@markless/ui';

export default function Page() @{
	let shown = state(true);

	<main>
		@if (shown) {
			<modal.root>
				<modal.trigger>Delete</modal.trigger>
				<modal.content>
					<modal.title>Delete?</modal.title>
				</modal.content>
			</modal.root>
		}
	</main>
}
`,
		})) ?? '',
	).not.toContain('MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED');
});

test.fails('@empty with live text shows when a filtered list goes from some rows to none (#868)', async () => {
	await visit('/empty', async (page) => {
		await page.getByLabel('Search').fill('zzz');
		await expect.poll(() => page.locator('li').allTextContents()).toEqual(['No match for zzz']);
	});
});

test.fails('an @if arm does not run its expressions once its condition turns false (#863)', async () => {
	await visit('/guarded', async (page) => {
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect.poll(() => page.locator('main').textContent()).toBe('Deleted');
	});
});

test.fails('a page the router prefetched shows a list derived from a storage() value written after the prefetch (#876)', async () => {
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

test('a storage() value written in a page shows in a component from another module that reads the same key (#867)', async () => {
	await visit('/shared', async (page) => {
		await page.getByRole('button', { name: 'Add' }).click();
		await expect.poll(() => page.locator('[data-badge]').textContent()).toBe('1');
	});
});

test.fails("live text beside an element in a component's children follows its state (#864)", async () => {
	await visit('/boxed', async (page) => {
		await page.getByRole('button', { name: 'South' }).click();
		await expect.poll(() => page.locator('[data-box]').textContent()).toBe('South▾');
	});
});

test('a state() can start from a storage() value (#870)', { timeout: 240_000 }, async () => {
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

test('a page that reads url.searchParams in an attribute renders (#865)', async () => {
	await visit('/notice?saved=1', async (page) => {
		await page.getByRole('status').waitFor({ state: 'visible' });
	});
});

test.fails(
	'a @for key computed from the row item builds (#872)',
	{ timeout: 240_000 },
	async () => {
		expect(
			(await buildError({
				'index.tsrx': `import { state } from '@markless/core';

export default function Page() @{
	let lines = state([{ id: 'a', size: 's' }, { id: 'a', size: 'm' }]);

	<ul>
		@for (const line of lines; key \`\${line.id}:\${line.size}\`) {
			<li>{line.size}</li>
		}
	</ul>
}
`,
			})) ?? '',
		).not.toContain('MARKLESS_REPEAT_KEY_UNSTABLE');
	},
);

test.fails('<select value> selects its option in the server HTML (#871)', async () => {
	const context = await browser.newContext({ baseURL: app.origin, javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto('/size');
		expect(await page.getByLabel('Size').inputValue()).toBe('m');
	} finally {
		await context.close();
	}
});
