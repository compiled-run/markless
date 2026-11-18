import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';

export default box(
	{
		name: 'website collapsible: the trigger label holds still while the note opens and closes, and is not selectable',
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

			const trigger = page.locator('.collapsible-summary').first();
			const details = page.locator('.collapsible-note').first();
			await trigger.scrollIntoViewIfNeeded();
			expect(await trigger.evaluate((node) => getComputedStyle(node).userSelect), 'the trigger text is not selectable').toBe('none');

			const track = () =>
				trigger.evaluate(
					(node) =>
						new Promise<{ x: number; y: number; height: number }[]>((done) => {
							const label = node.querySelector('span')!;
							const frames: { x: number; y: number; height: number }[] = [];
							const start = performance.now();
							const tick = () => {
								const box = label.getBoundingClientRect();
								frames.push({ x: box.x, y: box.y, height: node.getBoundingClientRect().height });
								if (performance.now() - start < 900) requestAnimationFrame(tick);
								else done(frames);
							};
							requestAnimationFrame(tick);
						}),
				);
			const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

			for (const [action, open] of [['opening', true], ['closing', false]] as const) {
				const frames = track();
				await trigger.click();
				const sampled = await frames;
				expect(await details.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(open);
				expect(sampled.length, `${action}: frames were sampled through the motion`).toBeGreaterThan(10);
				expect(spread(sampled.map((f) => f.x)), `${action}: the label does not move sideways`).toBeLessThan(0.5);
				expect(spread(sampled.map((f) => f.y)), `${action}: the label does not move up or down`).toBeLessThan(0.5);
				expect(spread(sampled.map((f) => f.height)), `${action}: the trigger keeps its height`).toBeLessThan(0.5);
			}
			expect(errors).toEqual([]);
			await receipt.capture('the collapsible trigger label stays put across open and close, and its text is not selectable');
		} finally {
			await browser.close();
		}
	},
);
