import { box } from '@async/witness';

// Product truth: an SSR-rendered @if arm that hosts an attach behavior must
// resume from the payload, dispatch its arm-record event as the very first
// interaction, and — per spec 06-runtime-resumer:222-224 — clean up the
// behavior BEFORE the flip-out removes its host from the DOM. Flipping back
// must rematerialize the arm's records (inner button dispatches again) and
// re-activate the behavior. The behavior proves activation by stamping its
// host and the body; its cleanup proves disposal ordering by recording whether
// the host was still connected when the cleanup ran.
const FIXTURE = 'fixtures/vite-ssr-dispose';
const INDEX = `${FIXTURE}/dist/index.html`;
const TOGGLE = '[data-toggle]';
const INNER = '[data-inner]';
const SECTION = 'main > section';
const OFF_ARM = 'main > p.off';
const OUTPUT = 'main > output';
const BRANCH_START = '<!--markless:branch:branch-site:0-->';
const BRANCH_END = '<!--/markless:branch:branch-site:0-->';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr branch dispose: built @if arm behavior cleans up on flip-out and rewires on flip-back',
		tags: ['ssr', 'build', 'preview', 'browser', 'branch', 'behavior'],
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

		// Server truth: SSR HTML carries only the taken arm (the section with the
		// inner button) between the branch comment anchors, plus the resumable
		// payload scripts. The attach behavior must NOT run server-side: no
		// activation stamps may appear in the served HTML.
		const html = await preview.request('/');
		await expect.html.contains(html, 'type="markless/state"');
		await expect.html.contains(html, 'type="markless/view"');
		await expect.html.contains(html, 'data-async-resumer');
		assertArmBetweenAnchors(html, { shows: 'data-inner', hides: 'class="off"' }, 'SSR HTML');
		if (html.includes('Closed')) {
			throw new Error(
				'Expected SSR HTML to render only the taken @if arm, but found "Closed".',
			);
		}
		if (html.includes('data-attached') || html.includes('data-cleanup')) {
			throw new Error(
				'Expected the attach behavior to stay browser-only, but SSR HTML carries its activation stamps.',
			);
		}
		assertOutputShows(html, 'none', 'SSR HTML');
		const preloadPaths = modulePreloadPaths(html);
		receipt.note(`SSR dispose modulepreload hrefs: ${formatPaths(preloadPaths)}`);

		const page = await preview.browser.visit('/');

		// Resume truth: the taken arm and initial output come from the payload,
		// and NO app code runs before interaction — the attach behavior has not
		// stamped its host yet, and startup fetches stay inside the rendered
		// modulepreload set (the resume runtime wakes on first interaction).
		await expect.page.text(page, OUTPUT, 'none', WAIT);
		await expect.page.attribute(page, SECTION, 'data-attached', null, WAIT);
		await expect.page.attribute(page, 'body', 'data-cleanup', null, WAIT);
		const startupScripts = await jsBuildRequestPaths(page);
		receipt.note(`SSR dispose startup JS: ${formatPaths(startupScripts)}`);
		assertStartupStaysInsidePreloads(startupScripts, preloadPaths);

		// Arm-record truth: the arm-internal button is the VERY FIRST interaction.
		// Its event record rides the branch armRecords, so this click proves the
		// bootstrap wake set includes arm-record events: the runtime wakes,
		// start() activates the taken arm's behavior (host stamped, cleanup
		// observable armed), and the replayed click dispatches the arm handler.
		await page.click(INNER, WAIT);
		await expect.page.text(page, OUTPUT, 'inner-clicked', WAIT);
		await expect.page.attribute(page, SECTION, 'data-attached', 'yes', WAIT);
		await expect.page.attribute(page, 'body', 'data-cleanup', 'pending', WAIT);
		const afterInnerScripts = await jsBuildRequestPaths(page);
		receipt.note(
			`SSR dispose post-inner-click lazy JS: ${formatPaths(
				afterInnerScripts.filter((path) => !startupScripts.includes(path)),
			)}`,
		);

		// Disposal truth: flipping the branch out must run the behavior cleanup,
		// and it must run BEFORE the host detaches (spec 06: removed nodes clean
		// up their behaviors before their locators are discarded).
		await page.click(TOGGLE, WAIT);
		await expect.page.text(page, OFF_ARM, 'Closed', WAIT);
		await expect.page.attribute(page, 'body', 'data-cleanup', 'ran', WAIT);
		await expect.page.attribute(page, 'body', 'data-cleanup-host-connected', 'true', WAIT);
		assertArmBetweenAnchors(
			await page.content(),
			{ shows: 'class="off"', hides: 'data-inner' },
			'flipped-out DOM',
		);

		// Flip-back truth: the arm rematerializes, the behavior re-activates (the
		// cleanup observable re-arms to "pending"), and the inner button's arm
		// event record dispatches again with the rewired records.
		await page.click(TOGGLE, WAIT);
		await expect.page.attribute(page, SECTION, 'data-attached', 'yes', WAIT);
		await expect.page.attribute(page, 'body', 'data-cleanup', 'pending', WAIT);
		assertArmBetweenAnchors(
			await page.content(),
			{ shows: 'data-inner', hides: 'class="off"' },
			'flipped-back DOM',
		);
		await page.click(INNER, WAIT);
		await expect.page.text(page, OUTPUT, 'inner-clicked-again', WAIT);

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture(
			'ssr branch arm behavior activated, cleaned up before flip-out removal, and rewired on flip-back',
		);
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
			`Expected SSR dispose startup to fetch only rendered modulepreload chunks (no un-preloaded app symbol before interaction), but saw: ${unexpected.join(', ')}`,
		);
	}
}

function formatPaths(paths: readonly string[]): string {
	return paths.length === 0 ? '(none)' : paths.join(', ');
}
