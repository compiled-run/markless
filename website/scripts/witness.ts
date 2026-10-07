// Run: node --experimental-strip-types scripts/witness.ts
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator } from 'playwright-core';
import { flatNav, headFor, nav, siteOrigin } from '../nav.ts';
import { findError } from '../components/docs/errors/lookup.ts';
import { errorIndex } from '../components/docs/errors/errors-index.ts';

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

/** A page's screenshot name: /concepts/state -> concepts-state. */
const slugFor = (href: string) => href.replace(/^\//, '').replace(/\//g, '-') || 'index';

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

try {
	await waitFor(`${origin}/`);

	const landing = await fetch(`${origin}/`);
	check(landing.status === 200, 'GET /', String(landing.status));
	const landingHtml = await landing.text();

	const statePage = await fetch(`${origin}/concepts/state`);
	check(statePage.status === 200, 'GET /concepts/state', String(statePage.status));
	const stateHtml = await statePage.text();
	check(
		stateHtml.includes('State is a variable the page watches'),
		'state page carries its prose',
	);
	check(
		!stateHtml.includes('<pre><code class="language-tsrx">'),
		'no code fence was left unhighlighted in the served HTML',
	);

	const assetPath = landingHtml.match(
		/(?:href|src)="(\/(?:assets|build)\/[^"]+)"/,
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
			['/', 'Framework', 'UI'],
			['/ui', 'UI', 'Framework'],
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

		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
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
		await page.goto(`${origin}/ui/accordion`, { waitUntil: 'load' });
		const paneFonts = await page.evaluate(() => {
			const fontOf = (selector: string) => {
				const node = document.querySelector(selector);
				return node ? getComputedStyle(node).fontFamily : '';
			};
			return { prose: fontOf('.prose pre'), pane: fontOf('.pg-shiki') };
		});
		check(
			isMono(paneFonts.prose),
			'/ui/accordion: its prose fences are set in the monospace stack',
			paneFonts.prose,
		);
		check(
			isMono(paneFonts.pane),
			'/ui/accordion: the generated demo pane is set in the monospace stack',
			paneFonts.pane,
		);
		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });

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
		const button = page.getByRole('button', { name: 'Pour a cup' }).first();
		const cupsLine = page.locator('.code-block [data-code-stage] p').first();
		await button.waitFor();
		await page.screenshot({ path: `${shotsDir}/T004-state-before.png`, fullPage: true });

		const readCount = async () => ((await cupsLine.textContent()) ?? '').trim();
		const before = await readCount();
		check(
			before === 'Cups of coffee today: 0',
			'the cups demo renders its zero state from the server',
			before,
		);

		// First click both wakes the island and increments; wait for the text to
		// settle before the second click (a click sent mid-resume is dropped).
		await button.click();
		await settleText(
			cupsLine,
			(text) => text === 'Cups of coffee today: 1',
			'the cups demo counts the first click',
		);
		await button.click();
		await settleText(
			cupsLine,
			(text) => text === 'Cups of coffee today: 2',
			'the cups demo counts the second click',
		);
		const after = await readCount();
		check(
			after === 'Cups of coffee today: 2',
			'the cups demo reaches 2 after two clicks (island resumed)',
			after,
		);
		await page.screenshot({ path: `${shotsDir}/T004-state-after.png`, fullPage: true });

		const heads: { href: string; title: string; description: string }[] = [];
		for (const section of nav) {
			for (const entry of section.entries) {
				const response = await fetch(`${origin}${entry.href}`);
				check(response.status === 200, `GET ${entry.href}`, String(response.status));
				const html = await response.text();
				check(/<h1[^>]*>[^<]/.test(html), `${entry.href} serves an h1`);
				const parsed = await page.evaluate((source) => {
					const document = new DOMParser().parseFromString(source, 'text/html');
					return {
						title: document.title,
						description:
							document
								.querySelector('meta[name="description"]')
								?.getAttribute('content') ?? '',
						meta: document.querySelector('.page-meta') !== null,
					};
				}, html);
				check(parsed.meta, `${entry.href} serves its page information`);
				const { title, description } = parsed;
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
					html.includes('rel="icon" href="/favicon.svg"'),
					`${entry.href} links a favicon`,
				);
				check(
					html.includes(`<link rel="canonical" href="${siteOrigin}${entry.href}"`),
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
				const meta = page.locator('.page-meta');
				const metaText = await meta.innerText();
				const readingTime = await meta.locator(':scope > span').nth(3).innerText();
				check(
					(await meta.isVisible()) &&
						(await meta.locator('.page-meta-level').innerText()).trim().length > 0 &&
						/(?:\d+\s*(?:min|hour)|\bbreak\b)/i.test(readingTime) &&
						/Assumes:\s*\S/.test(metaText),
					`${entry.href} renders readable level, reading time and prerequisites`,
					metaText.replace(/\s+/g, ' '),
				);
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
		// `public/` is served at the site root; scripts/generate-seo.ts writes all three from nav.ts.
		for (const [path, wanted] of [
			['/robots.txt', `Sitemap: ${siteOrigin}/sitemap.xml`],
			['/sitemap.xml', `<loc>${siteOrigin}/concepts/state</loc>`],
			['/llms.txt', `](${siteOrigin}/reference)`],
			['/favicon.svg', '<svg'],
		] as const) {
			const response = await fetch(`${origin}${path}`);
			check(response.status === 200, `GET ${path}`, String(response.status));
			const body = await response.text();
			check(body.includes(wanted), `${path} carries what it is for`, wanted);
		}
		const sitemapBody = await (await fetch(`${origin}/sitemap.xml`)).text();
		check(
			flatNav.every((entry) =>
				sitemapBody.includes(`<loc>${siteOrigin}${entry.href}</loc>`),
			),
			'the sitemap lists every page in the nav',
			`${(sitemapBody.match(/<loc>/g) ?? []).length} urls for ${flatNav.length} pages`,
		);
		const llmsBody = await (await fetch(`${origin}/llms.txt`)).text();
		check(
			flatNav.every((entry) => llmsBody.includes(`(${siteOrigin}${entry.href}):`)),
			'llms.txt lists every page with a sentence about it',
		);

		// --- widget: the counter on the landing page ----------------------------
		// The landing opens on the counter, so the resume proof lives there: the
		// count is served at nought, and two clicks reach two.
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		const landingDemos = page.locator('.playground');
		const landingCount = landingDemos.first().getByRole('button');
		await landingCount.waitFor();
		const landingText = async () => ((await landingCount.textContent()) ?? '').trim();
		check(
			(await landingText()) === 'Count 0',
			'the landing counter serves Count 0 from the server',
			await landingText(),
		);
		await landingCount.click();
		await settleText(
			landingCount,
			(text) => text === 'Count 1',
			'the landing counter counts the first click',
		);
		check(
			(await landingText()) === 'Count 1',
			'clicking the counter adds one, so the landing island resumed',
			await landingText(),
		);
		await landingCount.click();
		await settleText(
			landingCount,
			(text) => text === 'Count 2',
			'the landing counter counts a second click',
		);
		check(
			(await landingText()) === 'Count 2',
			'the count keeps adding on repeat clicks, so the island stayed awake',
			await landingText(),
		);

		// --- widget: the rolled die on the landing page --------------------------
		// The page's other claim is that the component body ran once: the die is
		// rolled while the body runs, so it must read the same after a click.
		const rolledLine = landingDemos.nth(1).locator('p').first();
		const rolledCount = landingDemos.nth(1).getByRole('button');
		await rolledCount.waitFor();
		const rolledAt = ((await rolledLine.textContent()) ?? '').trim();
		check(
			/^Rolled when the component ran: [1-6]$/.test(rolledAt),
			'the die opens on one roll, made when the body ran',
			rolledAt,
		);
		await rolledCount.click();
		await settleText(
			rolledCount,
			(text) => text === 'Count 1',
			'the die demo counts its click',
		);
		check(
			((await rolledCount.textContent()) ?? '').trim() === 'Count 1',
			'the die demo button adds one too',
			((await rolledCount.textContent()) ?? '').trim(),
		);
		check(
			((await rolledLine.textContent()) ?? '').trim() === rolledAt,
			'the die does not roll again, so the click ran no component body again',
			((await rolledLine.textContent()) ?? '').trim(),
		);
		await page.screenshot({
			path: `${shotsDir}/T004-landing-widgets-after.png`,
			fullPage: true,
		});

		// --- widget: the drawn number on the state page --------------------------
		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
		const cupsStage = page.locator('.code-block [data-code-stage]').first();
		const cupsNumbers = async () =>
			(await cupsStage.locator('p').allTextContents()).map((text) =>
				Number(text.replace(/[^0-9]+/g, '')),
			);
		const pour = cupsStage.getByRole('button', { name: 'Pour a cup' });
		await pour.waitFor();
		const [watchedBefore, drawnBefore] = await cupsNumbers();
		check(watchedBefore === 0, 'cups watched number starts at 0', String(watchedBefore));
		check(
			Number.isFinite(drawnBefore) && drawnBefore >= 10 && drawnBefore <= 99,
			'cups drew a number while the page was set up',
			String(drawnBefore),
		);
		await pour.click();
		await settleText(
			cupsStage.locator('p').first(),
			(text) => text.endsWith(': 1'),
			'cups watched number reaches 1',
		);
		const [watchedAfter, drawnAfter] = await cupsNumbers();
		check(watchedAfter === 1, 'cups watched number moved on click', String(watchedAfter));
		check(
			drawnAfter === drawnBefore,
			'cups drawn number did not move, so the component did not run again',
			`${drawnBefore} then ${drawnAfter}`,
		);
		await cupsStage.getByRole('button', { name: 'Start over' }).click();
		await settleText(
			cupsStage.locator('p').first(),
			(text) => text === 'Cups of coffee today: 0',
			'Start over assigns the count back to 0',
		);
		await page.screenshot({ path: `${shotsDir}/T005-cups-after.png`, fullPage: true });

		// --- the Code block on the state page --------------------------------------
		{
			const codePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			const codeRequests: string[] = [];
			codePage.on('request', (request) => codeRequests.push(request.url()));
			const editorAssets = /\.wasm|compile-worker|_code-frame/;
			await codePage.goto(`${origin}/concepts/state`, { waitUntil: 'networkidle' });
			const block = codePage.locator('.code-block');
			check(
				!codeRequests.some((url) => editorAssets.test(url)),
				'Code: the page fetches no compiler, wasm or result frame before the reader interacts',
				codeRequests.filter((url) => editorAssets.test(url)).join(', ') || 'none',
			);
			const preloads = await codePage
				.locator('link[rel="modulepreload"]')
				.evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
			const preloadedCode: string[] = [];
			for (const href of preloads) {
				const body = await (await fetch(href)).text();
				if (/cm-editor|code:run|yuku/.test(body)) preloadedCode.push(href);
			}
			check(
				preloadedCode.length === 0,
				'Code: no modulepreload carries the editor, the session or the compiler',
				preloadedCode.join(', ') || `${preloads.length} preloads checked`,
			);
			await block
				.locator('[data-code-stage]')
				.getByRole('button', { name: 'Pour a cup' })
				.click();
			await settleText(
				block.locator('[data-code-stage] p').first(),
				(text) => text.endsWith(': 1'),
				'Code: the prerendered starter result is live before the editor loads',
			);
			await block.hover();
			await block.locator('.cm-editor').waitFor({ timeout: 20000 });
			check(true, 'Code: pointing at the block loads the editor');
			const line = (text: string) => block.locator('.cm-line', { hasText: text }).first();
			await line('Cups of coffee today').click();
			await codePage.keyboard.press('Home');
			await codePage.keyboard.press('Shift+End');
			await codePage.keyboard.type('<p>Mugs poured: {cups}</p>');
			const frame = codePage.frameLocator('.code-frame');
			await frame.locator('text=Mugs poured: 0').waitFor({ timeout: 30000 });
			check(
				await block.locator('[data-code-stage]').isHidden(),
				'Code: an edit compiles in the browser and the frame takes over the Result pane',
			);
			await line('let cups = state(0)').click();
			await codePage.keyboard.press('Home');
			await codePage.keyboard.press('Shift+End');
			await codePage.keyboard.type('let cups = 0;');
			await block.locator('.cm-code-problem-note').first().waitFor({ timeout: 30000 });
			check(
				/MARKLESS_STATE_STALE_LOCAL_WRITE/.test(
					(await block.locator('.cm-editor').textContent()) ?? '',
				),
				'Code: a build error shows inline under the line it names',
			);
			await block.getByRole('button', { name: 'Reset' }).click();
			await frame.locator('text=Cups of coffee today: 0').waitFor({ timeout: 30000 });
			check(
				(await block.locator('.cm-code-problem-note').count()) === 0 &&
					(await line('let cups = state(0)').count()) === 1,
				'Code: Reset restores the starter and clears the error',
			);
			await block.screenshot({ path: `${shotsDir}/T012-code-reset.png` });
			await codePage.close();
		}

		await page.goto(`${origin}/concepts/computed`, { waitUntil: 'load' });
		const orderStage = page.locator('.code-block [data-code-stage]').first();
		const totalLine = orderStage.locator('p').nth(2);
		const addMug = orderStage.getByRole('button', { name: 'Add a mug' });
		const addCoaster = orderStage.getByRole('button', { name: 'Add a coaster' });
		await addMug.waitFor();
		check(
			((await totalLine.textContent()) ?? '').trim() === 'Total: 12',
			'mug order total renders 12 from the server',
			((await totalLine.textContent()) ?? '').trim(),
		);
		await addMug.click();
		await settleText(totalLine, (text) => text === 'Total: 24', 'mug order total reaches 24');
		check(
			((await totalLine.textContent()) ?? '').trim() === 'Total: 24',
			'adding a mug re-derives the total with no line updating it',
		);
		await addCoaster.click();
		await settleText(totalLine, (text) => text === 'Total: 27', 'mug order total reaches 27');
		check(
			((await totalLine.textContent()) ?? '').trim() === 'Total: 27',
			'adding a coaster re-derives the same total',
		);
		await page.screenshot({ path: `${shotsDir}/T005-mug-order-after.png`, fullPage: true });

		// --- widgets on the reading-tsrx page ------------------------------------
		await page.goto(`${origin}/start/reading-tsrx`, { waitUntil: 'load' });
		// The page walks through counter.tsrx line by line, so the fence it prints
		// is the file the demo above it runs, not a second counter that differs.
		const trimmedLines = (text: string) =>
			text
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line !== '');
		const counterFence = (await page.locator('pre.shiki').allInnerTexts()).find((text) =>
			text.includes('export default function Counter()'),
		);
		const counterFile = trimmedLines(
			await readFile(`${root}/components/demos/start/counter.tsrx`, 'utf8'),
		);
		check(
			trimmedLines(counterFence ?? '').join('\n') === counterFile.join('\n'),
			'the reading-tsrx page prints the counter file its demo runs',
			trimmedLines(counterFence ?? '').join(' | '),
		);
		const readingDemos = page.locator('.playground');
		const labelledLine = readingDemos.nth(1).locator('p').first();
		await labelledLine.waitFor();
		check(
			((await labelledLine.textContent()) ?? '').trim() === 'You clicked 0 times.',
			'the fragment demo serves its paragraph at 0',
			((await labelledLine.textContent()) ?? '').trim(),
		);
		await readingDemos.nth(1).getByRole('button', { name: 'Click me' }).click();
		await settleText(
			labelledLine,
			(text) => text === 'You clicked 1 times.',
			'the paragraph beside the button follows its click',
		);
		const teaToggle = readingDemos.nth(2).getByRole('button');
		const teaNote = readingDemos.nth(2).locator('p.note');
		check(
			((await teaToggle.textContent()) ?? '').trim() === 'Show the note' &&
				(await teaNote.count()) === 0,
			'the @if demo starts with no note in the page',
		);
		await teaToggle.click();
		await teaNote.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
		check(
			((await teaNote.textContent()) ?? '').trim() === 'Steep it for three minutes.' &&
				((await teaToggle.textContent()) ?? '').trim() === 'Hide the note',
			'opening the branch puts the note into the page',
			((await teaToggle.textContent()) ?? '').trim(),
		);
		await teaToggle.click();
		await teaNote.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
		check((await teaNote.count()) === 0, 'closing the branch takes the note out of the page');
		await page.screenshot({
			path: `${shotsDir}/T005-reading-tsrx-after.png`,
			fullPage: true,
		});

		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
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
			atRest.icon.src === '/theme/sun.png',
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
			dark.icon.src === '/theme/moon.png',
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

		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
		const sidebarBox = () =>
			page.evaluate(() => {
				const box = document.querySelector('.sidebar')?.getBoundingClientRect();
				return box
					? `${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.width)}`
					: '';
			});
		const sidebarBefore = await sidebarBox();
		await page.evaluate(() => {
			(window as { __beforeNavigation?: number }).__beforeNavigation = 1;
		});
		await page.locator('a.sidebar-link[href="/concepts/computed"]').click();
		await page.waitForURL('**/concepts/computed');
		await page
			.waitForFunction(
				() =>
					document.querySelector('.sidebar-link.is-active')?.getAttribute('href') ===
					'/concepts/computed',
				undefined,
				{ timeout: 10_000 },
			)
			.catch(() => {});
		const landed = await page.evaluate(() => ({
			heading: document.querySelector('h1')?.textContent ?? '',
			crumb: document.querySelector('.crumb-page')?.textContent ?? '',
			title: document.title,
			canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
			description:
				document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
			survived: (window as { __beforeNavigation?: number }).__beforeNavigation === 1,
		}));
		const sidebarAfter = await sidebarBox();
		const sidebarKept = sidebarBefore !== '' && sidebarAfter === sidebarBefore;
		check(
			landed.crumb === 'Computed' &&
				landed.title.startsWith('Computed') &&
				landed.canonical.endsWith('/concepts/computed'),
			'a sidebar click lands on the page it names, chrome and all',
			`${landed.crumb} / ${landed.title} / ${landed.canonical} / ${landed.heading}`,
		);
		check(
			landed.survived && sidebarKept && landed.description !== '',
			'that click is no document load: the sidebar stays and the head follows the page',
			`survived ${landed.survived} / sidebar ${sidebarBefore} -> ${sidebarAfter} / description "${landed.description}"`,
		);
		// The pager and the breadcrumb home are plain anchors: the router takes them the same way.
		const nextHref = await page.locator('a.pager-next').getAttribute('href');
		await page.locator('a.pager-next').click();
		await page.waitForURL(`**${nextHref}`);
		await page
			.waitForFunction(
				(href) =>
					document
						.querySelector('link[rel="canonical"]')
						?.getAttribute('href')
						?.endsWith(href),
				nextHref,
				{ timeout: 10_000 },
			)
			.catch(() => {});
		const paged = await page.evaluate(() => ({
			survived: (window as { __beforeNavigation?: number }).__beforeNavigation === 1,
			canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
		}));
		check(
			paged.survived && nextHref !== null && paged.canonical.endsWith(nextHref),
			'the pager link is no document load and lands on the next page',
			`${nextHref} / ${paged.canonical} / survived ${paged.survived}`,
		);
		await page.locator('a.crumb-home').click();
		await page.waitForURL('**/');
		await page
			.waitForFunction(
				() =>
					document
						.querySelector('link[rel="canonical"]')
						?.getAttribute('href')
						?.endsWith('/'),
				undefined,
				{ timeout: 10_000 },
			)
			.catch(() => {});
		const home = await page.evaluate(() => ({
			survived: (window as { __beforeNavigation?: number }).__beforeNavigation === 1,
			canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
		}));
		check(
			home.survived && home.canonical === `${siteOrigin}/`,
			'the breadcrumb home link is no document load and lands on the docs home',
			`${home.canonical} / survived ${home.survived}`,
		);

		// --- sprites and mascots ------------------------------------------------
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		const heroMug = page.locator('.prose .markless-mug.is-hero svg.mug').first();
		await heroMug.waitFor();
		check(
			(await heroMug.getAttribute('data-docs-mug')) === 'true',
			'the landing hero is the Markless mug, and it follows the pointer',
			String(await heroMug.getAttribute('data-variant')),
		);
		const siblingMascots = await page.locator('.more-from img.mascot').evaluateAll((nodes) =>
			nodes.map((node) => ({
				src: (node as HTMLImageElement).getAttribute('src'),
				width: (node as HTMLImageElement).naturalWidth,
			})),
		);
		const tileMugs = await page.locator('.more-from .markless-mug svg.mug').count();
		check(
			siblingMascots.length === 3 && siblingMascots.every((one) => one.width > 0) && tileMugs === 1,
			'the More from compiled.run strip shows the Markless mug and three mascots that decode',
			`${tileMugs} mug, ` + siblingMascots.map((one) => `${one.src}:${one.width}`).join(' '),
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
			['index', '/'],
			['state', '/concepts/state'],
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
			await page.goto(`${origin}/`, { waitUntil: 'load' });
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
					return {
						href: link.getAttribute('href'),
						sources: images.map((image) => image.getAttribute('src')),
						count: images.length,
						visible: visible.length,
						image: visible[0],
					};
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
					entries: shown.map((entry) => ({ href: entry.href, sources: entry.sources })),
					pairs: shown.filter((entry) => entry.count === 2).length,
					oneVisible: shown.filter((entry) => entry.visible === 1).length,
					loaded: shown.filter((entry) => (entry.image?.naturalWidth ?? 0) > 0).length,
					sources: shown.map((entry) => entry.image?.getAttribute('src') ?? ''),
				};
			});
			const expected = nav.flatMap((section) => section.entries);
			check(
				icons.links === expected.length &&
					new Set(icons.entries.map((entry) => entry.href)).size === expected.length &&
					expected.every((entry) =>
						icons.entries.some((actual) => actual.href === entry.href),
					),
				'the sidebar contains each navigation destination exactly once',
				String(icons.links),
			);
			for (const entry of expected) {
				const actual = icons.entries.find((actual) => actual.href === entry.href);
				const cuts = ['light', 'dark'].map((cut) =>
					entry.icon
						? `/sidebar/${entry.icon}-${cut}.png`
						: `/sprites/${entry.sprite ?? 'sparkle'}${cut === 'dark' ? '.dark' : ''}.png`,
				);
				check(
					cuts.every((src) => actual?.sources.includes(src)),
					`${entry.href} carries the navigation data's paired assets`,
				);
			}
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
				expected.every(
					(entry, index) =>
						icons.sources[index] ===
						(entry.icon
							? `/sidebar/${entry.icon}-${theme}.png`
							: `/sprites/${entry.sprite ?? 'sparkle'}${theme === 'dark' ? '.dark' : ''}.png`),
				),
				`the ${theme} theme selects the matching navigation asset`,
			);
			const rail = page.locator('nav.sidebar');
			await rail.screenshot({ path: `${shotsDir}/T034-sidebar-${theme}.png` });
		}
		await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

		for (const [label, href] of [
			['index', '/'],
			['state', '/concepts/state'],
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
								const list = document.querySelector('.page-tree');
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
							`${at}: the page tree is visible beside the prose without the mobile disclosure`,
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
							`${at}: the page tree starts collapsed above the article`,
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

					if (width === 390) await page.locator('.sidebar-summary').click();
					const currentLink = page.locator(`.page-tree a[href="${href}"]`);
					check(
						await currentLink.isVisible(),
						`${at}: the current destination is reachable in the open navigation`,
					);
					for (const branch of await page.locator('.page-tree .branch').all()) {
						const firstLink = branch.locator('a').first();
						if (!(await firstLink.isVisible())) {
							await branch.locator('.branch-trigger').click();
							await firstLink.waitFor({ state: 'visible' });
							check(
								await firstLink.isVisible(),
								`${at}: activating a collapsed branch exposes its destination`,
							);
						}
					}
					if (width === 390) {
						await page.locator('.sidebar-summary').click();
						check(
							!(await currentLink.isVisible()),
							`${at}: mobile navigation closes again`,
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
			'/',
			'/concepts/state',
			'/concepts/computed',
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
				href === '/' ? assumed.length === 0 : assumed.length > 0,
				`${href}: the assumes line has the links it should`,
				`${assumed.length} links`,
			);
		}

		// --- the footer doodles react to the pointer ----------------------------
		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
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
			'/concepts/events',
			'/concepts/conditionals',
			'/concepts/lists',
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

		// --- widget: the mug label on the events page ---------------------------
		await page.goto(`${origin}/concepts/events`, { waitUntil: 'load' });
		const echoStage = page.locator('.code-block [data-code-stage]').first();
		const echoField = echoStage.locator('input').first();
		const echoLine = echoStage.locator('p').first();
		const printedLine = echoStage.locator('p').nth(1);
		await echoField.waitFor();
		check(
			((await echoLine.textContent()) ?? '').trim() === 'Preview:',
			'mug label renders its empty preview from the server',
			((await echoLine.textContent()) ?? '').trim(),
		);
		await echoField.click();
		await echoField.pressSequentially('Ada', { delay: 40 });
		await settleText(
			echoLine,
			(text) => text === 'Preview: Ada',
			'mug label preview follows the keystrokes',
		);
		check(
			((await echoLine.textContent()) ?? '').trim() === 'Preview: Ada',
			'typing into the field moves the preview under it',
		);
		const urlBeforeSubmit = page.url();
		await echoField.press('Enter');
		await settleText(
			printedLine,
			(text) => text === 'Printed: Ada',
			'pressing Enter runs the submit handler',
		);
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
		await echoField.press('Escape');
		await settleText(echoLine, (text) => text === 'Preview:', 'Escape clears the name');
		await page.screenshot({ path: `${shotsDir}/T013-mug-label-after.png`, fullPage: true });

		await page.goto(`${origin}/concepts/conditionals`, { waitUntil: 'load' });
		const conditionalsTitles = await page
			.locator('.callout-title')
			.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
		check(
			conditionalsTitles.includes("Why can't I put an @if inside another @if?"),
			'/concepts/conditionals answers the nested @if question',
			conditionalsTitles.join(' | '),
		);
		const conditionalsText = (await page.locator('body').textContent()) ?? '';
		check(
			conditionalsText.includes('MARKLESS_STATE_CREATION_SITE_UNSTABLE'),
			'/concepts/conditionals names the error the build stops with',
		);

		// --- widget: the note panel on the conditionals page ---------------------
		// The page's claim: the field leaves the page with the branch, and the note
		// survives because it is declared above the branch.
		const notePanel = page.locator('.code-block [data-code-stage]').first();
		const noteToggle = notePanel.getByRole('button', { name: 'Show or hide the note' });
		const noteField = notePanel.locator('input');
		const noteVerdict = notePanel.locator('p').first();
		await noteToggle.waitFor();
		check((await noteField.count()) === 0, 'the note field is not in the page while closed');
		await noteToggle.click();
		await noteField.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
		const longNote = 'A note longer than twenty letters';
		await noteField.fill(longNote);
		await settleText(
			noteVerdict,
			(text) => text === 'That is a long note.',
			'the computed under the field follows the note',
		);
		await noteToggle.click();
		await noteField.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
		check((await noteField.count()) === 0, 'closing the panel takes the field out of the page');
		check(
			((await noteVerdict.textContent()) ?? '').trim() === 'That is a long note.',
			'the note outlives the branch, because it is declared above it',
			((await noteVerdict.textContent()) ?? '').trim(),
		);
		await noteToggle.click();
		await noteField.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
		check(
			(await noteField.inputValue()) === longNote,
			'opening the panel again shows the note that was typed',
			await noteField.inputValue(),
		);
		await page.screenshot({ path: `${shotsDir}/T013-note-panel-after.png`, fullPage: true });

		// --- widget: the shopping list on the lists page --------------------------
		await page.goto(`${origin}/concepts/lists`, { waitUntil: 'load' });
		const shopping = page.locator('.code-block [data-code-stage]').first();
		const shoppingRows = async () =>
			(await shopping.locator('li').allTextContents()).map((text) => text.trim());
		const pears = shopping.getByRole('checkbox', { name: 'Pears' });
		await pears.waitFor();
		check(
			(await shoppingRows()).join('|') === 'Pears|Coffee|Milk',
			'the list serves its rows in their first order',
			(await shoppingRows()).join('|'),
		);
		await pears.check();
		await shopping.getByRole('button', { name: 'Sort A to Z' }).click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await shoppingRows()).join('|') === 'Coffee|Milk|Pears') break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(
			(await shoppingRows()).join('|') === 'Coffee|Milk|Pears',
			'sorting reorders the rows',
			(await shoppingRows()).join('|'),
		);
		check(
			(await pears.isChecked()) &&
				!(await shopping.getByRole('checkbox', { name: 'Coffee' }).isChecked()),
			'the tick moves with Pears through the sort, because each row has a key',
		);
		await shopping.getByRole('button', { name: 'Remove ticked' }).click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await shoppingRows()).join('|') === 'Coffee|Milk') break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(
			(await shoppingRows()).join('|') === 'Coffee|Milk',
			'removing ticked rows drops Pears and keeps the rest',
			(await shoppingRows()).join('|'),
		);
		await page.screenshot({ path: `${shotsDir}/T013-shopping-list-after.png`, fullPage: true });

		// --- batch 3: first app, async, styling ---------------------------------
		for (const href of [
			'/start/first-app',
			'/concepts/async',
			'/concepts/styling',
		]) {
			const response = await fetch(`${origin}${href}`);
			check(response.status === 200, `GET ${href}`, String(response.status));
			await page.goto(`${origin}${href}`, { waitUntil: 'load' });
			const heading = ((await page.locator('h1').first().textContent()) ?? '').trim();
			check(heading.length > 0, `${href} renders its h1 in the browser`, heading);
			check(
				(await page.locator('.playground, .code-block').count()) > 0,
				`${href} carries its live demo`,
			);
			await page.screenshot({
				path: `${shotsDir}/T014-${slugFor(href)}.png`,
				fullPage: true,
			});
		}

		// --- widget: the mug facts on the async page ------------------------------
		// The page's claim: each pick runs the recipe again, the old answer stays
		// until the new one is ready, a failure swaps in @catch, and a later pick
		// recovers. Every text read while waiting must be the old or the new answer.
		await page.goto(`${origin}/concepts/async`, { waitUntil: 'load' });
		const facts = page.locator('.code-block [data-code-stage]').first();
		const factLine = facts.locator('p').first();
		await factLine.waitFor();
		await settleText(
			factLine,
			(text) => text === 'Pick a mug.',
			'the async demo serves its prompt',
		);
		const waitForFact = async (button: string, from: string, to: string, label: string) => {
			await facts.getByRole('button', { name: button }).click();
			const seen = new Set<string>();
			for (let attempt = 0; attempt < 60; attempt += 1) {
				const text = ((await factLine.textContent()) ?? '').trim();
				seen.add(text);
				if (text === to) break;
				await new Promise((done) => setTimeout(done, 100));
			}
			check(
				seen.has(to) && [...seen].every((text) => text === from || text === to),
				label,
				[...seen].join(' -> '),
			);
		};
		await waitForFact(
			'Tall mug',
			'Pick a mug.',
			'The tall mug holds a big coffee.',
			'the async demo holds the old answer until the new one is ready, then swaps',
		);
		await waitForFact(
			'Cracked mug',
			'The tall mug holds a big coffee.',
			'That mug is not on the shelf.',
			'a failed lookup swaps in the @catch block',
		);
		await waitForFact(
			'Small mug',
			'That mug is not on the shelf.',
			'The small mug holds one espresso.',
			'picking another mug after a failure recovers',
		);
		await page.screenshot({ path: `${shotsDir}/T014-mug-facts-after.png`, fullPage: true });

		// --- widget: two cards on the styling page --------------------------------
		await page.goto(`${origin}/concepts/styling`, { waitUntil: 'load' });
		const cards = page.locator('.playground').first().locator('article.card');
		await cards.first().waitFor();
		const cardGrounds = () =>
			cards.evaluateAll((nodes) =>
				nodes.map((node) => getComputedStyle(node as Element).backgroundColor),
			);
		const groundsAtRest = await cardGrounds();
		check(
			groundsAtRest.length === 2 && groundsAtRest[0] !== groundsAtRest[1],
			'two components both call it .card, and each keeps its own style',
			groundsAtRest.join(' vs '),
		);
		await page.getByRole('button', { name: 'Light it up' }).click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await cardGrounds())[1] !== groundsAtRest[1]) break;
			await new Promise((done) => setTimeout(done, 100));
		}
		const groundsLit = await cardGrounds();
		check(
			groundsLit[1] !== groundsAtRest[1] && groundsLit[0] === groundsAtRest[0],
			'lighting the chalk card restyles it and leaves the paper card alone',
			groundsLit.join(' vs '),
		);

		// The first-app page carries the scaffold command and a starter home that runs.
		await page.goto(`${origin}/start/first-app`, { waitUntil: 'load' });
		const firstAppText = (await page.locator('.prose').first().innerText()).replace(
			/\s+/g,
			' ',
		);
		check(
			firstAppText.includes('npm create markless@latest'),
			'the first-app page carries the scaffold command',
		);
		const starterCount = page.locator('.playground').first().getByRole('button');
		await starterCount.waitFor();
		await starterCount.click();
		await settleText(
			starterCount,
			(text) => text === 'Count 1',
			'the first-app starter home counts a click',
		);

		// --- batch 4: the Building an app section -------------------------------
		// Four pages, each with a widget whose teaching moment is a thing the
		// reader does. The checks below do that and assert what the page says.
		for (const href of [
			'/build/components',
			'/build/elements',
			'/build/storage',
			'/build/shared',
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

		// --- widgets: the badge and the picker on the components page -------------
		// A prop is a live read of the parent's value, and the child body runs once.
		await page.goto(`${origin}/build/components`, { waitUntil: 'load' });
		const badgeDemo = page
			.locator('.playground')
			.filter({ has: page.getByRole('button', { name: 'Add one' }) });
		const badgeLine = badgeDemo.locator('p').first();
		await badgeLine.waitFor();
		const badgeDrawn = async () =>
			((await badgeLine.textContent()) ?? '').match(/drew (\d+)/)?.[1] ?? '';
		const drewAtRest = await badgeDrawn();
		check(
			((await badgeLine.locator('strong').textContent()) ?? '').trim() === '0' &&
				drewAtRest !== '',
			'the badge serves 0 clicks and the number it drew',
			((await badgeLine.textContent()) ?? '').trim(),
		);
		await badgeDemo.getByRole('button', { name: 'Add one' }).click();
		await settleText(
			badgeLine.locator('strong'),
			(text) => text === '1',
			'the badge reads the parent count live',
		);
		check(
			(await badgeDrawn()) === drewAtRest,
			'the badge body did not run again, so its drawn number stayed',
			`${drewAtRest} then ${await badgeDrawn()}`,
		);
		const pickerDemo = page
			.locator('.playground')
			.filter({ has: page.getByRole('button', { name: 'Pick Grace' }) });
		const pickedLine = pickerDemo.locator('p').first();
		check(
			((await pickedLine.textContent()) ?? '').trim() === 'Picked: nobody',
			'the picker serves nobody picked',
			((await pickedLine.textContent()) ?? '').trim(),
		);
		await pickerDemo.getByRole('button', { name: 'Pick Grace' }).click();
		await settleText(
			pickedLine,
			(text) => text === 'Picked: Grace',
			'a callback prop talks back to the parent',
		);
		await page.screenshot({ path: `${shotsDir}/T006-components-after.png`, fullPage: true });

		// --- widget: the focus counter on the elements page -----------------------
		// The claim is that the handle is the real node, so what is checked is the
		// browser's own idea of which element has the caret.
		await page.goto(`${origin}/build/elements`, { waitUntil: 'load' });
		const focusButton = page.getByRole('button', { name: 'Add one and focus' });
		await focusButton.waitFor();
		const activeIsField = () =>
			page.evaluate(() => {
				const field = document.querySelector('.playground input');
				return Boolean(field) && document.activeElement === field;
			});
		const settleFocus = async () => {
			for (let attempt = 0; attempt < 40; attempt += 1) {
				if (await activeIsField()) return;
				await new Promise((done) => setTimeout(done, 100));
			}
		};
		check(!(await activeIsField()), 'the field does not start out focused');
		await focusButton.click();
		await settleFocus();
		check(await activeIsField(), 'clicking the button puts the caret in the field');
		check(
			(await page.locator('.playground input').inputValue()) === '1',
			'the same click adds one to the count in the field',
			await page.locator('.playground input').inputValue(),
		);
		await focusButton.focus();
		await page.locator('.playground label').click();
		await settleFocus();
		check(
			await activeIsField(),
			'clicking the label focuses the field, because for={field} names it',
		);
		await page.screenshot({ path: `${shotsDir}/T006-focus-counter-after.png`, fullPage: true });

		// --- widget: the drink pick on the storage page ----------------------------
		await page.goto(`${origin}/build/storage`, { waitUntil: 'load' });
		const drinkAttr = () =>
			page.evaluate(() => document.documentElement.getAttribute('data-docs-drink'));
		await page.locator('.playground button.coffee').click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await drinkAttr()) === 'coffee') break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(
			(await drinkAttr()) === 'coffee',
			'picking a drink writes it onto <html>',
			String(await drinkAttr()),
		);
		await page.reload({ waitUntil: 'domcontentloaded' });
		check(
			(await drinkAttr()) === 'coffee',
			'the pick survives a reload, applied before the page is shown',
			String(await drinkAttr()),
		);
		await page.screenshot({ path: `${shotsDir}/T006-drink-pick-after.png`, fullPage: true });
		await page.evaluate(() => localStorage.clear());

		// --- widget: the shared counter on the shared page --------------------------
		await page.goto(`${origin}/build/shared`, { waitUntil: 'load' });
		const sharedDemo = page
			.locator('.playground')
			.filter({ hasText: 'Badge shows:' })
			.first();
		const sharedBadge = sharedDemo.locator('output').first();
		await sharedBadge.waitFor();
		check(
			((await sharedBadge.textContent()) ?? '').trim() === '0',
			'the shared badge serves 0',
			((await sharedBadge.textContent()) ?? '').trim(),
		);
		await sharedDemo.getByRole('button', { name: 'Add one' }).click();
		await settleText(
			sharedBadge,
			(text) => text === '1',
			'a click in one component moves the badge in another through shared()',
		);
		await page.screenshot({ path: `${shotsDir}/T006-shared-after.png`, fullPage: true });

		// --- batch 5: the Router section, how it works, and the reference -------
		// Each widget check does what its page tells the reader to do and asserts
		// the line the page says they will then be looking at.
		for (const href of [
			'/router/pages',
			'/router/links',
			'/router/data',
			'/router/api-routes',
			'/router/deploying',
			'/how-it-works',
			'/reference',
			'/errors',
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

		// --- widget: the URL picker on the pages page -----------------------------
		await page.goto(`${origin}/router/pages`, { waitUntil: 'load' });
		const routeAnswer = page.locator('.playground .playground-output').first();
		const routeNote = page.locator('.playground .explorer-note').first();
		await routeAnswer.waitFor();
		check(
			((await routeAnswer.textContent()) ?? '').trim() ===
				'pages/blog/[slug].tsrx answers, with params.slug = "hello".',
			'the URL picker opens on the bracketed file and its parameter',
			((await routeAnswer.textContent()) ?? '').trim(),
		);
		await page.getByRole('button', { name: '/docs/guide/intro' }).click();
		await settleText(
			routeAnswer,
			(text) => text === 'pages/docs/[...slug].mdx answers, with params.slug = "guide/intro".',
			'the URL picker answers with the catch-all file',
		);
		await page.getByRole('button', { name: '/docs', exact: true }).click();
		await settleText(
			routeAnswer,
			(text) => text === 'pages/404.tsrx answers, with status 404.',
			'a catch-all with nothing to catch falls through to the 404 page',
		);
		check(
			((await routeNote.textContent()) ?? '').includes('at least one more part'),
			'the URL picker explains why /docs matched nothing',
			((await routeNote.textContent()) ?? '').slice(0, 60),
		);
		await page.screenshot({ path: `${shotsDir}/T030-url-picker-after.png`, fullPage: true });

		// --- widget: the link check on the links page -----------------------------
		await page.goto(`${origin}/router/links`, { waitUntil: 'load' });
		const linkLine = page.locator('.playground .file-lines').first();
		const linkAnswer = page.locator('.playground .playground-output').first();
		const linkNote = page.locator('.playground .explorer-note').first();
		await linkAnswer.waitFor();
		check(
			((await linkAnswer.textContent()) ?? '').trim() === 'The build passes.',
			'the link widget opens on the link that builds',
			((await linkAnswer.textContent()) ?? '').trim(),
		);
		await page.getByRole('button', { name: 'The folder was renamed' }).click();
		await settleText(
			linkAnswer,
			(text) => text === 'The build stops.',
			'the link widget stops the build after the rename',
		);
		check(
			((await linkLine.textContent()) ?? '').includes('/blogs/[slug]') &&
				((await linkNote.textContent()) ?? '').includes('does not match any route'),
			'the code line carries the renamed route and the note names the error',
			((await linkNote.textContent()) ?? '').slice(0, 60),
		);
		await page.getByRole('button', { name: 'The params are missing' }).click();
		await settleText(
			linkNote,
			(text) => text.includes('requires params'),
			'the link widget names the missing params',
		);
		await page.screenshot({ path: `${shotsDir}/T030-link-check-after.png`, fullPage: true });

		// --- widget: the streamed feed on the data page ---------------------------
		await page.goto(`${origin}/router/data`, { waitUntil: 'load' });
		const feedNote = page.locator('.playground .explorer-note').first();
		const feedBody = page.locator('.playground .screen p').nth(1);
		await feedNote.waitFor();
		check(
			((await feedNote.textContent()) ?? '').includes('Nothing has arrived yet'),
			'the streamed feed starts at the request',
			((await feedNote.textContent()) ?? '').slice(0, 60),
		);
		const nextPart = page.getByRole('button', { name: 'Next part' });
		await nextPart.click();
		await settleText(
			feedBody,
			(text) => text === 'Loading...',
			'the first part of the response carries the @pending content',
		);
		await nextPart.click();
		await settleText(
			feedBody,
			(text) => text === 'Loaded for /feed',
			'the same response then sends the @try content',
		);
		await page.getByRole('button', { name: 'Start over' }).click();
		await settleText(
			feedNote,
			(text) => text.includes('Nothing has arrived yet'),
			'the illustration can be replayed',
		);
		await page.screenshot({ path: `${shotsDir}/T030-feed-steps-after.png`, fullPage: true });

		// --- widget: the endpoint picker on the API routes page ---------------------
		await page.goto(`${origin}/router/api-routes`, { waitUntil: 'load' });
		const apiNote = page.locator('.playground .explorer-note').first();
		await apiNote.waitFor();
		check(
			((await apiNote.textContent()) ?? '').trim().startsWith('200 {"id":"42"}'),
			'a GET to the users endpoint answers with its params',
			((await apiNote.textContent()) ?? '').slice(0, 60),
		);
		await page.getByRole('button', { name: 'POST', exact: true }).click();
		await settleText(
			apiNote,
			(text) => text.startsWith('404 Not found. The file name says get'),
			'a POST finds no endpoint, because the file name says get',
		);

		// --- widget: the state graph demo ------------------------------------------
		// One write moves the state and the computed that reads it, nothing else.
		await page.goto(`${origin}/how-it-works/state-graph`, { waitUntil: 'load' });
		const graphOutputs = page.locator('.playground output');
		await graphOutputs.first().waitFor();
		const graphValues = async () =>
			(await graphOutputs.allTextContents()).map((text) => text.trim()).join(',');
		check(
			(await graphValues()) === '2,4',
			'the state graph demo serves count 2 and doubled 4',
			await graphValues(),
		);
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await graphValues()) === '3,6') break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(
			(await graphValues()) === '3,6',
			'one write moves the state and the computed that reads it',
			await graphValues(),
		);
		await page.screenshot({ path: `${shotsDir}/T030-state-graph-after.png`, fullPage: true });

		// --- sketch figures in How it works ----------------------------------------
		// Each one is driven the way its hint tells the reader to drive it.
		await page.goto(`${origin}/how-it-works/the-big-idea`, { waitUntil: 'load' });
		const planFigure = page.locator('figure.plan-anywhere');
		await planFigure.waitFor();
		const planLive = planFigure.locator('.env[data-for="browser"] .live');
		await planLive.click();
		await settleText(planLive, (text) => text === 'Count 1', 'the plan figure counter counts in Browser');
		await planFigure.getByRole('button', { name: 'Server', exact: true }).click();
		const serverPanel = planFigure.locator('.env[data-for="server"]');
		await serverPanel.waitFor({ state: 'visible' });
		check(
			((await serverPanel.textContent()) ?? '').includes('renderToString(App)') &&
				!(await planFigure.locator('.env[data-for="browser"]').isVisible()),
			'picking Server swaps in the server panel and the same plan cards stay',
		);
		check(
			(await planFigure.locator('.cards li').count()) === 3,
			'the plan figure keeps three plan cards',
		);

		await page.goto(`${origin}/how-it-works/compiler`, { waitUntil: 'load' });
		const passFigure = page.locator('figure.compiler-passes');
		const passWhere = passFigure.locator('.where');
		await passWhere.waitFor();
		check(
			((await passWhere.textContent()) ?? '').trim() === 'Pass 1 of 15',
			'the pass figure opens on pass 1',
			((await passWhere.textContent()) ?? '').trim(),
		);
		await passFigure.getByRole('button', { name: 'Next →' }).click();
		await settleText(passWhere, (text) => text === 'Pass 2 of 15', 'Next moves to pass 2');
		await passFigure.getByRole('button', { name: 'Pass 9, protocol-view' }).click();
		await settleText(passWhere, (text) => text === 'Pass 9 of 15', 'a station button jumps to pass 9');
		check(
			((await passFigure.locator('.pass[data-n="9"]').textContent()) ?? '').includes(
				'"symbol:1"',
			) && (await passFigure.locator('.pass[data-n="9"]').isVisible()),
			'pass 9 shows the view record card with its symbol IDs',
		);

		await page.goto(`${origin}/how-it-works/payload`, { waitUntil: 'load' });
		const payloadFigure = page.locator('figure.payload-card');
		const payloadSay = payloadFigure.locator('.say');
		await payloadSay.waitFor();
		check(
			((await payloadSay.textContent()) ?? '').includes('The click lives only in the view record.'),
			'the payload card opens on the button line',
			((await payloadSay.textContent()) ?? '').slice(0, 60),
		);
		await payloadFigure.getByRole('button', { name: 'The link' }).click();
		await settleText(
			payloadSay,
			(text) => text.includes('Fetching it does not run it.'),
			'pressing the link line explains the preload',
		);

		await page.goto(`${origin}/how-it-works/resuming`, { waitUntil: 'load' });
		const clickFigure = page.locator('figure.first-click');
		const clickLive = clickFigure.locator('.live');
		await clickLive.waitFor();
		await clickLive.click();
		await settleText(clickLive, (text) => text === 'Count 1', 'the first-click counter counts');
		await settleText(
			clickFigure.locator('.steps[data-for="direct"] li').last(),
			(text) => text.includes('Count 1'),
			'the direct path notes name the text that was written',
		);
		await clickFigure.getByRole('button', { name: 'Server-rendered page' }).click();
		await settleText(clickLive, (text) => text === 'Count 0', 'switching path starts the counter over');
		check(
			await clickFigure.locator('.steps[data-for="server"]').isVisible(),
			'the server path shows its own steps',
		);
		await page.screenshot({ path: `${shotsDir}/T030-first-click-after.png`, fullPage: true });

		// How it works is the one place the docs name semantic analysis, and it
		// defines the term in the words the learner pages paraphrase.
		await page.goto(`${origin}/how-it-works`, { waitUntil: 'load' });
		const howItWorksText = (await page.locator('.prose').first().innerText()).replace(
			/\s+/g,
			' ',
		);
		check(
			howItWorksText.includes(
				'Reading code for what it means, not only for how it is spelled, is called semantic analysis.',
			),
			'how-it-works defines semantic analysis in plain words',
		);
		check(
			howItWorksText.includes('Hydration means the browser runs your components again'),
			'how-it-works defines hydration before it rules it out',
		);
		for (const href of flatNav
			.map((entry) => entry.href)
			.filter((href) => /^\/(?:$|start|concepts|build|router)/.test(href))) {
			const learnerText = (await (await fetch(`${origin}${href}`)).text()).replace(
				/<[^>]+>/g,
				' ',
			);
			check(
				!/semantic analysis/i.test(learnerText),
				`${href} keeps the term semantic analysis for How it works`,
			);
		}

		// --- the landing comparison stays behind its collapsible -------------------
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		const comparison = page
			.locator('.collapsible')
			.filter({ has: page.getByRole('button', { name: 'Coming from another framework?' }) });
		const comparisonTrigger = comparison.getByRole('button', {
			name: 'Coming from another framework?',
		});
		const comparisonText = comparison.locator('p');
		check(
			(await comparisonTrigger.getAttribute('aria-expanded')) === 'false' &&
				!(await comparisonText.isVisible()),
			'the framework comparison starts closed with its text hidden',
		);
		await comparisonTrigger.click();
		await comparisonText.waitFor({ state: 'visible' });
		check(
			(await comparisonTrigger.getAttribute('aria-expanded')) === 'true' &&
				/\.value/.test(await comparisonText.innerText()),
			'opening the comparison exposes its actual text',
		);
		await comparisonTrigger.click();
		await comparisonText.waitFor({ state: 'hidden' });
		check(
			(await comparisonTrigger.getAttribute('aria-expanded')) === 'false' &&
				!(await comparisonText.isVisible()),
			'closing the comparison hides its text again',
		);

		// --- the reference names the packages it promises -------------------------
		await page.goto(`${origin}/reference`, { waitUntil: 'load' });
		const referenceText = (await page.locator('.prose').first().innerText()).replace(
			/\s+/g,
			' ',
		);
		for (const name of [
			'@markless/core',
			'@markless/router',
			'@markless/typescript-plugin',
			'@markless/ui',
			'@markless/vitest-browser',
			'@markless/compiler',
			'@markless/runtime',
			'@markless/web',
		]) {
			check(referenceText.includes(name), `the reference page lists ${name}`);
		}

		// --- the error codes index and one page per code ---------------------------
		await page.goto(`${origin}/errors`, { waitUntil: 'load' });
		const errorLinks = await page
			.locator('a[href^="/errors/MARKLESS_"]')
			.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
		check(
			errorLinks.length === errorIndex.total,
			'/errors links a page for every code in the generated index',
			`${errorLinks.length} links for ${errorIndex.total} codes`,
		);
		for (const code of [
			'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
			'MARKLESS_REPEAT_KEY_REQUIRED',
			'MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED',
			'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
		]) {
			check(errorLinks.includes(`/errors/${code}`), `/errors lists ${code}`);
			const response = await fetch(`${origin}/errors/${code}`);
			check(response.status === 200, `GET /errors/${code}`, String(response.status));
			const parsed = await page.evaluate((source) => {
				const document = new DOMParser().parseFromString(source, 'text/html');
				return {
					title: document.title,
					description:
						document.querySelector('meta[name="description"]')?.getAttribute('content') ??
						'',
				};
			}, await response.text());
			const wanted = headFor(`/errors/${code}`, findError);
			check(
				parsed.title === `${code} | Markless docs` && parsed.title === wanted.title,
				`/errors/${code} serves its code as its <title>`,
				parsed.title,
			);
			check(
				parsed.description === wanted.description &&
					parsed.description === findError(code)?.description,
				`/errors/${code} serves its error description as <meta name="description">`,
				parsed.description.slice(0, 60),
			);
		}

		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
		const mugButton = page.getByRole('button', { name: 'Say hello to the mug' });
		const mug = mugButton.locator('[data-docs-mug]');
		await mugButton.waitFor();
		check(
			(await page.getByRole('button', { name: 'Like this page', exact: true }).count()) ===
				0 &&
				(await page
					.locator('.like-heart-count,.thanks,.bean-flight,.coffee-bean')
					.count()) === 0,
			'the standalone mug has no like UI or flying beans',
		);
		await page.mouse.move(300, 200);
		await page.waitForTimeout(150);
		check(
			(await mug.getAttribute('style'))?.includes('--gaze-x') === true,
			'the mug follows movement before activation',
		);
		for (const activation of ['mouse', 'Enter', 'Space']) {
			if (activation === 'mouse') await mugButton.click();
			else {
				await mugButton.focus();
				await page.keyboard.press(activation);
			}
			await page.waitForTimeout(50);
			const response = await mugButton.locator('.greeting-eyes').evaluate((node) => {
				const animation = node.getAnimations()[0];
				animation?.pause();
				if (animation) animation.currentTime = 100;
				return new DOMMatrix(getComputedStyle(node).transform).d;
			});
			check(response < 0.9, `${activation} greeting produces a visible blink`);
		}
		await page.screenshot({ path: `${shotsDir}/mug-greeting.png`, fullPage: false });

		// --- the stickers are on the pages that ask for them --------------------
		await page.goto(`${origin}/`, { waitUntil: 'load' });
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
