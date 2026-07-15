import { box } from '@async/witness';

const FIXTURE = 'fixtures/router-app';
const NITRO_BUILD_DIR = 'node_modules/.nitro-router-app-preview';
const NITRO_OUTPUT_DIR = 'node_modules/.output-router-app-preview';
const COUNTER = 'button';
const STYLED_CHILD = '[data-styled-child]';
const UNSCOPED_BUTTON = '[data-unscoped-button]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router app preview: scoped TSRX style reaches first paint',
		tags: ['router', 'build', 'preview', 'browser', 'styles'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});
		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});

		try {
			const html = await preview.request('/');
			const headEnd = html.indexOf('</head>');
			const head = headEnd === -1 ? '' : html.slice(0, headEnd);
			const stylesheetHrefs = [...head.matchAll(/<link\b[^>]*>/gi)].flatMap(([link]) => {
				if (!/\brel\s*=\s*["']stylesheet["']/i.test(link)) return [];
				const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(link)?.[1];
				return href && /\.css(?:[?#]|$)/i.test(href) ? [href] : [];
			});
			if (stylesheetHrefs.length === 0) {
				throw new Error('Router preview did not deliver a built external stylesheet.');
			}
			const hasScopedCounter = [...html.matchAll(/<button\b[^>]*>/gi)].some(([button]) =>
				/\bclass\s*=\s*["'][^"']*\bmk-[\w-]+\b[^"']*["']/i.test(button),
			);
			const hasScopedChild = [...html.matchAll(/<p\b[^>]*>/gi)].some(
				([paragraph]) =>
					/\bdata-styled-child(?:\s*=\s*["'][^"']*["'])?/i.test(paragraph) &&
					/\bclass\s*=\s*["'][^"']*\bmk-[\w-]+\b[^"']*["']/i.test(paragraph),
			);
			if (!hasScopedCounter || !hasScopedChild) {
				throw new Error('Router SSR HTML did not include both scoped fixture elements.');
			}
			if (/<style\b/i.test(head) || html.includes('data-markless-scoped-style')) {
				throw new Error('Router preview must not deliver an inline scoped-style fallback.');
			}
			if (html.includes('?inline')) {
				throw new Error('Router preview must not import scoped CSS as inline text.');
			}
			if (/<script\b[^>]*\btype\s*=\s*["']module["']/i.test(html)) {
				throw new Error(
					'Router preview must deliver scoped CSS without eager page JavaScript.',
				);
			}
			const css = (
				await Promise.all(stylesheetHrefs.map((href) => preview.request(href)))
			).join('\n');
			if (!/button\.mk-[\w-]+\s*\{[^}]*background\s*:\s*red/i.test(css)) {
				throw new Error('Built route CSS did not include the page scoped style.');
			}
			if (
				!/p\.mk-[\w-]+\s*\{[^}]*color\s*:\s*(?:blue|#00f|rgb\(0\s*,\s*0\s*,\s*255\))/i.test(
					css,
				)
			) {
				throw new Error('Built route CSS did not include the imported child scoped style.');
			}

			const page = await preview.browser.visit('/');
			await expect.page.text(page, COUNTER, 'Count 0', WAIT);
			await expect.page.exists(page, 'button[class^="mk-"]', WAIT);
			await expect.page.computedStyle(
				page,
				COUNTER,
				{ 'background-color': 'rgb(255, 0, 0)' },
				WAIT,
			);
			await expect.page.computedStyle(page, STYLED_CHILD, { color: 'rgb(0, 0, 255)' }, WAIT);
			await expect.page.computedStyle(
				page,
				UNSCOPED_BUTTON,
				{ 'background-color': 'rgb(239, 239, 239)' },
				WAIT,
			);
			await page.click(COUNTER, WAIT);
			await expect.page.text(page, COUNTER, 'Count 1', WAIT);
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
			await receipt.capture(
				'built router delivered external page and imported-child scoped CSS at first paint',
			);
		} finally {
			await preview.close();
		}
	},
);

function isolatedNitroOutput() {
	return {
		buildDir: NITRO_BUILD_DIR,
		output: {
			dir: NITRO_OUTPUT_DIR,
			publicDir: `${NITRO_OUTPUT_DIR}/public`,
			serverDir: `${NITRO_OUTPUT_DIR}/server`,
		},
	};
}
