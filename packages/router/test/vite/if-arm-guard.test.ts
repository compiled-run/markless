import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// An @if arm stops evaluating its expressions once its condition turns false, so a guard is enough.
const packagesRoot = resolve(import.meta.dirname, '../../..');
let root: string;
let server: BuiltServer;
let browser: Browser;

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
	'profile.tsrx': `import { state } from '@markless/core';

export default function Profile() @{
	let person = state<{ name: { first: string }; age: number } | null>({ name: { first: 'ada' }, age: 36 });

	<article>
		<button onClick={() => (person = null)}>Forget</button>
		@if (!person) {
			<em>Nobody</em>
		} @else {
			<dl data-age={person.age.toFixed(0)}>
				<dt>{person.name.first.charAt(0).toUpperCase()}</dt>
				<dd>{String(person.age + 1)}</dd>
			</dl>
		}
	</article>
}
`,
	'absent.tsrx': `import { state } from '@markless/core';

export default function Absent() @{
	let item = state<{ label: string } | undefined>(undefined);

	<section>
		@if (item) {
			<b>{item.label.toLowerCase()}</b>
		} @else {
			<span>Missing</span>
		}
		<button onClick={() => (item = undefined)}>Clear</button>
	</section>
}
`,
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-863-'));
	const files: Record<string, string> = {
		'package.json': '{ "type": "module" }\n',
		'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
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
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await server?.close();
	await browser?.close();
	if (root) await rm(root, { recursive: true, force: true });
}, 60_000);

async function visit(path: string, run: (page: Page) => Promise<void>) {
	const context = await browser.newContext({ baseURL: server.origin });
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

test('an @if arm does not run its expressions once its condition turns false', async () => {
	await visit('/guarded', async (page) => {
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect.poll(() => page.locator('main').textContent()).toBe('Deleted');
	});
});

test('an @else arm guarded by a negated test stops running its expressions when the test flips', async () => {
	await visit('/profile', async (page) => {
		await expect.poll(() => page.locator('dt').textContent()).toBe('A');
		await page.getByRole('button', { name: 'Forget' }).click();
		await expect.poll(() => page.locator('article').textContent()).toBe('ForgetNobody');
	});
});

test('a page that starts on the other arm renders it on the server and resumes without running the guarded arm', async () => {
	await visit('/absent', async (page) => {
		await expect.poll(() => page.locator('section').textContent()).toBe('MissingClear');
		await page.getByRole('button', { name: 'Clear' }).click();
		await expect.poll(() => page.locator('section').textContent()).toBe('MissingClear');
	});
});

