import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';

interface Look {
	heading: string;
	text: string;
	paper: string;
	url: string;
	key: string;
	face: string;
	wash: string;
}

export default box(
	{
		name: 'website state page: the settings demo repaints the page, its key and its buttons in the same frame',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			await page.goto(new URL('/concepts/state', server.url).href, { waitUntil: 'networkidle' });
			const demo = page.locator('.settings-demo').first();
			await demo.scrollIntoViewIfNeeded();

			for (const name of ['Dark', 'Light', 'Dark'] as const) {
				await demo.evaluate((figure) => {
					const look = () => {
						const style = (selector: string, prop: 'color' | 'fill' | 'opacity') => getComputedStyle(figure.querySelector(selector)!)[prop];
						const shown = [...figure.querySelectorAll<SVGPathElement>('path.paper')].find((path) => path.getBoundingClientRect().width > 0)!;
						const pressed = figure.querySelector('button[aria-pressed="true"]')!;
						return {
							heading: figure.querySelector('.heading span')!.textContent!.trim(),
							text: style('.heading', 'color'),
							paper: getComputedStyle(shown).fill,
							url: style('[data-tone] .url', 'color'),
							key: style('.ring.corner .ring-ink', 'fill'),
							face: getComputedStyle(pressed.querySelector('path:nth-of-type(2)')!).fill,
							wash: getComputedStyle(pressed.querySelector('path:nth-of-type(3)')!).opacity,
						};
					};
					const frames: Look[] = [];
					const store = window as unknown as { settingsFrames: Look[]; settingsStop: boolean };
					store.settingsFrames = frames;
					store.settingsStop = false;
					const sample = () => {
						frames.push(look());
						if (!store.settingsStop) requestAnimationFrame(sample);
					};
					requestAnimationFrame(sample);
				});
				await demo.getByRole('button', { name }).click();
				await expect(demo.locator('.heading span')).toHaveText('Theme: ' + name.toLowerCase());
				await page.waitForTimeout(700);
				const frames = await page.evaluate(() => {
					const store = window as unknown as { settingsFrames: Look[]; settingsStop: boolean };
					store.settingsStop = true;
					return store.settingsFrames;
				});
				const before = frames[0]!;
				const after = frames.at(-1)!;
				expect(after.heading).toBe('Theme: ' + name.toLowerCase());
				expect(after.paper).not.toBe(before.paper);
				const changed = frames.findIndex((frame) => frame.heading !== before.heading);
				expect(changed, 'the heading changed while frames were sampled').toBeGreaterThan(0);
				for (const frame of frames.slice(changed)) expect(frame, 'every look after the heading changed is already the final one').toEqual(after);
				for (const frame of frames.slice(0, changed)) expect(frame.paper, 'nothing repaints before the heading does').toBe(before.paper);
			}
			expect(errors).toEqual([]);
			await receipt.capture('Dark, Light, Dark: heading, page colours, bar lettering, key rings and the pressed button all change in the same animation frame');
		} finally {
			await browser.close();
		}
	},
);
