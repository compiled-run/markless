// Run: node --experimental-strip-types scripts/witness.ts
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright-core';
import { flatNav, headFor, nav } from '../nav.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir =
	process.env.WITNESS_SHOTS_DIR ??
	'/Users/jacksm5pro/dev/open-source/markless/goals/compiled-website/notes/shots';

const failures: string[] = [];
const knownFailing: string[] = [];
const themeShots: Record<string, unknown>[] = [];
let knownFailingReason: string | undefined = undefined;
const check = (ok: boolean, label: string, detail = '') => {
	const line = `${label}${detail ? ` — ${detail}` : ''}`;
	if (ok) {
		console.log(`ok            ${line}`);
		return;
	}
	if (knownFailingReason) {
		knownFailing.push(`${line} (${knownFailingReason})`);
		console.log(`known-failing ${line} — ${knownFailingReason}`);
		return;
	}
	failures.push(line);
	console.log(`FAIL          ${line}`);
};

const freePort = () =>
	new Promise<number>((done, fail) => {
		const probe = createServer();
		probe.on('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			probe.close(() => done(port));
		});
	});

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
	cwd: root,
	env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
	stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog: string[] = [];
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

const stop = () => {
	if (!server.killed) server.kill('SIGKILL');
};
process.on('exit', stop);

const waitFor = async (url: string, attempts = 60) => {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.status < 500) return response;
		} catch {}
		await new Promise((done) => setTimeout(done, 250));
	}
	throw new Error(`server never answered ${url}\n${serverLog.join('')}`);
};

/** The tooltip is a CSS box, so "showing" means what the browser actually paints. */
const tooltipIsVisible = (tip: Locator) =>
	tip.evaluate((node) => {
		const style = getComputedStyle(node as Element);
		const box = (node as Element).getBoundingClientRect();
		return (
			style.visibility === 'visible' &&
			Number(style.opacity) > 0.9 &&
			box.width > 0 &&
			box.height > 0
		);
	});

/** A page's screenshot name: /markless/concepts/state -> concepts-state. */
const slugFor = (href: string) => href.replace(/^\/markless\/?/, '').replace(/\//g, '-') || 'index';

/** Waits until one element's text satisfies a predicate, then returns it. */
const settleText = async (locator: Locator, wanted: (text: string) => boolean, label: string) => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const text = ((await locator.textContent()) ?? '').trim();
		if (wanted(text)) return text;
		await new Promise((done) => setTimeout(done, 100));
	}
	const text = ((await locator.textContent()) ?? '').trim();
	check(false, label, `never settled, last read "${text}"`);
	return text;
};

const settleOn = (page: Page, text: string) =>
	page
		.waitForFunction(
			(expected) =>
				[...document.querySelectorAll('button')].some(
					(node) => node.textContent?.trim() === expected,
				),
			text,
			{ timeout: 5000 },
		)
		.catch(() => {});

try {
	await waitFor(`${origin}/markless`);

	const landing = await fetch(`${origin}/markless`);
	check(landing.status === 200, 'GET /markless', String(landing.status));
	const landingHtml = await landing.text();

	const statePage = await fetch(`${origin}/markless/concepts/state`);
	check(statePage.status === 200, 'GET /markless/concepts/state', String(statePage.status));
	const stateHtml = await statePage.text();
	check(
		stateHtml.includes('State is a variable the page is watching'),
		'state page carries its prose',
	);
	check(
		!stateHtml.includes('<pre><code class="language-tsrx">'),
		'no code fence was left unhighlighted in the served HTML',
	);

	const assetPath = landingHtml.match(
		/(?:href|src)="(\/markless\/(?:assets|build)\/[^"]+)"/,
	)?.[1];
	check(Boolean(assetPath), 'built asset URL found in served HTML', assetPath ?? 'none');
	if (assetPath) {
		const asset = await fetch(`${origin}${assetPath}`);
		const contentType = asset.headers.get('content-type') ?? '';
		check(asset.status === 200, `GET ${assetPath}`, String(asset.status));
		check(
			/javascript|css/.test(contentType),
			'asset content-type is script or stylesheet',
			contentType,
		);
	}

	const browser = await chromium.launch({ channel: 'chrome', headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

		for (const [href, selectedTitle, otherTitle] of [
			['/markless', 'Framework', 'UI'],
			['/markless/ui', 'UI', 'Framework'],
		] as const) {
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const trigger = page.locator('.mode-select-trigger');
			const content = page.locator('.mode-select-content');
			await trigger.click();
			await content.waitFor({ state: 'visible' });
			const selected = content.locator('.mode-select-item[ui-selected]');
			const other = content.getByRole('option', { name: otherTitle });
			check(
				(await content.isVisible()) &&
					(await trigger.getAttribute('aria-expanded')) === 'true',
				`${href}: the mode trigger opens the real select content`,
			);
			check(
				((await selected.locator('.mode-select-item-label').textContent()) ?? '').trim() ===
					selectedTitle,
				`${href}: the selected mode matches the URL`,
				((await selected.textContent()) ?? '').trim(),
			);
			check(
				(await other.count()) === 1 &&
					(await other.getAttribute('aria-selected')) === 'false',
				`${href}: the other mode is a real unselected option`,
				otherTitle,
			);
		}

		await page.goto(`${origin}/markless/concepts/state`, { waitUntil: 'load' });
		await mkdir(shotsDir, { recursive: true });

		// --- highlighting ------------------------------------------------------
		const tokens = page.locator('pre.shiki code span[style*="color"]');
		const tokenCount = await tokens.count();
		check(tokenCount > 0, 'code block carries highlighted token spans', `${tokenCount} spans`);
		const paletteSize = new Set(
			await tokens.evaluateAll((nodes) =>
				nodes.map((node) => getComputedStyle(node as Element).color),
			),
		).size;
		check(
			paletteSize >= 4,
			'the block paints at least four token colours',
			`${paletteSize} colours`,
		);
		const tokenColour = await tokens
			.first()
			.evaluate((node) => getComputedStyle(node as Element).color);
		const codeColour = await page
			.locator('pre.shiki')
			.first()
			.evaluate((node) => getComputedStyle(node as Element).color);
		check(
			tokenColour !== codeColour && tokenColour !== '',
			'a highlighted token is painted a different colour from the code body',
			`${tokenColour} vs ${codeColour}`,
		);
		await page.screenshot({ path: `${shotsDir}/T010-highlight.png`, fullPage: true });

		// One block on its own, so the owner can judge the theme and the font.
		const block = page.locator('pre.shiki').first();
		await block.screenshot({ path: `${shotsDir}/T005-codeblock.png` });

		// A block at rest ends at its last line: no reserved strip, no empty band.
		const hug = await block.evaluate((node) => {
			const element = node as HTMLElement;
			const lines = [...element.querySelectorAll('.line')];
			const last = lines.at(-1)?.getBoundingClientRect();
			const box = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			const code = element.querySelector('code');
			const token = element.querySelector('code span');
			return {
				gap: last ? box.bottom - last.bottom : Number.NaN,
				padding: Number.parseFloat(style.paddingBottom),
				font: style.fontFamily,
				codeFont: code ? getComputedStyle(code).fontFamily : '',
				tokenFont: token ? getComputedStyle(token).fontFamily : '',
			};
		});
		check(
			// The slack is the half-leading under the last line box, not a reserved strip.
			Number.isFinite(hug.gap) && hug.gap <= hug.padding + 8,
			'a code block at rest ends at its last line',
			`${hug.gap.toFixed(1)}px below the last line, padding ${hug.padding}px`,
		);
		const isMono = (font: string) => /mono|Menlo|Consolas/i.test(font);
		check(isMono(hug.font), 'the code block is set in the monospace stack', hug.font);
		// `* { font-family }` matches the token spans directly, and a direct match
		// beats an inherited family, so `pre` being monospace proves nothing about
		// the text a reader actually sees.
		check(
			isMono(hug.codeFont),
			'the computed font-family of `pre code` names a monospace family',
			hug.codeFont,
		);
		check(
			isMono(hug.tokenFont),
			'a highlighted token span is painted in the monospace stack',
			hug.tokenFont,
		);

		// A UI family page carries both kinds at once: the prose fences the page
		// writes and the demo pane the playground generates. Both are monospace.
		await page.goto(`${origin}/markless/ui/accordion`, { waitUntil: 'load' });
		const paneFonts = await page.evaluate(() => {
			const fontOf = (selector: string) => {
				const node = document.querySelector(selector);
				return node ? getComputedStyle(node).fontFamily : '';
			};
			return { prose: fontOf('.prose pre'), pane: fontOf('.pg-shiki') };
		});
		check(
			isMono(paneFonts.prose),
			'/markless/ui/accordion: its prose fences are set in the monospace stack',
			paneFonts.prose,
		);
		check(
			isMono(paneFonts.pane),
			'/markless/ui/accordion: the generated demo pane is set in the monospace stack',
			paneFonts.pane,
		);
		await page.goto(`${origin}/markless/concepts/state`, { waitUntil: 'load' });

		// --- hover docs --------------------------------------------------------
		// Most tokens are typed but not documented: the hover shows the type the
		// compiler inferred and `data-doc` is empty, which is what the very first
		// token on this page is. The two-line tooltip is what is under test, so the
		// checks run on the first token that really carries a sentence.
		const documented = page.locator('pre.shiki .tsrx-hover[data-doc]:not([data-doc=""])');
		const documentedCount = await documented.count();
		check(
			documentedCount > 0,
			'the page serves at least one token with a doc sentence of its own',
			`${documentedCount} of ${await page.locator('pre.shiki .tsrx-hover').count()} hover tokens`,
		);
		const hover = documented.first();
		await hover.waitFor();
		const expectedTitle = await hover.getAttribute('data-doc-title');
		const expectedDoc = await hover.getAttribute('data-doc');
		check(
			Boolean(expectedTitle && expectedDoc),
			'the token declares a title and a doc',
			String(expectedTitle),
		);
		const tip = hover.locator('.tsrx-tip');
		check(!(await tooltipIsVisible(tip)), 'the tooltip is hidden before anything points at it');
		// The block that has to hold still is the one the token sits in, which is
		// not always the page's first fence.
		const hoverBlockHeight = () =>
			hover.evaluate(
				(node) =>
					(node as HTMLElement).closest('pre')?.getBoundingClientRect().height ??
					Number.NaN,
			);
		const preHeightAtRest = await hoverBlockHeight();
		await hover.hover();
		await page.waitForTimeout(120);
		check(await tooltipIsVisible(tip), 'the tooltip shows on hover');
		const preHeightOnHover = await hoverBlockHeight();
		check(
			Math.abs(preHeightOnHover - preHeightAtRest) < 0.5,
			'the code block does not change height while a token is pointed at',
			`${preHeightAtRest.toFixed(1)}px then ${preHeightOnHover.toFixed(1)}px`,
		);
		// The doc is a popover above the token, so its foot sits above the token's head.
		const anchored = await hover.evaluate((node) => {
			const token = (node as HTMLElement).getBoundingClientRect();
			const doc = (node as HTMLElement).querySelector('.tsrx-tip')?.getBoundingClientRect();
			return doc ? { above: doc.bottom <= token.top + 1, width: doc.width } : undefined;
		});
		check(Boolean(anchored?.above), 'the tooltip is anchored above the token it explains');
		check(
			(anchored?.width ?? 0) > 0,
			'the tooltip has a painted box',
			`${anchored?.width ?? 0}px wide`,
		);
		check(
			(await tip.locator('.tsrx-tip-title').textContent())?.trim() === expectedTitle,
			'the tooltip shows the expected title',
			String(await tip.locator('.tsrx-tip-title').textContent()),
		);
		check(
			(await tip.locator('.tsrx-tip-body').textContent())?.trim() === expectedDoc,
			'the tooltip shows the expected sentence',
		);
		await page.screenshot({ path: `${shotsDir}/T010-tooltip.png`, fullPage: true });

		// Keyboard reach: focusing the token has to do what hovering it does.
		await page.mouse.move(0, 0);
		await page.waitForTimeout(120);
		check(!(await tooltipIsVisible(tip)), 'the tooltip hides again when the pointer leaves');
		await hover.focus();
		await page.waitForTimeout(120);
		check(await tooltipIsVisible(tip), 'the tooltip shows on keyboard focus');
		await hover.blur();

		// --- the island still resumes -----------------------------------------
		const button = page.getByRole('button', { name: /Clicked/ }).first();
		await button.waitFor();
		await page.screenshot({ path: `${shotsDir}/T004-state-before.png`, fullPage: true });

		const readCount = async () => (await button.textContent())?.trim();
		const before = await readCount();
		check(
			before === 'Clicked 0 times',
			'counter renders its zero state from the server',
			String(before),
		);

		// First click both wakes the island and increments; wait for the text to
		// settle before the second click (a click sent mid-resume is dropped).
		await button.click();
		await settleOn(page, 'Clicked 1 times');
		await button.click();
		await settleOn(page, 'Clicked 2 times');
		const after = await readCount();
		check(
			after === 'Clicked 2 times',
			'counter reaches 2 after two clicks (island resumed)',
			String(after),
		);
		await page.screenshot({ path: `${shotsDir}/T004-state-after.png`, fullPage: true });

		// --- every page in the nav: 200, an h1, a head of its own, a screenshot -
		// Nineteen identical titles are nineteen pages a reader, a bookmark and a
		// search result cannot tell apart, so the title and the description are
		// asserted per page and then asserted to be all different.
		const heads: { href: string; title: string; description: string }[] = [];
		for (const section of nav) {
			for (const entry of section.entries) {
				const response = await fetch(`${origin}${entry.href}`);
				check(response.status === 200, `GET ${entry.href}`, String(response.status));
				const html = await response.text();
				check(/<h1[^>]*>[^<]/.test(html), `${entry.href} serves an h1`);
				check(
					html.includes('class="page-meta"'),
					`${entry.href} carries its level, reading time and prerequisite line`,
				);
				const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
				const description =
					html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
				const wanted = headFor(entry.href);
				check(title === wanted.title, `${entry.href} serves its own <title>`, title);
				check(
					description === wanted.description && description.length > 40,
					`${entry.href} serves a <meta name="description"> of its own`,
					description.slice(0, 60),
				);
				check(
					html.includes('<html lang="en"'),
					`${entry.href} declares the language it is written in`,
				);
				check(
					html.includes('rel="icon" href="/markless/favicon.svg"'),
					`${entry.href} links a favicon`,
				);
				check(
					html.includes(`<link rel="canonical" href="https://compiled.run${entry.href}"`),
					`${entry.href} names itself canonical`,
				);
				// B1: the published `computed<T>(derive: () => T)` takes no argument,
				// so a documented `{ signal }` parameter is a snippet that does not
				// compile. Proven with tsc against @markless/core/dist/index.d.ts.
				check(
					!/computed\(async\s*\(\s*\{/.test(html.replace(/<[^>]+>/g, '')),
					`${entry.href} prints no computed(async ({ … }) => …), which does not typecheck on 0.3.1`,
				);
				heads.push({ href: entry.href, title, description });
				await page.goto(`${origin}${entry.href}`, { waitUntil: 'load' });
				const heading = ((await page.locator('h1').first().textContent()) ?? '').trim();
				check(heading.length > 0, `${entry.href} renders its h1 in the browser`, heading);
				await page.screenshot({
					path: `${shotsDir}/T005-${slugFor(entry.href)}.png`,
					fullPage: true,
				});
			}
		}
		check(
			new Set(heads.map((one) => one.title)).size === heads.length,
			'every page has a title no other page has',
			`${new Set(heads.map((one) => one.title)).size} distinct of ${heads.length}`,
		);
		check(
			new Set(heads.map((one) => one.description)).size === heads.length,
			'every page has a description no other page has',
			`${new Set(heads.map((one) => one.description)).size} distinct of ${heads.length}`,
		);

		// --- what a crawler and an agent look for before any page ---------------
		// The site is one section of compiled.run, so `public/` is served under
		// /markless/. scripts/generate-seo.ts writes all three from nav.ts.
		for (const [path, wanted] of [
			['/markless/robots.txt', 'Sitemap: https://compiled.run/markless/sitemap.xml'],
			['/markless/sitemap.xml', '<loc>https://compiled.run/markless/concepts/state</loc>'],
			['/markless/llms.txt', '](https://compiled.run/markless/reference)'],
			['/markless/favicon.svg', '<svg'],
		] as const) {
			const response = await fetch(`${origin}${path}`);
			check(response.status === 200, `GET ${path}`, String(response.status));
			const body = await response.text();
			check(body.includes(wanted), `${path} carries what it is for`, wanted);
		}
		const sitemapBody = await (await fetch(`${origin}/markless/sitemap.xml`)).text();
		check(
			flatNav.every((entry) =>
				sitemapBody.includes(`<loc>https://compiled.run${entry.href}</loc>`),
			),
			'the sitemap lists every page in the nav',
			`${(sitemapBody.match(/<loc>/g) ?? []).length} urls for ${flatNav.length} pages`,
		);
		const llmsBody = await (await fetch(`${origin}/markless/llms.txt`)).text();
		check(
			flatNav.every((entry) => llmsBody.includes(`(https://compiled.run${entry.href}):`)),
			'llms.txt lists every page with a sentence about it',
		);

		// --- widget: the mug card on the landing page ---------------------------
		// The landing teaches `state` with the polaroid's heart, not a counter, so
		// the resume proof lives there: the count is served at nought, and two
		// clicks reach two. The run log next to it is the page's other claim, that
		// the component body ran once — it must still read one entry afterwards.
		await page.goto(`${origin}/markless`, { waitUntil: 'load' });
		const mugHeart = page.locator('.mug-demo article button');
		const mugLikes = page.locator('.mug-demo article button span').first();
		await mugHeart.waitFor();
		check(
			((await mugLikes.textContent()) ?? '').trim() === '0',
			'the landing mug card serves nought likes from the server',
			((await mugLikes.textContent()) ?? '').trim(),
		);
		await mugHeart.click();
		await settleText(
			mugLikes,
			(text) => text === '1',
			'the landing mug card counts the first click',
		);
		check(
			((await mugLikes.textContent()) ?? '').trim() === '1',
			'clicking the heart adds a like, so the landing island resumed',
			((await mugLikes.textContent()) ?? '').trim(),
		);
		await mugHeart.click();
		await settleText(
			mugLikes,
			(text) => text === '2',
			'the landing mug card counts a second click',
		);
		check(
			((await mugLikes.textContent()) ?? '').trim() === '2',
			'the likes keep adding on repeat clicks, so the island stayed awake',
			((await mugLikes.textContent()) ?? '').trim(),
		);

		// --- widget: the run log on the landing page ----------------------------
		const runOnceLikes = page.locator('.run-once button span').first();
		const runOnceEntries = page.locator('.run-once .entry');
		await runOnceLikes.waitFor();
		const ranAt = ((await runOnceEntries.first().textContent()) ?? '').trim();
		check(
			(await runOnceEntries.count()) === 1 && ranAt.startsWith('#1 at '),
			'the run log opens on one entry, stamped when the body ran',
			ranAt,
		);
		await runOnceLikes.click();
		await settleText(
			runOnceLikes,
			(text) => text === '1',
			'the run-log heart counts its click',
		);
		check(
			((await runOnceLikes.textContent()) ?? '').trim() === '1',
			'the run-log heart adds a like too',
			((await runOnceLikes.textContent()) ?? '').trim(),
		);
		check(
			(await runOnceEntries.count()) === 1 &&
				((await runOnceEntries.first().textContent()) ?? '').trim() === ranAt,
			'the log gains no second entry, so the click ran no component body again',
			((await runOnceEntries.first().textContent()) ?? '').trim(),
		);
		await page.screenshot({
			path: `${shotsDir}/T004-landing-widgets-after.png`,
			fullPage: true,
		});

		// --- widget: two variables on the state page ---------------------------
		await page.goto(`${origin}/markless/concepts/state`, { waitUntil: 'load' });
		const twoNumbers = async () =>
			(await page.locator('.playground p').allTextContents()).map((text) =>
				Number(text.replace(/[^0-9]+/g, '')),
			);
		const addWatched = page.getByRole('button', { name: 'Add one to the watched variable' });
		await addWatched.waitFor();
		const [watchedBefore, drawnBefore] = await twoNumbers();
		check(
			watchedBefore === 0,
			'two-variables watched number starts at 0',
			String(watchedBefore),
		);
		check(
			Number.isFinite(drawnBefore) && drawnBefore >= 100,
			'two-variables drew a number during render',
			String(drawnBefore),
		);
		await addWatched.click();
		await settleText(
			page.locator('.playground p').first(),
			(text) => text.endsWith('1'),
			'two-variables watched number reaches 1',
		);
		const [watchedAfter, drawnAfter] = await twoNumbers();
		check(
			watchedAfter === 1,
			'two-variables watched number moved on click',
			String(watchedAfter),
		);
		check(
			drawnAfter === drawnBefore,
			'two-variables drawn number did not move, so the component did not run again',
			`${drawnBefore} then ${drawnAfter}`,
		);
		await page.screenshot({ path: `${shotsDir}/T005-two-variables-after.png`, fullPage: true });

		await page.goto(`${origin}/markless/concepts/computed`, { waitUntil: 'load' });
		const totalLine = page.locator('.playground p').nth(2);
		const addShirt = page.getByRole('button', { name: 'Add a shirt' });
		const addMug = page.getByRole('button', { name: 'Add a mug' });
		await addShirt.waitFor();
		check(
			((await totalLine.textContent()) ?? '').trim() === 'Total: 20',
			'cart total renders 20 from the server',
			((await totalLine.textContent()) ?? '').trim(),
		);
		await addShirt.click();
		await settleText(totalLine, (text) => text === 'Total: 40', 'cart total reaches 40');
		check(
			((await totalLine.textContent()) ?? '').trim() === 'Total: 40',
			'adding a shirt re-derives the total with no line updating it',
		);
		await addMug.click();
		await settleText(totalLine, (text) => text === 'Total: 48', 'cart total reaches 48');
		check(
			((await totalLine.textContent()) ?? '').trim() === 'Total: 48',
			'adding a mug re-derives the same total',
		);
		await page.screenshot({ path: `${shotsDir}/T005-cart-total-after.png`, fullPage: true });

		// --- widget: three differences on the reading-tsrx page ----------------
		await page.goto(`${origin}/markless/start/reading-tsrx`, { waitUntil: 'load' });
		const explorerNote = page.locator('.explorer-note');
		const litLines = page.locator('.file-line.is-lit');
		await explorerNote.waitFor();
		check(
			((await explorerNote.textContent()) ?? '').includes('statement container') ||
				((await explorerNote.textContent()) ?? '').includes('body is written'),
			'three-differences opens on the body explanation',
			((await explorerNote.textContent()) ?? '').slice(0, 60),
		);
		check(
			(await litLines.count()) === 2,
			'three-differences lights the two body lines to start with',
			String(await litLines.count()),
		);
		await page.getByRole('button', { name: 'The markup' }).click();
		await settleText(
			explorerNote,
			(text) => text.includes('The markup is a statement'),
			'three-differences explains the markup after a click',
		);
		check(
			((await explorerNote.textContent()) ?? '').includes('The markup is a statement'),
			'clicking a label swaps the sentence under the file',
		);
		check(
			(await litLines.count()) === 1,
			'clicking a label moves the highlight to one line',
			String(await litLines.count()),
		);
		// The widget shows `components/demos/concepts/counter.tsrx` line for line, so the
		// page carries one counter file rather than two that differ. The counter
		// renders a single element, so the fragment is taught from its own
		// example further down the page and the widget has no third label.
		const widgetFile = (await page.locator('.file-lines .file-line').allTextContents())
			.map((line) => line.trim())
			.filter((line) => line !== '');
		const counterFile = (
			await readFile(`${root}/components/demos/concepts/counter.tsrx`, 'utf8')
		)
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '');
		check(
			widgetFile.join('\n') === counterFile.join('\n'),
			'the three-differences widget shows the counter file itself',
			widgetFile.join(' | '),
		);
		check(
			(await page.getByRole('button', { name: 'The fragment' }).count()) === 0,
			'the widget offers no fragment label, because the counter file has no fragment',
		);
		await page.screenshot({
			path: `${shotsDir}/T005-three-differences-after.png`,
			fullPage: true,
		});

		await page.goto(`${origin}/markless/concepts/state`, { waitUntil: 'load' });
		const headSeed = await page.evaluate(() =>
			[...document.head.querySelectorAll('script:not([src])')].some((node) =>
				node.textContent?.includes('tsrx.storage/1'),
			),
		);
		check(headSeed, 'the storage seed script is in the head, so the theme cannot flash');

		const themeState = () =>
			page.evaluate(() => {
				const slot = document.querySelector('.theme-toggle-slot')?.getBoundingClientRect();
				const island = document
					.querySelector('.theme-toggle-island')
					?.getBoundingClientRect();
				return {
					attr: document.documentElement.getAttribute('data-theme'),
					painted: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
					stored: localStorage.getItem('theme'),
					prefers: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
					paper: getComputedStyle(document.body).backgroundColor,
					offered: [...document.querySelectorAll('.theme-toggle')]
						.filter((node) => getComputedStyle(node as Element).display !== 'none')
						.map((node) => (node as HTMLElement).dataset.themeToggle)
						.join(),
					onSlot:
						Boolean(slot && island) &&
						Math.abs(slot!.left - island!.left) < 2 &&
						Math.abs(slot!.right - island!.right) < 2,
					// The drawing on the button that is actually offered, and whether
					// the browser decoded it: a 404 still leaves the <img> in the DOM.
					icon: (() => {
						const shown = [...document.querySelectorAll('.theme-toggle')].find(
							(node) => getComputedStyle(node as Element).display !== 'none',
						);
						const image = shown?.querySelector(
							'img.theme-toggle-icon',
						) as HTMLImageElement | null;
						return {
							src: image?.getAttribute('src') ?? '',
							decoded: (image?.naturalWidth ?? 0) > 0,
						};
					})(),
				};
			});

		const atRest = await themeState();
		// public/theme.js resolves the stored choice into a `dark` or `light`
		// class on <html>, the only thing the CSS reads. So what an untouched
		// reader is owed is no stored choice and their own OS setting painted.
		check(
			atRest.stored === null && atRest.painted === atRest.prefers,
			'an untouched reader stores nothing and is put on their system theme',
			`painted ${atRest.painted}, prefers ${atRest.prefers}, stored ${String(atRest.stored)}`,
		);
		check(atRest.onSlot, 'the toggle lands on the hole the header reserves for it');
		check(
			atRest.offered === 'dark',
			'exactly one button is offered, and on a light page it is the dark one',
			atRest.offered,
		);
		check(
			atRest.icon.src === '/markless/theme/sun.png',
			'the light page shows the sun drawing',
			atRest.icon.src,
		);
		check(atRest.icon.decoded, 'the sun drawing decoded');

		await page.locator('.theme-toggle-to-dark').click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark')
				break;
			await new Promise((done) => setTimeout(done, 100));
		}
		const dark = await themeState();
		check(
			dark.attr === 'dark' && dark.painted === 'dark',
			'clicking the toggle puts data-theme="dark" and the dark class on <html>',
			`data-theme="${String(dark.attr)}", painted ${dark.painted}`,
		);
		check(dark.stored === 'dark', 'the choice is written to localStorage', String(dark.stored));
		check(
			dark.paper !== atRest.paper,
			'the page is actually repainted, not just re-labelled',
			`${atRest.paper} then ${dark.paper}`,
		);
		check(dark.offered === 'light', 'the dark page offers the light button', dark.offered);
		check(
			dark.icon.src === '/markless/theme/moon.png',
			'the drawing swaps with the theme: dark shows the moon',
			dark.icon.src,
		);
		check(dark.icon.decoded, 'the moon drawing decoded');

		await page.reload({ waitUntil: 'load' });
		const reloaded = await themeState();
		check(reloaded.attr === 'dark', 'the choice survives a reload', String(reloaded.attr));
		check(
			reloaded.paper === dark.paper,
			'the reloaded page paints dark from the first frame',
			reloaded.paper,
		);
		await page.screenshot({ path: `${shotsDir}/T019-theme-toggle-dark.png`, fullPage: false });

		await page.locator('.theme-toggle-to-light').click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light')
				break;
			await new Promise((done) => setTimeout(done, 100));
		}
		const back = await themeState();
		check(back.attr === 'light', 'the toggle goes back to light', String(back.attr));
		check(back.paper === atRest.paper, 'light is the light it started on', back.paper);
		await page.evaluate(() => localStorage.removeItem('theme'));

		await page.goto(`${origin}/markless/concepts/state`, { waitUntil: 'load' });
		await page.evaluate(() => {
			(window as { __beforeNavigation?: number }).__beforeNavigation = 1;
		});
		await page.locator('a.sidebar-link[href="/markless/concepts/computed"]').click();
		await page.waitForURL('**/markless/concepts/computed');
		const landed = await page.evaluate(() => ({
			heading: document.querySelector('h1')?.textContent ?? '',
			crumb: document.querySelector('.crumb-page')?.textContent ?? '',
			survived: (window as { __beforeNavigation?: number }).__beforeNavigation === 1,
		}));
		check(
			landed.crumb === 'Computed',
			'a sidebar click lands on the page it names, chrome and all',
			`${landed.crumb} / ${landed.heading}`,
		);
		check(
			!landed.survived,
			'that click is a document load, which is what finding 40 says it has to be',
			landed.survived
				? 'the window survived the click — client-side navigation works now'
				: '',
		);

		// --- sprites and mascots ------------------------------------------------
		await page.goto(`${origin}/markless`, { waitUntil: 'load' });
		const heroMascot = page.locator('.prose img.mascot').first();
		await heroMascot.waitFor();
		const heroSrc = await heroMascot.getAttribute('src');
		check(
			heroSrc === '/markless/mascots/markless.png',
			'the landing hero is the markless mascot',
			String(heroSrc),
		);
		const heroWidth = await heroMascot.evaluate(
			(node) => (node as HTMLImageElement).naturalWidth,
		);
		check(
			heroWidth > 0,
			'the markless mascot on the landing decodes',
			`naturalWidth ${heroWidth}`,
		);
		const siblingMascots = await page.locator('.more-from img.mascot').evaluateAll((nodes) =>
			nodes.map((node) => ({
				src: (node as HTMLImageElement).getAttribute('src'),
				width: (node as HTMLImageElement).naturalWidth,
			})),
		);
		check(
			siblingMascots.length === 4 && siblingMascots.every((one) => one.width > 0),
			'the More from compiled.run strip shows four mascots that decode',
			siblingMascots.map((one) => `${one.src}:${one.width}`).join(' '),
		);
		const sprites = await page
			.locator('.sprite img.sprite-ink-light')
			.evaluateAll((nodes) => nodes.map((node) => (node as HTMLImageElement).naturalWidth));
		check(sprites.length > 0, 'the landing paints sprites', `${sprites.length} sprites`);
		check(
			sprites.length > 0 && sprites.every((width) => width > 0),
			'every sprite on the landing decodes',
			sprites.join(' '),
		);

		for (const [label, href] of [
			['index', '/markless'],
			['state', '/markless/concepts/state'],
		] as const) {
			for (const theme of ['light', 'dark'] as const) {
				await page.goto(`${origin}${href}`, { waitUntil: 'load' });
				await page.evaluate((wanted) => {
					document.documentElement.setAttribute('data-theme', wanted);
				}, theme);
				await page.waitForTimeout(150);
				const painted = await page.evaluate(() => {
					const body = getComputedStyle(document.body);
					const token = document.querySelector('pre.shiki code span[style*="color"]');
					const sprite = document.querySelector('.sprite img.sprite-ink-dark');
					return {
						attr: document.documentElement.getAttribute('data-theme'),
						ground: body.backgroundColor,
						ink: body.color,
						token: token ? getComputedStyle(token).color : '',
						darkSpriteShown: sprite
							? getComputedStyle(sprite).display !== 'none'
							: false,
					};
				});
				check(
					painted.attr === theme,
					`${href} takes data-theme="${theme}"`,
					String(painted.attr),
				);
				check(
					painted.darkSpriteShown === (theme === 'dark'),
					`${href} paints the ${theme} cut of its sprites`,
					`dark cut shown: ${painted.darkSpriteShown}`,
				);
				themeShots.push({ page: label, theme, ...painted });
				await page.screenshot({
					path: `${shotsDir}/T016-${label}-${theme}.png`,
					fullPage: true,
				});
			}
		}
		const groundsDiffer = new Set(themeShots.map((shot) => shot.ground)).size > 1;
		check(
			groundsDiffer,
			'the two themes paint different grounds',
			[...new Set(themeShots.map((shot) => shot.ground))].join(' vs '),
		);
		const inksDiffer = new Set(themeShots.map((shot) => shot.ink)).size > 1;
		check(
			inksDiffer,
			'the two themes paint different ink',
			[...new Set(themeShots.map((shot) => shot.ink))].join(' vs '),
		);
		const tokensDiffer = new Set(themeShots.map((shot) => shot.token)).size > 1;
		check(
			tokensDiffer,
			'the code block paints different token colours in the two themes',
			[...new Set(themeShots.map((shot) => shot.token))].join(' vs '),
		);
		await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

		for (const theme of ['light', 'dark'] as const) {
			await page.goto(`${origin}/markless`, { waitUntil: 'load' });
			await page.evaluate((wanted) => {
				document.documentElement.setAttribute('data-theme', wanted);
				document.querySelector('details.sidebar-disclosure')?.setAttribute('open', '');
			}, theme);
			await page.waitForTimeout(300);
			const icons = await page.evaluate(async () => {
				const links = [...document.querySelectorAll('.sidebar-link')];
				const shown = links.map((link) => {
					const images = [
						...link.querySelectorAll('img.nav-icon-ink'),
					] as HTMLImageElement[];
					const visible = images.filter(
						(image) => getComputedStyle(image).display !== 'none',
					);
					return { count: images.length, visible: visible.length, image: visible[0] };
				});
				await Promise.all(
					shown.map((entry) =>
						entry.image && !entry.image.complete
							? entry.image.decode().catch(() => {})
							: undefined,
					),
				);
				return {
					links: links.length,
					pairs: shown.filter((entry) => entry.count === 2).length,
					oneVisible: shown.filter((entry) => entry.visible === 1).length,
					loaded: shown.filter((entry) => (entry.image?.naturalWidth ?? 0) > 0).length,
					sources: shown.map((entry) => entry.image?.getAttribute('src') ?? ''),
				};
			});
			check(icons.links === 19, 'the sidebar lists every page', String(icons.links));
			check(
				icons.pairs === icons.links,
				'every sidebar entry carries both cuts of its icon',
				`${icons.pairs} of ${icons.links}`,
			);
			check(
				icons.oneVisible === icons.pairs,
				`the ${theme} theme displays exactly one cut per entry`,
				String(icons.oneVisible),
			);
			check(
				icons.loaded === icons.pairs,
				`every ${theme} sidebar icon is a file the server really serves`,
				`${icons.loaded} decoded — e.g. ${icons.sources[0]}`,
			);
			check(
				icons.sources.filter(
					(source) => source.includes(`/sidebar/`) && source.endsWith(`-${theme}.png`),
				).length ===
					icons.links - 1,
				`the ${theme} theme asks for the ${theme} cut of eighteen sheet icons and one doodle`,
				icons.sources[1] ?? '',
			);
			const rail = page.locator('nav.sidebar');
			await rail.screenshot({ path: `${shotsDir}/T034-sidebar-${theme}.png` });
		}
		await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

		for (const [label, href] of [
			['index', '/markless'],
			['state', '/markless/concepts/state'],
		] as const) {
			const entry = nav
				.flatMap((section) => section.entries)
				.find((one) => one.href === href);
			const section = nav.find((one) => one.entries.some((one) => one.href === href));
			for (const theme of ['light', 'dark'] as const) {
				for (const width of [1440, 390] as const) {
					await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
					await page.goto(`${origin}${href}`, { waitUntil: 'load' });
					await page.evaluate((wanted) => {
						document.documentElement.setAttribute('data-theme', wanted);
					}, theme);
					await page.waitForTimeout(150);

					const chrome = await page.evaluate(() => {
						const header = document.querySelector('.site-header');
						const rail = document.querySelector('.on-this-page');
						const railVisible = rail
							? getComputedStyle(rail).display !== 'none'
							: false;
						const nav = document.querySelector('.sidebar');
						const h1 = document.querySelector('.prose h1');
						const navBox = nav?.getBoundingClientRect();
						const h1Box = h1?.getBoundingClientRect();
						return {
							header: Boolean(header),
							headerSticky: header ? getComputedStyle(header).position : '',
							crumbSection:
								document.querySelector('.crumb-section')?.textContent?.trim() ?? '',
							crumbPage:
								document.querySelector('.crumb-page')?.textContent?.trim() ?? '',
							search: Boolean(document.querySelector('.site-search')),
							themeToggle: Boolean(document.querySelector('[data-theme-toggle]')),
							github: Boolean(
								document.querySelector(
									'a.header-link[href*="github.com/compiled-run/markless"]',
								),
							),
							railVisible,
							railItems: [
								...document.querySelectorAll(
									'.on-this-page-item-h2 .on-this-page-link',
								),
							].map((node) => (node.textContent ?? '').trim()),
							railTargets: [...document.querySelectorAll('.on-this-page-link')].every(
								(node) => {
									const id = (node.getAttribute('href') ?? '').slice(1);
									return id !== '' && document.getElementById(id) !== null;
								},
							),
							pageH2s: [...document.querySelectorAll('.prose h2')].map((node) =>
								(node.textContent ?? '').trim(),
							),
							navPosition: nav ? getComputedStyle(nav).position : '',
							navHeight: navBox ? navBox.height : 0,
							screenful: window.innerHeight,
							disclosureHeight:
								document
									.querySelector('.sidebar-disclosure')
									?.getBoundingClientRect().height ?? 0,
							summaryHeight:
								document.querySelector('.sidebar-summary')?.getBoundingClientRect()
									.height ?? 0,
							navOpen: (
								document.querySelector(
									'.sidebar-disclosure',
								) as HTMLDetailsElement | null
							)?.open,
							navSummaryShown:
								getComputedStyle(
									document.querySelector('.sidebar-summary') as Element,
								).display !== 'none',
							// `checkVisibility` is the browser's own answer, which is what a
							// disclosure closed by CSS needs: the list keeps a box, and it
							// is the content-visibility skip that decides whether a reader
							// can see it.
							navLinksShown: (() => {
								const list = document.querySelector('.sidebar-list');
								return Boolean(
									list &&
									list.checkVisibility({
										contentVisibilityAuto: true,
										opacityProperty: true,
										visibilityProperty: true,
									}),
								);
							})(),
							h1Top: h1Box ? h1Box.top + window.scrollY : Number.NaN,
							overlap: Boolean(
								navBox &&
								h1Box &&
								navBox.right > h1Box.left &&
								navBox.left < h1Box.right &&
								navBox.bottom > h1Box.top &&
								navBox.top < h1Box.bottom,
							),
							scrollX: document.documentElement.scrollWidth > window.innerWidth + 1,
							bodyFont: Number.parseFloat(getComputedStyle(document.body).fontSize),
							prosePosition:
								document.querySelector('.prose')?.getBoundingClientRect().width ??
								0,
							pager: Boolean(document.querySelector('.pager .pager-title')),
						};
					});

					const at = `${label} ${theme} ${width}`;
					check(chrome.header, `${at}: the header is on the page`);
					check(
						chrome.headerSticky === 'sticky',
						`${at}: the header is sticky`,
						chrome.headerSticky,
					);
					check(
						chrome.crumbPage === (entry?.title ?? ''),
						`${at}: the breadcrumb names this page`,
						`${chrome.crumbSection} > ${chrome.crumbPage}`,
					);
					check(
						chrome.crumbSection === (section?.title ?? ''),
						`${at}: the breadcrumb names this section`,
						chrome.crumbSection,
					);
					check(chrome.search, `${at}: the header carries a search slot`);
					check(chrome.themeToggle, `${at}: the header carries a theme-toggle slot`);
					check(chrome.github, `${at}: the header links the repo`);
					check(chrome.pager, `${at}: the page ends with a prev/next pager`);
					check(!chrome.scrollX, `${at}: the document is no wider than the viewport`);
					check(
						!chrome.overlap,
						`${at}: the nav does not sit on top of the h1`,
						`nav is ${chrome.navPosition}`,
					);
					if (width === 1440) {
						check(chrome.railVisible, `${at}: the On this page rail is shown`);
						check(
							chrome.navLinksShown && !chrome.navSummaryShown,
							`${at}: the whole nav is open beside the prose, with no disclosure to press`,
							`links shown: ${chrome.navLinksShown}, summary shown: ${chrome.navSummaryShown}`,
						);
						check(
							chrome.railItems.length === chrome.pageH2s.length &&
								chrome.railItems.length > 1,
							`${at}: the rail lists every h2 on the page`,
							`${chrome.railItems.length} rail items, ${chrome.pageH2s.length} h2s`,
						);
						check(
							chrome.railItems.every(
								(title, index) => title === chrome.pageH2s[index],
							),
							`${at}: the rail's titles are this page's h2 titles`,
							chrome.railItems.join(' | '),
						);
						check(chrome.railTargets, `${at}: every rail link lands on a heading id`);
						check(
							chrome.bodyFont >= 19 && chrome.bodyFont <= 22,
							`${at}: body copy is set around 20px`,
							`${chrome.bodyFont}px`,
						);
					} else {
						// A docs site whose first phone screenful is entirely navigation
						// is not shippable, so the nav is one line behind a <details>
						// and the article's h1 is inside the first 844px.
						check(
							chrome.navPosition === 'static',
							`${at}: the sidebar stacks instead of being pinned`,
							chrome.navPosition,
						);
						check(
							!chrome.navLinksShown,
							`${at}: the nineteen nav links are collapsed, not stacked above the article`,
						);
						check(
							chrome.navSummaryShown,
							`${at}: the collapsed nav still offers the reader a way in`,
						);
						// The nineteen links cost one line: the closed disclosure is
						// exactly its own summary tall. The rail around it also carries
						// the wordmark and the mode switch, so what it may not cost is a
						// screenful — a third of the phone is the ceiling.
						check(
							Math.abs(chrome.disclosureHeight - chrome.summaryHeight) < 1,
							`${at}: the collapsed nav costs a line, and the links add nothing to it`,
							`${chrome.disclosureHeight.toFixed(0)}px of disclosure over a ${chrome.summaryHeight.toFixed(0)}px summary`,
						);
						check(
							chrome.navHeight < chrome.screenful / 3,
							`${at}: the whole rail costs less than a third of the phone`,
							`${chrome.navHeight.toFixed(0)}px of ${chrome.screenful}px`,
						);
						check(
							chrome.h1Top < 844,
							`${at}: the article's h1 is in the first phone screenful`,
							`h1 top ${chrome.h1Top.toFixed(0)}px`,
						);
						// The outline is laid on its side rather than hidden: item 8 of
						// the style guide wants the page's shape available on a phone too.
						check(
							chrome.railVisible,
							`${at}: the in-page outline is still offered, inline`,
						);
					}

					await page.screenshot({
						path: `${shotsDir}/T017-${label}-${theme}-${width}.png`,
						fullPage: true,
					});
				}
			}
		}
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

		// --- the assumes line links the pages it names -------------------------
		for (const href of [
			'/markless',
			'/markless/concepts/state',
			'/markless/concepts/computed',
		]) {
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const assumed = await page
				.locator('.page-meta a.page-meta-assume-link:not(.is-hidden)')
				.evaluateAll((nodes) =>
					nodes.map((node) => ({
						href: node.getAttribute('href') ?? '',
						title: (node.textContent ?? '').trim(),
					})),
				);
			for (const link of assumed) {
				const target = await fetch(`${origin}${link.href}`);
				check(
					target.status === 200,
					`${href}: "Assumes: ${link.title}" links a page that answers`,
					`${link.href} -> ${target.status}`,
				);
			}
			check(
				href === '/markless' ? assumed.length === 0 : assumed.length > 0,
				`${href}: the assumes line has the links it should`,
				`${assumed.length} links`,
			);
		}

		// --- the footer doodles react to the pointer ----------------------------
		await page.goto(`${origin}/markless/concepts/state`, { waitUntil: 'load' });
		const doodles = page.locator('.pager-doodles .sprite');
		await doodles.first().waitFor();
		check(
			(await doodles.count()) === 6,
			'the pager carries its six doodles',
			String(await doodles.count()),
		);
		const doodleImage = (index: number) => doodles.nth(index).locator('img.sprite-ink-light');
		const doodleMotion = (index: number) =>
			doodleImage(index).evaluate((node) => {
				const style = getComputedStyle(node as Element);
				return { transform: style.transform, animation: style.animationName };
			});
		const restingCrown = await doodleMotion(0);
		await doodles.first().hover();
		await page.waitForTimeout(450);
		const hoveredCrown = await doodleMotion(0);
		check(
			hoveredCrown.transform !== restingCrown.transform && hoveredCrown.transform !== 'none',
			'the first pager doodle moves when it is pointed at',
			`${restingCrown.transform} then ${hoveredCrown.transform}`,
		);
		// The sun is keyframed rather than swapped for another drawing: what proves
		// the reaction is that an animation is running on the image the reader is
		// looking at, not that its src changed. The flower turns on the row's own
		// spring transition instead, so it is read as a transform.
		for (const [index, name] of [[4, 'doodle-sun-turn']] as const) {
			await page.mouse.move(0, 0);
			await page.waitForTimeout(80);
			const resting = await doodleMotion(index);
			check(
				resting.animation === 'none',
				`doodle ${index + 1} is still at rest`,
				resting.animation,
			);
			await doodles.nth(index).hover();
			await page.waitForTimeout(60);
			const hovered = await doodleMotion(index);
			check(
				hovered.animation === name,
				`doodle ${index + 1} runs its ${name} reaction on hover`,
				hovered.animation,
			);
		}
		await page.mouse.move(0, 0);
		await page.waitForTimeout(80);
		// The strip on paper: the doodles are the low-contrast end of the palette,
		// so both themes are shot for a look rather than only measured.
		for (const theme of ['light', 'dark'] as const) {
			await page.evaluate(
				(wanted) => document.documentElement.setAttribute('data-theme', wanted),
				theme,
			);
			await page.waitForTimeout(120);
			await page
				.locator('.pager')
				.screenshot({ path: `${shotsDir}/T034-pager-${theme}.png` });
		}
		await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
		await page.waitForTimeout(80);
		const restingFlower = await doodleMotion(5);
		await doodles.nth(5).hover();
		await page.waitForTimeout(360);
		const hoveredFlower = await doodleMotion(5);
		check(
			restingFlower.transform !== hoveredFlower.transform &&
				hoveredFlower.transform !== 'none',
			'the flower turns when it is pointed at',
			`${restingFlower.transform} then ${hoveredFlower.transform}`,
		);
		await page.mouse.move(0, 0);

		// --- batch 2: events, conditionals, lists ------------------------------
		// Three pages, each with a widget whose whole teaching moment is a thing
		// the reader does. The checks below do exactly what the page asks the
		// reader to do, and assert what the page then claims they will see.
		for (const href of [
			'/markless/concepts/events',
			'/markless/concepts/conditionals',
			'/markless/concepts/lists',
		]) {
			const response = await fetch(`${origin}${href}`);
			check(response.status === 200, `GET ${href}`, String(response.status));
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const heading = ((await page.locator('h1').first().textContent()) ?? '').trim();
			check(heading.length > 0, `${href} renders its h1 in the browser`, heading);
			await page.screenshot({
				path: `${shotsDir}/T013-${slugFor(href)}.png`,
				fullPage: true,
			});
		}

		// --- widget: the name echo on the events page --------------------------
		await page.goto(`${origin}/markless/concepts/events`, { waitUntil: 'load' });
		const echoField = page.locator('.playground input').first();
		const echoLine = page.locator('.playground-echo p').first();
		await echoField.waitFor();
		check(
			((await echoLine.textContent()) ?? '').trim() === 'Hello,',
			'name echo renders its empty greeting from the server',
			((await echoLine.textContent()) ?? '').trim(),
		);
		await echoField.click();
		await echoField.pressSequentially('Ada', { delay: 40 });
		await settleText(
			echoLine,
			(text) => text === 'Hello, Ada',
			'name echo follows the keystrokes',
		);
		check(
			((await echoLine.textContent()) ?? '').trim() === 'Hello, Ada',
			'typing into the field moves the echo under it',
		);
		const urlBeforeSubmit = page.url();
		await echoField.press('Enter');
		await page.waitForTimeout(400);
		check(
			page.url() === urlBeforeSubmit,
			'pressing Enter does not navigate, because the handler calls preventDefault',
			`${urlBeforeSubmit} then ${page.url()}`,
		);
		check(
			(await echoField.inputValue()) === 'Ada',
			'the field still holds what was typed after the submit',
			await echoField.inputValue(),
		);
		await page.screenshot({ path: `${shotsDir}/T013-name-echo-after.png`, fullPage: true });

		// Six pages ship a callout where a widget was meant to be, and the heading
		// on it is the first thing the reader is told, so each one is checked
		// verbatim rather than by a phrase.
		const noBoxTitle: Record<string, string> = {
			'/markless/concepts/conditionals':
				'Why the panels on this page are files rather than boxes',
			'/markless/concepts/lists': 'Why the rows on this page are a file rather than a box',
			'/markless/concepts/async': 'What is missing here, and what this build actually does',
			'/markless/concepts/styling': 'Why the two cards are not side by side on this page',
			'/markless/build/components': 'Why that pair is not a box on this page',
			'/markless/build/storage': 'Why that file is not a box on this page',
		};

		for (const href of ['/markless/concepts/conditionals', '/markless/concepts/lists']) {
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const told = await page
				.locator('.callout-title')
				.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
			check(
				told.includes(noBoxTitle[href]),
				`${href} says out loud why it has no demo box`,
				told.join(' | '),
			);
			check(
				(await page.locator('.playground').count()) === 0,
				`${href} really has no playground frame to mislead the reader`,
			);
		}

		// --- batch 3: first app, async, styling ---------------------------------
		// Three pages, and two of them are the honest kind: the widget their
		// outline asked for cannot run on this build, so what is checked is that
		// the page says so and really has no demo frame to mislead anyone.
		for (const href of [
			'/markless/start/first-app',
			'/markless/concepts/async',
			'/markless/concepts/styling',
		]) {
			const response = await fetch(`${origin}${href}`);
			check(response.status === 200, `GET ${href}`, String(response.status));
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const heading = ((await page.locator('h1').first().textContent()) ?? '').trim();
			check(heading.length > 0, `${href} renders its h1 in the browser`, heading);
			check(
				(await page.locator('.playground').count()) === 0,
				`${href} has no demo frame, because it has no live widget`,
			);
			await page.screenshot({
				path: `${shotsDir}/T014-${slugFor(href)}.png`,
				fullPage: true,
			});
		}

		// The async and styling pages each carry the callout that says why the
		// widget is missing. The day the framework fix lands and the widget goes
		// back on the page, the `.playground` check above fails and the callout has
		// to come out with the note it names.
		for (const href of ['/markless/concepts/async', '/markless/concepts/styling']) {
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const told = await page
				.locator('.callout-title')
				.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
			check(
				told.includes(noBoxTitle[href]),
				`${href} says out loud why it has no demo box`,
				told.join(' | '),
			);
			const body = await page
				.locator('.callout-body')
				.evaluateAll((nodes) =>
					nodes.map((node) => (node.textContent ?? '').trim()).join(' '),
				);
			check(
				body.includes('NOTES.md finding 25') || body.includes('NOTES.md finding 26'),
				`${href} names the finding its missing widget is recorded under`,
			);
		}

		// The page quotes the specification's deadline rules, and on this build a
		// re-settle never commits the pending arm, so the callout has to say in so
		// many words that those rules are quoted and not measured here. It stays
		// until that is no longer true.
		await page.goto(`${origin}/markless/concepts/async`, { waitUntil: 'load' });
		const asyncCalloutBody = await page
			.locator('.callout-body')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()).join(' '));
		check(
			asyncCalloutBody.includes(
				'the deadline rules above are quoted from the specification, not measured on this site',
			),
			'the async page says which of its deadline claims are spec and not measured',
			asyncCalloutBody.slice(-120),
		);

		// The first-app page must carry the override a reader needs today, exactly,
		// and must not fake a terminal.
		await page.goto(`${origin}/markless/start/first-app`, { waitUntil: 'load' });
		const firstAppText = (await page.locator('.prose').first().innerText()).replace(
			/\s+/g,
			' ',
		);
		check(
			firstAppText.includes('"@tsrx/core": "0.1.58"'),
			'the first-app page carries the @tsrx/core override a clean install needs',
		);
		check(
			firstAppText.includes('npm create markless@latest'),
			'the first-app page carries the scaffold command',
		);

		// --- batch 4: the Building an app section -------------------------------
		// Four pages. Three carry a widget whose whole teaching moment is a thing
		// the reader does, and the checks below do exactly that and assert what
		// the page says will happen. The fourth is the honest kind.
		for (const href of [
			'/markless/build/components',
			'/markless/build/elements',
			'/markless/build/storage',
			'/markless/build/shared',
		]) {
			const response = await fetch(`${origin}${href}`);
			check(response.status === 200, `GET ${href}`, String(response.status));
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const heading = ((await page.locator('h1').first().textContent()) ?? '').trim();
			check(heading.length > 0, `${href} renders its h1 in the browser`, heading);
			await page.screenshot({
				path: `${shotsDir}/T006-${slugFor(href)}.png`,
				fullPage: true,
			});
		}

		await page.goto(`${origin}/markless/build/components`, { waitUntil: 'load' });
		check(
			(await page.locator('.playground').count()) === 0,
			'/markless/build/components really has no playground frame to mislead the reader',
		);
		const componentCallouts = await page
			.locator('.callout-title')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
		check(
			componentCallouts.includes(noBoxTitle['/markless/build/components']),
			'/markless/build/components says out loud why it has no demo box',
			componentCallouts.join(' | '),
		);
		const componentBody = await page
			.locator('.callout-body')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()).join(' '));
		check(
			componentBody.includes('finding 29'),
			'/markless/build/components names the finding its missing widget is recorded under',
		);

		// --- widget: the focus field on the elements page ------------------------
		// The claim is that the handle is the real node, so what is checked is the
		// browser's own idea of which element has the caret.
		await page.goto(`${origin}/markless/build/elements`, { waitUntil: 'load' });
		const focusButton = page.getByRole('button', { name: 'Put the cursor in the field' });
		await focusButton.waitFor();
		const activeIsField = () =>
			page.evaluate(() => {
				const field = document.querySelector('.playground input');
				return Boolean(field) && document.activeElement === field;
			});
		check(!(await activeIsField()), 'the field does not start out focused');
		await focusButton.click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if (await activeIsField()) break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(await activeIsField(), 'clicking the button puts the caret in the field');
		await settleText(
			page.locator('.playground-echo p').first(),
			(text) => text === 'The cursor is in the field',
			'the focus field reports the cursor moved',
		);
		await page.screenshot({ path: `${shotsDir}/T006-focus-field-after.png`, fullPage: true });

		await page.goto(`${origin}/markless/build/storage`, { waitUntil: 'load' });
		check(
			(await page.locator('.playground').count()) === 0,
			'/markless/build/storage really has no playground frame to mislead the reader',
		);
		const storageCallouts = await page
			.locator('.callout-title')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
		check(
			storageCallouts.includes(noBoxTitle['/markless/build/storage']),
			'/markless/build/storage says out loud why it has no demo box',
			storageCallouts.join(' | '),
		);
		const storageBody = await page
			.locator('.callout-body')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()).join(' '));
		check(
			storageBody.includes('finding 30'),
			'/markless/build/storage names the finding its missing widget is recorded under',
		);

		await page.goto(`${origin}/markless/build/shared`, { waitUntil: 'load' });
		check(
			(await page.locator('.playground').count()) === 0,
			'/markless/build/shared really has no playground frame to mislead the reader',
		);
		const sharedCallouts = await page
			.locator('.callout-title')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
		check(
			sharedCallouts.some((title) => title.includes('when we tried it on 0.3.1')),
			'/markless/build/shared says out loud what happened when it was tried',
			sharedCallouts.join(' | '),
		);
		const sharedBody = await page
			.locator('.callout-body')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()).join(' '));
		check(
			sharedBody.includes('NOTES.md'),
			'/markless/build/shared names the finding its missing widget is recorded under',
		);

		// --- batch 5: the Router section, how it works, and the reference -------
		// Five pages, four of them carrying a widget that is a plain state read
		// plus text bindings. Each check does what its page tells the reader to
		// do and asserts the line the page says they will then be looking at.
		for (const href of [
			'/markless/router/pages',
			'/markless/router/links',
			'/markless/router/data',
			'/markless/how-it-works',
			'/markless/reference',
		]) {
			const response = await fetch(`${origin}${href}`);
			check(response.status === 200, `GET ${href}`, String(response.status));
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const heading = ((await page.locator('h1').first().textContent()) ?? '').trim();
			check(heading.length > 0, `${href} renders its h1 in the browser`, heading);
			await page.screenshot({
				path: `${shotsDir}/T030-${slugFor(href)}.png`,
				fullPage: true,
			});
		}

		// --- widget: the route tree on the pages page ---------------------------
		await page.goto(`${origin}/markless/router/pages`, { waitUntil: 'load' });
		const routeUrl = page.locator('.playground .playground-output').first();
		const routeNote = page.locator('.playground .explorer-note').first();
		await routeUrl.waitFor();
		check(
			((await routeUrl.textContent()) ?? '').trim() === '/',
			'the route tree opens on the index file, which is the site root',
			((await routeUrl.textContent()) ?? '').trim(),
		);
		await page.getByRole('button', { name: 'pages/blog/[slug].tsrx' }).click();
		await settleText(
			routeUrl,
			(text) => text === '/blog/:slug',
			'the route tree answers with the dynamic route URL',
		);
		check(
			((await routeUrl.textContent()) ?? '').trim() === '/blog/:slug',
			'clicking a bracketed file name shows the URL it produces',
		);
		check(
			((await routeNote.textContent()) ?? '').includes('parameter'),
			'the route tree explains what the brackets did',
			((await routeNote.textContent()) ?? '').slice(0, 60),
		);
		await page.getByRole('button', { name: 'pages/docs/[...slug].mdx' }).click();
		await settleText(
			routeUrl,
			(text) => text === '/docs/**',
			'the route tree answers with the catch-all route URL',
		);
		await page.screenshot({ path: `${shotsDir}/T030-route-tree-after.png`, fullPage: true });

		// --- widget: the renamed route on the links page ------------------------
		await page.goto(`${origin}/markless/router/links`, { waitUntil: 'load' });
		const typoLine = page.locator('.playground .file-line').first();
		const typoAnswer = page.locator('.playground .playground-output').first();
		await typoAnswer.waitFor();
		check(
			((await typoAnswer.textContent()) ?? '').includes('This one compiles'),
			'the link widget opens on the link that compiles',
			((await typoAnswer.textContent()) ?? '').slice(0, 60),
		);
		await page.getByRole('button', { name: 'Somebody renamed the folder' }).click();
		await settleText(
			typoAnswer,
			(text) => text.includes('Type error on href'),
			'the link widget shows the type error after the rename',
		);
		check(
			((await typoLine.textContent()) ?? '').includes('/blogs/[slug]'),
			'the code line above the error carries the typo',
			((await typoLine.textContent()) ?? '').slice(0, 60),
		);
		await page.screenshot({ path: `${shotsDir}/T030-link-typo-after.png`, fullPage: true });

		// --- widget: the streaming illustration on the data page ----------------
		await page.goto(`${origin}/markless/router/data`, { waitUntil: 'load' });
		const stepMark = page.locator('.playground .playground-output').first();
		const stepNote = page.locator('.playground .explorer-note').first();
		await stepMark.waitFor();
		check(
			((await stepMark.textContent()) ?? '').trim() === 'Request',
			'the streaming illustration starts at the request',
			((await stepMark.textContent()) ?? '').trim(),
		);
		const stepButton = page.getByRole('button', { name: 'Step forward' });
		await stepButton.click();
		await settleText(
			stepMark,
			(text) => text === 'First flush',
			'the streaming illustration reaches the first flush',
		);
		await stepButton.click();
		await stepButton.click();
		await settleText(
			stepMark,
			(text) => text === 'Committed',
			'the streaming illustration reaches the commit',
		);
		check(
			((await stepNote.textContent()) ?? '').includes('live'),
			'the last step says the settled content is live',
			((await stepNote.textContent()) ?? '').slice(0, 60),
		);
		await page.getByRole('button', { name: 'Back to the start' }).click();
		await settleText(
			stepMark,
			(text) => text === 'Request',
			'the illustration can be replayed',
		);
		await page.screenshot({ path: `${shotsDir}/T030-stream-steps-after.png`, fullPage: true });

		// --- widget: the tier ladder on the how-it-works page -------------------
		// This is the page's whole argument, so the check is the argument: the
		// first three tiers run no component code and the last two do.
		await page.goto(`${origin}/markless/how-it-works`, { waitUntil: 'load' });
		const tierLine = page.locator('.playground .playground-output').first();
		const runsLine = page.locator('.playground [data-runs-code]').first();
		await tierLine.waitFor();
		check(
			((await tierLine.textContent()) ?? '').trim() === 'Tier 1, value slots',
			'the tier ladder opens on tier 1',
			((await tierLine.textContent()) ?? '').trim(),
		);
		check(
			((await runsLine.textContent()) ?? '').trim() === 'No component code runs.',
			'changing a number runs no component code',
			((await runsLine.textContent()) ?? '').trim(),
		);
		await page.getByRole('button', { name: 'Toggle a panel' }).click();
		await settleText(
			tierLine,
			(text) => text === 'Tier 3, branch range flips',
			'the tier ladder puts a branch flip at tier 3',
		);
		check(
			((await runsLine.textContent()) ?? '').trim() === 'No component code runs.',
			'a branch flip still runs no component code',
			((await runsLine.textContent()) ?? '').trim(),
		);
		await page.getByRole('button', { name: 'Load slow data' }).click();
		await settleText(
			tierLine,
			(text) => text === 'Tier 4, arm commit',
			'the tier ladder puts an async settle at tier 4',
		);
		await settleText(
			runsLine,
			(text) => text.startsWith('Component code runs'),
			'the tier ladder says out loud that tier 4 executes components',
		);
		await page.screenshot({ path: `${shotsDir}/T030-tier-ladder-after.png`, fullPage: true });

		// The how-it-works page is the most over-claimable on the site, so the
		// quoted doctrine sentence has to be on it verbatim, and the comparison
		// words may only appear inside the closed collapsible.
		const howItWorksText = (await page.locator('.prose').first().innerText()).replace(
			/\s+/g,
			' ',
		);
		check(
			howItWorksText.includes(
				'"No hydration" forbids re-executing components over existing server HTML; it does not forbid rendering new content client-side',
			),
			'how-it-works quotes the doctrine sentence rather than upgrading it',
		);
		check(
			howItWorksText.includes(
				'Component execution is paid exactly once per appearance of content',
			),
			'how-it-works quotes the vanilla-JS floor paragraph',
		);
		const virtualDomOutsideCollapsible = await page.evaluate(() => {
			const prose = document.querySelector('.prose');
			if (!prose) return true;
			const clone = prose.cloneNode(true) as HTMLElement;
			for (const details of clone.querySelectorAll('details')) details.remove();
			return /virtual DOM/i.test(clone.textContent ?? '');
		});
		check(
			!virtualDomOutsideCollapsible,
			'the words virtual DOM appear only inside the collapsible comparison',
		);

		// --- the reference page names the surface it promises -------------------
		await page.goto(`${origin}/markless/reference`, { waitUntil: 'load' });
		const referenceText = (await page.locator('.prose').first().innerText()).replace(
			/\s+/g,
			' ',
		);
		for (const name of [
			'state',
			'computed',
			'storage',
			'element',
			'attach',
			'@if',
			'@for',
			'@try',
		]) {
			check(referenceText.includes(name), `the reference page lists ${name}`);
		}
		for (const code of [
			'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
			'MARKLESS_REPEAT_KEY_REQUIRED',
			'MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED',
			'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
		]) {
			check(referenceText.includes(code), `the reference diagnostics table carries ${code}`);
		}

		// --- the like heart under the rail -------------------------------------
		// The pop, the burst and the "+1" are pressed-state transitions, so what
		// proves the "+1" arrives is that it is painted while the button is held.
		await page.goto(`${origin}/markless/concepts/state`, { waitUntil: 'load' });
		const heartButton = page.locator('.like-heart-button');
		const heartCount = page.locator('.like-heart-count');
		await heartButton.waitFor();
		check(
			((await heartCount.textContent()) ?? '').trim() === '0',
			'the like heart opens on nought likes',
			((await heartCount.textContent()) ?? '').trim(),
		);
		const plusOpacity = () =>
			page
				.locator('.like-heart-plus')
				.evaluate((node) => Number(getComputedStyle(node as Element).opacity));
		check(
			(await plusOpacity()) === 0,
			'the +1 is not painted before the press',
			String(await plusOpacity()),
		);
		await heartButton.scrollIntoViewIfNeeded();
		await heartButton.hover();
		const heartBox = (await heartButton.boundingBox())!;
		await page.mouse.move(heartBox.x + heartBox.width / 2, heartBox.y + heartBox.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(60);
		const pressedPlus = await plusOpacity();
		const pressedBurst = await page
			.locator('.like-burst-piece-1')
			.evaluate((node) => Number(getComputedStyle(node as Element).opacity));
		await page.mouse.up();
		// The burst is only in the air on the way out, so the shot is of the
		// release rather than the press.
		await page.waitForTimeout(180);
		await page.screenshot({ path: `${shotsDir}/T024-heart.png`, fullPage: false });
		check(pressedPlus > 0.5, 'the +1 is painted under the press', String(pressedPlus));
		check(
			pressedBurst > 0.5,
			'the burst doodles are painted under the press',
			String(pressedBurst),
		);
		await settleText(
			heartCount,
			(text) => text === '1',
			'the like heart counts the first click',
		);
		check(
			((await heartCount.textContent()) ?? '').trim() === '1',
			'clicking the heart adds a like',
			((await heartCount.textContent()) ?? '').trim(),
		);
		await heartButton.click();
		await settleText(
			heartCount,
			(text) => text === '2',
			'the like heart counts a second click',
		);
		check(
			((await heartCount.textContent()) ?? '').trim() === '2',
			'the likes keep adding on repeat clicks',
			((await heartCount.textContent()) ?? '').trim(),
		);

		// --- the stickers are on the pages that ask for them --------------------
		await page.goto(`${origin}/markless`, { waitUntil: 'load' });
		const heroSticker = page.locator('.sticker.is-hero');
		check((await heroSticker.count()) === 1, 'the landing hero carries one sticker');
		const heroLoaded = await heroSticker.evaluate(
			(node) => (node as HTMLImageElement).naturalWidth > 0,
		);
		check(heroLoaded, 'the hero sticker is a cut asset the server really serves');
		check(
			(await page.locator('.pager-doodles .sticker').count()) === 2,
			'the footer strip mixes two stickers in with the doodles',
		);
		await page.screenshot({ path: `${shotsDir}/T024-stickers-landing.png`, fullPage: true });
		await page.goto(`${origin}/markless/concepts/lists`, { waitUntil: 'load' });
		const cornerSticker = await page
			.locator('.callout[data-sticker="map"]')
			.evaluate((node) => getComputedStyle(node as Element, '::after').backgroundImage);
		check(
			cornerSticker.includes('/markless/stickers/map.png'),
			'a concept page callout paints its corner sticker',
			cornerSticker.slice(0, 60),
		);

		await writeFile(
			`${shotsDir}/T016-witness.json`,
			`${JSON.stringify({ origin, tokenCount, expectedTitle, before, after, assetPath, hug, themeShots, knownFailing, failures }, undefined, '\t')}\n`,
		);
	} finally {
		await browser.close();
	}
} finally {
	stop();
}

if (knownFailing.length > 0)
	console.log(
		`\nknown-failing (not a witness failure):\n${knownFailing.map((line) => `  - ${line}`).join('\n')}`,
	);

if (failures.length > 0) {
	console.error(`\nwitness FAILED:\n${failures.map((line) => `  - ${line}`).join('\n')}`);
	process.exit(1);
}
console.log('\nwitness passed');
