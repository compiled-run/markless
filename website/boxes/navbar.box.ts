import { box } from '@async/witness';
import { chromium, expect, type Page } from '@playwright/test';

const POLL = { timeout: 15_000 };

/** Samples the theme toggle every frame: a frame is wrong when a visible button offers the theme already painted. */
function sampleThemeFrames() {
	const frames: string[] = [];
	(window as unknown as { __themeFrames: string[] }).__themeFrames = frames;
	const tick = () => {
		const dark = document.documentElement.classList.contains('dark');
		for (const button of document.querySelectorAll<HTMLElement>('.theme-toggle')) {
			const style = getComputedStyle(button);
			const shown = button.getClientRects().length > 0 && style.display !== 'none' && Number(style.opacity) > 0;
			if (shown && button.dataset.themeToggle === (dark ? 'dark' : 'light')) frames.push(`${button.dataset.themeToggle} on ${dark ? 'dark' : 'light'}`);
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

const wrongThemeFrames = (page: Page) => page.evaluate(() => (window as unknown as { __themeFrames: string[] }).__themeFrames.splice(0));
/** The navbar as served, without what the runtime writes while it runs. */
const navbarMarkup = (page: Page) =>
	page.evaluate(() => {
		const copy = document.querySelector('.site-navbar')!.cloneNode(true) as HTMLElement;
		for (const element of copy.querySelectorAll('*'))
			for (const { name } of Array.from(element.attributes)) if (/^(m:|ui-open|ui-closed|aria-expanded|hidden|style|tabindex)/.test(name)) element.removeAttribute(name);
		return copy.outerHTML.replace(/ id="[^"]*"| aria-controls="[^"]*"/g, '');
	});
const documents = (page: Page) => page.evaluate(() => performance.getEntriesByType('navigation').length);
const expanded = (page: Page, label: string) => page.locator('.nav-pill .nav-trigger', { hasText: label }).getAttribute('aria-expanded');
const focused = (page: Page) =>
	page.evaluate(() => {
		const active = document.activeElement as HTMLElement;
		return active.getAttribute('aria-label') ?? active.textContent?.trim().replace(/\s+/g, ' ').slice(0, 20) ?? '';
	});

/** The inside of a fixed surface at each scroll offset: its paper grain is pinned to it, so every capture must match the first. */
async function surfaceWhileScrolling(page: Page, selector: string, offsets: readonly number[]) {
	const captures: Buffer[] = [];
	for (const y of offsets) {
		await page.evaluate((to) => scrollTo(0, to), y);
		await page.waitForTimeout(450);
		const box = (await page.locator(selector).first().boundingBox())!;
		captures.push(await page.screenshot({ clip: { x: box.x + 16, y: box.y + 16, width: box.width - 32, height: box.height - 32 } }));
	}
	return captures.map((capture) => capture.equals(captures[0]!));
}

async function restPointer(page: Page) {
	await page.mouse.move(800, 980, { steps: 4 });
	await page.keyboard.press('Escape');
	await expect.poll(() => page.locator('.nav-pill [ui-open]').count(), POLL).toBe(0);
}

/** Every way the bar is used, on whatever page is showing now. */
async function exerciseBar(page: Page, where: string) {
	await restPointer(page);
	// The section holding the page you are on first: it carries no visual mark, only the card's aria-current.
	const current = await page.evaluate(() => document.querySelector('.nav-panel a[aria-current="page"]')?.closest('.nav-item')?.querySelector('.nav-trigger')?.textContent?.trim());
	const sections = [...(current ? [current] : []), 'Docs', 'Migrate', 'Learn'];
	for (const label of new Set(sections)) {
		const trigger = page.locator('.nav-pill .nav-trigger', { hasText: label });
		await trigger.hover();
		await expect.poll(() => expanded(page, label), { ...POLL, message: `${where}: hover opens ${label}` }).toBe('true');
		await expect(page.locator('.nav-panel:not([hidden]) .card').first()).toBeVisible();
		await restPointer(page);
		await trigger.click();
		await expect.poll(() => expanded(page, label), { ...POLL, message: `${where}: click opens ${label}` }).toBe('true');
		// Past the hover delay, so the pointer resting on the trigger cannot re-open what Escape closes.
		await page.waitForTimeout(400);
		await page.keyboard.press('Escape');
		await expect.poll(() => expanded(page, label), { ...POLL, message: `${where}: Escape closes ${label}` }).toBe('false');
		await trigger.focus();
		await page.keyboard.press('ArrowDown');
		await expect.poll(() => expanded(page, label), { ...POLL, message: `${where}: ArrowDown opens ${label}` }).toBe('true');
		await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('card')), POLL).toBe(true);
		await page.keyboard.press('Escape');
		await expect.poll(() => focused(page), POLL).toBe(label);
		await restPointer(page);
	}
}

/** The address changes before the next page is swapped in; the sidebar marking it current means the swap is done. */
async function landed(page: Page, path: string) {
	await expect.poll(() => page.evaluate(() => location.pathname), POLL).toBe(path);
	await expect(page.locator(`#docs-sidebar a[aria-current="page"][href="${path}"]`)).toHaveCount(1, POLL);
}

async function navigateBy(page: Page, how: () => Promise<void>, path: string) {
	await how();
	await landed(page, path);
}

export default box(
	{
		name: 'website navbar: panels, keys, scroll-away and the theme toggle keep working across in-place navigation',
		tags: ['website', 'router', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const url = (path: string) => new URL(path, server.url).href;
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			// Printed if a step fails, so a red run says whether a module failed to load or a handler threw.
			const trail: string[] = [];
			page.on('requestfailed', (request) => trail.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
			page.on('console', (message) => message.type() === 'error' && trail.push(`console: ${message.text()}`));
			await page.addInitScript(sampleThemeFrames);
			await page.addInitScript(() => {
				const log: string[] = [];
				(window as unknown as { __navLog: string[] }).__navLog = log;
				const t0 = performance.now();
				for (const type of ['pointerover', 'pointerout', 'keydown'])
					document.addEventListener(type, (event) => {
						const target = event.target as Element;
						if (type === 'keydown' || target.closest?.('.nav-pill'))
							log.push(`${Math.round(performance.now() - t0)} ${type} ${String((target as HTMLElement).className ?? target.nodeName).slice(0, 24)}`);
					}, true);
			});
			await page.goto(url('/concepts/state'), { waitUntil: 'networkidle' });

			try {
				await exerciseBar(page, 'first load');
			} catch (failure) {
				const state = await page.evaluate(() => ({
					log: (window as unknown as { __navLog: string[] }).__navLog.slice(-30),
					items: [...document.querySelectorAll('.nav-pill .nav-item')].map((item) => [...item.attributes].map((a) => `${a.name}=${a.value}`).join(' ')),
					triggers: [...document.querySelectorAll('.nav-pill .nav-trigger')].map((t) => `${t.getAttribute('m:on')} ${t.getAttribute('aria-expanded')}`),
				}));
				console.log([...errors, ...trail, JSON.stringify(state, null, 1)].join('\n'));
				throw failure;
			}
			const steps: [string, () => Promise<void>, string][] = [
				['a Docs card', async () => { await page.locator('.nav-pill .nav-trigger', { hasText: 'Docs' }).hover(); await page.locator('.nav-panel:not([hidden]) .card', { hasText: 'Router' }).click(); }, '/router/pages'],
				['a Migrate card', async () => { await page.locator('.nav-pill .nav-trigger', { hasText: 'Migrate' }).hover(); await page.locator('.nav-panel:not([hidden]) .card', { hasText: 'Migrate an app' }).click(); }, '/start/migrate'],
				['a Learn card', async () => { await page.locator('.nav-pill .nav-trigger', { hasText: 'Learn' }).click(); await page.locator('.nav-panel:not([hidden]) .card', { hasText: 'How it works' }).click(); }, '/how-it-works'],
				['the home link', () => page.locator('.nav-pill .brand-link').click(), '/'],
				['a Docs card into its own section', async () => { await page.locator('.nav-pill .nav-trigger', { hasText: 'Docs' }).hover(); await page.locator('.nav-panel:not([hidden]) .card', { hasText: 'Core concepts' }).click(); }, '/concepts/state'],
				['the sidebar', () => page.locator('#docs-sidebar a[href="/concepts/computed"]').click(), '/concepts/computed'],
				['history back', () => page.goBack().then(() => undefined), '/concepts/state'],
			];
			for (const [label, how, path] of steps) {
				await navigateBy(page, how, path);
				await exerciseBar(page, `after ${label}`);
			}
			expect(await documents(page), 'every navigation stayed in the first document').toBe(1);

			// Every panel after those navigations is the panel a fresh load of the same page serves.
			const fresh = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
			for (const path of ['/router/pages', '/how-it-works/native-targets', '/', '/start/migrate', '/ui']) {
				await page.evaluate((to) => {
					const link = document.createElement('a');
					link.href = to;
					document.querySelector('main')!.append(link);
					link.click();
				}, path);
				await landed(page, path);
				await fresh.goto(url(path), { waitUntil: 'networkidle' });
				expect(await navbarMarkup(page), `the navbar on ${path} after in-place navigation`).toBe(await navbarMarkup(fresh));
			}
			await fresh.close();

			// Scroll-away is the same on every page, the home page included, and a navigation starts the next page with the bar showing.
			for (const path of ['/', '/concepts/state']) {
				await navigateBy(
					page,
					path === '/'
						? () => page.locator('.nav-pill .brand-link').click()
						: async () => {
								await page.mouse.wheel(0, -120);
								await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-nav-away')), POLL).toBe(false);
								await page.locator('.nav-pill .nav-trigger', { hasText: 'Docs' }).click();
								await page.locator('.nav-panel:not([hidden]) .card', { hasText: 'Core concepts' }).click();
							},
					path,
				);
				await restPointer(page);
				for (let k = 0; k < 6; k++) await page.mouse.wheel(0, 200);
				await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-nav-away')), { ...POLL, message: `${path}: scrolling down hides the bar` }).toBe(true);
				await page.mouse.wheel(0, -120);
				await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-nav-away')), { ...POLL, message: `${path}: scrolling up brings it back` }).toBe(false);
				for (let k = 0; k < 4; k++) await page.mouse.wheel(0, 200);
				await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-nav-away')), POLL).toBe(true);
			}
			// Scrolling up keeps the bar showing; neither it nor an open panel may slide over the page's paper.
			await page.evaluate(() => scrollTo(0, 2000));
			await page.waitForTimeout(400);
			expect(await surfaceWhileScrolling(page, '.nav-pill', [1500, 1483, 1450, 1111]), 'the grain inside the bar stays put while the page scrolls').toEqual([true, true, true, true]);
			await page.locator('.nav-pill .nav-trigger', { hasText: 'Docs' }).hover();
			await expect.poll(() => expanded(page, 'Docs'), POLL).toBe('true');
			expect(await surfaceWhileScrolling(page, '.nav-box', [1100, 1083, 1050]), 'the grain inside the open panel stays put while the page scrolls').toEqual([true, true, true]);
			await restPointer(page);
			await navigateBy(page, () => page.evaluate(() => (document.querySelector('#docs-sidebar a[href="/"]') as HTMLElement).click()), '/');
			await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-nav-away')), { ...POLL, message: 'a navigation from a scrolled page shows the bar' }).toBe(false);
			await exerciseBar(page, 'after navigating home from a scrolled page');

			// The arrow keys walk the bar in document order and wrap, as QDS's do.
			await page.locator('.nav-pill .brand-link').focus();
			for (const stop of ['Markless on GitHub', 'Docs', 'Migrate', 'Learn', 'Search docs', 'Switch to the dark theme', 'Markless home']) {
				await page.keyboard.press('ArrowRight');
				await expect.poll(() => focused(page), { ...POLL, message: `ArrowRight reaches ${stop}` }).toBe(stop);
			}

			// The search button opens nothing yet, and pressing it must not reach another button's handler.
			const themeBefore = await page.evaluate(() => document.documentElement.className);
			await page.locator('.nav-pill button[aria-label="Search docs"]').click();
			await page.waitForTimeout(300);
			expect(await page.evaluate(() => document.documentElement.className)).toBe(themeBefore);

			// The toggle swaps its drawing in one frame: no frame shows the button for the theme already painted.
			await wrongThemeFrames(page);
			for (let k = 0; k < 4; k++) {
				await page.locator('.nav-pill .theme-toggle:visible').click();
				await page.waitForTimeout(800);
				const next = page.locator('nav[aria-label="Page navigation"] a', { hasText: 'NEXT' });
				const nextPath = new URL((await next.getAttribute('href'))!, server.url).pathname;
				await navigateBy(page, () => next.click(), nextPath);
				await page.waitForTimeout(300);
			}
			await page.reload({ waitUntil: 'networkidle' });
			await page.waitForTimeout(500);
			expect(await wrongThemeFrames(page), 'frames showing the wrong theme button').toEqual([]);

			const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
			mobile.on('pageerror', (error) => errors.push(String(error)));
			await mobile.goto(url('/concepts/state'), { waitUntil: 'networkidle' });
			expect(await surfaceWhileScrolling(mobile, '.mobile-menu > .mobile-bar', [0, 17, 250, 1201]), 'the grain inside the top bar stays put while the page scrolls').toEqual([true, true, true, true]);
			await mobile.evaluate(() => scrollTo(0, 0));
			for (const path of ['/router/pages', '/start/migrate', '/how-it-works']) {
				await mobile.locator('.mobile-bar [aria-label="Open menu"]').click();
				await expect(mobile.locator('.menu-panel')).toBeVisible(POLL);
				await mobile.locator(`.menu-panel a[href="${path}"]`).click();
				await landed(mobile, path);
				await expect(mobile.locator('.menu-panel')).toBeHidden(POLL);
			}
			expect(errors).toEqual([]);
			await receipt.capture('navbar works after seven in-place navigations, scroll-away matches on every page, the theme toggle never shows the wrong drawing, and the paper grain inside the bars stays put while the page scrolls');
		} finally {
			await browser.close();
		}
	},
);
