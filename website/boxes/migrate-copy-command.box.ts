import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';

const COMMAND = /<CommandStrip command="([^"]+)"/.exec(
	readFileSync(new URL('../pages/start/migrate.mdx', import.meta.url), 'utf8'),
)![1]!;

export default box(
	{
		name: 'website migrate page: the setup command copies from a button and the mug adds no stray text',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const origin = new URL(server.url).origin;
		const directory = resolve(process.env.MARKLESS_MIGRATE_COPY_EVIDENCE ?? '.witness/migrate-copy-command');
		await mkdir(directory, { recursive: true });
		const browser = await chromium.launch({ headless: true });
		try {
			const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
			await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			await page.goto(new URL('/start/migrate', server.url).href, { waitUntil: 'networkidle' });

			const selected = await page.evaluate(() => {
				const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('Set it up'))!;
				const range = document.createRange();
				range.setStartBefore(heading);
				range.setEndAfter(document.querySelector('.command-strip')!);
				getSelection()!.removeAllRanges();
				getSelection()!.addRange(range);
				const text = getSelection()!.toString();
				getSelection()!.removeAllRanges();
				return text;
			});
			expect(selected, 'the mascot above the command puts no letters into copied page text').not.toMatch(/^\s*z\s*$/im);
			expect(await page.locator('.docs-mug svg text').count()).toBe(0);

			const button = page.getByRole('button', { name: 'Copy the command: ' + COMMAND });
			const status = page.locator('.command-strip [role="status"]');
			const sprite = await page.request.get(new URL('/ink-marks.svg', server.url).href).then((response) => response.text());
			for (const [part, mark] of [['idle', 'copy'], ['done', 'copied']] as const) {
				expect(await button.locator(`.icon .${part} use`).getAttribute('href'), `the ${part} icon is the hand-drawn ${mark} mark`).toBe(`/ink-marks.svg#${mark}`);
				expect(sprite).toContain(`<symbol id="${mark}"`);
			}
			for (const [theme, key] of [['light', 'Enter'], ['dark', ' ']] as const) {
				if (theme === 'dark') {
					await page.click('[data-theme-toggle="dark"]');
					await expect(page.locator('html.dark')).toHaveCount(1);
				}
				await page.evaluate(() => navigator.clipboard.writeText(''));
				await button.scrollIntoViewIfNeeded();
				const before = await button.boundingBox();
				const strip = await page.locator('.command-strip').boundingBox();
				await expect(button.locator('.icon .idle')).toBeVisible();
				await expect(button.locator('.icon .done')).toBeHidden();
				await page.screenshot({ path: resolve(directory, theme + '-idle.png') });
				await button.focus();
				const pressed = Date.now();
				await page.keyboard.press(key);
				await expect(button).toHaveAttribute('data-copied', 'yes');
				await expect(status).toHaveText('Copied to your clipboard');
				await expect(button.locator('.words .done')).toBeVisible();
				await expect(button.locator('.words .idle')).toBeHidden();
				await expect(button.locator('.icon .done')).toBeVisible();
				await expect(button.locator('.icon .idle')).toBeHidden();
				expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(COMMAND);
				expect(await button.boundingBox()).toEqual(before);
				expect(await page.locator('.command-strip').boundingBox()).toEqual(strip);
				await page.screenshot({ path: resolve(directory, theme + '-copied.png') });
				await expect(button).toHaveAttribute('data-copied', 'no', { timeout: 5_000 });
				expect(Date.now() - pressed, 'the Copied state stays long enough to read').toBeGreaterThanOrEqual(1_500);
				await expect(status).toHaveText('');
				await expect(button.locator('.words .idle')).toBeVisible();
				await expect(button.locator('.icon .idle')).toBeVisible();
			}
			await button.click();
			await expect(status).toHaveText('Copied to your clipboard');
			expect(errors).toEqual([]);
			receipt.note(JSON.stringify({ command: COMMAND, screenshots: directory }));
			await receipt.capture('setup command copies by Enter, Space and click in light and dark themes, then reverts');
		} finally {
			await browser.close();
		}
	},
);
