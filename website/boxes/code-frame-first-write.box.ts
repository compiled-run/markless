import { box } from '@async/witness';
import { chromium, expect, type Frame, type Locator, type Page } from '@playwright/test';

// The first write in a re-run result must reach the DOM inside the view transition's update callback, as it does on the page itself.
export default box(
	{
		name: 'Code block: the first write after Run again or an edit has its row before the writer returns',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const browser = await chromium.launch({ headless: true });
		const errors: string[] = [];
		const rowsAtReturn: Record<string, number[]> = {};

		async function rerun(page: Page, how: (block: Locator) => Promise<void>): Promise<Frame> {
			page.on('pageerror', (error) => errors.push(String(error)));
			await page.goto(new URL('/concepts/state', server.url).href);
			const block = page
				.locator('.code-block')
				.filter({ has: page.getByRole('tab', { name: 'glide.ts', exact: true }) });
			await block.scrollIntoViewIfNeeded();
			await block.locator('.title').hover();
			await page.mouse.down();
			await page.mouse.up();
			await expect(block).toHaveAttribute('data-code', 'ready', { timeout: 60_000 });
			await how(block);
			const iframe = block.locator('iframe.code-frame');
			await expect(iframe).toBeVisible({ timeout: 60_000 });
			const frame = (await (await iframe.elementHandle())!.contentFrame())!;
			await frame.locator('.hand ul li').first().waitFor();
			await frame.evaluate(() => {
				const rows = ((window as unknown as { rowsAtReturn: number[] }).rowsAtReturn = []);
				const start = document.startViewTransition!.bind(document);
				document.startViewTransition = (update) =>
					start(() => {
						(update as () => void)();
						rows.push(document.querySelector('.hand ul')!.children.length);
					});
			});
			return frame;
		}

		async function draw(name: string, frame: Frame): Promise<void> {
			const button = frame.getByRole('button', { name: 'Draw' });
			await button.click();
			await expect(frame.locator('.hand ul li')).toHaveCount(4);
			await button.click();
			await expect(frame.locator('.hand ul li')).toHaveCount(5);
			rowsAtReturn[name] = await frame.evaluate(
				() => (window as unknown as { rowsAtReturn: number[] }).rowsAtReturn,
			);
		}

		try {
			const runAgain = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			await draw(
				'run again',
				await rerun(runAgain, (block) => block.getByRole('button', { name: 'Run again' }).click()),
			);
			const edit = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			await draw(
				'edit',
				await rerun(edit, async (block) => {
					const input = block.getByRole('textbox', { name: /^hand\.tsrx,/ });
					await block.getByRole('button', { name: 'Edit code' }).click();
					await input.fill(`${await input.inputValue()}\n// edited\n`);
				}),
			);
			receipt.note(JSON.stringify({ rowsAtReturn, errors }));
			expect(rowsAtReturn).toEqual({ 'run again': [4, 5], edit: [4, 5] });
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	},
);
