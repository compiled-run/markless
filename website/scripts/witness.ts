// Run: node --experimental-strip-types scripts/witness.ts
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright-core';
import { flatNav, headFor, nav, siteOrigin } from '../nav.ts';
import { findError } from '../components/docs/errors/lookup.ts';
import { errorIndex } from '../components/docs/errors/errors-index.ts';
import { defaultCompilerPasses } from '../../packages/compiler/src/pass-registry.ts';

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

/** Polls `read` until it equals `want` (or satisfies it, when `want` is a predicate), for up to two seconds. */
const expectPoll = async (read: () => Promise<unknown>, want: unknown) => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const got = await read();
		if (typeof want === 'function' ? (want as (value: unknown) => boolean)(got) : got === want)
			return true;
		await new Promise((done) => setTimeout(done, 50));
	}
	return false;
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
/** Selects the code of the line holding `find` in the block's visible file and types `replacement` over it. */
async function retype(
	page: Page,
	block: Locator,
	find: string,
	replacement: string,
): Promise<void> {
	const input = block.locator('[data-code-input]:visible').first();
	await input.evaluate((element, wanted) => {
		const area = element as HTMLTextAreaElement;
		const at = area.value.indexOf(wanted);
		const start = area.value.lastIndexOf('\n', at) + 1;
		const end = area.value.indexOf('\n', at);
		const indent = /^[ \t]*/.exec(area.value.slice(start))?.[0].length ?? 0;
		area.focus();
		area.setSelectionRange(start + indent, end < 0 ? area.value.length : end);
	}, find);
	await page.keyboard.press('Backspace');
	await page.keyboard.type(replacement);
}

/** Whether the visible file's highlighted lines hold the textarea's text, and how far their heights differ. */
function codeLayers(block: Locator): Promise<{ same: boolean; heightGap: number }> {
	return block
		.locator('[data-code-file]:visible')
		.first()
		.evaluate((editor) => {
			const area = editor.querySelector('textarea')!;
			const pre = editor.querySelector('pre')!;
			const lines = [...pre.children].map((line) => line.textContent ?? '');
			return {
				same: lines.join('\n') === area.value,
				heightGap: Math.abs(
					area.getBoundingClientRect().height - pre.getBoundingClientRect().height,
				),
			};
		});
}

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

/** Like settleText, but reads only what is rendered: Watch lines keep their other answers in hidden spans. */
const settleInner = async (locator: Locator, wanted: (text: string) => boolean, label: string) => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const text = (await locator.innerText()).trim();
		if (wanted(text)) return text;
		await new Promise((done) => setTimeout(done, 100));
	}
	const text = (await locator.innerText()).trim();
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

	const assetPath = landingHtml.match(/(?:href|src)="(\/(?:assets|build)\/[^"]+)"/)?.[1];
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
		const button = page.locator('.code-block [data-code-stage]').getByRole('button', { name: 'Pour a cup' }).first();
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
					html.includes('rel="icon" href="/favicon-mug.svg"'),
					`${entry.href} links a favicon`,
				);
				check(
					html.includes(`<link rel="canonical" href="${siteOrigin}${entry.href}"`),
					`${entry.href} names itself canonical`,
				);
				// `computed<T>(derive: () => T)` takes no argument, so a `{ signal }` parameter does not compile.
				check(
					!/computed\(async\s*\(\s*\{/.test(html.replace(/<[^>]+>/g, '')),
					`${entry.href} prints no computed(async ({ … }) => …), which does not typecheck`,
				);
				heads.push({ href: entry.href, title, description });
				await page.goto(`${origin}${entry.href}`, { waitUntil: 'load' });
				const meta = page.locator('.page-meta');
				const metaText = await meta.innerText();
				const readingTime = await meta.locator('.page-meta-time').innerText();
				check(
					(await meta.isVisible()) &&
						/(?:\d+\s*(?:min|hour)|\bbreak\b)/i.test(readingTime) &&
						!/^\s*·/.test(metaText) &&
						/Assumes:\s*\S/.test(metaText),
					`${entry.href} renders a readable reading time and prerequisites, with no leading separator`,
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
			flatNav.every((entry) => sitemapBody.includes(`<loc>${siteOrigin}${entry.href}</loc>`)),
			'the sitemap lists every page in the nav',
			`${(sitemapBody.match(/<loc>/g) ?? []).length} urls for ${flatNav.length} pages`,
		);
		const llmsBody = await (await fetch(`${origin}/llms.txt`)).text();
		check(
			flatNav.every((entry) => llmsBody.includes(`(${siteOrigin}${entry.href}):`)),
			'llms.txt lists every page with a sentence about it',
		);

		// --- widget: the order ticket on the landing page -----------------------
		// The landing opens on the order ticket, so the resume proof lives there:
		// one press of Mark ready changes the status line and nothing else.
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		const ticket = page.locator('.code-block [data-code-stage]').first();
		const markReady = ticket.getByRole('button');
		await markReady.waitFor();
		const ticketLines = async () =>
			(await ticket.locator('p').allTextContents()).map((text) => text.trim());
		const buttonText = async () => ((await markReady.textContent()) ?? '').trim();
		check(
			(await buttonText()) === 'Mark ready 🔔',
			'the landing ticket serves its Mark ready button',
			await buttonText(),
		);
		const servedLines = await ticketLines();
		check(
			servedLines.join(' | ') === '☕ Latte for Marcus | Status: Brewing ⏳',
			'the landing ticket serves the order as brewing',
			servedLines.join(' | '),
		);
		await markReady.click();
		await settleText(
			ticket.locator('p').nth(1),
			(text) => text === 'Status: Ready for pickup ✅',
			'pressing Mark ready marks the order ready',
		);
		const pressedLines = await ticketLines();
		check(
			pressedLines.join(' | ') === '☕ Latte for Marcus | Status: Ready for pickup ✅',
			'one press changes only the status line, so the landing ticket resumed',
			pressedLines.join(' | '),
		);
		check(
			(await buttonText()) === 'Mark ready 🔔',
			'the button label stays put after the press',
			await buttonText(),
		);
		await markReady.click();
		check(
			(await expectPoll(ticketLines, (lines: unknown) =>
				(lines as string[]).join(' | ') === pressedLines.join(' | '),
			)) && (await ticket.locator('p').count()) === 2,
			'a second press leaves the ready order as it was',
			(await ticketLines()).join(' | '),
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
			const editorAssets = /\.wasm|compile-worker|_code-frame|code-session/;
			await codePage.goto(`${origin}/concepts/state`, { waitUntil: 'networkidle' });
			const block = codePage.locator('.code-block');
			check(
				!codeRequests.some((url) => editorAssets.test(url)),
				'Code: the page fetches no editor, compiler, wasm or result frame before the reader interacts',
				codeRequests.filter((url) => editorAssets.test(url)).join(', ') || 'none',
			);
			const preloads = await codePage
				.locator('link[rel="modulepreload"]')
				.evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
			const preloadedCode: string[] = [];
			for (const href of preloads) {
				const body = await (await fetch(href)).text();
				if (/insertText|code:run|yuku|getTheme/.test(body)) preloadedCode.push(href);
			}
			check(
				preloadedCode.length === 0,
				'Code: no modulepreload carries the editor, the highlighter, the session or the compiler',
				preloadedCode.join(', ') || `${preloads.length} preloads checked`,
			);
			const input = block.locator('[data-code-input]').first();
			check(
				(await input.getAttribute('readonly')) !== null &&
					(await input.inputValue()).includes('let cups = state(0)'),
				'Code: the server sends each file as a read-only textarea over its highlighted lines',
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
			const prerenderedSize = await block
				.locator('[data-code-stage] p')
				.first()
				.evaluate((node) => getComputedStyle(node).fontSize);
			await block.hover();
			await block.and(codePage.locator('[data-code="ready"]')).waitFor({ timeout: 20000 });
			check(
				(await input.getAttribute('readonly')) === null,
				'Code: pointing at the block makes the code editable',
			);
			await retype(codePage, block, 'Cups of coffee today', '<p>Mugs poured: {cups}</p>');
			const frame = codePage.frameLocator('.code-frame');
			await frame.locator('text=Mugs poured: 0').waitFor({ timeout: 30000 });
			check(
				await block.locator('[data-code-stage]').isHidden(),
				'Code: an edit compiles in the browser and the frame takes over the Result pane',
			);
			const frameSize = await frame
				.locator('p')
				.first()
				.evaluate((node) => getComputedStyle(node).fontSize);
			check(
				frameSize === prerenderedSize,
				"Code: the frame's text is the prerendered result's size, so fluid type follows the page's window",
				`${prerenderedSize} then ${frameSize}`,
			);
			const layers = await codeLayers(block);
			check(
				layers.same && layers.heightGap < 1,
				"Code: the highlighted lines repaint under the edit and stay the textarea's size",
				JSON.stringify(layers),
			);
			await retype(codePage, block, 'let cups = state(0)', 'let cups = 0;');
			await block.locator('.line.problem').first().waitFor({ timeout: 30000 });
			check(
				/MARKLESS_STATE_STALE_LOCAL_WRITE/.test(
					(await block.locator('.line.problem').first().getAttribute('data-problem')) ??
						'',
				) &&
					/MARKLESS_STATE_STALE_LOCAL_WRITE/.test(
						(await block.locator('[data-code-problems]').textContent()) ?? '',
					),
				'Code: a build error marks the line it names and is listed under the result',
			);
			await block.getByRole('button', { name: 'Reset code' }).click();
			await frame.locator('text=Cups of coffee today: 0').waitFor({ timeout: 30000 });
			check(
				(await block.locator('.line.problem').count()) === 0 &&
					(await input.inputValue()).includes('let cups = state(0)'),
				'Code: Reset restores the starter and clears the error',
			);
			await retype(codePage, block, 'let cups = state(0)', 'let cups = state(7)');
			const typed = await input.inputValue();
			await block.getByRole('button', { name: 'Run again' }).click();
			await codePage.waitForTimeout(800);
			check(
				(await input.inputValue()) === typed && typed.includes('state(7)'),
				'Code: Run again re-runs the preview and keeps the typed code',
			);
			await block.getByRole('button', { name: 'Reset code' }).click();
			const fullScreen = block.getByRole('button', { name: 'Full screen' });
			await fullScreen.click();
			const covered = await block
				.and(codePage.locator('[data-full]'))
				.waitFor({ timeout: 5000 })
				.then(
					() => true,
					() => false,
				);
			check(
				covered && (await fullScreen.getAttribute('aria-pressed')) === 'true',
				'Code: the full screen button puts the block over the whole screen',
			);
			await fullScreen.click();
			await codePage
				.locator('.code-block[data-full]')
				.waitFor({ state: 'detached', timeout: 5000 });
			await block.screenshot({ path: `${shotsDir}/T012-code-reset.png` });
			await codePage.close();
		}

		// --- Code blocks that need every compiled module linked ---------------------
		{
			const proof = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			await proof.goto(`${origin}/_code-proof`, { waitUntil: 'networkidle' });
			const blocks = proof.locator('.code-block');
			const editLine = async (index: number, find: string, replacement: string) => {
				const block = blocks.nth(index);
				await block.hover();
				await block.and(proof.locator('[data-code="ready"]')).waitFor({ timeout: 20000 });
				await retype(proof, block, find, replacement);
				await block
					.locator('.line', { hasText: replacement.slice(0, 40) })
					.first()
					.waitFor({ timeout: 5000 });
				return { block, frame: block.frameLocator('.code-frame') };
			};
			const noProblems = async (block: Locator) =>
				((await block.locator('[data-code-problems]').textContent()) ?? '').trim();

			const badge = await editLine(
				0,
				'<button onClick',
				'<button onClick={() => count++}>Add one</button>',
			);
			const addOne = badge.frame.getByRole('button', { name: 'Add one' });
			await addOne.waitFor({ timeout: 30000 });
			await addOne.click();
			await addOne.click();
			await settleText(
				badge.frame.locator('strong'),
				(text) => text === '2',
				'Code: after an edit, a child component follows the live prop its parent passes',
			);
			check(
				(await noProblems(badge.block)) === '',
				'Code: the edited child-prop block reports no problem',
				await noProblems(badge.block),
			);

			const faq = await editLine(
				1,
				'];',
				"{ value: 'gift', question: 'Can I gift it?', answer: 'Wrapped, too.' }, ];",
			);
			const gift = faq.frame.getByRole('button', { name: 'Can I gift it?' });
			await gift.waitFor({ timeout: 30000 });
			await gift.click();
			await faq.frame
				.getByText('Wrapped, too.')
				.waitFor({ state: 'visible', timeout: 5000 })
				.catch(() => {});
			check(
				(await faq.frame.getByText('Wrapped, too.').isVisible()) &&
					(await gift.getAttribute('aria-expanded')) === 'true',
				'Code: an @markless/ui accordion runs in the frame, and an item the reader adds opens',
				(await noProblems(faq.block)) || 'opened',
			);

			const note = await editLine(2, '<p>Short and sweet', '<p>Short and sweet!</p>');
			await note.frame.getByText('Short and sweet!').waitFor({ timeout: 30000 });
			await note.frame.locator('input').fill('a note that is longer than twenty characters');
			await settleText(
				note.frame.locator('section p'),
				(text) => text === 'That is a long note.',
				'Code: after an edit, a computed branch still switches',
			);

			const list = await editLine(
				3,
				"{ id: 'milk'",
				"{ id: 'milk', name: 'Milk' }, { id: 'apples', name: 'Apples' },",
			);
			await list.frame.getByText('Apples').waitFor({ timeout: 30000 });
			await list.frame.getByRole('button', { name: 'Sort A to Z' }).click();
			await settleText(
				list.frame.locator('ul'),
				(text) => text.replace(/\s+/g, '') === 'ApplesCoffeeMilkPears',
				'Code: after an edit, a keyed list still sorts',
			);
			await proof.screenshot({ path: `${shotsDir}/T017-code-proof.png`, fullPage: true });
			await proof.close();
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
		// The page walks through counter.tsrx line by line, so the card's code box
		// is the file the home page runs, not a second counter that differs.
		const trimmedLines = (text: string) =>
			text
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line !== '');
		const lineCard = page.locator('section[data-preview="line-to-part"]');
		const counterFile = trimmedLines(
			await readFile(`${root}/components/demos/start/counter.tsrx`, 'utf8'),
		);
		const cardLines = trimmedLines(await lineCard.locator('.code').innerText());
		check(
			cardLines.join('\n') === counterFile.join('\n'),
			'the reading-tsrx card prints the counter file line by line',
			cardLines.join(' | '),
		);
		const lineWatch = lineCard.locator('.pv-watch-text');
		check(
			(await lineWatch.innerText()).includes('made the number'),
			'the line card opens on the state line and the number it made',
			await lineWatch.innerText(),
		);
		await lineCard.getByRole('button', { name: /^\s*<button onClick/ }).click();
		await settleInner(
			lineWatch,
			(text) => text.includes('The markup made the button'),
			'clicking the markup line names the button it made',
		);
		await lineCard.locator('.count').click();
		await settleInner(
			lineCard.locator('.count'),
			(text) => text === 'Count 1',
			'the counter inside the line card counts',
		);
		const readingDemos = page.locator('.code-block [data-code-stage]');
		const labelledLine = readingDemos.nth(0).locator('p').first();
		await labelledLine.waitFor();
		check(
			((await labelledLine.textContent()) ?? '').trim() === 'You clicked 0 times.',
			'the fragment demo serves its paragraph at 0',
			((await labelledLine.textContent()) ?? '').trim(),
		);
		await readingDemos.nth(0).getByRole('button', { name: 'Click me' }).click();
		await settleText(
			labelledLine,
			(text) => text === 'You clicked 1 times.',
			'the paragraph beside the button follows its click',
		);
		const teaToggle = readingDemos.nth(1).getByRole('button');
		const teaNote = readingDemos.nth(1).locator('p.note');
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

		// A router link rewrites the server-set <html> class, so the painted theme must survive it.
		for (const os of ['light', 'dark'] as const) {
			const navPage = await browser.newPage({
				viewport: { width: 1280, height: 900 },
				colorScheme: os,
			});
			await navPage.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
			const painted = () =>
				navPage.evaluate(() => ({
					path: location.pathname,
					theme: document.documentElement.classList.contains('dark')
						? 'dark'
						: document.documentElement.classList.contains('light')
							? 'light'
							: 'none',
					paper: getComputedStyle(document.body).backgroundColor,
				}));
			const papers: Record<string, string> = {};
			for (const chosen of [os === 'light' ? 'dark' : 'light', os] as const) {
				await navPage.locator(`.theme-toggle-to-${chosen}`).click();
				await navPage.waitForFunction(
					(wanted) => document.documentElement.classList.contains(wanted),
					chosen,
				);
				papers[chosen] = (await painted()).paper;
			}
			check(papers.light !== papers.dark, `OS ${os}: the two themes paint different paper`);
			for (const chosen of [os === 'light' ? 'dark' : 'light', os] as const) {
				await navPage.locator(`.theme-toggle-to-${chosen}`).click();
				const seen: string[] = [];
				const visited = new Set([new URL(navPage.url()).pathname]);
				for (let step = 0; step < 5; step += 1) {
					const links = navPage.locator('.sidebar a[data-markless-router-link]:visible');
					const hrefs = await links.evaluateAll((nodes) =>
						nodes.map((node) => node.getAttribute('href') ?? ''),
					);
					const href = hrefs.find((candidate) => !visited.has(candidate));
					if (!href) break;
					visited.add(href);
					await navPage
						.locator(`.sidebar a[data-markless-router-link][href="${href}"]:visible`)
						.first()
						.click();
					await navPage.waitForURL(`**${href}`);
					await navPage
						.waitForFunction(
							(wanted) =>
								document
									.querySelector('.sidebar [aria-current="page"]')
									?.getAttribute('href') === wanted,
							href,
							{ timeout: 5000 },
						)
						.catch(() => {});
					const now = await painted();
					if (now.theme !== chosen || now.paper !== papers[chosen])
						seen.push(`${now.path} painted ${now.theme} (${now.paper})`);
					else seen.push('');
				}
				const wrong = seen.filter(Boolean);
				check(
					seen.length >= 3 && wrong.length === 0,
					`OS ${os}, chose ${chosen}: the theme stays across ${seen.length} router navigations`,
					wrong.join('; '),
				);
			}
			await navPage.close();
		}

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

		// --- rapid router navigation keeps the brand fonts ------------------------
		{
			const rapid = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			await rapid.addInitScript(() => {
				const bad: string[] = [];
				(window as { __fontFrames?: string[] }).__fontFrames = bad;
				const frame = () => {
					const heading = document.querySelector('main h1');
					const prose = document.querySelector('main.prose p');
					const faces =
						document.fonts.check('16px "Joy Elia"') &&
						document.fonts.check('16px "Shantell Sans"');
					const headingFont = heading ? getComputedStyle(heading).fontFamily : 'Joy Elia';
					const proseFont = prose ? getComputedStyle(prose).fontFamily : 'Shantell Sans';
					const sheet = document.querySelector('link[rel="stylesheet"][href*="global"]');
					if (
						document.readyState === 'complete' &&
						(!faces ||
							!sheet ||
							!headingFont.includes('Joy Elia') ||
							!proseFont.includes('Shantell Sans'))
					)
						bad.push(`${location.pathname}: ${headingFont} / ${proseFont} / faces ${faces}`);
					requestAnimationFrame(frame);
				};
				requestAnimationFrame(frame);
			});
			await rapid.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
			await rapid.waitForFunction(() => document.fonts.status === 'loaded');
			await rapid.evaluate(() => {
				(window as { __fontFrames?: string[] }).__fontFrames!.length = 0;
			});
			const hrefs = await rapid
				.locator('.sidebar a.page-link:visible')
				.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
			const order = [...hrefs.slice(1), ...hrefs.slice(0, -1).reverse()].slice(0, 10);
			for (const href of order) {
				const box = await rapid
					.locator(`.sidebar a.page-link[href="${href}"]`)
					.first()
					.boundingBox();
				if (box) await rapid.mouse.click(box.x + 8, box.y + box.height / 2);
			}
			const last = order.at(-1) ?? '';
			await rapid.waitForURL(`**${last}`);
			await rapid
				.waitForFunction(
					(href) =>
						document
							.querySelector('link[rel="canonical"]')
							?.getAttribute('href')
							?.endsWith(href),
					last,
					{ timeout: 10_000 },
				)
				.catch(() => {});
			await rapid.waitForTimeout(500);
			const fontFrames = await rapid.evaluate(
				() => (window as { __fontFrames?: string[] }).__fontFrames ?? [],
			);
			check(
				order.length >= 8 && fontFrames.length === 0,
				`${order.length} sidebar clicks with no wait keep Joy Elia and Shantell Sans painted on every frame`,
				[...new Set(fontFrames)].slice(0, 3).join('; '),
			);
			await rapid.close();
		}

		// --- the sidebar keeps its scroll; the page lands at the top at once -------
		{
			const scroller = await browser.newPage({ viewport: { width: 1280, height: 600 } });
			await scroller.goto(`${origin}/reference/cli`, { waitUntil: 'load' });
			await scroller.evaluate(() => {
				const seen: number[] = [];
				(window as { __landedAt?: number[] }).__landedAt = seen;
				document.addEventListener('marklessrouterrendered', () => seen.push(scrollY));
			});
			const kept: string[] = [];
			// /errors renders the sidebar inside its own wrapper, so the tree position changes.
			for (const href of ['/errors', '/reference/glossary', '/reference/cli']) {
				const from = new URL(scroller.url()).pathname;
				const link = scroller.locator(`.sidebar a[href="${href}"]:visible`).first();
				await scroller.evaluate(() => {
					const sidebar = document.querySelector('.sidebar')!;
					sidebar.scrollTop = sidebar.scrollHeight;
					scrollTo({ top: 400, behavior: 'instant' });
				});
				await scroller.waitForTimeout(150);
				const before = await scroller.evaluate(
					() => document.querySelector('.sidebar')!.scrollTop,
				);
				const box = await link.boundingBox();
				if (box) await scroller.mouse.click(box.x + 8, box.y + box.height / 2);
				await scroller.waitForURL(`**${href}`);
				await scroller.waitForFunction(
					(wanted) =>
						document.querySelector('.sidebar [aria-current="page"]')?.getAttribute('href') ===
						wanted,
					href,
					{ timeout: 10_000 },
				);
				const after = await scroller.evaluate(() => {
					const sidebar = document.querySelector('.sidebar')!;
					return {
						top: sidebar.scrollTop,
						max: sidebar.scrollHeight - sidebar.clientHeight,
					};
				});
				kept.push(
					`${from} -> ${href}: ${before} -> ${after.top}${after.top === Math.min(before, after.max) && before > 0 ? '' : ' (moved)'}`,
				);
			}
			const landedAt = await scroller.evaluate(
				() => (window as { __landedAt?: number[] }).__landedAt ?? [],
			);
			check(
				kept.every((line) => !line.endsWith('(moved)')),
				'the sidebar keeps its scroll position across router navigations, /errors included',
				kept.join('; '),
			);
			check(
				landedAt.length === 3 && landedAt.every((y) => y === 0),
				'each new page lands at the top in one step, with no smooth scroll from the old offset',
				landedAt.join(', '),
			);
			await scroller.close();
		}

		// --- sprites and mascots ------------------------------------------------
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		const heroMug = page.locator('.prose .markless-mug.is-hero svg.mug').first();
		await heroMug.waitFor();
		check(
			(await heroMug.getAttribute('data-docs-mug')) === 'true',
			'the landing hero is the Markless mug, and it follows the pointer',
			String(await heroMug.getAttribute('data-variant')),
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
		for (const href of ['/', '/concepts/state', '/concepts/computed']) {
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
		for (const href of ['/concepts/events', '/concepts/conditionals', '/concepts/lists']) {
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

		// --- concept previews: each one reports what the reader's action really did ---
		const ledgerText = async (card: Locator) =>
			((await card.getByRole('list').innerText()) ?? '').replace(/\s+/g, ' ').trim();
		const watchText = async (card: Locator) =>
			((await card.locator('.pv-watch-text').innerText()) ?? '').replace(/\s+/g, ' ').trim();
		const settleWatch = async (card: Locator, wanted: (text: string) => boolean, label: string) => {
			for (let attempt = 0; attempt < 40; attempt += 1) {
				if (wanted(await watchText(card))) return;
				await new Promise((done) => setTimeout(done, 100));
			}
			check(false, label, `never settled, last read "${await watchText(card)}"`);
		};

		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
		const pourCard = page.locator('section[data-preview="state-pour"]');
		const pourButton = pourCard.locator('.slot:not([hidden])').getByRole('button', { name: 'Pour a cup' });
		await pourButton.waitFor();
		await pourButton.focus();
		await page.keyboard.press('Enter');
		await pourButton.click();
		await settleWatch(pourCard, (text) => text.includes('“Cups today: 2”'), 'state preview reports the text a click changed');
		check(
			(await watchText(pourCard)).includes('“Cups today: 2”'),
			'state preview: two pours, by key and by click, change only the cups text',
			await watchText(pourCard),
		);
		check(
			(await ledgerText(pourCard)).includes('{drawn} never changed') &&
				(await ledgerText(pourCard)).includes('cups++ ran 2 times'),
			'state preview: the ledger counts cups++ runs and shows {drawn} untouched',
			await ledgerText(pourCard),
		);
		await pourCard.getByRole('switch', { name: 'Button shows cups too' }).click();
		await pourCard.locator('.slot:not([hidden])').getByRole('button', { name: /Pour cup/ }).click();
		await settleWatch(pourCard, (text) => text.includes('2 pieces of text'), 'state preview counts both readers');
		check(
			(await watchText(pourCard)).includes('“Pour cup 2”'),
			'state preview: with the button reading cups, one click changes both texts',
			await watchText(pourCard),
		);

		await page.goto(`${origin}/concepts/computed`, { waitUntil: 'load' });
		const basketCard = page.locator('section[data-preview="computed-basket"]');
		const basketSlot = () => basketCard.locator('.slot:not([hidden])');
		await basketSlot().getByRole('button', { name: 'One more coaster' }).waitFor();
		await basketSlot().getByRole('button', { name: 'One more coaster' }).click();
		await settleWatch(basketCard, (text) => text.includes('total is now 15'), 'computed preview: the recipe reruns for a coaster');
		check(
			(await ledgerText(basketCard)).includes('ran again, because it reads coasters'),
			'computed preview: the recipe row says it ran again',
			await ledgerText(basketCard),
		);
		await basketCard.getByRole('switch', { name: 'Recipe reads coasters' }).click();
		await basketSlot().getByRole('button', { name: 'One more coaster' }).click();
		await settleWatch(basketCard, (text) => text.includes('stayed 12'), 'computed preview: a recipe that skips coasters leaves the total');
		check(
			(await basketSlot().locator('p').nth(2).textContent())?.trim() === 'Total: 12',
			'computed preview: the mugs-only total really stayed 12',
		);

		await page.goto(`${origin}/concepts/events`, { waitUntil: 'load' });
		const eventsCard = page.locator('section[data-preview="events-mug"]');
		const mugField = eventsCard.getByLabel('Name for the mug');
		await mugField.waitFor();
		await mugField.focus();
		await page.keyboard.type('Ada', { delay: 40 });
		await settleWatch(eventsCard, (text) => text.includes('set name to "Ada"'), 'events preview: onInput reports the value it got');
		const eventsUrl = page.url();
		await page.keyboard.press('Enter');
		await settleWatch(eventsCard, (text) => text.includes('did not reload'), 'events preview: Enter runs onSubmit with preventDefault');
		check(page.url() === eventsUrl, 'events preview: the submit does not navigate');
		check(
			(await ledgerText(eventsCard)).includes('set printed = "Ada"'),
			'events preview: the onSubmit row shows what it printed',
			await ledgerText(eventsCard),
		);
		await page.keyboard.press('Escape');
		await settleWatch(eventsCard, (text) => text.startsWith('Escape fired keydown'), 'events preview: Escape runs onKeyDown');
		check((await mugField.inputValue()) === '', 'events preview: Escape cleared the field', await mugField.inputValue());

		await page.goto(`${origin}/concepts/conditionals`, { waitUntil: 'load' });
		const branchCard = page.locator('section[data-preview="conditionals-note"]');
		const branchToggle = branchCard.getByRole('button', { name: 'Show or hide' });
		await branchToggle.waitFor();
		await branchToggle.focus();
		await page.keyboard.press('Enter');
		await branchCard.getByLabel('Note').waitFor();
		await branchCard.getByLabel('Note').fill('buy milk');
		await branchToggle.click();
		await settleWatch(branchCard, (text) => text.includes('note still holds "buy milk"'), 'conditionals preview: the note outlives the branch');
		check((await branchCard.getByLabel('Note').count()) === 0, 'conditionals preview: closing removes the field');
		await branchToggle.click();
		await settleWatch(branchCard, (text) => text.includes('built field number 2'), 'conditionals preview: reopening builds a new field');
		check(
			(await branchCard.getByLabel('Note').inputValue()) === 'buy milk',
			'conditionals preview: the new field is filled from note',
		);
		await branchCard.screenshot({ path: `${shotsDir}/concepts-conditionals-preview.png` });

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
		for (const href of ['/start/new-app', '/concepts/async', '/concepts/styling']) {
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
		// On the served page every text read while waiting must be the old or the new answer.
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
		const cards = page.locator('.code-block [data-code-stage]').first().locator('article.card');
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

		const paperTab = page.locator('.code-block [data-code-tab="paper-card.tsrx"]').first();
		await paperTab.click();
		const paperPane = page.locator('.code-block [data-code-file="paper-card.tsrx"]').first();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if (await paperPane.isVisible()) break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(
			(await paperTab.getAttribute('aria-selected')) === 'true' &&
				(await paperPane.isVisible()),
			'a Code block with several files switches to the file tab the reader clicks',
		);

		// --- previews: lists, async and styling concept cards --------------------
		// Each card reads the live component, so these checks drive the card and read what it reports.
		const watchSays = async (card: Locator, wanted: (text: string) => boolean, label: string) => {
			const read = async () => (await card.locator('.pv-watch-text').innerText()).replace(/\s+/g, ' ').trim();
			for (let attempt = 0; attempt < 40; attempt += 1) {
				if (wanted(await read())) break;
				await new Promise((done) => setTimeout(done, 100));
			}
			const text = await read();
			check(wanted(text), label, text);
			return text;
		};

		await page.goto(`${origin}/concepts/lists`, { waitUntil: 'load' });
		const rowsCard = page.locator('section[data-preview="lists"]');
		const rowNames = async () =>
			(await rowsCard.locator('li.row').allTextContents()).map((text) => text.trim()).join('|');
		await rowsCard.getByRole('checkbox', { name: 'Pears' }).check();
		await watchSays(rowsCard, (text) => text.includes('Pears on row'), 'the lists card numbers the rows on the first tick');
		const pearsRow = await rowsCard.locator('li.row', { hasText: 'Pears' }).getAttribute('data-row');
		await rowsCard.getByRole('button', { name: 'Reverse' }).click();
		await watchSays(
			rowsCard,
			(text) => text.startsWith('Reverse: 2 moved, 0 made, 0 thrown away. The tick rode along with Pears.'),
			'Reverse moves the keyed rows, makes none, and the tick rides with Pears',
		);
		check((await rowNames()) === 'Milk|Coffee|Pears', 'Reverse reorders the rows', await rowNames());
		check(
			(await rowsCard.locator('li.row', { hasText: 'Pears' }).getAttribute('data-row')) === pearsRow &&
				(await rowsCard.getByRole('checkbox', { name: 'Pears' }).isChecked()),
			'the Pears element keeps its number and its tick through the reverse',
		);
		for (let left = 2; left >= 0; left -= 1) {
			await rowsCard.getByRole('button', { name: 'Remove top' }).click();
			await watchSays(rowsCard, (text) => text.startsWith('Remove top: 0 moved, 0 made, 1 thrown away.'), `Remove top throws one row away (${left} left)`);
		}
		check(
			((await rowsCard.locator('li.none').textContent()) ?? '').trim() === 'Nothing left to buy.',
			'the empty list shows its @empty block',
		);
		await rowsCard.getByRole('button', { name: 'Reset' }).click();
		await watchSays(rowsCard, (text) => text.startsWith('Reset: 0 moved, 3 made, 0 thrown away.'), 'Reset makes three new rows');

		await page.goto(`${origin}/concepts/async`, { waitUntil: 'load' });
		const blocksCard = page.locator('section[data-preview="async"]');
		const onPage = () => blocksCard.locator('li.block[data-on="true"], li.block[data-on="held"]').innerText();
		await blocksCard.getByRole('radio', { name: 'tall', exact: true }).check({ force: true });
		await watchSays(blocksCard, (text) => text.startsWith('The tall answer is ready'), 'the async card swaps in the tall answer');
		await blocksCard.getByRole('radio', { name: 'small', exact: true }).check({ force: true });
		await watchSays(blocksCard, (text) => text.startsWith('Looking up the small mug.'), 'the async card reports the new lookup');
		check(
			((await blocksCard.locator('.answer').textContent()) ?? '').trim() === 'The tall mug holds a big coffee.' &&
				(await blocksCard.locator('li.block[data-on="held"]').count()) === 1,
			'while small is looked up, the tall answer stays and @try is marked as still showing',
		);
		await watchSays(blocksCard, (text) => text.startsWith('The small answer is ready'), 'the small answer replaces the tall one');
		await blocksCard.getByRole('radio', { name: 'cracked', exact: true }).check({ force: true });
		await watchSays(blocksCard, (text) => text.startsWith('The lookup failed'), 'the cracked mug lands in @catch');
		check((await onPage()).includes('@catch'), 'the async card marks @catch as on the page', await onPage());

		await page.goto(`${origin}/concepts/styling`, { waitUntil: 'load' });
		const scopeCard = page.locator('section[data-preview="styling"]');
		const groundOf = (index: number) =>
			scopeCard.locator('.card').nth(index).evaluate((node) => getComputedStyle(node).backgroundColor);
		const paperAtRest = await groundOf(0);
		const chalkAtRest = await groundOf(1);
		check(paperAtRest !== chalkAtRest, 'two files style .card, and the two cards look different', `${paperAtRest} vs ${chalkAtRest}`);
		await scopeCard.getByRole('switch', { name: 'Chalk card lit' }).click();
		await watchSays(scopeCard, (text) => text.startsWith("The chalk card's class is now card lit."), 'the lit switch reports the new class');
		check(
			(await scopeCard.locator('.card').nth(1).getAttribute('class'))?.split(/\s+/).includes('lit') === true &&
				(await groundOf(1)) !== chalkAtRest &&
				(await groundOf(0)) === paperAtRest,
			'lighting the chalk card restyles it and leaves the paper card alone',
		);
		await scopeCard.getByRole('radio', { name: 'big', exact: true }).check({ force: true });
		await watchSays(scopeCard, (text) => text.includes('data-size is now big'), 'the size choice reports the new attribute');
		check(
			(await scopeCard.locator('.card').first().getAttribute('data-size')) === 'big',
			'the paper card carries data-size="big"',
		);
		await scopeCard.getByRole('switch', { name: 'Show page classes' }).click();
		const scopes = await watchSays(scopeCard, (text) => /mk-\w+ and mk-\w+/.test(text), 'the card reads each file class from the page');
		const [paperScope, chalkScope] = scopes.match(/mk-\w+/g) ?? [];
		check(
			paperScope !== chalkScope &&
				(await scopeCard.locator('.card').first().getAttribute('class'))?.includes(paperScope ?? '?') === true &&
				(await scopeCard.locator('.card').nth(1).getAttribute('class'))?.includes(chalkScope ?? '?') === true,
			'each card carries a different file class, the one the card reports',
			`${paperScope} vs ${chalkScope}`,
		);

		// The first-app page carries the scaffold command and a starter home that runs.
		await page.goto(`${origin}/start/new-app`, { waitUntil: 'load' });
		const firstAppText = (await page.locator('.prose').first().innerText()).replace(
			/\s+/g,
			' ',
		);
		check(
			firstAppText.includes('npm create markless@latest'),
			'the first-app page carries the scaffold command',
		);
		const starterCount = page
			.locator('.code-block [data-code-stage]')
			.first()
			.getByRole('button', { name: /^Count/ });
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
			.locator('.code-block [data-code-stage]')
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
		const pickerDemo = page.locator('section[data-preview="name-picker"]');
		const pickedLine = pickerDemo.locator('.pg-stage p').first();
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
				const field = document.querySelector('.code-block [data-code-stage] input');
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
			(await page.locator('.code-block [data-code-stage] input').inputValue()) === '1',
			'the same click adds one to the count in the field',
			await page.locator('.code-block [data-code-stage] input').inputValue(),
		);
		await focusButton.focus();
		await page.locator('.code-block [data-code-stage] label').click();
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
		const drinkCard = page.locator('section[data-preview="drink-pick"]');
		const watchedDrink = () =>
			drinkCard.locator('.pv-watch mark:visible').allTextContents();
		check(
			(await watchedDrink()).join() === 'tea,tea',
			'the drink card watches the starting value on <html>',
			(await watchedDrink()).join(),
		);
		await drinkCard.locator('button.coffee').click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await drinkAttr()) === 'coffee') break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(
			(await drinkAttr()) === 'coffee',
			'picking a drink writes it onto <html>',
			String(await drinkAttr()),
		);
		check(
			(await watchedDrink()).join() === 'coffee,coffee',
			'the Watch line follows the pick',
			(await watchedDrink()).join(),
		);
		await Promise.all([
			page.waitForEvent('load'),
			drinkCard.getByRole('button', { name: 'Reload page' }).click(),
		]);
		check(
			(await drinkAttr()) === 'coffee',
			'the pick survives the card\'s Reload page, applied before the page is shown',
			String(await drinkAttr()),
		);
		check(
			(await watchedDrink()).join() === 'coffee,coffee',
			'after the reload the Watch line still shows the saved pick',
			(await watchedDrink()).join(),
		);
		await page.screenshot({ path: `${shotsDir}/T006-drink-pick-after.png`, fullPage: true });
		await page.evaluate(() => localStorage.clear());

		// --- widget: the shared counter on the shared page --------------------------
		await page.goto(`${origin}/build/shared`, { waitUntil: 'load' });
		const sharedDemo = page.locator('.code-block [data-code-stage]').first();
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
		const talliesCard = page.locator('section[data-preview="tallies"]');
		const tallyCounts = async () =>
			(await talliesCard.locator('.pg-stage output:visible').allTextContents())
				.map((text) => text.trim())
				.join();
		check((await tallyCounts()) === '0,0', 'the tallies start at 0 and 0', await tallyCounts());
		await talliesCard.locator('.pg-stage button:visible', { hasText: 'Add one' }).first().click();
		await settleText(
			talliesCard.locator('.pg-stage output:visible').last(),
			(text) => text === '1',
			"with { scope: 'page' }, a click on Left moves Right too",
		);
		await talliesCard.getByRole('radio', { name: 'widget' }).check();
		check(
			(await tallyCounts()) === '0,0',
			"the 'widget' tallies start with their own copies",
			await tallyCounts(),
		);
		await talliesCard.locator('.pg-stage button:visible', { hasText: 'Add one' }).first().click();
		await settleText(
			talliesCard.locator('.pg-stage output:visible').first(),
			(text) => text === '1',
			"with { scope: 'widget' }, a click on Left moves Left",
		);
		check(
			(await tallyCounts()) === '1,0',
			"with { scope: 'widget' }, Right keeps its own number",
			await tallyCounts(),
		);
		await talliesCard.getByRole('radio', { name: 'page' }).check();
		check(
			(await talliesCard.locator('.pv-watch-text span:visible').innerText()).includes("'page'"),
			'switching Scope back shows the page-scope Watch line',
		);
		const talliesTab = talliesCard.locator('.pg-tab:visible', { hasText: 'tallies.tsrx' });
		await talliesTab.click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await talliesTab.getAttribute('aria-selected')) === 'true') break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check(
			(await talliesTab.getAttribute('aria-selected')) === 'true' &&
				(await talliesCard.locator('.pg-pane:visible').innerText()).includes('<tally.Tally'),
			"the tallies card's code switches to the file tab the reader clicks",
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
		const urlCard = page.locator('section[data-preview="url-picker"]');
		const routeWatch = urlCard.locator('.pv-watch-text');
		await routeWatch.waitFor();
		check(
			(await routeWatch.innerText()).startsWith('pages/blog/[slug].tsrx answers.') &&
				(await urlCard.locator('.file.slug .param').innerText()) === 'slug = "hello"',
			'the URL picker opens on the bracketed file and its parameter',
			await routeWatch.innerText(),
		);
		await urlCard.getByRole('button', { name: '/docs/guide/intro' }).click();
		await settleInner(
			routeWatch,
			(text) => text.startsWith('pages/docs/[...slug].mdx answers.'),
			'the URL picker answers with the catch-all file',
		);
		check(
			(await urlCard.locator('.file.rest .param').innerText()) === 'slug = "guide/intro"',
			'the catch-all file row shows the whole rest of the path as one param',
		);
		await urlCard.getByRole('button', { name: '/docs', exact: true }).click();
		await settleInner(
			routeWatch,
			(text) => text.startsWith('pages/404.tsrx answers.') && text.includes('at least one more part'),
			'a catch-all with nothing to catch falls through to the 404 page, and the card says why',
		);
		await page.screenshot({ path: `${shotsDir}/T030-url-picker-after.png`, fullPage: true });

		// --- widget: the link check on the links page -----------------------------
		await page.goto(`${origin}/router/links`, { waitUntil: 'load' });
		const linkCard = page.locator('section[data-preview="link-check"]');
		const linkResult = linkCard.locator('.result');
		await linkResult.waitFor();
		check(
			(await linkResult.innerText()).startsWith('The build passes'),
			'the link card opens on the link that builds',
			await linkResult.innerText(),
		);
		await linkCard.getByRole('radio', { name: 'renamed' }).check();
		await settleInner(
			linkResult,
			(text) => text.startsWith('The build stops') && text.includes('does not match any route'),
			'the link card stops the build after the rename, with the error',
		);
		check(
			(await linkCard.locator('.wide .code').innerText()).includes('/blogs/[slug]'),
			'the code line carries the renamed route',
		);
		await linkCard.getByRole('radio', { name: 'no params' }).check();
		await settleInner(
			linkResult,
			(text) => text.includes('requires params'),
			'the link card names the missing params',
		);
		await page.screenshot({ path: `${shotsDir}/T030-link-check-after.png`, fullPage: true });

		// --- widget: the streamed feed on the data page ---------------------------
		await page.goto(`${origin}/router/data`, { waitUntil: 'load' });
		const feedCard = page.locator('section[data-preview="feed-steps"]');
		const feedBody = feedCard.locator('.screen .text');
		await feedBody.waitFor();
		check(
			(await feedBody.innerText()) === 'Loading...' &&
				(await feedCard.locator('.end').innerText()) === 'The response stays open.',
			'the first part of the response carries the @pending content and leaves it open',
			await feedBody.innerText(),
		);
		await feedCard.getByRole('button', { name: 'Next', exact: true }).click();
		await settleInner(
			feedBody,
			(text) => text === 'Loaded for /feed',
			'the same response then sends the @try content',
		);
		check(
			(await feedCard.locator('.end').innerText()) === 'The response ends.',
			'after the second part the response ends',
		);
		await feedCard.getByRole('radio', { name: 'quick' }).check();
		await settleInner(
			feedCard.locator('.part.one'),
			(text) => text.includes('Loaded for /feed') && !text.includes('Loading...'),
			'quick data goes out in the first part, and Loading... is never sent',
		);
		await page.screenshot({ path: `${shotsDir}/T030-feed-steps-after.png`, fullPage: true });

		// --- widget: the endpoint picker on the API routes page ---------------------
		await page.goto(`${origin}/router/api-routes`, { waitUntil: 'load' });
		const apiCard = page.locator('section[data-preview="api-answers"]');
		const apiWatch = apiCard.locator('.pv-watch-text');
		await apiWatch.waitFor();
		check(
			(await apiWatch.innerText()).startsWith('users/[id].get.ts answers') &&
				(await apiCard.locator('.reply .body').innerText()) === '200 {"id":"42"}',
			'a GET to the users endpoint answers with its params',
			await apiWatch.innerText(),
		);
		await apiCard.getByRole('radio', { name: 'POST', exact: true }).check();
		await settleInner(
			apiWatch,
			(text) => text.startsWith('The file name says get, so a POST'),
			'a POST finds no endpoint, because the file name says get',
		);
		check(
			(await apiCard.locator('.reply .body').innerText()) === '404 Not found',
			'the response box answers the POST with 404',
		);

		// --- widget: the build targets on the deploying page ------------------------
		await page.goto(`${origin}/router/deploying`, { waitUntil: 'load' });
		const buildCard = page.locator('section[data-preview="build-targets"]');
		await buildCard.getByRole('radio', { name: 'vercel' }).check();
		await settleInner(
			buildCard.locator('.pv-watch-text'),
			(text) => text.includes('.vercel/output/'),
			'the vercel preset writes .vercel/output/ from the same app folder',
		);
		check(
			(await buildCard.locator('.command').innerText()).includes('NITRO_PRESET=vercel npm run build'),
			'the command box shows the preset variable',
		);

		// --- preview cards on the home, start, tooling, contributing and UI pages ----
		// Each card is driven the way its page tells the reader to drive it.
		const card = (name: string) => page.locator(`section[data-preview="${name}"]`);
		const watchOf = (name: string) => card(name).locator('.pv-watch-text');

		// The home's Try this list ticks each step by itself once the reader has done it.
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		const tryBlock = page.locator('.code-block').first();
		const trySteps = tryBlock.locator('[data-code-step]');
		const doneSteps = () =>
			trySteps.evaluateAll((rows) => rows.map((row) => row.hasAttribute('data-done')));
		check(
			(await trySteps.count()) === 3 && (await doneSteps()).every((done) => !done),
			'the home Try this list serves three steps, none ticked',
			JSON.stringify(await doneSteps()),
		);
		await tryBlock.hover();
		await tryBlock.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 20000 });
		await retype(page, tryBlock, 'Mark ready 🔔', 'Done 🎉');
		await tryBlock
			.frameLocator('.code-frame')
			.getByRole('button', { name: 'Done 🎉' })
			.waitFor({ timeout: 30000 });
		check(
			await expectPoll(doneSteps, (done: unknown) => JSON.stringify(done) === '[true,false,false]'),
			'renaming the button ticks the first step and only that one',
			JSON.stringify(await doneSteps()),
		);

		await page.goto(`${origin}/tooling/editor-setup`, { waitUntil: 'load' });
		const editorCard = card('editor');
		check(
			!(await editorCard.locator('.problem').isVisible()),
			'with the plugin off there is no error under the code',
		);
		await editorCard.getByRole('switch').nth(1).click();
		await editorCard.locator('.problem').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
		check(
			await editorCard.locator('.problem').isVisible(),
			'turning the plugin on shows the onClik error',
		);
		await editorCard.getByRole('switch').first().click();
		await settleInner(
			watchOf('editor'),
			(text) => text.startsWith('Colours from the extension'),
			'with both on, the card says which piece made what',
		);

		await page.goto(`${origin}/tooling/testing`, { waitUntil: 'load' });
		const testCard = card('test-paths');
		await testCard.getByRole('button', { name: 'Next', exact: true }).click();
		await settleInner(
			watchOf('test-paths'),
			(text) => text.startsWith('The test clicks the button'),
			'Next steps the test to its click',
		);
		check(
			(await testCard.locator('.count-button').innerText()) === 'Count 1',
			'after the click step the counter reads Count 1',
		);
		await testCard.getByRole('radio', { name: 'renderSSR' }).check();
		await settleInner(
			watchOf('test-paths'),
			(text) => text.startsWith('The test server renders Counter to HTML'),
			'renderSSR changes only the first step',
		);

		await page.goto(`${origin}/tooling/type-checking`, { waitUntil: 'load' });
		const typeCard = card('typecheck');
		await typeCard.getByRole('button', { name: 'Check', exact: true }).click();
		await typeCard.locator('.error').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
		check(
			(await typeCard.locator('.error').innerText()).includes('TS2322'),
			'Check puts the TS2322 error under line 4 of App.tsrx',
		);
		await typeCard.getByRole('radio', { name: '"Home"' }).check();
		await typeCard.getByRole('button', { name: 'Check', exact: true }).click();
		await settleInner(
			watchOf('typecheck'),
			(text) => text.startsWith('No errors'),
			'a string label checks clean',
		);

		await page.goto(`${origin}/contributing`, { waitUntil: 'load' });
		await card('repo-map').getByRole('button', { name: 'web', exact: true }).click();
		await settleInner(
			watchOf('repo-map'),
			(text) => text.startsWith('@markless/web') && text.includes('Imported by: bundler, core, router, vitest-browser'),
			'picking web names its job and the packages that import it',
		);

		await page.goto(`${origin}/contributing/ci`, { waitUntil: 'load' });
		await card('ci-modes').getByRole('radio', { name: '--full' }).check();
		await settleInner(
			card('ci-modes').locator('.job.full .state'),
			(text) => text === 'Runs',
			'--full moves the eight full jobs to Runs',
		);

		await page.goto(`${origin}/contributing/improve-the-docs`, { waitUntil: 'load' });
		const typoCard = card('typo-count');
		check((await typoCard.locator('.part:visible').count()) === 0, 'part names start hidden');
		await typoCard.getByRole('switch').click();
		await settleInner(
			typoCard.locator('.pg-controls'),
			(text) => text.includes('<Controls>'),
			'Part names labels each band with the part that draws it',
		);
		check((await typoCard.locator('.part:visible').count()) === 4, 'all four part names show');

		await page.goto(`${origin}/ui`, { waitUntil: 'load' });
		const addressCard = card('edit-address');
		await addressCard.getByRole('button', { name: 'Edit address' }).click();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await settleInner(
			watchOf('edit-address'),
			(text) => text.includes('inside the dialog') && text.includes('Tab pressed 2 times'),
			'Tab keeps focus inside the dialog, and the card counts the presses',
		);
		await page.keyboard.press('Escape');
		await settleInner(
			watchOf('edit-address'),
			(text) => text === 'The dialog closed, and focus went back to Edit address.',
			'Escape closes the dialog and focus goes back to the trigger',
		);
		const partsCard = card('modal-parts');
		await partsCard.getByRole('button', { name: 'Edit address' }).click();
		await settleInner(
			watchOf('modal-parts'),
			(text) => text.startsWith('Open.'),
			'opening the drawn modal says which parts carry ui-open',
		);
		check(
			(await partsCard.locator('[ui-open]').count()) === 4,
			'exactly root, trigger, backdrop and content carry ui-open',
			String(await partsCard.locator('[ui-open]').count()),
		);
		await page.keyboard.press('Escape');
		await card('select-everywhere').getByRole('radio', { name: 'server' }).check();
		await settleInner(
			watchOf('select-everywhere'),
			(text) => text.includes('A server wrote its HTML first'),
			'the select card names the server path',
		);

		await page.goto(`${origin}/ui/styling`, { waitUntil: 'load' });
		const layerCard = card('layer-wins');
		const tipSide = () =>
			layerCard.evaluate((node) => {
				const save = node.querySelector('.save')!.getBoundingClientRect();
				const tip = node.querySelector('.tip')!.getBoundingClientRect();
				return tip.left >= save.right - 1 ? 'right' : tip.bottom <= save.top + 1 ? 'above' : 'other';
			});
		check((await tipSide()) === 'above', 'the layered default puts the tip above Save', await tipSide());
		await layerCard.getByRole('switch').click();
		for (let attempt = 0; attempt < 40; attempt += 1) {
			if ((await tipSide()) === 'right') break;
			await new Promise((done) => setTimeout(done, 100));
		}
		check((await tipSide()) === 'right', 'your plain rule moves the tip right of Save', await tipSide());
		await page.screenshot({ path: `${shotsDir}/T038-layer-wins-after.png`, fullPage: true });

		// --- widget: the state graph demo ------------------------------------------
		// One write moves the state and the computed that reads it, nothing else.
		await page.goto(`${origin}/how-it-works/state-graph`, { waitUntil: 'load' });
		const graphStage = page.locator('.code-block [data-code-stage]').first();
		const graphOutputs = graphStage.locator('p');
		await graphOutputs.first().waitFor();
		const graphValues = async () =>
			(await graphOutputs.allTextContents()).map((text) => text.split(':').at(-1)!.trim()).join(',');
		check(
			(await graphValues()) === '2,4',
			'the state graph demo serves count 2 and doubled 4',
			await graphValues(),
		);
		await graphStage.getByRole('button', { name: 'Next', exact: true }).click();
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

		// --- previews in How it works ----------------------------------------------
		// Each one is driven the way its card invites, and the check reads the part
		// of the card that shows the mechanism, not only the demo.
		const see = async (locator: Locator, wanted: (text: string) => boolean, label: string) => {
			const text = await settleText(locator, wanted, label);
			if (wanted(text)) check(true, label);
		};

		await page.goto(`${origin}/how-it-works/the-big-idea`, { waitUntil: 'load' });
		const planCard = page.locator('section[data-preview="plan-anywhere"]');
		const planWatch = planCard.locator('.pv-watch-text');
		await planCard.waitFor();
		const planLive = planCard.locator('.live');
		await planLive.click();
		await see(planLive, (text) => text === 'Count 1', 'the plan card counter counts in Browser');
		await see(
			planWatch,
			(text) => text.includes('symbol:0 ran count++'),
			'the plan card names the symbol and the text write the click used',
		);
		await planCard.getByRole('radio', { name: 'Server' }).check();
		await see(
			planCard.locator('.where').first(),
			(text) => text === 'markless/state script',
			'picking Server moves state:count into the markless/state script',
		);
		check(
			(await planCard.locator('.rows .row').count()) === 3 &&
				(await planCard.locator('.env:visible').innerText()).includes('renderToString(App)'),
			'the same three plan rows stay while the place changes',
		);

		await page.goto(`${origin}/how-it-works/compiler`, { waitUntil: 'load' });
		const passCard = page.locator('section[data-preview="compiler-passes"]');
		const passWhere = passCard.locator('.where');
		const passTotal = defaultCompilerPasses.length;
		const viewReaders = defaultCompilerPasses
			.slice(9)
			.filter((pass) => pass.consumes.includes('protocolView')).length;
		await passWhere.waitFor();
		check(
			((await passWhere.textContent()) ?? '').trim() === `Pass 1 of ${passTotal}`,
			'the pass card opens on pass 1',
			((await passWhere.textContent()) ?? '').trim(),
		);
		const passNext = passCard.getByRole('button', { name: 'Next →' });
		await passNext.click();
		await see(passWhere, (text) => text === `Pass 2 of ${passTotal}`, 'Next moves to pass 2');
		check(
			(await passCard.locator('.chip.read').allTextContents()).join() === 'semanticGraph' &&
				(await passCard.locator('.chip.new').allTextContents()).join() === 'stateLowering',
			'pass 2 reads the semantic graph and writes stateLowering',
		);
		for (let pass = 3; pass <= 9; pass += 1) await passNext.click();
		await see(passWhere, (text) => text === `Pass 9 of ${passTotal}`, 'Next reaches pass 9');
		await see(
			passCard.locator('.pv-watch-text'),
			(text) => text === `New: protocolView. ${viewReaders} later passes read it.`,
			'the Watch line counts the later passes that read the view record',
		);
		check(
			((await passCard.locator('.out').textContent()) ?? '').includes('"symbol:1"'),
			'pass 9 shows the view record excerpt with its symbol IDs',
		);
		for (let pass = 10; pass <= passTotal; pass += 1) await passNext.click();
		await see(
			passWhere,
			(text) => text === `Pass ${passTotal} of ${passTotal}`,
			'Next steps through every pass to the last one',
		);
		await see(
			passCard.locator('.pv-watch-text'),
			(text) => text.endsWith('That is the last pass.'),
			'the last pass says it is the last',
		);

		await page.goto(`${origin}/how-it-works/payload`, { waitUntil: 'load' });
		const payloadCard = page.locator('section[data-preview="payload-card"]');
		const payloadWatch = payloadCard.locator('.pv-watch-text');
		await payloadWatch.waitFor();
		check(
			((await payloadWatch.textContent()) ?? '').includes('Locator h0 is element 1'),
			'the payload card opens on the view record and its element',
		);
		await payloadCard.locator('[data-line="state"]').hover();
		await see(
			payloadWatch,
			(text) => text.includes('"root":0'),
			'hovering the state line explains the value',
		);
		check(
			(await payloadCard.locator('.board').getAttribute('data-part')) === 'state',
			'hovering the state line marks the text it fills',
		);
		await payloadCard.locator('[data-line="link"]').focus();
		await see(
			payloadWatch,
			(text) => text.includes('Fetching it does not run it.'),
			'focusing the link line explains the preload',
		);

		await page.goto(`${origin}/how-it-works/resuming`, { waitUntil: 'load' });
		const clickCard = page.locator('section[data-preview="first-click"]');
		const clickWatch = clickCard.locator('.pv-watch-text');
		const clickLive = clickCard.locator('.live');
		await clickLive.waitFor();
		await clickLive.click();
		await see(clickLive, (text) => text === 'Count 1', 'the first-click counter counts');
		await see(
			clickWatch,
			(text) => text.includes("button's own listener imported symbol:0"),
			'the direct path names the listener on the button',
		);
		await clickCard.getByRole('radio', { name: 'General' }).check();
		await see(clickLive, (text) => text === 'Count 0', 'switching path starts the counter over');
		await clickLive.hover();
		await see(
			clickWatch,
			(text) => text.includes('symbol:0 was fetched before the press'),
			'on the general path a hover fetches the symbol without running it',
		);
		await clickLive.click();
		await see(
			clickWatch,
			(text) => text.includes('started the runtime'),
			'on the general path the first click starts the full runtime',
		);
		await clickCard.getByRole('radio', { name: 'Server' }).check();
		check(
			(await clickCard.locator('.rows:visible .row.never').count()) === 2,
			'the server path lists the full runtime and the body as never started',
		);
		await page.screenshot({ path: `${shotsDir}/T030-first-click-after.png`, fullPage: true });

		await page.goto(`${origin}/how-it-works/state-graph`, { waitUntil: 'load' });
		const wakeCard = page.locator('section[data-preview="state-graph"]');
		const journal = () => wakeCard.locator('.entries li:visible').allTextContents();
		await wakeCard.waitFor();
		await wakeCard.getByRole('button', { name: 'count++' }).click();
		await see(
			wakeCard.locator('.slot.on-count').last(),
			(text) => text === 'doubled 6',
			'count++ moves the computed that reads count',
		);
		check(
			(await journal()).join('|') === 'setText count → "3"|setText doubled → "6"',
			'the journal lists the two text writes of that flush',
			(await journal()).join('|'),
		);
		await wakeCard.getByRole('button', { name: "label = 'Cups'" }).click();
		await see(
			wakeCard.locator('.slot.on-label'),
			(text) => text === 'Cups',
			'the label write changes the heading',
		);
		check(
			(await journal()).join('|') === 'setText heading → "Cups"',
			'the label write leaves count and doubled out of the journal',
			(await journal()).join('|'),
		);
		await wakeCard.getByRole('button', { name: 'count = 3' }).click();
		await see(
			wakeCard.locator('.entries li:visible').first(),
			(text) => text === 'empty: no flush ran',
			'writing the same value runs no flush',
		);

		await page.goto(`${origin}/how-it-works/lazy-chunks`, { waitUntil: 'load' });
		const lanesCard = page.locator('section[data-preview="lazy-lanes"]');
		const ranChips = () => lanesCard.locator('tbody td:nth-child(3)').allTextContents();
		await lanesCard.waitFor();
		check(
			(await ranChips()).every((text) => text.trim() === 'not yet'),
			'no handler has run at load',
		);
		await lanesCard.getByRole('button', { name: 'Like 0' }).click();
		await see(
			lanesCard.locator('tbody td:nth-child(3)').first(),
			(text) => text === '×1',
			'Like runs its handler',
		);
		check(
			(await ranChips()).map((text) => text.trim()).join() === '×1,×1,not yet,not yet',
			'Like runs its handler and its text update, and Save stays unrun',
			(await ranChips()).join(),
		);
		await lanesCard.getByRole('button', { name: 'Load the page again' }).click();
		await see(
			lanesCard.locator('tbody td:nth-child(3)').first(),
			(text) => text === 'not yet',
			'loading again clears what ran',
		);

		await page.goto(`${origin}/how-it-works/native-targets`, { waitUntil: 'load' });
		const hostCard = page.locator('section[data-preview="native-hosts"]');
		const hostTrace = hostCard.locator('.trace li').last();
		await hostCard.waitFor();
		await hostCard.locator('.device.web .live').click();
		await see(hostTrace, (text) => text === 'text: Count 1', 'the browser button writes its text');
		await hostCard.getByRole('radio', { name: 'iOS' }).check();
		await see(
			hostCard.locator('.json:visible mark'),
			(text) => text === '"touchUpInside"',
			'the iOS proof record names touchUpInside',
		);
		await hostCard.locator('.device.phone .live').click();
		await see(hostTrace, (text) => text === 'title: Count 1', 'the drawn UIButton sets its title');
		await see(
			hostCard.locator('.pv-watch-text'),
			(text) => text.includes('touchUpInside ran symbol:counter.increment'),
			'the Watch line follows the native event to the symbol',
		);
		await hostCard.getByRole('radio', { name: 'macOS' }).check();
		await see(
			hostCard.locator('.json:visible mark'),
			(text) => text === '"action"',
			'the macOS proof record names action',
		);

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
			howItWorksText.includes('When a server renders the page, its HTML arrives already wired.'),
			'how-it-works says server HTML arrives already wired',
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

		// --- the computed page keeps its framework comparison behind a collapsible --
		await page.goto(`${origin}/concepts/computed`, { waitUntil: 'load' });
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
				/dependency array/.test(await comparisonText.innerText()),
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
			const parsed = await page.evaluate(
				(source) => {
					const document = new DOMParser().parseFromString(source, 'text/html');
					return {
						title: document.title,
						description:
							document
								.querySelector('meta[name="description"]')
								?.getAttribute('content') ?? '',
					};
				},
				await response.text(),
			);
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

		await page.goto(`${origin}/how-it-works/payload`, { waitUntil: 'load' });
		await page.evaluate(() => localStorage.setItem('mascot-glaze', 'green'));
		await page.reload({ waitUntil: 'load' });
		const spot = page.locator('.docs-mug');
		check(
			(await spot.count()) === 1 &&
				(await spot.locator('[aria-hidden="true"] svg[data-variant="spot"]').count()) === 1 &&
				(await spot.locator('button, a').count()) === 0,
			'a docs page shows one hidden-from-screen-readers mug spot with no click target',
		);
		check(
			(await spot
				.locator('.body-shape')
				.evaluate((node) => getComputedStyle(node).fill)) === 'rgb(165, 206, 180)',
			'the mug spot wears the glaze the reader saved in the studio',
		);
		await page.evaluate(() => localStorage.removeItem('mascot-glaze'));
		await page.screenshot({ path: `${shotsDir}/mug-spot.png`, fullPage: false });
		await page.goto(`${origin}/concepts/state`, { waitUntil: 'load' });
		check(
			(await page.locator('.docs-mug, [data-variant="toc"]').count()) === 0,
			'a page without a mug spot has no mug in its outline rail',
		);

		// --- UI family playgrounds: each control and demo really drives the family --
		{
			const poll = async <T>(read: () => Promise<T>, wanted: (value: T) => boolean) => {
				let value = await read();
				for (let attempt = 0; attempt < 40 && !wanted(value); attempt += 1) {
					await page.waitForTimeout(100);
					value = await read();
				}
				return value;
			};
			const playground = async (family: string) => {
				await page.goto(`${origin}/ui/${family}`, { waitUntil: 'networkidle' });
				const card = page.locator(`section.pg[data-family="${family}"]`);
				check((await card.count()) === 1, `/ui/${family}: the page carries its playground`);
				return card;
			};
			const switchFor = (card: Locator, name: string) =>
				card
					.locator('.pg-ctl')
					.filter({ has: page.locator('.pg-name', { hasText: new RegExp(`^${name}$`) }) })
					.locator('.pg-switch');

			{
				const card = await playground('carousel');
				const showing = () =>
					card.locator('.slide[ui-active] .slide-name').textContent().then((text) => text ?? '');
				const next = card.getByRole('button', { name: 'Next slide' });
				await next.click();
				check((await poll(showing, (v) => v === 'Oslo')) === 'Oslo', 'carousel: Next shows Oslo');
				const painted = () =>
					card.locator('.window').evaluate((window) => {
						const box = window.getBoundingClientRect();
						const hit = document.elementFromPoint(
							box.left + box.width / 2,
							box.top + box.height / 2,
						);
						return hit?.closest('.slide')?.querySelector('.slide-name')?.textContent ?? '';
					});
				check(
					(await poll(painted, (v) => v === 'Oslo')) === 'Oslo',
					'carousel: the window paints the Oslo slide once it has moved',
				);
				await next.click();
				await poll(showing, (v) => v === 'Lima');
				await switchFor(card, 'Rewind').click();
				await next.click();
				check(
					(await poll(showing, (v) => v === 'Paris')) === 'Paris',
					'carousel: with the Rewind switch on, Next at the end comes round to Paris',
				);
				await card.getByRole('tab', { name: 'Paris' }).focus();
				await page.keyboard.press('ArrowRight');
				check(
					(await poll(showing, (v) => v === 'Oslo')) === 'Oslo',
					'carousel: Right arrow on a picker shows the next slide',
				);
			}

			{
				const card = await playground('collapsible');
				const trigger = card.locator('.trigger');
				const panel = card.locator('.panel');
				await trigger.click();
				check(
					(await poll(() => panel.getAttribute('hidden'), (v) => v === 'until-found')) ===
						'until-found',
					'collapsible: closing the panel leaves it hidden="until-found"',
				);
				await switchFor(card, 'DisableUntilFound').click();
				check(
					(await poll(() => panel.getAttribute('hidden'), (v) => v === '')) === '',
					'collapsible: the DisableUntilFound switch turns that into plain hidden',
				);
				await switchFor(card, 'Disabled').click();
				check(
					await poll(() => trigger.isDisabled(), (v) => v),
					'collapsible: the Disabled switch disables the trigger',
				);
			}

			{
				const card = await playground('combobox');
				const input = card.locator('.input');
				await card.locator('.option', { hasText: 'Mango' }).click();
				check(
					(await poll(() => input.inputValue(), (v) => v === 'Mango')) === 'Mango',
					'combobox: a click on an option writes its label into the field',
				);
				await switchFor(card, 'Inline').click();
				check(
					await poll(() => card.locator('.list').isHidden(), (v) => v),
					'combobox: the Inline switch off turns the list into a closed popup',
				);
				await card.locator('.show').click();
				check(
					await poll(() => card.locator('.list').isVisible(), (v) => v),
					'combobox: the trigger opens the popup list',
				);
				await page.keyboard.press('Escape');
				check(
					await poll(() => card.locator('.list').isHidden(), (v) => v),
					'combobox: Escape closes the popup list',
				);
			}

			{
				const card = await playground('modal');
				const dialog = page.locator('.dialog');
				await card.locator('.open').click();
				check(await poll(() => dialog.isVisible(), (v) => v), 'modal: the trigger opens the dialog');
				const onTop = await dialog.evaluate((node) => {
					const box = node.getBoundingClientRect();
					const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 12);
					return (
						box.top >= 0 &&
						box.left >= 0 &&
						box.bottom <= innerHeight &&
						box.right <= innerWidth &&
						node.contains(hit)
					);
				});
				check(onTop, 'modal: the open dialog is fully inside the viewport and on top');
				await dialog.locator('.field').fill('9 Mill Road');
				check(
					(await settleText(card.locator('.card-address'), (t) => t === '9 Mill Road', 'modal: card')) ===
						'9 Mill Road',
					'modal: typing in the dialog updates the address on the page',
				);
				await page.keyboard.press('Escape');
				check(await poll(() => dialog.isHidden(), (v) => v), 'modal: Escape closes the dialog');
				await switchFor(card, 'Alert').click();
				await card.locator('.open').click();
				await poll(() => dialog.isVisible(), (v) => v);
				await page.mouse.click(5, 5);
				await page.waitForTimeout(400);
				check(await dialog.isVisible(), 'modal: with Alert on, a press on the backdrop does not close');
				await page.keyboard.press('Escape');
				await poll(() => dialog.isHidden(), (v) => v);
			}

			{
				const card = await playground('navbar');
				const open = () =>
					card
						.locator('.item[ui-open] > .top')
						.textContent()
						.then((text) => text ?? '')
						.catch(() => '');
				check(/Products/.test(await open()), 'navbar: the playground starts with Products open');
				await card.locator('.top', { hasText: 'Docs' }).hover();
				check(/Docs/.test(await poll(open, (v) => /Docs/.test(v))), 'navbar: resting on Docs opens it');
				const shown = card
					.locator('.pg-cell')
					.filter({ hasText: 'value' })
					.locator('.pg-pick-value');
				check(
					(await settleText(shown, (t) => t === 'docs', 'navbar: value')) === 'docs',
					'navbar: the value control follows the open dropdown',
				);
				await page.mouse.move(5, 5);
				await switchFor(card, 'Hover').click();
				await poll(open, (v) => v === '');
				await card.locator('.top', { hasText: 'Products' }).hover();
				await page.waitForTimeout(500);
				check((await open()) === '', 'navbar: with Hover off, resting on an item opens nothing');
				await card.locator('.top', { hasText: 'Products' }).click();
				check(/Products/.test(await poll(open, (v) => /Products/.test(v))), 'navbar: a click opens Products');
			}
		}

		// --- UI family playgrounds: each control and the widget itself respond ----
		const playground = async (family: string) => {
			await page.goto(`${origin}/ui/${family}`, { waitUntil: 'load' });
			const card = page.locator(`section.pg[data-family="${family}"]`);
			check((await card.count()) === 1, `/ui/${family}: the page carries one playground`);
			return { card, stage: card.locator('.pg-stage') };
		};
		const choose = async (card: Locator, label: string, option: string) => {
			await card
				.locator('.pg-cell', { hasText: label })
				.first()
				.locator('.pg-pick-trigger')
				.click();
			await page
				.locator('.pg-pick-item:visible', { hasText: new RegExp(`^\\s*${option}\\s*$`) })
				.first()
				.click();
		};
		const settle = (read: () => Promise<unknown>, want: unknown) => expectPoll(read, want);
		{
			const { card, stage } = await playground('radiogroup');
			const chosen = () => stage.locator('.plan[ui-selected]').innerText();
			check((await chosen()).includes('Annual'), '/ui/radiogroup: Annual is chosen at first');
			await stage.locator('label', { hasText: 'Lifetime' }).click();
			check(
				await settle(chosen, (text: string) => text.includes('Lifetime')),
				'/ui/radiogroup: a click chooses Lifetime',
			);
			await page.keyboard.press('ArrowUp');
			check(
				await settle(chosen, (text: string) => text.includes('Annual')),
				'/ui/radiogroup: Up arrow chooses the option above',
			);
			check(
				(await card.locator('.pg-pick-value').first().innerText()) === 'annual',
				'/ui/radiogroup: the value control follows the choice',
			);
			await choose(card, 'orientation', 'horizontal');
			check(
				await settle(() => stage.locator('[ui-horizontal]').count(), 1),
				'/ui/radiogroup: orientation lays the options in a row',
			);
		}
		{
			const { card, stage } = await playground('qrcode');
			const path = () => stage.locator('.qr-pattern path').getAttribute('d');
			const first = await path();
			await card.locator('.pg-field').fill('hello');
			check(
				await settle(path, (d: string) => d !== first),
				'/ui/qrcode: typing a value redraws the code',
			);
			await card.locator('.pg-cell', { hasText: 'Logo' }).locator('.pg-switch').click();
			check(
				await settle(() => stage.locator('.qr-logo').isVisible(), true),
				'/ui/qrcode: the Logo switch shows the overlay',
			);
		}
		{
			const { card, stage } = await playground('progress');
			const bar = stage.locator('[role="progressbar"]');
			await choose(card, 'value', '60');
			check(
				await settle(() => bar.getAttribute('aria-valuenow'), '60'),
				'/ui/progress: the value control moves the bar',
			);
			await choose(card, 'value', '\\(none\\)');
			check(
				await settle(() => bar.getAttribute('ui-progress'), 'indeterminate'),
				'/ui/progress: no value makes the bar indeterminate',
			);
		}
		{
			const { card, stage } = await playground('pagination');
			const current = () => stage.locator('[aria-current="page"]').innerText();
			check((await current()) === '3', '/ui/pagination: page 3 is current at first');
			await stage.getByRole('button', { name: 'Next page' }).focus();
			await page.keyboard.press('Enter');
			check(await settle(current, '4'), '/ui/pagination: Enter on Next moves to page 4');
			await choose(card, 'page', '1');
			check(
				await settle(current, '1'),
				'/ui/pagination: the page control moves the current page',
			);
		}
		{
			const { card, stage } = await playground('toaster');
			const toast = stage.locator('[ui-toast]');
			check(!(await toast.isVisible()), '/ui/toaster: no message shows before Save draft');
			await choose(card, 'Tone', 'error');
			await stage.getByRole('button', { name: 'Save draft' }).focus();
			await page.keyboard.press('Enter');
			check(
				await settle(() => toast.isVisible(), true),
				'/ui/toaster: Enter on Save draft shows the message',
			);
			check(
				(await toast.getAttribute('role')) === 'alert',
				'/ui/toaster: an error message is role=alert',
			);
			const box = await toast.boundingBox();
			const frame = await stage.boundingBox();
			check(
				!!box &&
					!!frame &&
					box.y >= frame.y &&
					box.y + box.height <= frame.y + frame.height,
				'/ui/toaster: the message is fully inside the stage',
			);
			await stage.getByRole('button', { name: 'Dismiss' }).click();
			check(
				await settle(() => toast.isVisible(), false),
				'/ui/toaster: Dismiss removes the message',
			);
		}
		const toggleNamed = (card: Locator, name: string) =>
			card
				.locator('.pg-ctl')
				.filter({ has: page.locator('.pg-name', { hasText: new RegExp(`^${name}$`) }) })
				.locator('.pg-switch');
		// An open overlay must sit fully inside its card and be the topmost thing at its centre.
		const overlayOnTop = async (overlay: Locator, card: Locator) =>
			overlay.evaluate((node, frame) => {
				const box = node.getBoundingClientRect();
				const edge = (frame as Element).getBoundingClientRect();
				const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
				return (
					box.width > 0 &&
					box.top >= edge.top &&
					box.bottom <= edge.bottom &&
					box.left >= edge.left &&
					box.right <= edge.right &&
					node.contains(hit)
				);
			}, await card.elementHandle());
		const switchIn = (card: Locator, name: string) =>
			card
				.locator('.pg-ctl')
				.filter({ has: page.locator('.pg-name', { hasText: new RegExp(`^${name}$`) }) })
				.locator('.pg-switch');
		const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
		const chooseNamed = async (card: Locator, name: string, option: string) => {
			await card
				.locator('.pg-cell')
				.filter({ has: page.locator('.pg-name', { hasText: new RegExp(`^${name}$`) }) })
				.locator('.pg-pick-trigger')
				.click();
			await page
				.locator('.pg-pick-item:visible', { hasText: new RegExp(`^\\s*${option}\\s*$`) })
				.first()
				.click();
		};
		{
			const { card, stage } = await playground('tabs');
			const shown = () => stage.locator('.tab[ui-selected]').innerText();
			await stage.locator('.tab', { hasText: 'Billing' }).click();
			await page.keyboard.press('ArrowRight');
			check(
				await settle(shown, 'Alerts'),
				'/ui/tabs: Right arrow skips the disabled Team tab and shows Alerts',
			);
			await toggleNamed(card, 'Select on focus').click();
			await stage.locator('.tab', { hasText: 'Alerts' }).focus();
			await page.keyboard.press('Home');
			check(
				(await settle(focusedText, 'Overview')) && (await shown()) === 'Alerts',
				'/ui/tabs: with Select on focus off, Home moves focus but keeps Alerts showing',
			);
			await page.keyboard.press('Enter');
			check(await settle(shown, 'Overview'), '/ui/tabs: Enter shows the focused tab');
			await choose(card, 'orientation', 'vertical');
			check(
				await settle(() => stage.locator('.list[aria-orientation="vertical"]').count(), 1),
				'/ui/tabs: the orientation control stacks the tabs',
			);
		}
		{
			const { card, stage } = await playground('resizable');
			const files = () => stage.locator('.pane[ui-value="files"]').getAttribute('ui-size');
			const divider = stage.locator('.divider').first();
			await divider.focus();
			await page.keyboard.press('ArrowRight');
			check(await settle(files, '29'), '/ui/resizable: Right arrow grows Files by one step');
			await choose(card, 'step', '10');
			await divider.focus();
			await page.keyboard.press('ArrowRight');
			check(await settle(files, '39'), '/ui/resizable: the step control makes one press move ten');
			await card.locator('.pg-showall').click();
			await toggleNamed(card, 'OnChange').click();
			await divider.focus();
			await page.keyboard.press('ArrowLeft');
			check(
				await settle(() => card.locator('.pg-log').innerText(), 'onChange called 1 time(s)'),
				'/ui/resizable: with the onChange log on, one arrow press is logged once',
			);
			await toggleNamed(card, 'Disabled').click();
			check(
				await settle(() => divider.getAttribute('tabindex'), '-1'),
				'/ui/resizable: the Disabled switch takes the dividers out of the Tab order',
			);
		}
		{
			const { card, stage } = await playground('tree');
			const rows = stage.locator('[role="treeitem"]');
			const docs = rows.filter({ hasText: 'docs' }).first();
			await stage.locator('.files').focus();
			check(await settle(focusedText, (text: string) => text.startsWith('src')), '/ui/tree: focus lands on src');
			for (let step = 0; step < 3; step += 1) await page.keyboard.press('ArrowDown');
			await page.keyboard.press('ArrowRight');
			check(
				await settle(() => docs.getAttribute('aria-expanded'), 'true'),
				'/ui/tree: Right arrow opens docs',
			);
			check(
				await settle(() => stage.locator('.readout').innerText(), (t: string) => t.includes('docs opened')),
				'/ui/tree: the readout names the row that opened',
			);
			await toggleNamed(card, 'src open').click();
			check(
				await settle(() => rows.first().getAttribute('aria-expanded'), 'false'),
				'/ui/tree: the src open switch closes src',
			);
		}
		{
			const { card, stage } = await playground('textbox');
			await stage.locator('.label').click();
			await page.keyboard.type('ada99');
			check(
				await settle(() => stage.locator('.echo-text').innerText(), 'ada99'),
				'/ui/textbox: typing reaches onChange',
			);
			check(
				await settle(() => stage.locator('.hook-empty').isVisible(), false),
				'/ui/textbox: the root drops ui-empty once the field holds text',
			);
			await toggleNamed(card, 'Readonly').click();
			check(
				await settle(() => stage.locator('.input').getAttribute('readonly'), ''),
				'/ui/textbox: the Readonly switch makes the input read-only',
			);
		}
		{
			const { card, stage } = await playground('table');
			const picked = () => stage.locator('.picked').innerText();
			await stage.locator('td', { hasText: 'Last week' }).click();
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('Space');
			check(await settle(picked, 'marmalade'), '/ui/table: Space picks the row under focus');
			await stage.locator('th', { hasText: 'Sealed' }).click();
			check(
				await settle(() => stage.locator('.asked').innerText(), 'sealed'),
				'/ui/table: a header press reaches onSortChange',
			);
			await toggleNamed(card, 'Multiple').click();
			await stage.locator('th', { hasText: 'Damson jam' }).click();
			await page.keyboard.press('Shift+ArrowDown');
			check(
				await settle(picked, 'jam, chutney'),
				'/ui/table: with Multiple on, Shift and Down picks a run of rows',
			);
			await card.locator('.pg-showall').click();
			await chooseNamed(card, 'value', 'marmalade');
			check(
				await settle(picked, 'jam, chutney, marmalade'),
				'/ui/table: with Multiple on, the value control adds a row to the pick',
			);
			await toggleNamed(card, 'Multiple').click();
			check(
				await settle(picked, 'jam'),
				'/ui/table: turning Multiple off keeps the value a list of its first row',
			);
		}
		{
			const { card, stage } = await playground('gridlist');
			const picked = () => stage.locator('.picked').innerText();
			await stage.locator('[role="row"]', { hasText: 'invoice' }).click();
			check(await settle(picked, 'invoice'), '/ui/gridlist: a click picks the row');
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('Enter');
			await page.keyboard.press('Enter');
			check(
				await settle(() => stage.locator('.pressed').innerText(), 'Rename sardines-on-toast.jpg'),
				'/ui/gridlist: Enter reaches the row button and presses it',
			);
			await page.keyboard.press('Escape');
			await toggleNamed(card, 'Multiple').click();
			await stage.locator('[role="row"]', { hasText: 'moodboard' }).click();
			check(
				await settle(picked, 'invoice, moodboard'),
				'/ui/gridlist: with Multiple on, a second row joins the pick',
			);
			await card.locator('.pg-showall').click();
			await chooseNamed(card, 'value', 'sardines');
			check(
				await settle(picked, 'invoice, moodboard, sardines'),
				'/ui/gridlist: with Multiple on, the value control adds a row to the pick',
			);
			await toggleNamed(card, 'Multiple').click();
			check(
				await settle(picked, 'invoice'),
				'/ui/gridlist: turning Multiple off keeps the value a list of its first row',
			);
			await chooseNamed(card, 'value', 'sardines');
			const selectedRows = stage.locator('[role="row"][aria-selected="true"]');
			check(
				(await settle(picked, 'sardines')) &&
					(await settle(() => selectedRows.count(), 1)) &&
					(await selectedRows.innerText()).includes('sardines-on-toast.jpg'),
				'/ui/gridlist: with Multiple off, the value control moves the pick to one row',
			);
		}
		{
			const { card, stage } = await playground('tooltip');
			const tip = stage.locator('.tip');
			check(!(await tooltipIsVisible(tip)), '/ui/tooltip: the tip is hidden at first');
			await stage.locator('.save').hover();
			check(
				await settle(() => tooltipIsVisible(tip), true),
				'/ui/tooltip: resting on Save shows the tip',
			);
			check(await overlayOnTop(tip, card), '/ui/tooltip: the tip is inside the card and on top');
			await page.mouse.move(2, 2);
			check(
				await settle(() => tooltipIsVisible(tip), false),
				'/ui/tooltip: the tip hides when the pointer leaves',
			);
			await switchIn(card, 'Open').click();
			check(
				await settle(() => tooltipIsVisible(tip), true),
				'/ui/tooltip: the open switch shows the tip',
			);
		}
		{
			const { card, stage } = await playground('hovercard');
			const panel = stage.locator('.card');
			await choose(card, 'delay', '0');
			await stage.locator('.link').first().hover();
			check(
				await settle(() => panel.isVisible(), true),
				'/ui/hovercard: resting on the link shows the card',
			);
			check(
				await overlayOnTop(panel, card),
				'/ui/hovercard: the open card is inside its frame and on top',
			);
			await page.keyboard.press('Escape');
			check(await settle(() => panel.isVisible(), false), '/ui/hovercard: Escape hides the card');
		}
		{
			const { card, stage } = await playground('popover');
			const panel = stage.locator('.panel');
			await stage.locator('.share').click();
			check(await settle(() => panel.isVisible(), true), '/ui/popover: Share opens the panel');
			check(
				await overlayOnTop(panel, card),
				'/ui/popover: the open panel is inside its card, above the code below it',
			);
			await page.keyboard.press('Escape');
			check(await settle(() => panel.isVisible(), false), '/ui/popover: Escape closes the panel');
			await stage.locator('.share').click();
			await settle(() => panel.isVisible(), true);
			await page.mouse.click(5, 5);
			check(
				await settle(() => panel.isVisible(), false),
				'/ui/popover: a press outside closes the panel',
			);
		}
		{
			const { card, stage } = await playground('drawer');
			const sheet = page.locator('.sheet');
			await stage.locator('.open').click();
			check(await settle(() => sheet.isVisible(), true), '/ui/drawer: Change day opens the sheet');
			check(
				await sheet.evaluate((node) => {
					const box = node.getBoundingClientRect();
					const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 8);
					return box.bottom <= innerHeight + 1 && box.top >= 0 && node.contains(hit);
				}),
				'/ui/drawer: the open sheet is on screen and on top',
			);
			await sheet.getByRole('button', { name: 'Friday' }).click();
			check(
				await settle(() => stage.locator('.card-day').innerText(), 'Friday'),
				'/ui/drawer: picking Friday closes the sheet and updates the card',
			);
			await choose(card, 'orientation', 'horizontal');
			await stage.locator('.open').click();
			check(
				await settle(() => sheet.getAttribute('ui-orientation'), 'horizontal'),
				'/ui/drawer: orientation turns the sheet into a side panel',
			);
			await page.keyboard.press('Escape');
			check(await settle(() => sheet.isVisible(), false), '/ui/drawer: Escape closes it');
		}
		{
			const { card, stage } = await playground('toggle');
			const line = stage.locator('.now');
			await stage.locator('.track').click();
			check(
				await settle(() => line.innerText(), (text: string) => text.startsWith('On')),
				'/ui/toggle: a click turns the switch on and the line follows',
			);
			await page.keyboard.press('Space');
			check(
				await settle(() => line.innerText(), (text: string) => text.startsWith('Off')),
				'/ui/toggle: Space turns it off again',
			);
			await switchIn(card, 'Disabled').click();
			check(
				await settle(() => stage.locator('.track').isDisabled(), true),
				'/ui/toggle: the Disabled switch disables the switch',
			);
		}
		{
			const { card, stage } = await playground('select');
			await stage.locator('.trigger').click();
			const list = stage.locator('.list');
			check(await settle(() => list.isVisible(), true), '/ui/select: the button opens the list');
			check(await overlayOnTop(list, card), '/ui/select: the open list is inside the card and on top');
			await stage.locator('.option', { hasText: 'Banana' }).click();
			check(
				await settle(() => stage.locator('.trigger').innerText(), 'Banana'),
				'/ui/select: picking Banana writes it on the button',
			);
			check(
				(await stage.locator('.note').innerText()).includes("'banana'"),
				'/ui/select: the line shows the value, not the label',
			);
			await switchIn(card, 'Disabled').click();
			check(
				await settle(() => stage.locator('.trigger').isDisabled(), true),
				'/ui/select: the Disabled switch disables the button',
			);
		}
		{
			const { card, stage } = await playground('checkbox');
			await stage.locator('.box').click();
			check(
				await settle(() => stage.locator('.note').innerText(), (text: string) => text.endsWith('true')),
				'/ui/checkbox: a click ticks the box and the line shows true',
			);
			await switchIn(card, 'Required').click();
			check(
				await settle(() => stage.locator('input[type="checkbox"]').evaluate((node) => (node as HTMLInputElement).required), true),
				'/ui/checkbox: the Required switch reaches the form field',
			);
			const mixed = page.locator('.cp[data-family="checkbox"]').nth(0);
			const all = mixed.getByRole('checkbox', { name: 'Order both' });
			check((await all.getAttribute('aria-checked')) === 'mixed', '/ui/checkbox: Order both starts mixed');
			await mixed.getByText('Cake', { exact: true }).click();
			check(
				await settle(() => all.getAttribute('aria-checked'), 'true'),
				'/ui/checkbox: ticking the last row turns Order both on',
			);
			const form = page.locator('.cp[data-family="checkbox"]').nth(1);
			await form.getByRole('button', { name: 'Save' }).click();
			check(
				(await form.locator('.note').innerText()) === 'Nothing sent yet.',
				'/ui/checkbox: a required box that is off stops the form',
			);
			await form.locator('.box').click();
			await form.getByRole('button', { name: 'Save' }).click();
			check(
				await settle(() => form.locator('.note').innerText(), 'Sent email=ada@example.com newsletter=weekly'),
				'/ui/checkbox: a ticked box sends its name and value',
			);
		}

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
