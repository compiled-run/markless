import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';

interface Look {
	field: string;
	spot: string;
	name: string;
}

export default box(
	{
		name: 'website state page: the ID card birthday repaints the age field and the page spot in the same frame, and leaves the name alone',
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
			const figure = page.locator('figure.idcard').first();
			await figure.scrollIntoViewIfNeeded();

			for (const age of [25, 26, 27]) {
				await figure.evaluate((node) => {
					const look = () => ({
						field: node.querySelector('.age-field .value')!.textContent!.trim(),
						spot: node.querySelector('.age-spot')!.textContent!.trim(),
						name: node.querySelector('.name-spot')!.textContent!.trim(),
					});
					const frames: Look[] = [];
					const store = window as unknown as { cardFrames: Look[]; cardStop: boolean };
					store.cardFrames = frames;
					store.cardStop = false;
					const sample = () => {
						frames.push(look());
						if (!store.cardStop) requestAnimationFrame(sample);
					};
					requestAnimationFrame(sample);
				});
				await figure.getByRole('button', { name: 'Birthday: person.age++' }).click();
				await expect(figure.locator('.age-spot')).toHaveText('Age ' + age);
				await page.waitForTimeout(400);
				const frames = await page.evaluate(() => {
					const store = window as unknown as { cardFrames: Look[]; cardStop: boolean };
					store.cardStop = true;
					return store.cardFrames;
				});
				const before = frames[0]!;
				const after = frames.at(-1)!;
				expect(after).toEqual({ field: String(age), spot: 'Age ' + age, name: 'Jack' });
				const changed = frames.findIndex((frame) => frame.spot !== before.spot || frame.field !== before.field);
				expect(changed, 'the age changed while frames were sampled').toBeGreaterThan(0);
				for (const frame of frames.slice(changed)) expect(frame, 'every look after the age changed is already the final one').toEqual(after);
				for (const frame of frames) expect(frame.name, 'the name spot never repaints').toBe('Jack');
			}
			expect(errors).toEqual([]);
			await receipt.capture('Three birthdays: the card field and the page spot change in the same animation frame, the name stays Jack');
		} finally {
			await browser.close();
		}
	},
);
