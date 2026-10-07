import type { BoxContext, PageHandle } from '@async/witness';
import type { UserConfig } from 'vite';

const FIXTURE = 'fixtures/router-docs';
const NITRO_BUILD_DIR = 'node_modules/.nitro-router-docs-roster';
const NITRO_OUTPUT_DIR = 'node_modules/.output-router-docs-roster';
const FIELD = '[data-spell-field]';
const EXTEND = '[data-extend]';
const tile = (n: number) => `[data-tile]:nth-child(${n})`;
const WAIT = { timeoutMs: 10_000 };
// A plain route and an MDX page both compose the family from another module, so neither page's own payload holds the roster derivation.
const ROUTES = ['/spelling', '/spelled'];

export const config = (base: UserConfig): UserConfig =>
	({
		...base,
		root: `${base.root}/${FIXTURE}`,
		configFile: `${base.root}/${FIXTURE}/vite.config.ts`,
		nitro: {
			buildDir: NITRO_BUILD_DIR,
			output: {
				dir: NITRO_OUTPUT_DIR,
				publicDir: `${NITRO_OUTPUT_DIR}/public`,
				serverDir: `${NITRO_OUTPUT_DIR}/server`,
			},
		},
	}) as UserConfig;

export async function extendsRoster(
	expect: BoxContext['expect'],
	visit: (path: string) => Promise<PageHandle>,
): Promise<void> {
	for (const path of ROUTES) {
		const page = await visit(path);
		await expect.page.text(page, tile(1), 'a', WAIT);
		await expect.page.text(page, tile(2), 'b', WAIT);
		await expect.page.text(page, tile(3), '', WAIT);
		// Focus first: the focus gesture resumes the page before the family's own module has loaded.
		await page.click(FIELD, WAIT);
		await page.click(EXTEND, WAIT);
		await expect.page.text(page, tile(3), 'z', WAIT);
		await expect.page.text(page, tile(1), 'a', WAIT);
		await expect.page.text(page, tile(2), 'b', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
	}
}
