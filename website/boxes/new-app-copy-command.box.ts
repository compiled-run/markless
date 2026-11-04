import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';
import { commandVariants } from '../components/docs/walkthrough/commands.ts';

export default box(
	{
		name: 'website new-app page: the create command copies from the ink button for whichever package manager shows',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const origin = new URL(server.url).origin;
		const directory = resolve(process.env.MARKLESS_NEW_APP_COPY_EVIDENCE ?? '.witness/new-app-copy-command');
		await mkdir(directory, { recursive: true });
		const browser = await chromium.launch({ headless: true });
		try {
			const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
			await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			await page.goto(new URL('/start/new-app', server.url).href, { waitUntil: 'networkidle' });

			const variants = commandVariants('create');
			expect(await page.locator('button.copy').count(), 'only the create command carries a Copy button').toBe(variants.length);
			for (const [index, variant] of [variants[0]!, variants[1]!].entries()) {
				if (index > 0) await page.evaluate((manager) => document.documentElement.setAttribute('data-package-manager', manager), variant.manager);
				const button = page.getByRole('button', { name: 'Copy the command: ' + variant.code });
				await expect(button).toBeVisible();
				expect(await button.locator('.icon .idle use').getAttribute('href')).toBe('/ink-marks.svg#copy');
				expect(await button.locator('.icon .done use').getAttribute('href')).toBe('/ink-marks.svg#copied');
				await page.evaluate(() => navigator.clipboard.writeText(''));
				await button.scrollIntoViewIfNeeded();
				await button.focus();
				await page.keyboard.press(index === 0 ? 'Enter' : ' ');
				await expect(button).toHaveAttribute('data-copied', 'yes');
				await expect(button.locator('.icon .done')).toBeVisible();
				await expect(button.locator('.icon .idle')).toBeHidden();
				await expect(button.locator('xpath=following-sibling::p[@role="status"]')).toHaveText('Copied to your clipboard');
				expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(variant.code);
				await page.screenshot({ path: resolve(directory, variant.manager + '-copied.png') });
				await expect(button).toHaveAttribute('data-copied', 'no', { timeout: 5_000 });
			}
			expect(errors).toEqual([]);
			receipt.note(JSON.stringify({ screenshots: directory }));
			await receipt.capture('the create command copies by Enter and Space for npm and pnpm, then reverts');
		} finally {
			await browser.close();
		}
	},
);
