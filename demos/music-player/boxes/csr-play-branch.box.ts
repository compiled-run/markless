import { box } from '@async/witness';

// Product truth: the Player's `@if (isPlaying)` icon branch lives in a child
// component whose condition is a parent-graph prop. CSR composition must keep
// the child branch records wired so clicking play/pause flips the icon arm and
// clicking again flips it back (the demo regression: the icon never flipped).
// The branch-flip machinery may load lazily only after the first interaction.
const PLAY_TOGGLE = '[aria-label="Play or pause"]';
const PLAY_ICON = '.play .play-icon';
const PAUSED_ICON = '▶';
const PLAYING_ICON = '❚❚';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player csr: play/pause icon branch flips and flips back',
		tags: ['music-player', 'csr', 'preview', 'browser', 'branch'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);

		// The served size map is the box's independent source for what a module
		// costs, so every charge the ledger mirrors is re-derived, never trusted.
		const sizes = await servedExecutionSizes(preview);

		// Mount truth: the app renders paused — the @else arm shows the play
		// glyph and the toggle button carries the paused class binding.
		const page = await preview.browser.visit('/');
		await waitForLogSummaryAttribute(page, WAIT);
		await expect.page.bodyText(
			page,
			{ contains: 'Do I Clench My Fists? (Slowed + Reverb)' },
			WAIT,
		);
		await expect.page.text(page, PLAY_ICON, PAUSED_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play', WAIT);
		const startupScripts = await jsBuildRequestPaths(page);
		receipt.note(`csr play-branch startup JS: ${formatPaths(startupScripts)}`);

		// Interaction truth: the click writes `isPlaying`, the icon branch flips
		// to the playing arm, and the class binding rides along.
		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PLAYING_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play active', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		const firstPlay = await waitForLogInteractionAttribute(page, 1, sizes, WAIT);
		receipt.note(
			`first-Play charge: app ${firstPlay.app} B, framework ${firstPlay.framework} B over ` +
				`[${firstPlay.modules.join(', ')}]`,
		);
		if (firstPlay.modules.length === 0) {
			throw new Error('The first Play click charged no modules; the ledger mirrored nothing.');
		}
		// Exactness contract: no chunk may load post-click that was not in the
		// startup preloaded set.
		const afterClickScripts = await jsBuildRequestPaths(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		if (lazyChunks.length > 0) {
			throw new Error(`Post-click chunks were not preloaded: ${formatPaths(lazyChunks)}`);
		}

		// Round-trip truth: clicking again restores the paused arm without stale
		// leftovers from the playing arm.
		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PAUSED_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'pause', WAIT);
		// The ledger charges each module once, so this turn's own delta is only what
		// the first click did not already pay for — smaller, never a re-charge.
		const secondPlay = await waitForLogInteractionAttribute(page, 2, sizes, WAIT);
		receipt.note(
			`second-Play charge: app ${secondPlay.app} B, framework ${secondPlay.framework} B over ` +
				`[${formatPaths(secondPlay.modules)}]`,
		);
		if (secondPlay.app > firstPlay.app || secondPlay.framework > firstPlay.framework) {
			throw new Error(
				`Expected the round-trip click to charge no more than the first (app ${firstPlay.app} B, ` +
					`framework ${firstPlay.framework} B), got app ${secondPlay.app} B, framework ${secondPlay.framework} B.`,
			);
		}

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('music-player csr play icon branch flipped and round-tripped');
	},
);

type NetworkRequestPage = {
	networkRequests(): Promise<ReadonlyArray<{ readonly url: string; readonly method: string }>>;
};

type ContentPage = {
	content(): Promise<string>;
};

type ExecutionSizeMap = Record<
	string,
	{ readonly raw?: number; readonly gzip?: number; readonly instrument?: true }
>;

const FRAMEWORK_LOG_ID = /^(?:web|runtime|serializer|router|core|analyzer):/;

async function servedExecutionSizes(preview: {
	request(path: string): Promise<string>;
}): Promise<ExecutionSizeMap> {
	const sizes = JSON.parse(
		await preview.request('/build/execution-sizes.json'),
	) as ExecutionSizeMap;
	if (!sizes['web:resume-events']?.raw) {
		throw new Error('Expected the served size map to carry a raw size for web:resume-events.');
	}
	return sizes;
}

// The load line is the ledger's own wording: what executed before the first
// gesture, and the running total. A per-turn clause here would mean load work
// was attributed to a click that had not happened yet.
async function waitForLogSummaryAttribute(
	page: ContentPage,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const summaryPattern =
		/data-markless-log-summary="markless: (\d+\.\d) KB executed at load · total (\d+\.\d) KB[^"]*"/;
	assertRejectsPreLedgerWording(summaryPattern, [
		'data-markless-log-summary="markless: rendered — 3 app modules executed (1.8 KB app) · 1 instrument modules executed (9.4 KB)"',
		'data-markless-log-summary="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 3.1 KB"',
	]);
	const started = Date.now();
	let lastSeen: string | null = null;
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		const summary = summaryPattern.exec(html);
		if (summary) {
			lastSeen = summary[0];
			// The readable clause and the exact mirror must be the same number.
			const loadBytes = Number(
				/data-markless-log-load-bytes="([^"]*)"/.exec(html)?.[1] ?? Number.NaN,
			);
			if (!Number.isInteger(loadBytes)) {
				throw new Error(`The load line printed ${summary[1]} KB with no byte mirror behind it.`);
			}
			if ((loadBytes / 1024).toFixed(1) === summary[1]) return;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(
		`Expected data-markless-log-summary to mirror the ledger load line, saw ${lastSeen ?? '(absent)'}.`,
	);
}

// The turn's cost is proven, not guessed: the ledger names the modules it
// charged, and each one is joined against the served size map by category. The
// arithmetic is checked end to end over the observed set, so a module waking for
// the first time changes the sum AND the module list rather than silently
// fitting a literal.
async function waitForLogInteractionAttribute(
	page: ContentPage,
	count: number,
	sizes: ExecutionSizeMap,
	options: { readonly timeoutMs: number },
): Promise<{ readonly app: number; readonly framework: number; readonly modules: string[] }> {
	const lastPattern =
		/data-markless-log-last="markless: (\d+\.\d) KB executed at load · this click \+(\d+\.\d) KB · total (\d+\.\d) KB[^"]*"/;
	assertRejectsPreLedgerWording(lastPattern, [
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 3.1 KB"',
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 1.8 KB app · 1.5 KB instrument"',
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 3 app modules (bytes unknown; 1 unmapped) · 9.4 KB instrument"',
	]);
	const started = Date.now();
	const countPattern = new RegExp(`data-markless-log-interactions="${count}"`);
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		const last = lastPattern.exec(html);
		const read = (name: string) =>
			new RegExp(`data-markless-log-${name}="([^"]*)"`).exec(html)?.[1];
		if (!countPattern.test(html) || !last) {
			await new Promise((resolve) => setTimeout(resolve, 25));
			continue;
		}
		if (/data-markless-log-incomplete="/.test(html)) {
			throw new Error(
				`The ledger reported unmapped ids on interaction ${count}: ${read('last')}`,
			);
		}
		// Estimated source bytes are the ledger's own honest-unknown fallback; a
		// preview build measures real chunks, so seeing it means the map went stale.
		if (read('unit') !== 'chunk-raw-bytes') {
			throw new Error(
				`Expected interaction ${count} to be charged in chunk-raw-bytes, got ${read('unit')}.`,
			);
		}
		const modules = (read('turn-modules') ?? '').split(' ').filter(Boolean);
		const expected = { app: 0, framework: 0, instrument: 0 };
		for (const id of modules) {
			const entry = sizes[id];
			if (!entry?.raw) {
				throw new Error(
					`Interaction ${count} charged ${id}, which the served size map cannot back.`,
				);
			}
			expected[
				entry.instrument ? 'instrument' : FRAMEWORK_LOG_ID.test(id) ? 'framework' : 'app'
			] += entry.raw;
		}
		const app = Number(read('app-bytes'));
		const framework = Number(read('framework-bytes'));
		if (app !== expected.app || framework !== expected.framework) {
			throw new Error(
				`Interaction ${count} accounting disagrees with the size map: mirrored ` +
					`app=${app} framework=${framework}, size-map sum over [${formatPaths(modules)}] ` +
					`app=${expected.app} framework=${expected.framework}.`,
			);
		}
		// The readable clause and the exact mirror must be the same number.
		if ((Number(read('turn-bytes')) / 1024).toFixed(1) !== last[2]) {
			throw new Error(
				`Interaction ${count} printed +${last[2]} KB but mirrored ${read('turn-bytes')} B.`,
			);
		}
		return { app, framework, modules };
	}
	throw new Error(`Expected interaction ${count} to mirror the owner-worded ledger line.`);
}

// Self-check: the pre-ledger wording this box used to pin must never satisfy the
// re-pointed matchers, so a regression to it fails instead of matching loosely.
function assertRejectsPreLedgerWording(pattern: RegExp, fixtures: readonly string[]): void {
	for (const fixture of fixtures) {
		if (pattern.test(fixture))
			throw new Error(`Execution-log matcher accepted a rejected format: ${fixture}`);
	}
}

async function jsBuildRequestPaths(page: NetworkRequestPage): Promise<readonly string[]> {
	const requests = await page.networkRequests();
	return requests
		.filter((request) => request.method === 'GET')
		.map((request) => new URL(request.url).pathname)
		.filter((pathname) => pathname.startsWith('/build/') && pathname.endsWith('.js'));
}

function formatPaths(paths: readonly string[]): string {
	return paths.length === 0 ? '(none)' : paths.join(', ');
}
