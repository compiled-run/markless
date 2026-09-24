// Control discovery and first-use visits: every distinct visible control on a route, each used once on a
// fresh page, with the JS requests made after the input and optional V8 coverage for the whole visit.
import { startCoverage } from './coverage.mjs';
import { pageAgent } from './page-agent.mjs';

export const VIEWPORT = { width: 1440, height: 1000 };
export const CONTROL_SELECTOR =
	'button, summary, select, textarea, input:not([type=hidden]), [role=button], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=option]';
const TEXT_INPUT_TYPES = new Set([
	'',
	'text',
	'search',
	'email',
	'number',
	'tel',
	'url',
	'password',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isJsUrl = (url) => /\.m?js(?:[?#]|$)/.test(url);

/**
 * Visible, enabled controls in document order, one per distinct key (data-testid, else role/tag plus
 * accessible label), so 200 identical row checkboxes count once. `ordinal` indexes
 * document.querySelectorAll(CONTROL_SELECTOR).
 */
export async function distinctControls(page) {
	return page.evaluate(
		({ selector, textTypes }) => {
			const seen = new Set();
			const out = [];
			const all = [...document.querySelectorAll(selector)];
			all.forEach((el, ordinal) => {
				if (el.closest('a[href]')) return;
				if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
				const box = el.getBoundingClientRect();
				if (box.width === 0 || box.height === 0) return;
				if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
					return;
				const label = (
					el.getAttribute('aria-label') ||
					el.textContent ||
					el.getAttribute('name') ||
					''
				)
					.trim()
					.replace(/\s+/g, ' ')
					.slice(0, 40);
				const testid = el.getAttribute('data-testid');
				const role = el.getAttribute('role') || el.tagName.toLowerCase();
				const key = testid ?? `${role}:${label}`;
				if (seen.has(key)) return;
				seen.add(key);
				const type = (el.getAttribute('type') ?? '').toLowerCase();
				const typed =
					el.tagName === 'TEXTAREA' ||
					(el.tagName === 'INPUT' && textTypes.includes(type));
				const kind = el.tagName === 'SELECT' ? 'select' : typed ? 'type' : 'click';
				out.push({ key, label, ordinal, kind });
			});
			return out;
		},
		{ selector: CONTROL_SELECTOR, textTypes: [...TEXT_INPUT_TYPES] },
	);
}

/**
 * Opens a fresh page with the benchmark page agent, JS request tracking, and optional coverage.
 * `phase` splits requests into load / input windows.
 */
export async function openPage(browser, { coverage = false } = {}) {
	const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block' });
	await context.addInitScript(pageAgent);
	const page = await context.newPage();
	const cov = coverage ? await startCoverage(context, page) : null;
	const state = { phase: 'load', js: { load: [], input: [] }, errors: [], documents: 0 };
	page.on('pageerror', (e) => state.errors.push(String(e?.message ?? e).slice(0, 300)));
	page.on('request', (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame())
			state.documents++;
		if (isJsUrl(request.url())) state.js[state.phase].push(request.url());
	});
	return {
		page,
		state,
		coverage: cov,
		async goto(url) {
			await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
			await page.waitForFunction(() => document.readyState === 'complete');
			state.documents = 0;
		},
		async settle(ms = 300) {
			await page.waitForLoadState('networkidle').catch(() => {});
			await sleep(ms);
			await page.waitForLoadState('networkidle').catch(() => {});
		},
		async close() {
			await cov?.stop();
			await context.close().catch(() => {});
		},
	};
}

/** One untimed step in the runner's case shape (click / focus / press / insertText / selectAll / waitFor). */
export async function runStep(page, step, timeout = 10000) {
	if (step.click) {
		const target = page.locator(step.click.selector).nth(step.click.nth ?? 0);
		for (let i = 0; i < (step.times ?? 1); i++) await target.click({ timeout });
	} else if (step.focus) {
		await page
			.locator(step.focus.selector)
			.nth(step.focus.nth ?? 0)
			.focus({ timeout });
	} else if (step.selectAll) await page.keyboard.press('ControlOrMeta+A');
	else if (step.press) await page.keyboard.press(step.press);
	else if (step.insertText !== undefined) await page.keyboard.insertText(step.insertText);
	else if (step.waitFor) await waitForExpect(page, step.waitFor, timeout);
	else throw new Error(`unsupported step ${JSON.stringify(step)}`);
}

export async function waitForExpect(page, predicates, timeout = 10000) {
	await page.waitForFunction((p) => window.__bench?.check(p) ?? false, predicates, {
		timeout,
		polling: 'raf',
	});
}

/**
 * Uses one control the way a reader first would: click it, type one character into text fields, and
 * pick another option in a select (whose native popup takes no page clicks).
 */
export async function useControl(page, control, timeout = 5000) {
	const el = page.locator(CONTROL_SELECTOR).nth(control.ordinal);
	if (control.kind === 'select') {
		const values = await el.evaluate((select) => [...select.options].map((o) => o.value));
		const current = await el.inputValue();
		await el.selectOption(values.find((value) => value !== current) ?? current, { timeout });
		return;
	}
	await el.click({ timeout });
	if (control.kind === 'type') await page.keyboard.type('a');
}

/**
 * Every distinct control on `url`, each first-used on its own fresh page. Returns per-control JS requests
 * made after the input, page errors, whether the input loaded a new document, and (with coverage) the
 * whole visit's coverage.
 */
export async function firstUseSweep(
	browser,
	url,
	{ coverage = false, settleMs = 400, concurrency = 4 } = {},
) {
	const probe = await openPage(browser);
	let controls;
	let loadJs;
	try {
		await probe.goto(url);
		controls = await distinctControls(probe.page);
		loadJs = [...probe.state.js.load];
	} finally {
		await probe.close();
	}
	const results = Array.from({ length: controls.length });
	let next = 0;
	const worker = async () => {
		while (next < controls.length) {
			const index = next++;
			results[index] = await firstUse(browser, url, controls[index], { coverage, settleMs });
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, controls.length) }, worker));
	return { url, loadJs, controls: results };
}

async function firstUse(browser, url, control, { coverage, settleMs }) {
	const visit = await openPage(browser, { coverage });
	try {
		await visit.goto(url);
		const current = (await distinctControls(visit.page)).find((c) => c.key === control.key);
		if (!current)
			return { ...control, missing: true, inputJs: [], errors: [...visit.state.errors] };
		visit.state.phase = 'input';
		let inputError = null;
		await useControl(visit.page, current).catch(
			(e) => (inputError = String(e.message).split('\n')[0].slice(0, 200)),
		);
		await visit.settle(settleMs);
		return {
			...control,
			inputJs: [...visit.state.js.input],
			navigated: visit.state.documents > 0,
			inputError,
			errors: [...visit.state.errors],
			coverage: coverage ? await visit.coverage.take() : undefined,
		};
	} finally {
		await visit.close();
	}
}
