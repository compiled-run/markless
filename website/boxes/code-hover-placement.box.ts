import { box } from '@async/witness';
import { chromium } from '@playwright/test';

const PAGES = ['/concepts/state', '/build/elements', '/router/pages', '/ui/accordion'];
const WIDTHS = [1280, 390];
const EDGES = ['top', 'middle', 'bottom'] as const;

export default box(
	{
		name: 'website code hovers sit beside their token and stay on screen',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		// A page's first compile writes its code-block modules, and a new module file reloads open pages.
		for (const path of PAGES) await fetch(new URL(path, server.url));
		const browser = await chromium.launch({ headless: true });
		const failures: string[] = [];
		let placements = 0;
		try {
			const page = await browser.newPage();
			for (const width of WIDTHS) {
				await page.setViewportSize({ width, height: 800 });
				for (const path of PAGES) {
					await page.goto(new URL(path, server.url).href, { waitUntil: 'load' });
					const tokens = page.locator('.tsrx-hover:visible');
					await tokens.first().waitFor();
					const count = await tokens.count();
					for (const index of new Set([0, Math.floor(count / 2), count - 1])) {
						for (const edge of EDGES) {
							const placed = await tokens.nth(index).evaluate((node, edge) => {
								node.scrollIntoView({ block: 'center' });
								const start = node.getBoundingClientRect();
								if (edge === 'top') scrollBy(0, start.top - 70);
								if (edge === 'bottom') scrollBy(0, start.bottom - innerHeight + 4);
								(node as HTMLElement).focus({ preventScroll: true });
								const docs = [node.querySelector('.tsrx-tip'), ...document.querySelectorAll('.cp-doc')];
								const doc = docs.find((one) => one && getComputedStyle(one).display !== 'none');
								if (!doc) return undefined;
								const a = node.getBoundingClientRect();
								const b = doc.getBoundingClientRect();
								(node as HTMLElement).blur();
								return {
									token: node.textContent?.slice(0, 24),
									covers: !(b.bottom <= a.top || b.top >= a.bottom || b.right <= a.left || b.left >= a.right),
									inside: b.top >= 0 && b.left >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5,
									rects: `token ${Math.round(a.top)}-${Math.round(a.bottom)}, doc ${Math.round(b.top)}-${Math.round(b.bottom)} x ${Math.round(b.left)}-${Math.round(b.right)}`,
								};
							}, edge);
							placements++;
							const where = `${path} at ${width}px, token ${index} of ${count} at the ${edge}`;
							if (!placed) failures.push(`${where}: focusing the token shows no doc`);
							else if (placed.covers) failures.push(`${where}: the doc covers "${placed.token}" (${placed.rects})`);
							else if (!placed.inside) failures.push(`${where}: the doc leaves the viewport (${placed.rects})`);
						}
					}
				}
			}
		} finally {
			await browser.close();
		}
		if (failures.length > 0) throw new Error(failures.join('\n'));
		receipt.note(`${placements} hover placements: none covers its token or leaves the viewport.`);
	},
);
