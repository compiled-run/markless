// Contract correctness smoke for demos/interaction-benchmark/CONTRACT.md: trusted Playwright input, exact expected values, no timing.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const appDir = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(`${repoRoot}package.json`)('@playwright/test');

const port = Number(process.env.PORT ?? 4470);
const origin = `http://127.0.0.1:${port}`;
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const TIMEOUT = 5000;

const server = spawn(
	'node_modules/.bin/vite',
	['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
	{ cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'] }
);
server.stderr.on('data', (d) => process.stderr.write(d));

const results = [];
function record(name, ok, detail = '') {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
}

async function waitForServer() {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(origin)).ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`preview server did not start on ${origin}`);
}

let browser;

async function visit(path, phase) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const requests = [];
	page.on('request', (req) => requests.push(req));
	if (phase === 'early') {
		await page.goto(origin + path, { waitUntil: 'commit' });
	} else {
		await page.goto(origin + path, { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);
	}
	return { page, context, requests };
}

const byId = (page, id) => page.getByTestId(id);
const row = (page, id) => page.locator(`[data-testid="record-row"][data-id="${id}"]`);

class AssertionFailed extends Error {}

async function expectState(page, fn, arg, describe) {
	try {
		await page.waitForFunction(fn, arg, { timeout: TIMEOUT });
	} catch {
		const actual = describe ? await describe() : '';
		throw new AssertionFailed(`assertion did not hold within ${TIMEOUT} ms${actual ? `; actual ${actual}` : ''}`);
	}
}

const q = (id) => `[data-testid="${id}"]`;

function textIs(page, id, expected) {
	return expectState(
		page,
		([sel, want]) => document.querySelector(sel)?.textContent === want,
		[q(id), expected],
		async () => JSON.stringify(await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? null, q(id)))
	);
}

async function focusedTestId(page) {
	return page.evaluate(() => {
		const el = document.activeElement;
		const r = el?.closest('[data-testid="record-row"]');
		return `${el?.getAttribute('data-testid') ?? el?.tagName}${r ? `@${r.getAttribute('data-id')}` : ''}`;
	});
}

async function rowIds(page) {
	return page.$$eval('[data-testid="record-row"]', (rows) => rows.map((r) => r.getAttribute('data-id')));
}

function assert(cond, message) {
	if (!cond) throw new AssertionFailed(message);
}

async function runCase(name, phase, path, body) {
	const v = await visit(path, phase);
	try {
		await body(v.page, v);
		record(`${name} [${phase}]`, true);
	} catch (error) {
		record(`${name} [${phase}]`, false, error instanceof AssertionFailed ? error.message : String(error));
	} finally {
		await v.context.close();
	}
}

const cases = [
	{
		id: 'overview-counter-first',
		path: '/',
		phases: ['early', 'settled'],
		run: async (page) => {
			await byId(page, 'counter-increment').click();
			await textIs(page, 'counter-value', '1');
		}
	},
	{
		id: 'overview-counter-repeat-x10',
		path: '/',
		phases: ['early', 'settled'],
		run: async (page) => {
			const button = byId(page, 'counter-increment');
			await button.waitFor({ state: 'visible' });
			const box = await button.boundingBox();
			const x = box.x + box.width / 2;
			const y = box.y + box.height / 2;
			await Promise.all(Array.from({ length: 10 }, () => page.mouse.click(x, y)));
			await textIs(page, 'counter-value', '10');
			await page.waitForTimeout(300);
			const after = await byId(page, 'counter-value').textContent();
			assert(after === '10', `counter drifted to ${after}`);
		}
	},
	{
		id: 'overview-independent-panel',
		path: '/',
		phases: ['settled'],
		run: async (page) => {
			await byId(page, 'counter-increment').click();
			await textIs(page, 'counter-value', '1');
			await byId(page, 'stepper-increment').click();
			await textIs(page, 'stepper-value', '6');
			await textIs(page, 'stepper-derived', 'Squared: 36');
			await textIs(page, 'counter-value', '1');
			await textIs(page, 'toggle-status', 'Off');
			const pressed = await byId(page, 'toggle-button').getAttribute('aria-pressed');
			assert(pressed === 'false', `toggle aria-pressed ${pressed}`);
		}
	},
	{
		id: 'overview-toggle',
		path: '/',
		phases: ['early', 'settled'],
		run: async (page) => {
			await byId(page, 'toggle-button').focus();
			await page.keyboard.press('Space');
			await expectState(page, (sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', q('toggle-button'));
			await textIs(page, 'toggle-status', 'On');
			await page.keyboard.press('Enter');
			await textIs(page, 'toggle-status', 'Off');
		}
	},
	{
		id: 'overview-disclosure',
		path: '/',
		phases: ['early', 'settled'],
		run: async (page) => {
			assert(!(await byId(page, 'tree-leaf-getting-started').isVisible()), 'leaf visible while collapsed');
			await byId(page, 'disclosure-guides').click();
			await expectState(page, (sel) => document.querySelector(sel)?.getAttribute('aria-expanded') === 'true', q('disclosure-guides'));
			await byId(page, 'tree-leaf-getting-started').waitFor({ state: 'visible', timeout: TIMEOUT });
			const controls = await byId(page, 'disclosure-guides').getAttribute('aria-controls');
			assert(controls === 'disclosure-panel-guides', `aria-controls ${controls}`);
		}
	},
	{
		id: 'overview-disclosure-nested',
		path: '/',
		phases: ['settled'],
		run: async (page) => {
			await byId(page, 'disclosure-guides').click();
			await byId(page, 'disclosure-advanced').waitFor({ state: 'visible' });
			await byId(page, 'disclosure-advanced').click();
			await expectState(page, (sel) => document.querySelector(sel)?.getAttribute('aria-expanded') === 'true', q('disclosure-advanced'));
			await byId(page, 'tree-leaf-caching').waitFor({ state: 'visible', timeout: TIMEOUT });
			await byId(page, 'tree-leaf-streaming').waitFor({ state: 'visible', timeout: TIMEOUT });
			await byId(page, 'disclosure-guides').focus();
			await page.keyboard.press('Enter');
			await byId(page, 'tree-leaf-caching').waitFor({ state: 'hidden', timeout: TIMEOUT });
			await page.keyboard.press('Space');
			await byId(page, 'tree-leaf-caching').waitFor({ state: 'visible', timeout: TIMEOUT });
			const nested = await byId(page, 'disclosure-advanced').getAttribute('aria-expanded');
			assert(nested === 'true', 'nested state lost after parent collapse');
		}
	},
	{
		id: 'overview-tab',
		path: '/',
		phases: ['early', 'settled'],
		run: async (page) => {
			await byId(page, 'tab-activity').click();
			await expectState(
				page,
				() =>
					document.querySelector('[data-testid="tab-activity"]')?.getAttribute('aria-selected') === 'true' &&
					document.querySelector('[data-testid="tab-summary"]')?.getAttribute('aria-selected') === 'false' &&
					document.querySelector('[data-testid="tab-panel"]')?.textContent === 'Activity: 12 updates in the last 24 hours.',
				undefined,
				async () => JSON.stringify(await byId(page, 'tab-panel').textContent())
			);
		}
	},
	{
		id: 'overview-tab-keyboard (extra)',
		path: '/',
		phases: ['settled'],
		run: async (page) => {
			const state = () =>
				page.evaluate(() => ({
					focus: document.activeElement?.id,
					selected: [...document.querySelectorAll('[role="tab"]')]
						.filter((t) => t.getAttribute('aria-selected') === 'true' && t.getAttribute('tabindex') === '0')
						.map((t) => t.id),
					labelledby: document.getElementById('tab-panel')?.getAttribute('aria-labelledby'),
					text: document.getElementById('tab-panel')?.textContent
				}));
			await byId(page, 'tab-summary').focus();
			const steps = [
				['ArrowRight', 'tab-activity', 'Activity: 12 updates in the last 24 hours.'],
				['ArrowRight', 'tab-notes', 'Notes: No open issues.'],
				['ArrowRight', 'tab-summary', 'Summary: 200 records across 5 teams.'],
				['ArrowLeft', 'tab-notes', 'Notes: No open issues.'],
				['Home', 'tab-summary', 'Summary: 200 records across 5 teams.'],
				['End', 'tab-notes', 'Notes: No open issues.']
			];
			for (const [key, id, text] of steps) {
				await page.keyboard.press(key);
				const s = await state();
				assert(
					s.focus === id && s.selected.length === 1 && s.selected[0] === id && s.labelledby === id && s.text === text,
					`${key}: ${JSON.stringify(s)}`
				);
			}
			await byId(page, 'tab-activity').focus();
			await page.keyboard.press('Enter');
			await textIs(page, 'tab-panel', 'Activity: 12 updates in the last 24 hours.');
			await byId(page, 'tab-summary').focus();
			await page.keyboard.press('Space');
			await textIs(page, 'tab-panel', 'Summary: 200 records across 5 teams.');
		}
	},
	{
		id: 'overview-filter',
		path: '/',
		phases: ['early', 'settled'],
		run: async (page) => {
			await textIs(page, 'filter-count', '12 items');
			await byId(page, 'filter-input').click();
			await page.keyboard.insertText('berry');
			await expectState(
				page,
				() =>
					document.querySelector('[data-testid="filter-count"]')?.textContent === '2 items' &&
					JSON.stringify([...document.querySelectorAll('[data-testid="filter-item"]')].map((li) => li.textContent)) ===
						'["Blueberry","Elderberry"]',
				undefined,
				async () => JSON.stringify(await page.$$eval('[data-testid="filter-item"]', (els) => els.map((e) => e.textContent)))
			);
			assert((await byId(page, 'filter-empty').count()) === 0, 'filter-empty present with matches');
		}
	},
	{
		id: 'overview-filter-empty (extra)',
		path: '/',
		phases: ['settled'],
		run: async (page) => {
			await byId(page, 'filter-input').click();
			await page.keyboard.insertText('zzz');
			await textIs(page, 'filter-empty', 'No matching items');
			await textIs(page, 'filter-count', '0 items');
			assert((await page.getByTestId('filter-item').count()) === 0, 'items remain');
		}
	},
	{
		id: 'records-search',
		path: '/records',
		phases: ['early', 'settled'],
		run: async (page) => {
			await byId(page, 'records-search').click();
			await page.keyboard.insertText('knuth');
			await expectState(
				page,
				() => {
					const rows = document.querySelectorAll('[data-testid="record-row"]');
					return (
						document.querySelector('[data-testid="records-count"]')?.textContent === 'Showing 15 of 200' &&
						rows.length === 15 &&
						rows[0].getAttribute('data-id') === 'r016'
					);
				},
				undefined,
				async () => `${await byId(page, 'records-count').textContent()} first=${(await rowIds(page))[0]}`
			);
		}
	},
	{
		id: 'records-search-empty (extra)',
		path: '/records',
		phases: ['settled'],
		run: async (page) => {
			await byId(page, 'records-search').click();
			await page.keyboard.insertText('no-such-person');
			await textIs(page, 'records-empty', 'No records match');
			const colspan = await byId(page, 'records-empty').getAttribute('colspan');
			assert(colspan === '7', `colspan ${colspan}`);
			await textIs(page, 'records-count', 'Showing 0 of 200');
		}
	},
	{
		id: 'records-sort',
		path: '/records',
		phases: ['early', 'settled'],
		run: async (page) => {
			const marked = await page.evaluate(() => {
				const r = document.querySelector('[data-testid="record-row"][data-id="r004"]');
				if (r) r.__smokeIdentity = true;
				return !!r;
			});
			await byId(page, 'sort-score').click();
			await expectState(
				page,
				() => {
					const rows = document.querySelectorAll('[data-testid="record-row"]');
					const th = document.querySelector('[data-testid="sort-score"]')?.closest('th');
					return (
						th?.getAttribute('aria-sort') === 'ascending' &&
						rows[0]?.getAttribute('data-id') === 'r004' &&
						rows[rows.length - 1]?.getAttribute('data-id') === 'r147'
					);
				},
				undefined,
				async () => JSON.stringify((await rowIds(page)).slice(0, 2))
			);
			const nameSort = await page.evaluate(() => document.querySelector('[data-testid="sort-name"]')?.closest('th')?.getAttribute('aria-sort'));
			assert(nameSort === 'none', `sort-name aria-sort ${nameSort}`);
			if (marked) {
				const kept = await page.evaluate(() => document.querySelector('[data-testid="record-row"][data-id="r004"]').__smokeIdentity === true);
				assert(kept, 'row DOM identity lost across sort');
			}
		}
	},
	{
		id: 'records-sort-toggle',
		path: '/records',
		phases: ['settled'],
		run: async (page) => {
			const initial = await page.$$eval('th[aria-sort]', (ths) => ths.map((t) => t.getAttribute('aria-sort')));
			assert(JSON.stringify(initial) === '["none","none"]', `initial aria-sort ${initial}`);
			await byId(page, 'sort-score').click();
			await expectState(page, () => document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r004');
			await byId(page, 'sort-score').click();
			await expectState(
				page,
				() =>
					document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'descending' &&
					document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r147'
			);
			await byId(page, 'sort-name').click();
			await expectState(
				page,
				() =>
					document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r028' &&
					document.querySelector('[data-testid="sort-name"]')?.closest('th')?.getAttribute('aria-sort') === 'ascending' &&
					document.querySelector('[data-testid="sort-score"]')?.closest('th')?.getAttribute('aria-sort') === 'none'
			);
			const firstName = await row(page, 'r028').getByTestId('record-name').textContent();
			assert(firstName === 'Ada Engelbart', `first name ${firstName}`);
		}
	},
	{
		id: 'records-select',
		path: '/records',
		phases: ['early', 'settled'],
		run: async (page) => {
			await row(page, 'r003').getByTestId('record-select').click();
			await textIs(page, 'selection-summary', '1 selected');
			assert(await row(page, 'r003').getByTestId('record-select').isChecked(), 'r003 not checked');
		}
	},
	{
		id: 'records-select-persists (extra)',
		path: '/records',
		phases: ['settled'],
		run: async (page) => {
			await row(page, 'r003').getByTestId('record-select').focus();
			await page.keyboard.press('Space');
			await textIs(page, 'selection-summary', '1 selected');
			await byId(page, 'records-search').click();
			await page.keyboard.insertText('knuth');
			await textIs(page, 'records-count', 'Showing 15 of 200');
			await textIs(page, 'selection-summary', '1 selected');
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.press('Backspace');
			await textIs(page, 'records-count', 'Showing 200 of 200');
			await byId(page, 'sort-score').click();
			assert(await row(page, 'r003').getByTestId('record-select').isChecked(), 'selection lost across search/sort');
		}
	},
	{
		id: 'records-dialog-open',
		path: '/records',
		phases: ['early', 'settled'],
		run: async (page) => {
			await row(page, 'r001').getByTestId('record-edit').click();
			await byId(page, 'edit-dialog').waitFor({ state: 'visible', timeout: TIMEOUT });
			await expectState(
				page,
				() => {
					const input = document.querySelector('[data-testid="edit-name"]');
					return input?.value === 'Katherine Hopper' && document.activeElement === input;
				},
				undefined,
				async () => `value=${await byId(page, 'edit-name').inputValue()} focus=${await focusedTestId(page)}`
			);
			const labelled = await byId(page, 'edit-dialog').getAttribute('aria-labelledby');
			const titleId = await byId(page, 'edit-dialog-title').getAttribute('id');
			assert(labelled && labelled === titleId, `aria-labelledby ${labelled} vs ${titleId}`);
			await textIs(page, 'edit-dialog-title', 'Edit record');
			assert(await page.evaluate(() => document.querySelector('dialog.dialog')?.matches(':modal')), 'dialog not modal');
			assert((await page.getByTestId('edit-dialog').count()) === 1, 'more than one dialog');
		}
	},
	{
		id: 'records-dialog-save',
		path: '/records',
		phases: ['settled'],
		run: async (page) => {
			await row(page, 'r003').getByTestId('record-select').click();
			await textIs(page, 'selection-summary', '1 selected');
			await row(page, 'r001').getByTestId('record-edit').click();
			await byId(page, 'edit-name').waitFor({ state: 'visible' });
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.insertText('Renamed Record');
			await byId(page, 'edit-save').click();
			await expectState(
				page,
				() => {
					const dialog = document.querySelector('[data-testid="edit-dialog"]');
					const r = document.querySelector('[data-testid="record-row"][data-id="r001"]');
					return (
						(!dialog || !dialog.open) &&
						r?.querySelector('[data-testid="record-name"]')?.textContent === 'Renamed Record' &&
						document.querySelector('[data-testid="selection-summary"]')?.textContent === '1 selected' &&
						document.activeElement === r.querySelector('[data-testid="record-edit"]')
					);
				},
				undefined,
				async () => `focus=${await focusedTestId(page)}`
			);
			const label = await row(page, 'r001').getByTestId('record-edit').getAttribute('aria-label');
			assert(label === 'Edit Renamed Record', `aria-label ${label}`);
			const selectLabel = await row(page, 'r001').getByTestId('record-select').getAttribute('aria-label');
			assert(selectLabel === 'Select Renamed Record', `select aria-label ${selectLabel}`);
		}
	},
	{
		id: 'records-dialog-save-resort (extra)',
		path: '/records',
		phases: ['settled'],
		run: async (page) => {
			await byId(page, 'sort-name').click();
			await expectState(page, () => document.querySelector('[data-testid="record-row"]')?.getAttribute('data-id') === 'r028');
			await row(page, 'r001').getByTestId('record-edit').click();
			await byId(page, 'edit-name').waitFor({ state: 'visible' });
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.press('Backspace');
			assert(await byId(page, 'edit-save').isDisabled(), 'save enabled with empty name');
			await page.keyboard.insertText('  Aaa First  ');
			await page.keyboard.press('Enter');
			await expectState(
				page,
				() => {
					const first = document.querySelector('[data-testid="record-row"]');
					return first?.getAttribute('data-id') === 'r001' && document.activeElement === first.querySelector('[data-testid="record-edit"]');
				},
				undefined,
				async () => `focus=${await focusedTestId(page)}`
			);
			const name = await row(page, 'r001').getByTestId('record-name').textContent();
			assert(name === 'Aaa First', `name ${JSON.stringify(name)}`);
			assert((await focusedTestId(page)) === 'record-edit@r001', `focus ${await focusedTestId(page)}`);
		}
	},
	{
		id: 'records-dialog-cancel',
		path: '/records',
		phases: ['settled'],
		run: async (page) => {
			await row(page, 'r002').getByTestId('record-edit').click();
			await byId(page, 'edit-name').waitFor({ state: 'visible' });
			await page.keyboard.insertText('xx');
			await page.keyboard.press('Escape');
			await expectState(
				page,
				() => {
					const dialog = document.querySelector('[data-testid="edit-dialog"]');
					const r = document.querySelector('[data-testid="record-row"][data-id="r002"]');
					return (
						(!dialog || !dialog.open) &&
						r?.querySelector('[data-testid="record-name"]')?.textContent === 'Hedy Floyd' &&
						document.activeElement === r.querySelector('[data-testid="record-edit"]')
					);
				},
				undefined,
				async () => `focus=${await focusedTestId(page)}`
			);
			await row(page, 'r002').getByTestId('record-edit').click();
			await byId(page, 'edit-cancel').click();
			await expectState(page, () => !document.querySelector('[data-testid="edit-dialog"]')?.open);
			assert((await focusedTestId(page)) === 'record-edit@r002', `focus after cancel ${await focusedTestId(page)}`);
		}
	},
	{
		id: 'settings-derived',
		path: '/settings',
		phases: ['early', 'settled'],
		run: async (page) => {
			await textIs(page, 'settings-total', 'Total: $25.00');
			await byId(page, 'settings-quantity').click();
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.insertText('3');
			await textIs(page, 'settings-total', 'Total: $37.50');
			await page.keyboard.insertText('x');
			await textIs(page, 'settings-total', 'Total: n/a');
		}
	},
	{
		id: 'settings-submit',
		path: '/settings',
		phases: ['settled'],
		run: async (page, v) => {
			const status = await byId(page, 'settings-status');
			assert((await status.textContent()) === '' && (await status.getAttribute('role')) === 'status', 'status not initially empty');
			await byId(page, 'settings-submit').click();
			await expectState(
				page,
				() => {
					const b = document.querySelector('[data-testid="settings-submit"]');
					return document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saving…' && b?.disabled && b.textContent === 'Saving…';
				}
			);
			await expectState(
				page,
				() => {
					const b = document.querySelector('[data-testid="settings-submit"]');
					return (
						document.querySelector('[data-testid="settings-status"]')?.textContent === 'Saved Ada Lovelace, total $25.00' &&
						!b?.disabled &&
						b?.textContent === 'Save'
					);
				},
				undefined,
				async () => JSON.stringify(await status.textContent())
			);
			const posts = v.requests.filter((r) => r.method() === 'POST');
			assert(posts.length === 1, `${posts.length} POST requests`);
			const post = posts[0];
			assert(new URL(post.url()).pathname === '/api/settings', `url ${post.url()}`);
			assert(post.headers()['content-type'] === 'application/json', `content-type ${post.headers()['content-type']}`);
			const body = JSON.parse(post.postData());
			assert(
				JSON.stringify(body) === JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' }),
				`body ${post.postData()}`
			);
		}
	},
	{
		id: 'settings-submit-error',
		path: '/settings',
		phases: ['settled'],
		run: async (page) => {
			await byId(page, 'settings-name').click();
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.insertText('fail');
			await byId(page, 'settings-submit').click();
			await textIs(page, 'settings-status', 'Saving…');
			await textIs(page, 'settings-error', 'The server rejected this display name.');
			await textIs(page, 'settings-status', '');
			const b = byId(page, 'settings-submit');
			assert((await b.isEnabled()) && (await b.textContent()) === 'Save', 'submit not reset');
			assert((await byId(page, 'settings-error').getAttribute('role')) === 'alert', 'settings-error role');
			await byId(page, 'settings-name').click();
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.insertText('Ada Lovelace');
			await byId(page, 'settings-submit').click();
			await expectState(page, () => !document.querySelector('[data-testid="settings-error"]'));
			await textIs(page, 'settings-status', 'Saved Ada Lovelace, total $25.00');
		}
	},
	{
		id: 'settings-validation',
		path: '/settings',
		phases: ['settled'],
		run: async (page, v) => {
			await byId(page, 'settings-name').click();
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.insertText('Al');
			await byId(page, 'settings-email').click();
			await page.keyboard.press(SELECT_ALL);
			await page.keyboard.insertText('nope');
			assert((await byId(page, 'settings-name-error').count()) === 0, 'error shown before submit');
			await byId(page, 'settings-submit').click();
			await textIs(page, 'settings-name-error', 'Display name must be at least 3 characters.');
			await textIs(page, 'settings-email-error', 'Enter a valid email address.');
			const attrs = await page.evaluate(() =>
				['name', 'email', 'quantity', 'unit-price'].map((f) => {
					const input = document.querySelector(`[data-testid="settings-${f}"]`);
					return [input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby')];
				})
			);
			assert(
				JSON.stringify(attrs) === JSON.stringify([['true', 'settings-name-error'], ['true', 'settings-email-error'], [null, null], [null, null]]),
				`attrs ${JSON.stringify(attrs)}`
			);
			assert((await focusedTestId(page)) === 'settings-name', `focus ${await focusedTestId(page)}`);
			await page.waitForTimeout(400);
			assert(!v.requests.some((r) => r.url().includes('/api/settings')), 'settings request sent');
			await page.keyboard.insertText('a');
			await expectState(page, () => !document.querySelector('[data-testid="settings-name-error"]'));
			const invalid = await byId(page, 'settings-name').getAttribute('aria-invalid');
			assert(invalid === null || invalid === 'false', `aria-invalid after fix ${invalid}`);
		}
	},
	{
		id: 'nav-overview-to-records',
		path: '/',
		phases: ['early', 'settled'],
		run: async (page, v) => {
			await byId(page, 'nav-records').click();
			await expectState(
				page,
				() =>
					location.pathname === '/records' &&
					document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
					document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
					document.querySelector('[data-testid="nav-records"]')?.getAttribute('aria-current') === 'page'
			);
			assert((await page.title()) === 'Records | Interaction benchmark', `title ${await page.title()}`);
			const others = await page.$$eval('[data-testid="nav-overview"], [data-testid="nav-settings"]', (els) => els.map((e) => e.hasAttribute('aria-current')));
			assert(!others.includes(true), 'stale aria-current');
			const docs = v.requests.filter((r) => r.resourceType() === 'document').length;
			v.documentRequests = docs;
		}
	},
	{
		id: 'history-back',
		path: '/',
		phases: ['settled'],
		run: async (page, v) => {
			await byId(page, 'nav-records').click();
			await expectState(page, () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
			await page.evaluate(() => window.scrollTo(0, 1200));
			await page.waitForTimeout(100);
			// A trusted click would scroll the non-sticky header link into view (scrollY 0) before leaving, defeating the restore check.
			await byId(page, 'nav-settings').dispatchEvent('click');
			await textIs(page, 'page-title', 'Settings');
			const topAfterLink = await page.evaluate(() => scrollY);
			assert(topAfterLink === 0, `scrollY after header link ${topAfterLink}`);
			await page.goBack();
			await expectState(
				page,
				() =>
					location.pathname === '/records' &&
					document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
					document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
					Math.abs(scrollY - 1200) <= 50,
				undefined,
				async () => `scrollY=${await page.evaluate(() => scrollY)}`
			);
			assert((await page.title()) === 'Records | Interaction benchmark', 'title after back');
			assert((await byId(page, 'nav-records').getAttribute('aria-current')) === 'page', 'aria-current after back');
			await page.goForward();
			await textIs(page, 'page-title', 'Settings');
			assert((await page.title()) === 'Settings | Interaction benchmark', 'title after forward');
			const docs = v.requests.filter((r) => r.resourceType() === 'document').length;
			assert(docs === 1, `${docs} document requests across client navigation`);
		}
	}
];

async function staticChecks() {
	for (const route of [
		['/', 'Overview'],
		['/records', 'Records'],
		['/settings', 'Settings']
	]) {
		const [path, title] = route;
		const res = await fetch(origin + path);
		const html = await res.text();
		const checks = [
			['lang', /<html lang="en">/.test(html)],
			['charset', /<meta charset="utf-8"/.test(html)],
			['viewport', /<meta name="viewport" content="width=device-width, initial-scale=1"/.test(html)],
			['title', html.includes(`<title>${title} | Interaction benchmark</title>`)],
			['entrant', html.includes('<meta name="benchmark:entrant" content="sveltekit"')],
			['build', /<meta name="benchmark:build" content="[^"]+"/.test(html)],
			['page-title', new RegExp(`<h1 class="page-title" data-testid="page-title">${title}</h1>`).test(html)],
			['nav aria-current', new RegExp(`aria-current="page"[^>]*>${title}</a>|>${title}</a>`).test(html)]
		];
		if (path === '/records') checks.push(['200 SSR rows', (html.match(/data-testid="record-row"/g) ?? []).length === 200]);
		if (path === '/') checks.push(['SSR controls', html.includes('data-testid="counter-increment"') && html.includes('data-testid="filter-input"')]);
		const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
		record(`SSR document ${path}`, failed.length === 0, failed.join(', '));
	}

	const get = await fetch(origin + '/api/settings');
	record('GET /api/settings returns 405', get.status === 405, String(get.status));
	const started = Date.now();
	const bad = await fetch(origin + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
	const badBody = await bad.json();
	const elapsed = Date.now() - started;
	record(
		'POST /api/settings unparseable body -> 400 Invalid settings.',
		bad.status === 400 && badBody.error === 'Invalid settings.' && bad.headers.get('cache-control') === 'no-store' && elapsed >= 290,
		`${bad.status} ${JSON.stringify(badBody)} ${bad.headers.get('cache-control')} ${elapsed}ms`
	);
	const ok = await fetch(origin + '/api/settings', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' })
	});
	const okBody = await ok.json();
	record(
		'POST /api/settings valid -> 200',
		ok.status === 200 &&
			ok.headers.get('content-type') === 'application/json' &&
			JSON.stringify(okBody) === JSON.stringify({ ok: true, message: 'Saved Ada Lovelace, total $25.00', savedAt: '2026-01-01T00:00:00.000Z' }),
		`${ok.status} ${ok.headers.get('content-type')} ${JSON.stringify(okBody)}`
	);
	const rej = await fetch(origin + '/api/settings', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: ' FAIL ', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' })
	});
	record('POST /api/settings name fail -> 422', rej.status === 422, String(rej.status));
}

const navDocs = {};
try {
	await waitForServer();
	await staticChecks();
	browser = await chromium.launch();
	const only = process.argv.slice(2);
	for (const c of cases) {
		if (only.length && !only.some((o) => c.id.startsWith(o))) continue;
		for (const phase of c.phases) {
			await runCase(c.id, phase, c.path, async (page, v) => {
				v.phase = phase;
				await c.run(page, v);
				if (c.id === 'nav-overview-to-records') navDocs[phase] = v.documentRequests;
			});
		}
	}
	for (const [phase, docs] of Object.entries(navDocs)) {
		console.log(`INFO nav-overview-to-records [${phase}] document requests: ${docs} (1 = client-side navigation)`);
	}
} catch (error) {
	record('smoke run', false, String(error));
} finally {
	await browser?.close();
	server.kill();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
