import { box } from '@async/witness';
import { chromium, expect, type Page } from '@playwright/test';

// The dialog's handlers, the families it is built from, and the index: none may load before the first open.
const OPEN_COST = /search-index\.json|markless:symbol:[^?]*(?:components%2Fdocs%2Fsearch|modal%2Fmodal\.tsrx|combobox%2Fcombobox\.tsrx)/;

// A cold dev server compiles every handler the first open and the first keystrokes reach.
const COLD = { timeout: 30_000 };

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Search the docs' });
const options = (page: Page) => dialog(page).getByRole('option');

export default box(
	{
		name: 'website docs search: Cmd K opens it, typing finds headings, the keys walk the hits and Enter lands on the anchor, with no dialog code run and no index fetched before the first open',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		// A page's first compile writes its code-block modules, and a new module file reloads open pages.
		for (const route of ['/concepts/state', '/build/shared']) await fetch(new URL(route, server.url));
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			const requested: string[] = [];
			page.on('request', (request) => requested.push(request.url()));
			await page.goto(new URL('/concepts/state', server.url).href, { waitUntil: 'networkidle' });

			expect(requested.filter((url) => OPEN_COST.test(url)), 'no dialog code runs and no index is fetched with the page').toEqual([]);
			await expect(dialog(page)).toBeHidden();

			await page.keyboard.press('ControlOrMeta+k');
			await expect(dialog(page)).toBeVisible(COLD);
			const field = dialog(page).getByRole('combobox');
			await expect(field).toBeFocused(COLD);
			expect(requested.some((url) => url.includes('search-index.json')), 'the first open loads the index').toBe(true);

			await field.pressSequentially('shared');
			await expect(options(page).first()).toBeVisible(COLD);
			await expect(options(page).first().locator('mark')).toHaveText(/shared/i);
			const values = await options(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('ui-value')));
			expect(values.length).toBeGreaterThan(1);
			expect(values.some((value) => value?.startsWith('/build/shared#')), 'a hit names a heading anchor on the shared() page').toBe(true);

			await page.keyboard.press('ArrowDown');
			await expect(options(page).nth(0)).toHaveAttribute('ui-highlighted', '', COLD);
			await page.keyboard.press('ArrowDown');
			await expect(options(page).nth(1)).toHaveAttribute('ui-highlighted', '');
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('ArrowDown');
			const target = await options(page).nth(1).getAttribute('ui-value');
			expect(target).toContain('#');

			await page.keyboard.press('Enter');
			await expect(dialog(page)).toBeHidden(COLD);
			await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).hash).toBe(target);
			const anchor = page.locator(`[id="${target!.split('#')[1]}"]`);
			await expect(anchor).toBeInViewport();
			receipt.note(JSON.stringify({ landedOn: target }));

			await page.keyboard.press('ControlOrMeta+k');
			await expect(dialog(page)).toBeVisible(COLD);
			await dialog(page).getByRole('combobox').fill('');
			await dialog(page).getByRole('combobox').pressSequentially('qqzzxv');
			await expect(dialog(page).getByText('Nothing in the docs matches “qqzzxv”.')).toBeVisible(COLD);
			await expect(dialog(page).locator('svg.nothing-found')).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(dialog(page)).toBeHidden();

			const fresh = await browser.newPage({ viewport: { width: 1200, height: 900 } });
			const warmed: string[] = [];
			fresh.on('request', (request) => warmed.push(request.url()));
			await fresh.goto(new URL('/concepts/state', server.url).href, { waitUntil: 'networkidle' });
			const button = fresh.getByRole('button', { name: 'Search the docs' });
			await button.hover();
			await expect.poll(() => warmed.some((url) => url.includes('search-index.json')), { message: 'hovering the button loads the index' }).toBe(true);
			await button.click();
			await expect(dialog(fresh)).toBeVisible(COLD);
			await expect(dialog(fresh).getByRole('combobox')).toBeFocused();
			await fresh.keyboard.press('Escape');
			await expect(dialog(fresh)).toBeHidden();
			await expect(button).toBeFocused();

			expect(errors).toEqual([]);
			await receipt.capture('Cmd K and the button open the search; typing, arrows and Enter land on a heading anchor; the dialog code runs and the index loads only on open or hover');
		} finally {
			await browser.close();
		}
	},
);
