import { box } from '@async/witness';
import { chromium, expect, type Frame, type Locator, type Page } from '@playwright/test';

const HAND = `import { state } from '@markless/core';

function glide(change: () => void) {
	document.startViewTransition(change);
}

export default function Hand() @{
	let hand = state(['A', 'B', 'C']);

	<section>
		<p>{hand.length} cards</p>
		<ul>
			@for (const card of hand; key card) {
				<li>{card}</li>
			}
		</ul>
		<button
			onClick={() => glide(() => hand.push('D' + hand.length))}
			disabled={hand.length === 6}
		>
			Draw
		</button>
	</section>
}
`;

// The first write in a re-run result must reach the DOM inside the view transition's update callback, as it does on a built page.
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

		async function open(): Promise<{ page: Page; block: Locator }> {
			const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			page.on('pageerror', (error) => errors.push(String(error)));
			await page.goto(new URL('/concepts/lists', server.url).href);
			const block = page.locator('.code-block').first();
			await block.scrollIntoViewIfNeeded();
			await block.locator('.title').hover();
			await page.mouse.down();
			await page.mouse.up();
			await expect(block).toHaveAttribute('data-code', 'ready', { timeout: 60_000 });
			return { page, block };
		}

		async function edit(block: Locator, code: string): Promise<void> {
			await block.locator('.pane:not([hidden]) [data-code-input]').fill(code);
		}

		async function result(block: Locator): Promise<Frame> {
			const iframe = block.locator('iframe.code-frame');
			await expect(iframe).toBeVisible({ timeout: 60_000 });
			const frame = (await (await iframe.elementHandle())!.contentFrame())!;
			await expect(frame.locator('ul li')).toHaveCount(3, { timeout: 30_000 });
			await frame.evaluate(() => {
				const rows = ((window as unknown as { rowsAtReturn: number[] }).rowsAtReturn = []);
				const start = document.startViewTransition!.bind(document);
				document.startViewTransition = (update) =>
					start(() => {
						(update as () => void)();
						rows.push(document.querySelector('ul')!.children.length);
					});
			});
			return frame;
		}

		async function draw(name: string, frame: Frame): Promise<void> {
			const button = frame.getByRole('button', { name: 'Draw' });
			await button.click();
			await expect(frame.locator('ul li')).toHaveCount(4);
			await button.click();
			await expect(frame.locator('ul li')).toHaveCount(5);
			rowsAtReturn[name] = await frame.evaluate(
				() => (window as unknown as { rowsAtReturn: number[] }).rowsAtReturn,
			);
		}

		try {
			const edited = await open();
			await edit(edited.block, HAND);
			await draw('edit', await result(edited.block));

			const rerun = await open();
			await edit(rerun.block, HAND);
			const first = await result(rerun.block);
			await first.locator('ul').evaluate((list) => list.setAttribute('data-replaced', ''));
			await rerun.block.getByRole('button', { name: 'Run again' }).click();
			await expect(first.locator('ul:not([data-replaced])')).toHaveCount(1, { timeout: 30_000 });
			await draw('run again', await result(rerun.block));

			receipt.note(JSON.stringify({ rowsAtReturn, errors }));
			expect(rowsAtReturn).toEqual({ edit: [4, 5], 'run again': [4, 5] });
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	},
);
