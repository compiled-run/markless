import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { marklessBuildManifestPath } from '../../../bundler/src/build/build-manifests.ts';
import { MARKLESS_BYTE_ATTRIBUTION } from '../../../bundler/src/build/chunking.ts';
import { clientAssetsManifestPath } from '../../src/vite/client-assets-manifest.ts';
import { buildFixture } from '../support/fixture-build.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
const SUBMIT_HOLD = 'web/submit-hold';
const FORM_SEND = 'web/form-send';

const PAGES = {
	save: [
		'import { state } from "@markless/core";',
		'export default function Save() @{',
		'\tlet saved = state("");',
		'\t<form onSubmit={async (event) => {',
		'\t\tevent.preventDefault();',
		'\t\tconst name = String(new FormData(event.currentTarget as HTMLFormElement).get("name"));',
		'\t\tawait fetch("/save", { method: "POST", body: name });',
		'\t\tsaved = name;',
		'\t}}>',
		'\t\t<input name="name" value="Ada" />',
		'\t\t<button type="submit">Save</button>',
		'\t\t<p>{saved}</p>',
		'\t</form>',
		'}',
	],
	sent: [
		'export default function Sent() @{',
		'\t@try {',
		'\t\t<form method="post" action="/notes"><input name="note" /><button>Send</button></form>',
		'\t} @catch (error) {',
		'\t\t<p>{error.message}</p>',
		'\t}',
		'}',
	],
	fetch: [
		'import { state } from "@markless/core";',
		'export default function Fetch() @{',
		'\tlet answer = state("");',
		'\t<section><button type="button" onClick={async () => {',
		'\t\tconst response = await fetch("/answer");',
		'\t\tanswer = await response.text();',
		'\t}}>Ask</button>',
		'\t<p>{answer}</p></section>',
		'}',
	],
	count: [
		'import { state } from "@markless/core";',
		'export default function Count() @{',
		'\tlet count = state(0);',
		'\t<form onSubmit={(event) => { event.preventDefault(); count += new FormData(event.currentTarget as HTMLFormElement).getAll("n").length; }}>',
		'\t\t<input name="n" value="1" /><button data-count type="submit">Count {count}</button>',
		'\t</form>',
		'}',
	],
} as const;

type App = { readonly root: string; readonly server: BuiltServer };

async function buildApp(pages: ReadonlyArray<keyof typeof PAGES>): Promise<App> {
	const root = await mkdtemp(join(tmpdir(), 'markless-submit-hold-preload-'));
	await mkdir(join(root, 'pages'), { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	for (const page of pages) await writeFile(join(root, `pages/${page}.tsrx`), PAGES[page].join('\n'));
	await buildFixture({ root });
	return { root, server: await startBuiltServer(join(root, '.output/server/index.mjs'), { cwd: root }) };
}

async function closeApp(app: App | undefined): Promise<void> {
	await app?.server.close();
	if (app) await rm(app.root, { recursive: true, force: true });
}

async function buildFacts(app: App) {
	const publicDir = join(app.root, '.output/public');
	const manifest = JSON.parse(await readFile(clientAssetsManifestPath(publicDir), 'utf8')) as {
		readonly routes: { readonly ssr: Record<string, readonly string[]> };
	};
	const attribution = JSON.parse(
		await readFile(marklessBuildManifestPath(publicDir, MARKLESS_BYTE_ATTRIBUTION), 'utf8'),
	) as { readonly chunks: Record<string, { readonly modules: ReadonlyArray<[string, string, number]> }> };
	const runtimeOf = (href: string) =>
		(attribution.chunks[href.split('/').pop()!]?.modules ?? []).flatMap(([category, id]) =>
			category === 'runtime' ? [id] : [],
		);
	return {
		preloads: (page: string) => manifest.routes.ssr[`pages/${page}.tsrx`] ?? [],
		// The runtime modules a route's landing preloads.
		landingRuntime: (page: string) => (manifest.routes.ssr[`pages/${page}.tsrx`] ?? []).flatMap(runtimeOf),
		runtimeOf,
	};
}

// Scripts under /build the page fetched at load, and after `act` when given.
async function fetchedScripts(app: App, page: string, act?: (tab: import('@playwright/test').Page) => Promise<void>) {
	const browser = await launchBrowser(chromium);
	try {
		const tab = await browser.newPage();
		const scripts: string[] = [];
		tab.on('request', (request) => {
			const url = new URL(request.url());
			if (request.resourceType() === 'script' && url.pathname.startsWith('/build/')) scripts.push(url.pathname);
		});
		await tab.goto(`${app.server.origin}/${page}`, { waitUntil: 'networkidle' });
		await act?.(tab);
		await tab.waitForLoadState('networkidle');
		return scripts;
	} finally {
		await browser.close();
	}
}

describe('an app whose forms need the hold', () => {
	let app: App | undefined;
	beforeAll(async () => {
		app = await buildApp(['save', 'sent', 'fetch']);
	}, 240_000);
	afterAll(() => closeApp(app));

	test('a page whose form has an async submit handler preloads the submit hold, so a press waits on no fetch for it', async () => {
		expect((await buildFacts(app!)).landingRuntime('save')).toContain(SUBMIT_HOLD);
	});

	test('a page whose form is sent in place preloads its sender and the hold', async () => {
		expect((await buildFacts(app!)).landingRuntime('sent')).toEqual(expect.arrayContaining([FORM_SEND, SUBMIT_HOLD]));
	});

	test.each(['fetch', 'save', 'sent'])('/%s fetches no script at load that its preload does not name', async (page) => {
		const preloaded = new Set((await buildFacts(app!)).preloads(page));
		expect((await fetchedScripts(app!, page)).filter((script) => !preloaded.has(script))).toEqual([]);
	});
});

describe('an app with no form that needs the hold', () => {
	let app: App | undefined;
	beforeAll(async () => {
		app = await buildApp(['fetch', 'count']);
	}, 240_000);
	afterAll(() => closeApp(app));

	test('/fetch dispatches in full, so it would carry the hold if dispatch alone pulled it in', async () => {
		expect((await buildFacts(app!)).landingRuntime('fetch')).toContain('web/resume-events');
	});

	test.each(['fetch', 'count'])('/%s preloads neither the hold nor the in-place sender', async (page) => {
		const runtime = (await buildFacts(app!)).landingRuntime(page);
		expect(runtime).not.toContain(SUBMIT_HOLD);
		expect(runtime).not.toContain(FORM_SEND);
	});

	test('a submit whose handler returns no promise fetches no script, the hold included', async () => {
		const facts = await buildFacts(app!);
		const preloaded = new Set(facts.preloads('count'));
		const scripts = await fetchedScripts(app!, 'count', async (tab) => {
			await tab.click('[data-count]');
			await expect.poll(() => tab.textContent('[data-count]')).toBe('Count 1');
		});
		expect(scripts.filter((script) => !preloaded.has(script))).toEqual([]);
		expect(scripts.filter((script) => facts.runtimeOf(script).includes(SUBMIT_HOLD))).toEqual([]);
	});
});
