import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A page rendered with the starting value, opened where localStorage holds another one: every spot
// derived from the saved value shows it with no interaction, not only the spots that print it.
const packagesRoot = resolve(import.meta.dirname, '../../..');
let root: string;
let browser: Browser;
let app: BuiltServer;

const derivedMarkup = (direct: string) => `
	let taps = state(0);
	let mood = storage('mood', 'calm');
	const loud = computed(() => mood.toUpperCase());
	const parts = computed(() => mood.split('-'));

	<main data-mood={words.cheerful(mood)}>
		<button type="button" onClick={() => (taps += 1)}>Tap</button>
		<p data-fn>{words.say(mood, taps)}</p>
		<p data-computed>{loud}</p>
		@if (mood === 'calm') {
			<em data-calm>Calm</em>
		} @else {
			<strong data-other>Not calm</strong>
		}
		<ul>
			@for (const part of parts; key part) {
				<li>{part}</li>
			}
		</ul>
		<Badge mood={mood} />${direct}
	</main>
`;

const derivedPage = (name: string, direct = '') => `import { computed, state, storage } from '@markless/core';
import Badge from '../src/badge.tsrx';
import * as words from '../src/words.ts';

export default function ${name}() @{${derivedMarkup(direct)}}
`;

// Each derived spot alone on its page, so no other spot's wiring can wake it.
const alone: Record<string, string> = {
	fn: '<p data-spot>{words.say(mood, taps)}</p>',
	computed: '<p data-spot>{loud}</p>',
	attribute: '<p data-spot={words.cheerful(mood)}>{taps}</p>',
	if: "@if (mood === 'calm') { <em>Calm</em> } @else { <strong>Not calm</strong> }",
	for: '<ul>@for (const part of parts; key part) { <li>{part}</li> }</ul>',
	prop: '<Badge mood={mood} />',
};

const files: Record<string, string> = {
	'package.json': '{ "type": "module" }\n',
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
	'src/words.ts': `export const cheerful = (mood: string) => String(mood.startsWith('happy'));

export const say = (mood: string, taps: number) =>
	\`\${mood.startsWith('happy') ? 'Feeling happy' : 'Feeling calm'} after \${taps} taps\`;
`,
	'src/badge.tsrx': `export default function Badge({ mood }: { readonly mood: string }) @{
	<b data-badge>{mood}</b>
}
`,
	'src/left.tsrx': `import { storage } from '@markless/core';
import * as words from './words.ts';

export default function Left() @{
	let mood = storage('mood', 'calm');
	<p data-left>{words.say(mood, 0)}</p>
}
`,
	'src/right.tsrx': `import { computed, storage } from '@markless/core';

export default function Right() @{
	let mood = storage('mood', 'calm');
	const loud = computed(() => mood.toUpperCase());
	<p data-right>{loud}</p>
}
`,
	'pages/derived.tsrx': derivedPage('Derived'),
	'pages/direct.tsrx': derivedPage('Direct', '\n\t\t<output data-direct>{mood}</output>'),
	...Object.fromEntries(
		Object.entries(alone).map(([name, markup]) => [
			`pages/alone/${name}.tsrx`,
			`import { computed, state, storage } from '@markless/core';
import Badge from '../../src/badge.tsrx';
import * as words from '../../src/words.ts';

export default function Alone() @{
	let taps = state(0);
	let mood = storage('mood', 'calm');
	const loud = computed(() => mood.toUpperCase());
	const parts = computed(() => mood.split('-'));

	<main>
		<button type="button" onClick={() => (taps += 1)}>Tap</button>
		${markup}
	</main>
}
`,
		]),
	),
	'pages/shared.tsrx': `import Left from '../src/left.tsrx';
import Right from '../src/right.tsrx';

export default function Shared() @{
	<main>
		<Left />
		<Right />
	</main>
}
`,
};

beforeAll(async () => {
	browser = await launchBrowser(chromium);
	root = await mkdtemp(join(tmpdir(), 'markless-storage-derived-'));
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
		await buildFixture({
			root,
			nitro: {
				routeRules: Object.fromEntries(
					['/derived', '/shared', ...Object.keys(alone).map((name) => `/alone/${name}`)].map(
						(path) => [path, { prerender: true }],
					),
				),
			},
		});
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

// Saves `saved` in localStorage only, so the page is served with the starting value, then reloads without touching it.
async function reloadWithSaved(
	path: string,
	saved: string | undefined,
	run: (page: Page, ranModules: () => Promise<string[]>) => Promise<void>,
) {
	const context = await browser.newContext({ baseURL: app.origin });
	try {
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		if (saved !== undefined) await page.evaluate((value) => localStorage.setItem('mood', value), saved);
		await context.clearCookies();
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		await page.reload();
		await page.waitForLoadState('networkidle');
		// The bundled modules with any function that ran, once the page has been idle twice.
		const ranModules = async () => {
			for (let idle = 0; idle < 2; idle++)
				await page.evaluate(() => new Promise((done) => requestIdleCallback(() => done(undefined))));
			return (await page.coverage.stopJSCoverage())
				.filter(
					(entry) =>
						new URL(entry.url, app.origin).pathname.startsWith('/build/') &&
						entry.functions.some((fn) => fn.ranges[0]!.count > 0),
				)
				.map((entry) => new URL(entry.url).pathname)
				.sort();
		};
		await run(page, ranModules);
		expect(errors).toEqual([]);
	} finally {
		await context.close();
	}
}

const text = (page: Page, selector: string) => page.locator(selector).textContent();

async function expectEveryDerivedSpot(page: Page) {
	await expect.poll(() => text(page, '[data-fn]')).toBe('Feeling happy after 0 taps');
	await expect.poll(() => text(page, '[data-computed]')).toBe('HAPPY-SUNNY');
	await expect.poll(() => page.locator('main').getAttribute('data-mood')).toBe('true');
	await expect.poll(() => page.locator('[data-other]').count()).toBe(1);
	await expect.poll(() => page.locator('[data-calm]').count()).toBe(0);
	await expect.poll(() => page.locator('li').allTextContents()).toEqual(['happy', 'sunny']);
	await expect.poll(() => text(page, '[data-badge]')).toBe('happy-sunny');
}

test('a prerendered page shows the saved value in every derived spot when nothing prints it directly', async () => {
	await reloadWithSaved('/derived', 'happy-sunny', expectEveryDerivedSpot);
});

const aloneSpots: Record<string, (page: Page) => Promise<unknown>> = {
	fn: (page) => text(page, '[data-spot]'),
	computed: (page) => text(page, '[data-spot]'),
	attribute: (page) => page.locator('[data-spot]').getAttribute('data-spot'),
	if: (page) => page.locator('main em, main strong').allTextContents(),
	for: (page) => page.locator('li').allTextContents(),
	prop: (page) => text(page, '[data-badge]'),
};
const aloneSaved: Record<string, unknown> = {
	fn: 'Feeling happy after 0 taps',
	computed: 'HAPPY-SUNNY',
	attribute: 'true',
	if: ['Not calm'],
	for: ['happy', 'sunny'],
	prop: 'happy-sunny',
};

for (const [name, read] of Object.entries(aloneSpots))
	test(`a page whose only spot is a ${name} over the saved value shows it after a reload`, async () => {
		await reloadWithSaved(`/alone/${name}`, 'happy-sunny', async (page) => {
			await expect.poll(() => read(page)).toEqual(aloneSaved[name]);
		});
	});

test('a page served with the starting value shows the saved value in its direct and derived spots', async () => {
	await reloadWithSaved('/direct', 'happy-sunny', async (page) => {
		await expect.poll(() => text(page, '[data-direct]')).toBe('happy-sunny');
		await expectEveryDerivedSpot(page);
	});
});

test('two components that share one storage() key both show their derived spots from the saved value', async () => {
	await reloadWithSaved('/shared', 'happy-sunny', async (page) => {
		await expect.poll(() => text(page, '[data-left]')).toBe('Feeling happy after 0 taps');
		await expect.poll(() => text(page, '[data-right]')).toBe('HAPPY-SUNNY');
	});
});

test('a page runs no bundled code on load when nothing is saved or the saved value is the starting one', async () => {
	await reloadWithSaved('/derived', undefined, async (_page, ranModules) => {
		expect(await ranModules()).toEqual([]);
	});
	await reloadWithSaved('/derived', 'calm', async (page, ranModules) => {
		expect(await ranModules()).toEqual([]);
		expect(await text(page, '[data-fn]')).toBe('Feeling calm after 0 taps');
		expect(await page.locator('[data-calm]').count()).toBe(1);
	});
	await reloadWithSaved('/derived', 'happy-sunny', async (page, ranModules) => {
		await expect.poll(() => text(page, '[data-fn]')).toBe('Feeling happy after 0 taps');
		expect(await ranModules()).not.toEqual([]);
	});
});
