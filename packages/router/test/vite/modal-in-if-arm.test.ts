import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A @markless/ui modal inside an @if arm builds, and works again each time the arm shows it.
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

const pages: Record<string, string> = {
	'index.tsrx': `import { state } from '@markless/core';
import { modal } from '@markless/ui';

export default function Page() @{
	let shown = state(true);

	<main>
		<button type="button" data-testid="toggle" onClick={() => (shown = !shown)}>Toggle</button>
		@if (shown) {
			<modal.root data-testid="root">
				<modal.trigger data-testid="trigger">Delete</modal.trigger>
				<modal.content>
					<modal.title>Delete?</modal.title>
				</modal.content>
			</modal.root>
		}
	</main>
}
`,
	'later.tsrx': `import { state } from '@markless/core';
import { modal as dialog } from '@markless/ui';

export default function Later() @{
	let note = state('');

	<section>
		@if (note !== '') {
			<dialog.root data-testid="root">
				<p>{note}</p>
				<dialog.trigger data-testid="trigger">Discard note</dialog.trigger>
				<dialog.backdrop data-testid="backdrop">
					<dialog.content>
						<dialog.title>Discard?</dialog.title>
						<dialog.close data-testid="close">Keep</dialog.close>
					</dialog.content>
				</dialog.backdrop>
			</dialog.root>
		} @else {
			<em data-testid="empty">No note</em>
		}
		<button type="button" data-testid="write" onClick={() => (note = 'groceries')}>Write</button>
		<button type="button" data-testid="clear" onClick={() => (note = '')}>Clear</button>
	</section>
}
`,
	'pair.tsrx': `import { state } from '@markless/core';
import { modal } from '@markless/ui';

export default function Pair() @{
	let armed = state(false);
	let changes = state(0);

	<article>
		<modal.root data-testid="served-root">
			<modal.trigger data-testid="served-trigger">Settings</modal.trigger>
			<modal.content>
				<modal.title>Settings</modal.title>
			</modal.content>
		</modal.root>
		<output data-testid="changes">{changes}</output>
		<button type="button" data-testid="arm" onClick={() => (armed = !armed)}>Arm</button>
		@if (armed) {
			<modal.root data-testid="armed-root" onChange={() => (changes = changes + 1)}>
				<modal.content>
					<modal.title>Armed</modal.title>
					<modal.close data-testid="armed-close">Done</modal.close>
				</modal.content>
				<modal.trigger data-testid="armed-trigger">Open armed</modal.trigger>
			</modal.root>
		}
	</article>
}
`,
	'nested.tsrx': `import { state } from '@markless/core';
import { modal } from '@markless/ui';

function Confirm({ label }: { readonly label: string }) @{
	let asking = state(false);

	<div>
		<button type="button" data-testid="ask" onClick={() => (asking = !asking)}>{label}</button>
		@if (asking) {
			<modal.root data-testid="nested-root">
				<modal.trigger data-testid="nested-trigger">Really?</modal.trigger>
				<modal.backdrop data-testid="nested-backdrop">
					<modal.content>
						<modal.title>Sure?</modal.title>
						<modal.close data-testid="nested-close">No</modal.close>
					</modal.content>
				</modal.backdrop>
			</modal.root>
		}
	</div>
}

export default function Nested() @{
	<main>
		<h1>Archive</h1>
		<Confirm label="Archive" />
	</main>
}
`,
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-869-'));
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
	await symlink(join(packagesRoot, 'headless/components'), join(root, 'node_modules/@markless/ui'), 'dir');
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

test('an @if arm can hold a modal, and the modal opens after the arm shows it again', async () => {
	await visit('/', async (page) => {
		const trigger = page.getByTestId('trigger');
		await trigger.click();
		await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true');
		await page.getByTestId('toggle').click();
		await expect.poll(() => page.getByTestId('root').count()).toBe(0);
		await page.getByTestId('toggle').click();
		await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false');
		await trigger.click();
		await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true');
		await expect.poll(() => page.getByTestId('root').getAttribute('ui-open')).not.toBeNull();
	});
});

test('a modal an @if first shows in the browser opens and closes, and again after a re-show', async () => {
	await visit('/later', async (page) => {
		await expect.poll(() => page.getByTestId('root').count()).toBe(0);
		for (let round = 0; round < 2; round++) {
			await page.getByTestId('write').click();
			await expect.poll(() => page.getByTestId('empty').count()).toBe(0);
			await expect.poll(() => page.getByTestId('backdrop').isHidden()).toBe(true);
			await page.getByTestId('trigger').click();
			await expect.poll(() => page.getByTestId('backdrop').isVisible()).toBe(true);
			await page.getByTestId('close').click();
			await expect.poll(() => page.getByTestId('backdrop').isHidden()).toBe(true);
			await page.getByTestId('clear').click();
			await expect.poll(() => page.getByTestId('root').count()).toBe(0);
			await expect.poll(() => page.getByTestId('empty').count()).toBe(1);
		}
	});
});

test('a modal an @if shows beside a served modal is its own instance and reports its changes', async () => {
	await visit('/pair', async (page) => {
		const served = page.getByTestId('served-trigger');
		for (let round = 0; round < 2; round++) {
			await page.getByTestId('arm').click();
			const armed = page.getByTestId('armed-trigger');
			await expect.poll(() => armed.getAttribute('aria-expanded')).toBe('false');
			await armed.click();
			await expect.poll(() => armed.getAttribute('aria-expanded')).toBe('true');
			expect(await served.getAttribute('aria-expanded')).toBe('false');
			await page.getByTestId('armed-close').click();
			await expect.poll(() => armed.getAttribute('aria-expanded')).toBe('false');
			await expect.poll(() => page.getByTestId('changes').textContent()).toBe(String(2 * (round + 1)));
			await page.getByTestId('arm').click();
			await expect.poll(() => page.getByTestId('armed-root').count()).toBe(0);
		}
		await served.click();
		await expect.poll(() => served.getAttribute('aria-expanded')).toBe('true');
	});
});

test('a modal in an @if a component of the page holds opens each time the @if shows it', async () => {
	await visit('/nested', async (page) => {
		for (let round = 0; round < 2; round++) {
			await page.getByTestId('ask').click();
			await expect.poll(() => page.getByTestId('nested-backdrop').isHidden()).toBe(true);
			await page.getByTestId('nested-trigger').click();
			await expect.poll(() => page.getByTestId('nested-backdrop').isVisible()).toBe(true);
			await page.getByTestId('nested-close').click();
			await expect.poll(() => page.getByTestId('nested-backdrop').isHidden()).toBe(true);
			await page.getByTestId('ask').click();
			await expect.poll(() => page.getByTestId('nested-root').count()).toBe(0);
		}
	});
});
