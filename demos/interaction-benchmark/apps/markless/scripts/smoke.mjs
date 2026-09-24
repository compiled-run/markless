// Contract smoke for demos/interaction-benchmark/CONTRACT.md: every measured and correctness-only case, with trusted Playwright input.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appDir, '../../../..');
const port = Number(process.env.PORT ?? 4410);
const origin = `http://127.0.0.1:${port}`;
const TIMEOUT = 5000;

// playwright is not a root dependency; load the copy pnpm already installed for the repo.
const pnpmStore = join(repoRoot, 'node_modules/.pnpm');
const playwrightDir = readdirSync(pnpmStore).find((name) => /^playwright@\d/.test(name));
if (!playwrightDir) throw new Error(`playwright not found under ${pnpmStore}`);
const { chromium } = await import(
	pathToFileURL(join(pnpmStore, playwrightDir, 'node_modules/playwright/index.mjs')).href
);

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
	cwd: appDir,
	env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
	stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => (serverLog += chunk));
server.stderr.on('data', (chunk) => (serverLog += chunk));

const results = [];
function record(id, ok, detail = '') {
	results.push({ id, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` - ${detail}` : ''}`);
}

async function waitForServer() {
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			const response = await fetch(`${origin}/`);
			if (response.ok) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`server did not start on ${origin}\n${serverLog}`);
}

const byTestId = (id) => `[data-testid="${id}"]`;

async function open(browser, path, phase) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const settingsRequests = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/settings') settingsRequests.push(request);
	});
	if (phase === 'early') {
		await page.goto(`${origin}${path}`, { waitUntil: 'commit' });
	} else {
		await page.goto(`${origin}${path}`, { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);
	}
	return { context, page, errors, settingsRequests };
}

// Polls a DOM predicate; resolves to the last observed snapshot so failures report what was seen.
async function expectDom(page, predicate, arg) {
	try {
		await page.waitForFunction(predicate, arg, { timeout: TIMEOUT });
		return { ok: true };
	} catch {
		return { ok: false };
	}
}

const text = (page, id) => page.locator(byTestId(id)).first().textContent({ timeout: TIMEOUT }).catch(() => null);
const attr = (page, id, name) =>
	page.locator(byTestId(id)).first().getAttribute(name, { timeout: TIMEOUT }).catch(() => null);
const focusedTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const selectAll = (page) => page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
const rowIds = (page) =>
	page.evaluate(() => [...document.querySelectorAll('[data-testid="record-row"]')].map((row) => row.dataset.id));
const rowLocator = (page, id, testid) => page.locator(`[data-testid="record-row"][data-id="${id}"] ${byTestId(testid)}`);

async function runCase(browser, id, path, phases, body) {
	for (const phase of phases) {
		const label = phases.length > 1 ? `${id} [${phase}]` : id;
		const session = await open(browser, path, phase);
		try {
			const detail = await body(session.page, session);
			const failures = detail.filter((entry) => !entry.ok);
			if (session.errors.length) failures.push({ what: `page errors: ${session.errors.join('; ')}` });
			record(label, failures.length === 0, failures.map((entry) => entry.what).join('; '));
		} catch (error) {
			record(label, false, `threw: ${error.message.split('\n')[0]}`);
		} finally {
			await session.context.close();
		}
	}
}

const check = (ok, what) => ({ ok: Boolean(ok), what });

let browser;
try {
	await waitForServer();

	// Raw SSR HTML: identity, document basics, route content present before any script runs.
	for (const [path, title] of [
		['/', 'Overview'],
		['/records', 'Records'],
		['/settings', 'Settings'],
	]) {
		const response = await fetch(`${origin}${path}`);
		const html = await response.text();
		const failures = [];
		if (response.status !== 200) failures.push(`status ${response.status}`);
		if (!/<html lang="en"/.test(html)) failures.push('html lang');
		if (!/<meta charset="utf-8"/.test(html)) failures.push('charset');
		if (!html.includes('<meta name="viewport" content="width=device-width, initial-scale=1"')) failures.push('viewport');
		if (!html.includes('<meta name="benchmark:entrant" content="markless"')) failures.push('entrant meta');
		if (!/<meta name="benchmark:build" content="[^"]+"/.test(html)) failures.push('build meta');
		if (!html.includes(`<title>${title} | Interaction benchmark</title>`)) failures.push('title');
		if (!new RegExp(`data-testid="page-title"[^>]*>${title}<`).test(html)) failures.push('page-title');
		if (path === '/records' && (html.match(/data-testid="record-row"/g) ?? []).length !== 200) failures.push('200 SSR rows');
		record(`ssr-html ${path}`, failures.length === 0, failures.join(', '));
	}

	// POST /api/settings server behavior (5.1).
	{
		const failures = [];
		const started = Date.now();
		const ok = await fetch(`${origin}/api/settings`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' }),
		});
		const elapsed = Date.now() - started;
		const okBody = await ok.json();
		if (ok.status !== 200 || okBody.message !== 'Saved Ada Lovelace, total $25.00') failures.push(`200 path ${ok.status}`);
		if (elapsed < 300) failures.push(`delay ${elapsed}ms`);
		if (!ok.headers.get('content-type')?.startsWith('application/json')) failures.push('content-type');
		if (ok.headers.get('cache-control') !== 'no-store') failures.push(`cache-control ${ok.headers.get('cache-control')}`);
		const rejected = await fetch(`${origin}/api/settings`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: ' FAIL ', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' }),
		});
		const rejectedBody = await rejected.json();
		if (rejected.status !== 422 || rejectedBody.error !== 'The server rejected this display name.') failures.push(`422 path ${rejected.status}`);
		const garbage = await fetch(`${origin}/api/settings`, { method: 'POST', body: '{nope' });
		if (garbage.status !== 400) failures.push(`unparseable body ${garbage.status}`);
		const get = await fetch(`${origin}/api/settings`);
		if (get.status !== 405) failures.push(`GET ${get.status}`);
		record('api-settings', failures.length === 0, failures.join(', '));
	}

	browser = await chromium.launch();

	// Client JS per route on initial load (settled), gzip via zlib.
	const bytes = {};
	for (const path of ['/', '/records', '/settings']) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const scripts = new Map();
		page.on('response', async (response) => {
			if (response.request().resourceType() !== 'script') return;
			try {
				const body = await response.body();
				scripts.set(response.url(), { raw: body.length, gzip: gzipSync(body).length });
			} catch {}
		});
		await page.goto(`${origin}${path}`, { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);
		const entries = [...scripts.values()];
		bytes[path] = {
			scripts: entries.length,
			raw: entries.reduce((sum, entry) => sum + entry.raw, 0),
			gzip: entries.reduce((sum, entry) => sum + entry.gzip, 0),
		};
		console.log(`INFO ${path} load: ${bytes[path].scripts} scripts, ${bytes[path].raw} B raw, ${bytes[path].gzip} B gzip`);
		await context.close();
	}

	await runCase(browser, 'layout-and-nav-attributes', '/records', ['settled'], async (page) => [
		check((await attr(page, 'nav-records', 'aria-current')) === 'page', 'nav-records aria-current'),
		check((await attr(page, 'nav-overview', 'aria-current')) === null, 'nav-overview has no aria-current'),
		check((await attr(page, 'nav-settings', 'href')) === '/settings', 'nav-settings href'),
		check((await page.title()) === 'Records | Interaction benchmark', `title ${await page.title()}`),
		check((await attr(page, 'disclosure-guides', 'aria-expanded')) === 'false', 'guides collapsed'),
		check(!(await page.locator(byTestId('disclosure-panel-guides')).isVisible()), 'guides panel hidden'),
		check((await attr(page, 'disclosure-guides', 'aria-controls')) === 'disclosure-panel-guides', 'aria-controls'),
	]);

	await runCase(browser, 'overview-counter-first', '/', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('counter-increment')).click();
		const done = await expectDom(page, () => document.querySelector('[data-testid="counter-value"]')?.textContent === '1');
		return [check(done.ok, `counter-value "${await text(page, 'counter-value')}"`)];
	});

	await runCase(browser, 'overview-counter-repeat-x10', '/', ['early', 'settled'], async (page) => {
		const button = page.locator(byTestId('counter-increment'));
		await button.waitFor({ state: 'visible' });
		const box = await button.boundingBox();
		for (let i = 0; i < 10; i++) void page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		const done = await expectDom(page, () => document.querySelector('[data-testid="counter-value"]')?.textContent === '10');
		await page.waitForTimeout(300);
		return [check(done.ok && (await text(page, 'counter-value')) === '10', `counter-value "${await text(page, 'counter-value')}"`)];
	});

	await runCase(browser, 'counter-keyboard-enter-space', '/', ['settled'], async (page) => {
		await page.locator(byTestId('counter-increment')).focus();
		await page.keyboard.press('Enter');
		await page.keyboard.press('Space');
		const done = await expectDom(page, () => document.querySelector('[data-testid="counter-value"]')?.textContent === '2');
		return [check(done.ok, `counter-value "${await text(page, 'counter-value')}"`)];
	});

	await runCase(browser, 'overview-independent-panel', '/', ['settled'], async (page) => {
		await page.locator(byTestId('counter-increment')).click();
		await expectDom(page, () => document.querySelector('[data-testid="counter-value"]')?.textContent === '1');
		await page.locator(byTestId('stepper-increment')).click();
		const done = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="stepper-value"]')?.textContent === '6' &&
				document.querySelector('[data-testid="stepper-derived"]')?.textContent === 'Squared: 36',
		);
		return [
			check(done.ok, `stepper "${await text(page, 'stepper-value')}" / "${await text(page, 'stepper-derived')}"`),
			check((await text(page, 'counter-value')) === '1', 'counter still 1'),
			check((await text(page, 'toggle-status')) === 'Off', 'toggle still Off'),
		];
	});

	await runCase(browser, 'stepper-bounds', '/', ['settled'], async (page) => {
		for (let i = 0; i < 5; i++) await page.locator(byTestId('stepper-increment')).click();
		const atMax = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="stepper-value"]')?.textContent === '10' &&
				document.querySelector('[data-testid="stepper-increment"]')?.disabled === true,
		);
		for (let i = 0; i < 10; i++) await page.locator(byTestId('stepper-decrement')).click();
		const atMin = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="stepper-value"]')?.textContent === '0' &&
				document.querySelector('[data-testid="stepper-decrement"]')?.disabled === true,
		);
		return [check(atMax.ok, 'max 10 disables increment'), check(atMin.ok, `min 0 disables decrement ("${await text(page, 'stepper-value')}")`)];
	});

	await runCase(browser, 'overview-toggle', '/', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('toggle-button')).focus();
		await page.keyboard.press('Space');
		const done = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="toggle-button"]')?.getAttribute('aria-pressed') === 'true' &&
				document.querySelector('[data-testid="toggle-status"]')?.textContent === 'On',
		);
		return [check(done.ok, `aria-pressed ${await attr(page, 'toggle-button', 'aria-pressed')}, status "${await text(page, 'toggle-status')}"`)];
	});

	await runCase(browser, 'overview-disclosure', '/', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('disclosure-guides')).click();
		const done = await expectDom(
			page,
			() => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute('aria-expanded') === 'true',
		);
		const leafVisible = await page.locator(byTestId('tree-leaf-getting-started')).isVisible();
		return [check(done.ok, `aria-expanded ${await attr(page, 'disclosure-guides', 'aria-expanded')}`), check(leafVisible, 'getting-started visible')];
	});

	await runCase(browser, 'overview-disclosure-nested', '/', ['settled'], async (page) => {
		await page.locator(byTestId('disclosure-guides')).click();
		const opened = await expectDom(
			page,
			() => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute('aria-expanded') === 'true',
		);
		if (!opened.ok) return [check(false, 'guides did not open (precondition)')];
		await page.locator(byTestId('disclosure-advanced')).click();
		const done = await expectDom(
			page,
			() => document.querySelector('[data-testid="disclosure-advanced"]')?.getAttribute('aria-expanded') === 'true',
		);
		const out = [
			check(done.ok, 'advanced expanded'),
			check(await page.locator(byTestId('tree-leaf-caching')).isVisible(), 'caching visible'),
			check(await page.locator(byTestId('tree-leaf-streaming')).isVisible(), 'streaming visible'),
		];
		await page.locator(byTestId('disclosure-guides')).click();
		await page.locator(byTestId('disclosure-guides')).click();
		const kept = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute('aria-expanded') === 'true' &&
				document.querySelector('[data-testid="disclosure-advanced"]')?.getAttribute('aria-expanded') === 'true' &&
				document.querySelector('[data-testid="tree-leaf-caching"]')?.checkVisibility() === true,
		);
		out.push(check(kept.ok, 'nested state kept across parent collapse'));
		return out;
	});

	await runCase(browser, 'overview-tab', '/', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('tab-activity')).click();
		const done = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="tab-activity"]')?.getAttribute('aria-selected') === 'true' &&
				document.querySelector('[data-testid="tab-summary"]')?.getAttribute('aria-selected') === 'false' &&
				document.querySelector('[data-testid="tab-panel"]')?.textContent === 'Activity: 12 updates in the last 24 hours.',
		);
		return [check(done.ok, `panel "${await text(page, 'tab-panel')}"`)];
	});

	await runCase(browser, 'tabs-keyboard', '/', ['settled'], async (page) => {
		const out = [];
		await page.locator(byTestId('tab-summary')).focus();
		const steps = [
			['ArrowRight', 'activity'],
			['ArrowRight', 'notes'],
			['ArrowRight', 'summary'],
			['ArrowLeft', 'notes'],
			['Home', 'summary'],
			['End', 'notes'],
		];
		for (const [key, expected] of steps) {
			await page.keyboard.press(key);
			const done = await expectDom(
				page,
				(tab) =>
					document.querySelector(`[data-testid="tab-${tab}"]`)?.getAttribute('aria-selected') === 'true' &&
					document.activeElement?.getAttribute('data-testid') === `tab-${tab}`,
				expected,
			);
			out.push(check(done.ok, `${key} -> ${expected} (focus ${await focusedTestId(page)})`));
		}
		out.push(check((await attr(page, 'tab-notes', 'tabindex')) === '0', 'selected tabindex 0'));
		out.push(check((await attr(page, 'tab-summary', 'tabindex')) === '-1', 'unselected tabindex -1'));
		out.push(check((await attr(page, 'tab-panel', 'aria-labelledby')) === 'tab-notes', 'panel aria-labelledby'));
		return out;
	});

	await runCase(browser, 'overview-filter', '/', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('filter-input')).click();
		await page.keyboard.insertText('berry');
		const done = await expectDom(page, () => {
			const items = [...document.querySelectorAll('[data-testid="filter-item"]')].map((item) => item.textContent);
			return (
				document.querySelector('[data-testid="filter-count"]')?.textContent === '2 items' &&
				items.join(',') === 'Blueberry,Elderberry'
			);
		});
		return [check(done.ok, `count "${await text(page, 'filter-count')}"`)];
	});

	await runCase(browser, 'filter-empty', '/', ['settled'], async (page) => {
		await page.locator(byTestId('filter-input')).click();
		await page.keyboard.insertText('zzz');
		const done = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="filter-count"]')?.textContent === '0 items' &&
				document.querySelectorAll('[data-testid="filter-item"]').length === 0 &&
				document.querySelector('[data-testid="filter-empty"]')?.textContent === 'No matching items',
		);
		return [check(done.ok, `count "${await text(page, 'filter-count')}"`)];
	});

	await runCase(browser, 'records-search', '/records', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('records-search')).click();
		await page.keyboard.insertText('knuth');
		const done = await expectDom(page, () => {
			const rows = document.querySelectorAll('[data-testid="record-row"]');
			return (
				document.querySelector('[data-testid="records-count"]')?.textContent === 'Showing 15 of 200' &&
				rows.length === 15 &&
				rows[0]?.getAttribute('data-id') === 'r016'
			);
		});
		return [check(done.ok, `count "${await text(page, 'records-count')}", rows ${(await rowIds(page)).length}`)];
	});

	await runCase(browser, 'records-empty', '/records', ['settled'], async (page) => {
		await page.locator(byTestId('records-search')).click();
		await page.keyboard.insertText('no-such-record');
		const done = await expectDom(
			page,
			() =>
				document.querySelectorAll('[data-testid="record-row"]').length === 0 &&
				document.querySelector('[data-testid="records-empty"]')?.textContent === 'No records match' &&
				document.querySelector('[data-testid="records-empty"]')?.getAttribute('colspan') === '7',
		);
		return [check(done.ok, `rows ${(await rowIds(page)).length}`)];
	});

	await runCase(browser, 'records-sort', '/records', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('sort-score')).click();
		const done = await expectDom(page, () => {
			const rows = [...document.querySelectorAll('[data-testid="record-row"]')];
			return (
				document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'ascending' &&
				rows[0]?.getAttribute('data-id') === 'r004' &&
				rows.at(-1)?.getAttribute('data-id') === 'r147'
			);
		});
		const ids = await rowIds(page);
		return [check(done.ok, `first ${ids[0]} last ${ids.at(-1)}`)];
	});

	await runCase(browser, 'records-sort-toggle', '/records', ['settled'], async (page) => {
		await page.locator(byTestId('sort-score')).click();
		await expectDom(page, () => document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r004');
		await page.locator(byTestId('sort-score')).click();
		const descending = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'descending' &&
				document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r147',
		);
		await page.locator(byTestId('sort-name')).click();
		const byName = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r028' &&
				document.querySelector('[data-testid="sort-name"]')?.closest('th')?.getAttribute('aria-sort') === 'ascending' &&
				document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'none',
		);
		return [check(descending.ok, 'score descending first r147'), check(byName.ok, `name ascending first r028 (got ${(await rowIds(page))[0]})`)];
	});

	await runCase(browser, 'records-select', '/records', ['early', 'settled'], async (page) => {
		await rowLocator(page, 'r003', 'record-select').click();
		const done = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="record-row"][data-id="r003"] [data-testid="record-select"]')?.checked === true &&
				document.querySelector('[data-testid="selection-summary"]')?.textContent === '1 selected',
		);
		return [check(done.ok, `summary "${await text(page, 'selection-summary')}"`)];
	});

	await runCase(browser, 'records-selection-survives-search-sort', '/records', ['settled'], async (page) => {
		await rowLocator(page, 'r016', 'record-select').click();
		await page.locator(byTestId('records-search')).click();
		await page.keyboard.insertText('knuth');
		await page.locator(byTestId('sort-score')).click();
		await rowLocator(page, 'r016', 'record-select').waitFor({ timeout: TIMEOUT }).catch(() => {});
		const checked = await rowLocator(page, 'r016', 'record-select').isChecked().catch(() => false);
		await page.locator(byTestId('records-search')).click();
		await selectAll(page);
		await page.keyboard.insertText('zzzz');
		const hidden = await expectDom(page, () => document.querySelector('[data-testid="selection-summary"]')?.textContent === '1 selected');
		return [check(checked, 'r016 still checked after search + sort'), check(hidden.ok, 'hidden selection still counted')];
	});

	await runCase(browser, 'records-dialog-open', '/records', ['early', 'settled'], async (page) => {
		await rowLocator(page, 'r001', 'record-edit').click();
		const done = await expectDom(page, () => {
			const input = document.querySelector('[data-testid="edit-name"]');
			const dialog = document.querySelector('[data-testid="edit-dialog"]');
			return dialog?.checkVisibility() && input?.value === 'Katherine Hopper' && document.activeElement === input;
		});
		return [check(done.ok, `edit-name "${await page.locator(byTestId('edit-name')).inputValue().catch(() => null)}", focus ${await focusedTestId(page)}`)];
	});

	await runCase(browser, 'records-dialog-save', '/records', ['settled'], async (page) => {
		await rowLocator(page, 'r003', 'record-select').click();
		await rowLocator(page, 'r001', 'record-edit').click();
		await page.locator(byTestId('edit-name')).waitFor({ state: 'visible', timeout: TIMEOUT });
		await selectAll(page);
		await page.keyboard.insertText('Renamed Record');
		await page.locator(byTestId('edit-save')).click();
		const done = await expectDom(
			page,
			() =>
				!document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
				document.querySelector('[data-testid="record-row"][data-id="r001"] [data-testid="record-name"]')?.textContent === 'Renamed Record' &&
				document.querySelector('[data-testid="selection-summary"]')?.textContent === '1 selected' &&
				document.activeElement === document.querySelector('[data-testid="record-row"][data-id="r001"] [data-testid="record-edit"]'),
		);
		const label = await rowLocator(page, 'r001', 'record-edit').getAttribute('aria-label');
		return [
			check(done.ok, `name "${await rowLocator(page, 'r001', 'record-name').textContent()}", focus ${await focusedTestId(page)}`),
			check(label === 'Edit Renamed Record', `aria-label ${label}`),
		];
	});

	await runCase(browser, 'records-dialog-save-disabled-when-empty', '/records', ['settled'], async (page) => {
		await rowLocator(page, 'r001', 'record-edit').click();
		await page.locator(byTestId('edit-name')).waitFor({ state: 'visible', timeout: TIMEOUT });
		await selectAll(page);
		await page.keyboard.insertText('   ');
		const done = await expectDom(page, () => document.querySelector('[data-testid="edit-save"]')?.disabled === true);
		return [check(done.ok, 'edit-save disabled for blank name')];
	});

	await runCase(browser, 'records-dialog-sorted-rename', '/records', ['settled'], async (page) => {
		await page.locator(byTestId('sort-name')).click();
		await expectDom(page, () => document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r028');
		await rowLocator(page, 'r001', 'record-edit').click();
		await page.locator(byTestId('edit-name')).waitFor({ state: 'visible', timeout: TIMEOUT });
		await selectAll(page);
		await page.keyboard.insertText('AAA First');
		await page.keyboard.press('Enter');
		const done = await expectDom(page, () => document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r001');
		return [check(done.ok, `first row after rename ${(await rowIds(page))[0]}`)];
	});

	await runCase(browser, 'records-dialog-cancel', '/records', ['settled'], async (page) => {
		await rowLocator(page, 'r002', 'record-edit').click();
		await page.locator(byTestId('edit-name')).waitFor({ state: 'visible', timeout: TIMEOUT });
		await page.keyboard.press('Escape');
		const done = await expectDom(
			page,
			() =>
				!document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
				document.querySelector('[data-testid="record-row"][data-id="r002"] [data-testid="record-name"]')?.textContent === 'Hedy Floyd' &&
				document.activeElement === document.querySelector('[data-testid="record-row"][data-id="r002"] [data-testid="record-edit"]'),
		);
		const out = [check(done.ok, `focus ${await focusedTestId(page)}`)];
		await rowLocator(page, 'r002', 'record-edit').click();
		await page.locator(byTestId('edit-cancel')).click();
		const cancel = await expectDom(
			page,
			() =>
				!document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
				document.activeElement === document.querySelector('[data-testid="record-row"][data-id="r002"] [data-testid="record-edit"]'),
		);
		out.push(check(cancel.ok, 'edit-cancel closes and returns focus'));
		return out;
	});

	await runCase(browser, 'settings-derived', '/settings', ['early', 'settled'], async (page) => {
		await page.locator(byTestId('settings-quantity')).click();
		await selectAll(page);
		await page.keyboard.insertText('3');
		const done = await expectDom(page, () => document.querySelector('[data-testid="settings-total"]')?.textContent === 'Total: $37.50');
		return [check(done.ok, `total "${await text(page, 'settings-total')}"`)];
	});

	await runCase(browser, 'settings-total-invalid', '/settings', ['settled'], async (page) => {
		await page.locator(byTestId('settings-unit-price')).click();
		await selectAll(page);
		await page.keyboard.insertText('1.234');
		const done = await expectDom(page, () => document.querySelector('[data-testid="settings-total"]')?.textContent === 'Total: n/a');
		return [
			check(done.ok, `total "${await text(page, 'settings-total')}"`),
			check((await page.locator(byTestId('settings-unit-price-error')).count()) === 0, 'errors hidden before first submit'),
		];
	});

	await runCase(browser, 'settings-submit', '/settings', ['settled'], async (page, session) => {
		await page.locator(byTestId('settings-submit')).click();
		const pending = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saving…' &&
				document.querySelector('[data-testid="settings-submit"]')?.disabled === true &&
				document.querySelector('[data-testid="settings-submit"]')?.textContent.trim() === 'Saving…',
		);
		const result = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saved Ada Lovelace, total $25.00' &&
				document.querySelector('[data-testid="settings-submit"]')?.disabled === false &&
				document.querySelector('[data-testid="settings-submit"]')?.textContent.trim() === 'Save',
		);
		const request = session.settingsRequests[0];
		return [
			check(pending.ok, 'pending UI'),
			check(result.ok, `status "${await text(page, 'settings-status')}"`),
			check(session.settingsRequests.length === 1, `${session.settingsRequests.length} request(s)`),
			check(request?.method() === 'POST' && request?.headers()['content-type'] === 'application/json', 'POST json'),
			check(
				request?.postData() === JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' }),
				`body ${request?.postData()}`,
			),
		];
	});

	await runCase(browser, 'settings-submit-error', '/settings', ['settled'], async (page) => {
		await page.locator(byTestId('settings-name')).click();
		await selectAll(page);
		await page.keyboard.insertText('fail');
		await page.locator(byTestId('settings-submit')).click();
		const pending = await expectDom(page, () => document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saving…');
		const result = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="settings-error"]')?.textContent === 'The server rejected this display name.' &&
				document.querySelector('[data-testid="settings-error"]')?.getAttribute('role') === 'alert' &&
				document.querySelector('[data-testid="settings-status"]')?.textContent === '' &&
				document.querySelector('[data-testid="settings-submit"]')?.disabled === false,
		);
		return [check(pending.ok, 'pending UI'), check(result.ok, `error "${await text(page, 'settings-error')}"`)];
	});

	await runCase(browser, 'settings-network-error', '/settings', ['settled'], async (page) => {
		await page.route('**/api/settings', (route) => route.abort());
		await page.locator(byTestId('settings-submit')).click();
		const result = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="settings-error"]')?.textContent === 'Request failed.' &&
				document.querySelector('[data-testid="settings-status"]')?.textContent === '',
		);
		return [check(result.ok, `error "${await text(page, 'settings-error')}"`)];
	});

	await runCase(browser, 'settings-validation', '/settings', ['settled'], async (page, session) => {
		await page.locator(byTestId('settings-name')).click();
		await selectAll(page);
		await page.keyboard.insertText('Al');
		await page.locator(byTestId('settings-email')).click();
		await selectAll(page);
		await page.keyboard.insertText('nope');
		await page.locator(byTestId('settings-submit')).click();
		const done = await expectDom(
			page,
			() =>
				document.querySelector('[data-testid="settings-name-error"]')?.textContent === 'Display name must be at least 3 characters.' &&
				document.querySelector('[data-testid="settings-email-error"]')?.textContent === 'Enter a valid email address.' &&
				document.querySelector('[data-testid="settings-name"]')?.getAttribute('aria-invalid') === 'true' &&
				document.querySelector('[data-testid="settings-email"]')?.getAttribute('aria-invalid') === 'true' &&
				document.activeElement?.getAttribute('data-testid') === 'settings-name',
		);
		await page.waitForTimeout(400);
		const describedBy = await attr(page, 'settings-name', 'aria-describedby');
		const errorId = await attr(page, 'settings-name-error', 'id');
		const out = [
			check(done.ok, `focus ${await focusedTestId(page)}, name error "${await text(page, 'settings-name-error')}"`),
			check(session.settingsRequests.length === 0, `${session.settingsRequests.length} request(s)`),
			check(describedBy !== null && describedBy === errorId, `aria-describedby ${describedBy} -> ${errorId}`),
		];
		await page.locator(byTestId('settings-name')).click();
		await selectAll(page);
		await page.keyboard.insertText('Alan');
		const live = await expectDom(
			page,
			() =>
				!document.querySelector('[data-testid="settings-name-error"]') &&
				document.querySelector('[data-testid="settings-name"]')?.getAttribute('aria-invalid') !== 'true',
		);
		out.push(check(live.ok, 'errors update on input after first submit'));
		return out;
	});

	await runCase(browser, 'nav-overview-to-records', '/', ['early', 'settled'], async (page) => {
		await page.evaluate(() => (window.__noReload = true)).catch(() => {});
		let documentRequests = 0;
		page.on('request', (request) => {
			if (request.resourceType() === 'document') documentRequests++;
		});
		await page.locator(byTestId('nav-records')).click();
		const done = await expectDom(
			page,
			() =>
				location.pathname === '/records' &&
				document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
				document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
				document.querySelector('[data-testid="nav-records"]')?.getAttribute('aria-current') === 'page',
		);
		return [
			check(done.ok, `path ${new URL(page.url()).pathname}, title "${await text(page, 'page-title')}"`),
			check((await page.title()) === 'Records | Interaction benchmark', `document.title ${await page.title()}`),
			check((await attr(page, 'nav-overview', 'aria-current')) === null, 'nav-overview aria-current removed'),
			check(documentRequests === 0, `${documentRequests} document request(s)`),
			check(await page.evaluate(() => window.scrollY === 0), 'lands at top'),
		];
	});

	await runCase(browser, 'history-back', '/', ['settled'], async (page) => {
		await page.locator(byTestId('nav-records')).click();
		await expectDom(page, () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
		await page.evaluate(() => window.scrollTo(0, 1200));
		await page.waitForTimeout(200);
		await page.locator(byTestId('nav-settings')).click();
		const atSettings = await expectDom(page, () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings');
		const settingsScroll = await page.evaluate(() => window.scrollY);
		await page.goBack();
		const done = await expectDom(
			page,
			() =>
				location.pathname === '/records' &&
				document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
				document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
				Math.abs(window.scrollY - 1200) <= 50,
		);
		const out = [
			check(atSettings.ok, 'reached Settings'),
			check(settingsScroll === 0, `forward nav scrollY ${settingsScroll}`),
			check(done.ok, `back: path ${new URL(page.url()).pathname}, scrollY ${await page.evaluate(() => window.scrollY)}`),
			check((await page.title()) === 'Records | Interaction benchmark', `title ${await page.title()}`),
			check((await attr(page, 'nav-records', 'aria-current')) === 'page', 'aria-current restored'),
		];
		await page.goForward();
		const forward = await expectDom(page, () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings');
		out.push(check(forward.ok, 'forward restores Settings'));
		return out;
	});

	await runCase(browser, 'nav-all-routes', '/', ['settled'], async (page) => {
		const out = [];
		for (const [testid, path, title] of [
			['nav-settings', '/settings', 'Settings'],
			['nav-overview', '/', 'Overview'],
			['nav-records', '/records', 'Records'],
		]) {
			await page.locator(byTestId(testid)).click();
			const done = await expectDom(
				page,
				([expectedPath, expectedTitle]) =>
					location.pathname === expectedPath &&
					document.querySelector('[data-testid="page-title"]')?.textContent === expectedTitle &&
					document.title === `${expectedTitle} | Interaction benchmark`,
				[path, title],
			);
			out.push(check(done.ok, `${testid} -> ${path}`));
		}
		await page.locator(byTestId('nav-overview')).click();
		await expectDom(page, () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Overview');
		await page.locator(byTestId('counter-increment')).click();
		const live = await expectDom(page, () => document.querySelector('[data-testid="counter-value"]')?.textContent === '1');
		out.push(check(live.ok, 'client-rendered Overview is interactive'));
		return out;
	});
} finally {
	await browser?.close();
	server.kill();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
	console.error(`${failed.length} contract smoke check(s) failed`);
	process.exit(1);
}
console.log('contract smoke passed');
