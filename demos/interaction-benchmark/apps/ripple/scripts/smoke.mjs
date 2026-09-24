// Contract smoke for the built Ripple app: every case in CONTRACT.md sections 10, 2, 3.5, 5, 5.1 with trusted Playwright input.
// Start the server first: PORT=4480 node dist/server/entry.js
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = new URL('../../../../../', import.meta.url).pathname;
const pnpmDir = join(repoRoot, 'node_modules/.pnpm');
const playwrightDir = readdirSync(pnpmDir).find((name) => /^playwright@\d/.test(name));
if (!playwrightDir) throw new Error(`playwright not found under ${pnpmDir}`);
const { chromium } = await import(
	pathToFileURL(join(pnpmDir, playwrightDir, 'node_modules/playwright/index.mjs')).href
);

const base = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 4480}`;
const expectedBuild = process.env.BENCHMARK_BUILD_ID;
const TIMEOUT = 10_000;
const results = [];

class Mismatch extends Error {}
function expect(label, actual, expected) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Mismatch(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}
async function until(page, label, fn, arg) {
	try {
		await page.waitForFunction(fn, arg, { timeout: TIMEOUT });
	} catch {
		throw new Mismatch(`timeout waiting for ${label}`);
	}
}

const tid = (page, id) => page.getByTestId(id, { exact: true });
const text = async (page, id) => (await tid(page, id).textContent())?.trim();
const attr = (page, id, name) => tid(page, id).getAttribute(name);
const row = (page, id) => page.locator(`[data-testid="record-row"][data-id="${id}"]`);
const rowIds = (page) =>
	page.$$eval('[data-testid="record-row"]', (rows) => rows.map((r) => r.getAttribute('data-id')));
const focusedTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const focusedRowId = (page) =>
	page.evaluate(() => document.activeElement?.closest('[data-testid="record-row"]')?.getAttribute('data-id') ?? null);
const selectAll = (page) => page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');

let browser;
async function run(name, phase, fn, { path = '/' } = {}) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const requests = [];
	page.on('request', (request) => requests.push({ url: request.url(), method: request.method(), type: request.resourceType() }));
	const started = Date.now();
	try {
		await page.goto(base + path, { waitUntil: phase === 'early' ? 'commit' : 'load' });
		if (phase === 'settled') await page.waitForLoadState('networkidle');
		await fn(page, { requests });
		results.push({ name, phase, ok: true, ms: Date.now() - started });
		console.error(`pass ${name} [${phase}]`);
	} catch (error) {
		results.push({ name, phase, ok: false, error: error instanceof Mismatch ? error.message : String(error) });
		console.error(`FAIL ${name} [${phase}]: ${results.at(-1).error}`);
	} finally {
		await context.close();
	}
}

const cases = {
	async 'overview-counter-first'(page) {
		await tid(page, 'counter-increment').click();
		await until(page, 'counter 1', () => document.querySelector('[data-testid="counter-value"]')?.textContent === '1');
	},
	async 'overview-counter-repeat-x10'(page) {
		const button = tid(page, 'counter-increment');
		await button.waitFor();
		const box = await button.boundingBox();
		await Promise.all(Array.from({ length: 10 }, () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)));
		await until(page, 'counter 10', () => document.querySelector('[data-testid="counter-value"]')?.textContent === '10');
		await page.waitForTimeout(200);
		expect('counter-value stays 10', await text(page, 'counter-value'), '10');
	},
	async 'overview-independent-panel'(page) {
		await tid(page, 'counter-increment').click();
		await until(page, 'counter 1', () => document.querySelector('[data-testid="counter-value"]')?.textContent === '1');
		await tid(page, 'stepper-increment').click();
		await until(page, 'stepper 6', () => document.querySelector('[data-testid="stepper-value"]')?.textContent === '6');
		expect('stepper-derived', await text(page, 'stepper-derived'), 'Squared: 36');
		expect('counter-value', await text(page, 'counter-value'), '1');
		expect('toggle-status', await text(page, 'toggle-status'), 'Off');
		expect('toggle aria-pressed', await attr(page, 'toggle-button', 'aria-pressed'), 'false');
	},
	async 'overview-toggle'(page) {
		await tid(page, 'toggle-button').focus();
		await page.keyboard.press('Space');
		await until(page, 'toggle on', () =>
			document.querySelector('[data-testid="toggle-button"]')?.getAttribute('aria-pressed') === 'true' &&
			document.querySelector('[data-testid="toggle-status"]')?.textContent === 'On');
	},
	async 'overview-disclosure'(page) {
		expect('leaf hidden initially', await tid(page, 'tree-leaf-getting-started').isVisible(), false);
		await tid(page, 'disclosure-guides').click();
		await until(page, 'guides open', () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute('aria-expanded') === 'true');
		await tid(page, 'tree-leaf-getting-started').waitFor({ state: 'visible', timeout: TIMEOUT });
	},
	async 'overview-disclosure-nested'(page) {
		await tid(page, 'disclosure-guides').click();
		await tid(page, 'tree-leaf-getting-started').waitFor({ state: 'visible', timeout: TIMEOUT });
		await tid(page, 'disclosure-advanced').click();
		await until(page, 'advanced open', () => document.querySelector('[data-testid="disclosure-advanced"]')?.getAttribute('aria-expanded') === 'true');
		await tid(page, 'tree-leaf-caching').waitFor({ state: 'visible', timeout: TIMEOUT });
		await tid(page, 'tree-leaf-streaming').waitFor({ state: 'visible', timeout: TIMEOUT });
		// Nested group keeps its own state across parent collapse; keyboard activation also toggles.
		await tid(page, 'disclosure-guides').focus();
		await page.keyboard.press('Enter');
		await tid(page, 'tree-leaf-caching').waitFor({ state: 'hidden', timeout: TIMEOUT });
		await page.keyboard.press('Space');
		await tid(page, 'tree-leaf-caching').waitFor({ state: 'visible', timeout: TIMEOUT });
		expect('advanced still expanded', await attr(page, 'disclosure-advanced', 'aria-expanded'), 'true');
		expect('aria-controls', await attr(page, 'disclosure-advanced', 'aria-controls'), 'disclosure-panel-advanced');
	},
	async 'overview-tab'(page) {
		await tid(page, 'tab-activity').click();
		await until(page, 'activity selected', () =>
			document.querySelector('[data-testid="tab-activity"]')?.getAttribute('aria-selected') === 'true' &&
			document.querySelector('[data-testid="tab-summary"]')?.getAttribute('aria-selected') === 'false' &&
			document.querySelector('[data-testid="tab-panel"]')?.textContent.trim() === 'Activity: 12 updates in the last 24 hours.');
		expect('tabindex', await attr(page, 'tab-activity', 'tabindex'), '0');
		expect('labelledby', await attr(page, 'tab-panel', 'aria-labelledby'), 'tab-activity');
	},
	async 'overview-tab-keyboard'(page) {
		await tid(page, 'tab-summary').focus();
		await page.keyboard.press('ArrowRight');
		await until(page, 'arrow right', () => document.activeElement?.getAttribute('data-testid') === 'tab-activity' &&
			document.activeElement.getAttribute('aria-selected') === 'true');
		await page.keyboard.press('End');
		await until(page, 'end', () => document.activeElement?.getAttribute('data-testid') === 'tab-notes');
		expect('notes panel', await text(page, 'tab-panel'), 'Notes: No open issues.');
		await page.keyboard.press('ArrowRight');
		await until(page, 'wrap', () => document.activeElement?.getAttribute('data-testid') === 'tab-summary');
		await page.keyboard.press('ArrowLeft');
		await until(page, 'wrap left', () => document.activeElement?.getAttribute('data-testid') === 'tab-notes');
		await page.keyboard.press('Home');
		await until(page, 'home', () => document.activeElement?.getAttribute('data-testid') === 'tab-summary' &&
			document.querySelector('[data-testid="tab-panel"]')?.textContent.trim() === 'Summary: 200 records across 5 teams.');
		expect('summary tabindex', await attr(page, 'tab-summary', 'tabindex'), '0');
		expect('notes tabindex', await attr(page, 'tab-notes', 'tabindex'), '-1');
	},
	async 'overview-filter'(page) {
		expect('initial count', await text(page, 'filter-count'), '12 items');
		await tid(page, 'filter-input').click();
		await page.keyboard.insertText('berry');
		await until(page, 'berry', () => document.querySelector('[data-testid="filter-count"]')?.textContent === '2 items');
		expect('items', await page.getByTestId('filter-item').allTextContents(), ['Blueberry', 'Elderberry']);
		expect('no empty', await tid(page, 'filter-empty').count(), 0);
		await selectAll(page);
		await page.keyboard.insertText('zzz');
		await until(page, 'empty', () => document.querySelector('[data-testid="filter-empty"]')?.textContent === 'No matching items');
		expect('zero count', await text(page, 'filter-count'), '0 items');
		expect('no items', await page.getByTestId('filter-item').count(), 0);
	},
	async 'records-search'(page) {
		await tid(page, 'records-search').click();
		await page.keyboard.insertText('knuth');
		await until(page, 'knuth', () => document.querySelector('[data-testid="records-count"]')?.textContent === 'Showing 15 of 200');
		const ids = await rowIds(page);
		expect('rows', ids.length, 15);
		expect('first', ids[0], 'r016');
		await selectAll(page);
		await page.keyboard.insertText('no-such-record');
		await until(page, 'empty', () => document.querySelector('[data-testid="records-empty"]')?.textContent === 'No records match');
		expect('empty colspan', await attr(page, 'records-empty', 'colspan'), '7');
	},
	async 'records-sort'(page) {
		await tid(page, 'sort-score').click();
		await until(page, 'score asc', () => {
			const rows = document.querySelectorAll('[data-testid="record-row"]');
			return document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'ascending' &&
				rows[0]?.getAttribute('data-id') === 'r004' && rows[rows.length - 1]?.getAttribute('data-id') === 'r147';
		});
		expect('name aria-sort', await tid(page, 'sort-name').evaluate((b) => b.closest('th').getAttribute('aria-sort')), 'none');
	},
	async 'records-sort-toggle'(page) {
		const row001 = await row(page, 'r001').elementHandle();
		await tid(page, 'sort-score').click();
		await until(page, 'asc', () => document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r004');
		await tid(page, 'sort-score').click();
		await until(page, 'desc', () =>
			document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'descending' &&
			document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r147');
		await tid(page, 'sort-name').click();
		await until(page, 'name asc', () =>
			document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r028' &&
			document.querySelector('[data-testid="sort-name"]')?.closest('th')?.getAttribute('aria-sort') === 'ascending' &&
			document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'none');
		expect('r028 name', await row(page, 'r028').getByTestId('record-name').textContent(), 'Ada Engelbart');
		expect('row identity kept across sort', await row001.evaluate((el) => el.isConnected), true);
	},
	async 'records-select'(page) {
		await row(page, 'r003').getByTestId('record-select').click();
		await until(page, 'selected', () =>
			document.querySelector('[data-testid="record-row"][data-id="r003"] [data-testid="record-select"]')?.checked === true &&
			document.querySelector('[data-testid="selection-summary"]')?.textContent === '1 selected');
		// Selection survives search and sort; Space toggles a focused checkbox.
		await tid(page, 'records-search').click();
		await page.keyboard.insertText('knuth');
		await until(page, 'search', () => document.querySelector('[data-testid="records-count"]')?.textContent === 'Showing 15 of 200');
		expect('summary under search', await text(page, 'selection-summary'), '1 selected');
		await selectAll(page);
		await page.keyboard.press('Backspace');
		await until(page, 'cleared', () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
		await tid(page, 'sort-score').click();
		expect('still checked', await row(page, 'r003').getByTestId('record-select').isChecked(), true);
		await row(page, 'r005').getByTestId('record-select').focus();
		await page.keyboard.press('Space');
		await until(page, 'two', () => document.querySelector('[data-testid="selection-summary"]')?.textContent === '2 selected');
	},
	async 'records-dialog-open'(page) {
		await row(page, 'r001').getByTestId('record-edit').click();
		await tid(page, 'edit-dialog').waitFor({ state: 'visible', timeout: TIMEOUT });
		await until(page, 'focus', () => document.activeElement?.getAttribute('data-testid') === 'edit-name');
		expect('edit-name value', await tid(page, 'edit-name').inputValue(), 'Katherine Hopper');
		expect('title', await text(page, 'edit-dialog-title'), 'Edit record');
		expect('labelledby', await attr(page, 'edit-dialog', 'aria-labelledby'), await attr(page, 'edit-dialog-title', 'id'));
		await selectAll(page);
		await page.keyboard.press('Backspace');
		await until(page, 'save disabled', () => document.querySelector('[data-testid="edit-save"]')?.disabled === true);
	},
	async 'records-dialog-save'(page) {
		await row(page, 'r003').getByTestId('record-select').click();
		await until(page, 'selected', () => document.querySelector('[data-testid="selection-summary"]')?.textContent === '1 selected');
		await row(page, 'r001').getByTestId('record-edit').click();
		await until(page, 'focus', () => document.activeElement?.getAttribute('data-testid') === 'edit-name');
		await selectAll(page);
		await page.keyboard.insertText('Renamed Record');
		await tid(page, 'edit-save').click();
		await tid(page, 'edit-dialog').waitFor({ state: 'hidden', timeout: TIMEOUT });
		await until(page, 'renamed', () =>
			document.querySelector('[data-testid="record-row"][data-id="r001"] [data-testid="record-name"]')?.textContent === 'Renamed Record');
		expect('summary', await text(page, 'selection-summary'), '1 selected');
		expect('focus testid', await focusedTestId(page), 'record-edit');
		expect('focus row', await focusedRowId(page), 'r001');
		expect('edit aria-label', await row(page, 'r001').getByTestId('record-edit').getAttribute('aria-label'), 'Edit Renamed Record');
		expect('select aria-label', await row(page, 'r001').getByTestId('record-select').getAttribute('aria-label'), 'Select Renamed Record');
		// Enter in edit-name saves, and a name-sorted table re-sorts.
		await tid(page, 'sort-name').click();
		await until(page, 'name sorted', () => document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r028');
		await row(page, 'r028').getByTestId('record-edit').click();
		await until(page, 'focus 2', () => document.activeElement?.getAttribute('data-testid') === 'edit-name');
		await selectAll(page);
		await page.keyboard.insertText('Zz Last');
		await page.keyboard.press('Enter');
		await until(page, 're-sorted', () => {
			const rows = document.querySelectorAll('[data-testid="record-row"]');
			return rows[rows.length - 1]?.getAttribute('data-id') === 'r028';
		});
		expect('focus row after enter', await focusedRowId(page), 'r028');
	},
	async 'records-dialog-cancel'(page) {
		await row(page, 'r002').getByTestId('record-edit').click();
		await until(page, 'focus', () => document.activeElement?.getAttribute('data-testid') === 'edit-name');
		await page.keyboard.insertText('xx');
		await page.keyboard.press('Escape');
		await tid(page, 'edit-dialog').waitFor({ state: 'hidden', timeout: TIMEOUT });
		expect('name', await row(page, 'r002').getByTestId('record-name').textContent(), 'Hedy Floyd');
		expect('focus testid', await focusedTestId(page), 'record-edit');
		expect('focus row', await focusedRowId(page), 'r002');
		await row(page, 'r002').getByTestId('record-edit').click();
		await until(page, 'focus 2', () => document.activeElement?.getAttribute('data-testid') === 'edit-name');
		expect('draft reset', await tid(page, 'edit-name').inputValue(), 'Hedy Floyd');
		await tid(page, 'edit-cancel').click();
		await tid(page, 'edit-dialog').waitFor({ state: 'hidden', timeout: TIMEOUT });
		expect('focus row after cancel button', await focusedRowId(page), 'r002');
		expect('one dialog max', await page.getByTestId('edit-dialog').count() <= 1, true);
	},
	async 'settings-derived'(page) {
		expect('initial total', await text(page, 'settings-total'), 'Total: $25.00');
		await tid(page, 'settings-quantity').click();
		await selectAll(page);
		await page.keyboard.insertText('3');
		await until(page, 'total', () => document.querySelector('[data-testid="settings-total"]')?.textContent === 'Total: $37.50');
		await selectAll(page);
		await page.keyboard.insertText('x');
		await until(page, 'n/a', () => document.querySelector('[data-testid="settings-total"]')?.textContent === 'Total: n/a');
		expect('no error before submit', await tid(page, 'settings-quantity-error').count(), 0);
	},
	async 'settings-submit'(page, { requests }) {
		let pendingSeen = false;
		await page.exposeFunction('__pending', () => (pendingSeen = true));
		await page.evaluate(() => {
			const button = document.querySelector('[data-testid="settings-submit"]');
			const status = document.querySelector('[data-testid="settings-status"]');
			new MutationObserver(() => {
				if (status.textContent === 'Saving…' && button.disabled && button.textContent.trim() === 'Saving…') window.__pending();
			}).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
		});
		await tid(page, 'settings-submit').click();
		await until(page, 'saved', () =>
			document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saved Ada Lovelace, total $25.00' &&
			document.querySelector('[data-testid="settings-submit"]')?.disabled === false &&
			document.querySelector('[data-testid="settings-submit"]')?.textContent.trim() === 'Save');
		expect('pending UI observed', pendingSeen, true);
		const posts = requests.filter((r) => r.url.endsWith('/api/settings'));
		expect('one POST', posts.map((r) => r.method), ['POST']);
		expect('no error', await tid(page, 'settings-error').count(), 0);
	},
	async 'settings-submit-error'(page, { requests }) {
		await tid(page, 'settings-name').click();
		await selectAll(page);
		await page.keyboard.insertText('fail');
		await tid(page, 'settings-submit').click();
		await until(page, 'error', () =>
			document.querySelector('[data-testid="settings-error"]')?.textContent === 'The server rejected this display name.' &&
			document.querySelector('[data-testid="settings-status"]')?.textContent === '' &&
			document.querySelector('[data-testid="settings-submit"]')?.disabled === false);
		expect('role alert', await attr(page, 'settings-error', 'role'), 'alert');
		expect('one POST', requests.filter((r) => r.url.endsWith('/api/settings')).length, 1);
		// A new submit removes the previous error synchronously with the pending UI.
		await tid(page, 'settings-name').click();
		await selectAll(page);
		await page.keyboard.insertText('Grace');
		await page.keyboard.press('Enter');
		await until(page, 'error cleared while pending', () =>
			document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saving…' &&
			!document.querySelector('[data-testid="settings-error"]'));
		await until(page, 'saved via Enter', () =>
			document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saved Grace, total $25.00');
	},
	async 'settings-validation'(page, { requests }) {
		await tid(page, 'settings-name').click();
		await selectAll(page);
		await page.keyboard.insertText('Al');
		await tid(page, 'settings-email').click();
		await selectAll(page);
		await page.keyboard.insertText('nope');
		await tid(page, 'settings-submit').click();
		await until(page, 'errors', () =>
			document.querySelector('[data-testid="settings-name-error"]')?.textContent === 'Display name must be at least 3 characters.' &&
			document.querySelector('[data-testid="settings-email-error"]')?.textContent === 'Enter a valid email address.');
		expect('name invalid', await attr(page, 'settings-name', 'aria-invalid'), 'true');
		expect('email invalid', await attr(page, 'settings-email', 'aria-invalid'), 'true');
		expect('qty not invalid', (await attr(page, 'settings-quantity', 'aria-invalid')) ?? 'false', 'false');
		expect('describedby', await attr(page, 'settings-name', 'aria-describedby'), await attr(page, 'settings-name-error', 'id'));
		expect('focus', await focusedTestId(page), 'settings-name');
		expect('no request', requests.filter((r) => r.url.endsWith('/api/settings')).length, 0);
		// After the first attempt, errors update on every input event.
		await page.keyboard.press('End');
		await page.keyboard.insertText('an');
		await until(page, 'name error gone', () => !document.querySelector('[data-testid="settings-name-error"]'));
		expect('name valid', (await attr(page, 'settings-name', 'aria-invalid')) ?? 'false', 'false');
		expect('describedby removed', await attr(page, 'settings-name', 'aria-describedby'), null);
		expect('status empty', await text(page, 'settings-status'), '');
	},
	async 'nav-overview-to-records'(page) {
		await tid(page, 'nav-records').click();
		await page.waitForURL((url) => url.pathname === '/records', { timeout: TIMEOUT });
		await until(page, 'records', () =>
			document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
			document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
			document.querySelector('[data-testid="nav-records"]')?.getAttribute('aria-current') === 'page');
		expect('title', await page.title(), 'Records | Interaction benchmark');
		expect('overview aria-current', await attr(page, 'nav-overview', 'aria-current'), null);
		expect('scrollY', await page.evaluate(() => window.scrollY), 0);
	},
	async 'history-back'(page) {
		await tid(page, 'nav-records').click();
		await until(page, 'records', () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
		await page.waitForLoadState('load');
		await page.evaluate(() => window.scrollTo(0, 1200));
		await until(page, 'scrolled', () => Math.abs(window.scrollY - 1200) <= 1);
		await tid(page, 'nav-settings').click();
		await until(page, 'settings', () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings');
		expect('forward nav at top', await page.evaluate(() => window.scrollY), 0);
		await page.goBack();
		await until(page, 'back to records', () =>
			location.pathname === '/records' &&
			document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
			document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
			Math.abs(window.scrollY - 1200) <= 50);
		expect('title', await page.title(), 'Records | Interaction benchmark');
		expect('aria-current', await attr(page, 'nav-records', 'aria-current'), 'page');
		await page.goForward();
		await until(page, 'forward to settings', () =>
			location.pathname === '/settings' && document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings');
		expect('forward title', await page.title(), 'Settings | Interaction benchmark');
	},
};

const plan = [
	['overview-counter-first', ['early', 'settled'], '/'],
	['overview-counter-repeat-x10', ['early', 'settled'], '/'],
	['overview-independent-panel', ['settled'], '/'],
	['overview-toggle', ['early', 'settled'], '/'],
	['overview-disclosure', ['early', 'settled'], '/'],
	['overview-disclosure-nested', ['settled'], '/'],
	['overview-tab', ['early', 'settled'], '/'],
	['overview-tab-keyboard', ['settled'], '/'],
	['overview-filter', ['early', 'settled'], '/'],
	['records-search', ['early', 'settled'], '/records'],
	['records-sort', ['early', 'settled'], '/records'],
	['records-sort-toggle', ['settled'], '/records'],
	['records-select', ['early', 'settled'], '/records'],
	['records-dialog-open', ['early', 'settled'], '/records'],
	['records-dialog-save', ['settled'], '/records'],
	['records-dialog-cancel', ['settled'], '/records'],
	['settings-derived', ['early', 'settled'], '/settings'],
	['settings-submit', ['settled'], '/settings'],
	['settings-submit-error', ['settled'], '/settings'],
	['settings-validation', ['settled'], '/settings'],
	['nav-overview-to-records', ['early', 'settled'], '/'],
	['history-back', ['settled'], '/'],
];

// Document-level checks that need no browser.
async function documentChecks() {
	for (const [path, title] of [['/', 'Overview'], ['/records', 'Records'], ['/settings', 'Settings']]) {
		const name = `document ${path}`;
		try {
			const response = await fetch(base + path);
			const html = await response.text();
			expect(`${name} status`, response.status, 200);
			expect(`${name} lang`, /<html lang="en">/.test(html), true);
			expect(`${name} charset`, /<meta charset="utf-8"/i.test(html), true);
			expect(`${name} viewport`, html.includes('<meta name="viewport" content="width=device-width, initial-scale=1"'), true);
			expect(`${name} entrant`, html.includes('<meta name="benchmark:entrant" content="ripple"'), true);
			const build = html.match(/<meta name="benchmark:build" content="([^"]+)"/)?.[1] ?? null;
			if (expectedBuild) expect(`${name} build`, build, expectedBuild);
			else expect(`${name} build present`, typeof build === 'string' && build.length > 0 && !build.includes('%'), true);
			expect(`${name} title`, html.includes(`<title>${title} | Interaction benchmark</title>`), true);
			expect(`${name} ssr page-title`, html.replace(/<!--[^]*?-->/g, '').includes(`data-testid="page-title" class="page-title">${title}</h1>`), true);
			if (path === '/records') expect('ssr rows', html.match(/data-testid="record-row"/g)?.length, 200);
			results.push({ name, ok: true });
		} catch (error) {
			results.push({ name, ok: false, error: error.message });
		}
	}
	const name = 'endpoint /api/settings';
	try {
		const post = (body) => fetch(base + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
		const t0 = Date.now();
		const ok = await post(JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' }));
		const elapsed = Date.now() - t0;
		expect('200 status', ok.status, 200);
		expect('200 content-type', ok.headers.get('content-type'), 'application/json');
		expect('200 cache-control', ok.headers.get('cache-control'), 'no-store');
		expect('200 body', await ok.json(), { ok: true, message: 'Saved Ada Lovelace, total $25.00', savedAt: '2026-01-01T00:00:00.000Z' });
		expect('delay >= 300ms', elapsed >= 300, true);
		const rejected = await post(JSON.stringify({ name: ' FAIL ', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' }));
		expect('422', rejected.status, 422);
		expect('422 body', await rejected.json(), { ok: false, error: 'The server rejected this display name.' });
		const garbage = await post('{not json');
		expect('400 unparseable', garbage.status, 400);
		expect('400 body', await garbage.json(), { ok: false, error: 'Invalid settings.' });
		for (const method of ['GET', 'PUT', 'DELETE']) {
			expect(`${method} 405`, (await fetch(base + '/api/settings', { method })).status, 405);
		}
		results.push({ name, ok: true });
	} catch (error) {
		results.push({ name, ok: false, error: error.message });
	}
}

// Records whether header-link clicks are client navigations or document loads (Ripple 0.4.7 has no client router).
async function navigationKind() {
	const context = await browser.newContext();
	const page = await context.newPage();
	const kinds = {};
	try {
		await page.goto(base + '/', { waitUntil: 'load' });
		for (const [id, title] of [['nav-records', 'Records'], ['nav-settings', 'Settings'], ['nav-overview', 'Overview']]) {
			await page.evaluate(() => (window.__benchMarker = true));
			let documentRequest = false;
			const onRequest = (request) => {
				if (request.isNavigationRequest() && request.resourceType() === 'document') documentRequest = true;
			};
			page.on('request', onRequest);
			await tid(page, id).click();
			await until(page, title, (t) => document.querySelector('[data-testid="page-title"]')?.textContent === t, title);
			page.off('request', onRequest);
			kinds[id] = documentRequest || !(await page.evaluate(() => window.__benchMarker === true)) ? 'document navigation' : 'client';
		}
	} finally {
		await context.close();
	}
	return kinds;
}

await documentChecks();
browser = await chromium.launch();
let navigation;
try {
	for (const [name, phases, path] of plan) {
		for (const phase of phases) await run(name, phase, cases[name], { path });
	}
	navigation = await navigationKind();
} finally {
	await browser.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.phase ? ` [${r.phase}]` : ''}${r.ok ? '' : `: ${r.error}`}`);
console.log(`navigation kind: ${JSON.stringify(navigation)}`);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
