import { box } from '@async/witness';
import { assertEmptyDeltaContainer } from './empty-delta-container.ts';

// Product truth: an SSR-rendered @if branch must resume from prerender data
// (no app code executed before interaction) and flip its arm in the real
// browser when a click writes the branch's state. The flip replaces the DOM
// range between the branch comment anchors, and the branch-update symbol may
// load lazily only after the interaction.
const FIXTURE = 'fixtures/vite-ssr-branch';
const INDEX = `${FIXTURE}/dist/index.html`;
const TOGGLE = '[data-toggle]';
const ON_ARM = 'main > p.on';
const OFF_ARM = 'main > p.off';
const BRANCH_START = '<!--markless:branch:branch-site:0-->';
const BRANCH_END = '<!--/markless:branch:branch-site:0-->';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr branch flip: built @if arm resumes and flips on click',
		tags: ['ssr', 'build', 'preview', 'browser', 'branch'],
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

		// Server truth: SSR HTML carries only the taken arm between the branch
		// comment anchors, plus an empty-delta resumable container.
		const html = await preview.request('/');
		await assertEmptyDeltaContainer(preview, html, 'SSR branch HTML');
		assertArmBetweenAnchors(html, { shows: 'class="on"', hides: 'class="off"' }, 'SSR HTML');
		if (html.includes('Hidden')) {
			throw new Error(
				'Expected SSR HTML to render only the taken @if arm, but found "Hidden".',
			);
		}
		const preloadPaths = modulePreloadPaths(html);
		receipt.note(`SSR branch modulepreload hrefs: ${preloadPaths.join(', ')}`);

		const page = await preview.browser.visit('/');

		// Resume truth: the initial arm comes from server HTML, not app code.
		// Startup fetches stay inside the rendered modulepreload set; the
		// branch-update symbol is not among them.
		await expect.page.text(page, ON_ARM, 'Shown', WAIT);
		await expect.page.bodyText(page, { notContains: 'Hidden' }, WAIT);
		assertArmBetweenAnchors(
			await page.content(),
			{ shows: 'class="on"', hides: 'class="off"' },
			'resumed DOM',
		);
		const startupScripts = await jsBuildRequestPaths(page);
		receipt.note(`SSR branch startup JS: ${formatPaths(startupScripts)}`);
		assertStartupStaysInsidePreloads(startupScripts, preloadPaths);

		// Interaction truth: the click writes `open`, the runtime lazily loads
		// the branch-update symbol, and the range between the anchors flips.
		await page.click(TOGGLE, WAIT);
		await expect.page.text(page, OFF_ARM, 'Hidden', WAIT);
		await expect.page.bodyText(page, { notContains: 'Shown' }, WAIT);
		assertArmBetweenAnchors(
			await page.content(),
			{ shows: 'class="off"', hides: 'class="on"' },
			'flipped DOM',
		);
		const afterClickScripts = await jsBuildRequestPaths(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		receipt.note(`SSR branch post-click lazy JS: ${formatPaths(lazyChunks)}`);

		// Round-trip truth: flipping back restores the original arm between the
		// same anchors without stale leftovers.
		await page.click(TOGGLE, WAIT);
		await expect.page.text(page, ON_ARM, 'Shown', WAIT);
		await expect.page.bodyText(page, { notContains: 'Hidden' }, WAIT);
		assertArmBetweenAnchors(
			await page.content(),
			{ shows: 'class="on"', hides: 'class="off"' },
			'round-trip DOM',
		);

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('ssr branch arm resumed, flipped, and round-tripped');
	},
);

type ArmExpectation = {
	/** Fragment the taken arm must render between the anchors. */
	readonly shows: string;
	/** Fragment of the other arm that must not appear between the anchors. */
	readonly hides: string;
};

function assertArmBetweenAnchors(html: string, arm: ArmExpectation, label: string): void {
	const start = html.indexOf(BRANCH_START);
	const end = html.indexOf(BRANCH_END);
	if (start === -1 || end === -1 || end < start) {
		throw new Error(
			`Expected ${label} to keep both branch comment anchors: ${BRANCH_START} … ${BRANCH_END}`,
		);
	}
	const range = html.slice(start + BRANCH_START.length, end);
	if (!range.includes(arm.shows)) {
		throw new Error(
			`Expected ${label} branch range to contain ${arm.shows}, got: ${range.trim()}`,
		);
	}
	if (range.includes(arm.hides)) {
		throw new Error(
			`Expected ${label} branch range to drop ${arm.hides}, got: ${range.trim()}`,
		);
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
			`Expected SSR branch startup to fetch only rendered modulepreload chunks (no branch symbol before interaction), but saw: ${unexpected.join(', ')}`,
		);
	}
}

function formatPaths(paths: readonly string[]): string {
	return paths.length === 0 ? '(none)' : paths.join(', ');
}
