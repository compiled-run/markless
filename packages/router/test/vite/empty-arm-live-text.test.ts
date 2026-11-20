import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// An @empty arm holding live text appears when its list empties and follows its reads while shown.
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
	'roster.tsrx': `import { state } from '@markless/core';

export default function Roster() @{
	let members = state<string[]>(['Ada']);
	let team = state('Blue');

	<section>
		<button onClick={() => (members = [])}>Clear</button>
		<button onClick={() => (team = 'Red')}>Red</button>
		<button onClick={() => (members = ['Grace'])}>Add</button>
		<table>
			<tbody>
				@for (const member of members; key member) {
					<tr><td>{member}</td></tr>
				} @empty {
					<tr data-team={team}><td>Nobody on {team} yet</td></tr>
				}
			</tbody>
		</table>
	</section>
}
`,
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-868-'));
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

test('@empty with live text shows when a filtered list goes from some rows to none', async () => {
	await visit('/empty', async (page) => {
		await page.getByLabel('Search').fill('zzz');
		await expect.poll(() => page.locator('li').allTextContents()).toEqual(['No match for zzz']);
	});
});

test('rows keep their own text while the query that would fill @empty changes', async () => {
	await visit('/empty', async (page) => {
		await page.getByLabel('Search').fill('a');
		await expect.poll(() => page.locator('li').allTextContents()).toEqual(['apple', 'banana']);
	});
});

test('an @empty arm follows its live text and attribute while shown, and comes back current after rows return', async () => {
	await visit('/roster', async (page) => {
		const cells = () => page.locator('td').allTextContents();
		await page.getByRole('button', { name: 'Clear' }).click();
		await expect.poll(cells).toEqual(['Nobody on Blue yet']);
		await page.getByRole('button', { name: 'Red' }).click();
		await expect.poll(cells).toEqual(['Nobody on Red yet']);
		await expect.poll(() => page.locator('tr').getAttribute('data-team')).toBe('Red');
		await page.getByRole('button', { name: 'Add' }).click();
		await expect.poll(cells).toEqual(['Grace']);
		await page.getByRole('button', { name: 'Clear' }).click();
		await expect.poll(cells).toEqual(['Nobody on Red yet']);
	});
});
