import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default box(
	{
		name: 'Mug preferences preserve focus, appearance and saved choices',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const browser = await chromium.launch({ headless: true });
		const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
		const directory = resolve(process.env.MARKLESS_MUG_EVIDENCE ?? '.witness/mug-studio-types');
		await mkdir(directory, { recursive: true });
		const errors: string[] = [];
		const requests: { url: string; status?: number; error?: string }[] = [];
		const states: unknown[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('requestfailed', (request) =>
			requests.push({ url: request.url(), error: request.failure()?.errorText }),
		);
		page.on('response', (response) => {
			if (response.status() >= 400)
				requests.push({ url: response.url(), status: response.status() });
		});
		const capture = async (label: string) => {
			const state = await page.evaluate(() => ({
				activeElement: document.activeElement?.outerHTML,
				preferences: [...document.documentElement.attributes]
					.filter((attribute) => attribute.name.startsWith('data-mascot-'))
					.map((attribute) => [attribute.name, attribute.value]),
				buttons: [...document.querySelectorAll('.mascot button[data-choice]')].map(
					(element) => {
						const rect = element.getBoundingClientRect();
						return {
							choice: element.getAttribute('data-choice'),
							pressed: element.getAttribute('aria-pressed'),
							display: getComputedStyle(element).display,
							rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						};
					},
				),
			}));
			states.push({ label, state });
			await page.screenshot({ path: resolve(directory, label + '.png'), fullPage: true });
			await writeFile(
				resolve(directory, 'observations.json'),
				JSON.stringify({ states, errors, requests }, null, 2),
			);
			receipt.note(JSON.stringify({ label, state }));
		};
		try {
			await page.goto(new URL('/markless/mascot', server.url).href);
			const mug = page.locator('.mascot .drawing svg.mug');
			await expect(mug).toBeVisible();
			await capture('initial');
			const opacity = async () =>
				mug
					.locator('[opacity]')
					.evaluateAll((elements) =>
						elements.map((element) => ({
							tag: element.tagName,
							opacity: element.getAttribute('opacity'),
						})),
					);
			const originalOpacity = await opacity();
			expect(originalOpacity).toContainEqual({ tag: 'ellipse', opacity: '.15' });
			expect(originalOpacity).toContainEqual({ tag: 'ellipse', opacity: '.65' });
			const choices = [
				['glaze', 'yellow'],
				['pour', 'heart'],
				['expression', 'happy'],
				['coaster', 'cork'],
				['companion', 'beans'],
			] as const;
			for (const [family, value] of choices) {
				const selector = `.mascot [data-choice="${family}-${value}"]`;
				await page.locator(selector + '[aria-pressed="false"]').click();
				const selected = page.locator(selector + '[aria-pressed="true"]');
				await expect(selected).toBeVisible();
				await expect(selected).toBeFocused();
				await expect(mug).toHaveAttribute('data-' + family, value);
				await capture(family + '-unselected-input');
				await selected.click();
				await expect(selected).toBeFocused();
				await expect(mug).toHaveAttribute('data-' + family, value);
				expect(await opacity()).toEqual(originalOpacity);
				await capture(family + '-selected-input');
			}
			await page.reload();
			for (const [family, value] of choices) {
				await expect(mug).toHaveAttribute('data-' + family, value);
				await expect(
					page.locator(`.mascot [data-choice="${family}-${value}"][aria-pressed="true"]`),
				).toBeVisible();
			}
			expect(await opacity()).toEqual(originalOpacity);
			expect(errors).toEqual([]);
			expect(requests).toEqual([]);
			await capture('persisted');
			receipt.note(
				'One box-owned Playwright page used ordinary visible clicks; read-only geometry and focus captured; browser closed in finally.',
			);
		} catch (error) {
			await capture('first-failure');
			throw error;
		} finally {
			await browser.close();
		}
	},
);
