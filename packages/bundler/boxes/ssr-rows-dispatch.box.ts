import { box } from '@async/witness';

// Product truth: SSR-rendered keyed repeat rows must resume from the payload
// (no app code executed before interaction) and dispatch row events with the
// correct per-row item locals in the real browser. Clicking the SECOND row's
// button must write that row's `entry.code` — proving row index + item locals
// dispatch, not just any handler firing. Row-event symbols may load lazily
// only after the interaction.
const FIXTURE = 'fixtures/vite-ssr-rows';
const INDEX = `${FIXTURE}/dist/index.html`;
const FIRST_ROW_TITLE = 'main > section > article:nth-of-type(1) > h2';
const SECOND_ROW_TITLE = 'main > section > article:nth-of-type(2) > h2';
const FIRST_ROW_BUTTON = 'main > section > article:nth-of-type(1) button';
const SECOND_ROW_BUTTON = 'main > section > article:nth-of-type(2) button';
const OUTPUT = 'main > output';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr rows dispatch: built keyed repeat rows resume and dispatch row events',
		tags: ['ssr', 'build', 'preview', 'browser', 'repeat'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.environment(build, 'ssr');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		// Server truth: SSR HTML carries both keyed rows in collection order, the
		// initial output value, and the resumable payload scripts.
		const html = await preview.request('/');
		await expect.html.contains(html, 'type="markless/state"');
		await expect.html.contains(html, 'type="markless/view"');
		assertRowsInOrder(html, 'SSR HTML');
		assertOutputShows(html, 'none', 'SSR HTML');
		receipt.note(
			`SSR rows resumer bootstrap script present: ${html.includes('data-async-resumer')}`,
		);
		const preloadPaths = modulePreloadPaths(html);
		receipt.note(`SSR rows modulepreload hrefs: ${formatPaths(preloadPaths)}`);

		const page = await preview.browser.visit('/');

		// Resume truth: both rows and the initial output come from the payload,
		// not app code. Startup fetches stay inside the rendered modulepreload
		// set; no row-event symbol loads before interaction.
		await expect.page.text(page, FIRST_ROW_TITLE, 'Alpha', WAIT);
		await expect.page.text(page, SECOND_ROW_TITLE, 'Beta', WAIT);
		await expect.page.text(page, OUTPUT, 'none', WAIT);
		const startupScripts = await jsBuildRequestPaths(page);
		receipt.note(`SSR rows startup JS: ${formatPaths(startupScripts)}`);
		assertStartupStaysInsidePreloads(startupScripts, preloadPaths);

		// Interaction truth: clicking the SECOND row's button must dispatch that
		// row's handler with its own item locals, writing `chosen = 'beta'`.
		await page.click(SECOND_ROW_BUTTON, WAIT);
		await expect.page.text(page, OUTPUT, 'beta', WAIT);
		const afterClickScripts = await jsBuildRequestPaths(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		receipt.note(`SSR rows post-click lazy JS: ${formatPaths(lazyChunks)}`);

		// Cross-row truth: the FIRST row's button carries different item locals.
		await page.click(FIRST_ROW_BUTTON, WAIT);
		await expect.page.text(page, OUTPUT, 'alpha', WAIT);

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('ssr keyed repeat rows resumed and dispatched per-row events');
	},
);

// The rows fixture renders <article><h2>Title</h2><button>Choose</button></article>
// per entry; SSR order must match the collection order (alpha before beta).
function assertRowsInOrder(html: string, label: string): void {
	const alpha = html.indexOf('<h2>Alpha</h2>');
	const beta = html.indexOf('<h2>Beta</h2>');
	if (alpha === -1 || beta === -1) {
		throw new Error(`Expected ${label} to render both keyed rows (Alpha and Beta).`);
	}
	if (beta < alpha) {
		throw new Error(`Expected ${label} to render Alpha before Beta in collection order.`);
	}
	const chooseButtons = html.split('>Choose</button>').length - 1;
	if (chooseButtons !== 2) {
		throw new Error(
			`Expected ${label} to render exactly two row Choose buttons, got ${chooseButtons}.`,
		);
	}
}

function assertOutputShows(html: string, expected: string, label: string): void {
	if (!html.includes(`<output>${expected}</output>`)) {
		throw new Error(`Expected ${label} output element to show "${expected}".`);
	}
}

function modulePreloadPaths(html: string): readonly string[] {
	return [...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g)].map(
		(match) => new URL(match[1], 'http://fixture.local').pathname,
	);
}

type NetworkRequestPage = {
	networkRequests(): Promise<ReadonlyArray<{ readonly url: string; readonly method: string }>>;
};

async function jsBuildRequestPaths(page: NetworkRequestPage): Promise<readonly string[]> {
	const requests = await page.networkRequests();
	return requests
		.filter((request) => request.method === 'GET')
		.map((request) => new URL(request.url).pathname)
		.filter((pathname) => pathname.startsWith('/build/') && pathname.endsWith('.js'));
}

function assertStartupStaysInsidePreloads(
	startupScripts: readonly string[],
	preloadPaths: readonly string[],
): void {
	const preloaded = new Set(preloadPaths);
	const unexpected = [...new Set(startupScripts.filter((path) => !preloaded.has(path)))];
	if (unexpected.length > 0) {
		throw new Error(
			`Expected SSR rows startup to fetch only rendered modulepreload chunks (no row symbol before interaction), but saw: ${unexpected.join(', ')}`,
		);
	}
}

function formatPaths(paths: readonly string[]): string {
	return paths.length === 0 ? '(none)' : paths.join(', ');
}
