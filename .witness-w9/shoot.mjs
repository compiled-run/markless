// Serves the production build and looks at /markless/ui/accordion the way a
// reader would: both themes, desktop and phone, plus the checks the page has to
// pass to be worth the owner's time.
// Run: node .witness-w9/shoot.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = resolve(root, '.witness-w9');
mkdirSync(shots, { recursive: true });

const failures = [];
const check = (ok, label, detail = '') => {
	const line = `${label}${detail ? ` — ${detail}` : ''}`;
	console.log(`${ok ? 'ok           ' : 'FAIL         '} ${line}`);
	if (!ok) failures.push(line);
};

const freePort = () =>
	new Promise((done, fail) => {
		const probe = createServer();
		probe.on('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const port = probe.address().port;
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
const log = [];
server.stdout.on('data', (chunk) => log.push(String(chunk)));
server.stderr.on('data', (chunk) => log.push(String(chunk)));
process.on('exit', () => server.kill('SIGKILL'));

const url = `${origin}/markless/ui/accordion`;
for (let attempt = 0; attempt < 60; attempt += 1) {
	try {
		const response = await fetch(url);
		if (response.status < 500) break;
	} catch {}
	await new Promise((done) => setTimeout(done, 250));
}

const html = await (await fetch(url)).text();
check(html.includes('<h1'), 'the page serves an h1');
check(!html.includes('ui-preview-shows'), 'no caption paragraph survives inside a preview');
check(!html.includes('theme-toggle-island'), 'the page body carries no theme toggle');

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// The router's seed script reads the stored value as JSON, so the theme is
// written the way the toggle writes it.
const openPage = async (theme, width, height) => {
	const context = await browser.newContext({
		viewport: { width, height },
		colorScheme: theme,
	});
	await context.addInitScript(
		`localStorage.setItem('theme', ${JSON.stringify(JSON.stringify(theme))})`,
	);
	const page = await context.newPage();
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForTimeout(700);
	return { context, page };
};

// --- structure, on the desktop light pass -----------------------------------
const { context: deskLight, page } = await openPage('light', 1280, 900);

const sections = await page.locator('h2[id]').allTextContents();
check(
	sections.join(' | ') === 'Examples | Real-world examples | Anatomy | Keyboard | API reference',
	'the five sections are in the ruled order',
	sections.join(' | '),
);

// The family gives every item label an id too, so the API headings are named by
// the slug the page mints for them.
const parts = await page.locator('h3[id^="accordion-"]').allTextContents();
check(
	parts.join(' | ') ===
		'accordion.root | accordion.item | accordion.itemlabel | accordion.itemtrigger | accordion.itemcontent',
	'one API heading per part, in partOrder',
	parts.join(' | '),
);

const subtitle = await page.locator('.page-subtitle').first();
const subtitleLook = await subtitle.evaluate((node) => {
	const style = getComputedStyle(node);
	return { size: style.fontSize, opacity: style.opacity, text: node.textContent?.trim() ?? '' };
});
check(
	subtitleLook.text.split(/\s+/).length < 10,
	'the subtitle is under ten words',
	subtitleLook.text,
);
check(
	Number.parseFloat(subtitleLook.size) > 20 && Number.parseFloat(subtitleLook.opacity) < 0.9,
	'the subtitle is drawn as a subtitle, not as body text',
	`${subtitleLook.size} / ${subtitleLook.opacity}`,
);

const accordions = await page.locator('[ui-multiple], .accordion, .faq-list, .settings').count();
check(accordions >= 7, 'every demo painted', String(accordions));

// Every root prop the manifest carries has to be in the first API table.
const rootProps = await page
	.locator('h3#accordion-root + table .api-prop')
	.allTextContents();
for (const prop of ['value', 'multiple', 'collapsible', 'disabled', 'disableUntilFound', 'onChange'])
	check(rootProps.includes(prop), `accordion.root's ${prop} row is in the API table`);

const anatomyParts = await page.locator('.anatomy-table .api-prop').allTextContents();
check(
	anatomyParts.join(',') ===
		'accordion.root,accordion.item,accordion.itemlabel,accordion.itemtrigger,accordion.itemcontent',
	'the anatomy table lists the five parts',
	anatomyParts.join(','),
);

const caps = await page.locator('.key-cap, kbd').count();
check(caps >= 6, 'the keyboard table draws keycaps', String(caps));

// --- the code panels open ----------------------------------------------------
const panels = page.locator('.code-panel');
const panelCount = await panels.count();
check(panelCount === 8, 'one code panel per demo plus the hero', String(panelCount));

const firstClamp = panels.first().locator('.clamp').first();
const before = await firstClamp.evaluate((node) => node.getBoundingClientRect().height);
await panels.first().getByText('Expand code').first().click();
await page.waitForTimeout(400);
const after = await firstClamp.evaluate((node) => node.getBoundingClientRect().height);
check(after > before, 'Expand code lifts the clamp', `${Math.round(before)}px -> ${Math.round(after)}px`);

const tabs = await panels.nth(1).locator('.tab').allTextContents();
check(tabs.length >= 2, 'a demo with CSS shows a second tab', tabs.join(' | '));

// --- the demos answer a click ------------------------------------------------
const shut = page.locator('.faq-item').nth(1);
await shut.locator('.faq-trigger').click();
await page.waitForTimeout(300);
check(
	(await shut.getAttribute('ui-open')) !== null,
	'clicking a question opens it',
	String(await shut.getAttribute('ui-open')),
);

// The playground's controls are a sibling unit's work; this only reports what
// flipping one does to the demo beside it.
const stage = page.locator('.pg-stage .accordion');
const beforeFlip = await stage.getAttribute('ui-multiple');
await page.locator('.pg-quick .switch').first().click();
await page.waitForTimeout(400);
const afterFlip = await stage.getAttribute('ui-multiple');
console.log(
	`note          the playground's multiple toggle: demo ui-multiple ${beforeFlip} -> ${afterFlip}`,
);

// --- the shots ---------------------------------------------------------------
await deskLight.close();

for (const [theme, width, height, name] of [
	['light', 1280, 900, 'desktop-light'],
	['dark', 1280, 900, 'desktop-dark'],
	['light', 390, 844, 'mobile-light'],
	['dark', 390, 844, 'mobile-dark'],
]) {
	const { context, page: shot } = await openPage(theme, width, height);
	const painted = await shot.evaluate(() => document.documentElement.dataset.theme);
	check(painted === theme, `${name} is painted in the ${theme} theme`, String(painted));
	await shot.screenshot({ path: `${shots}/${name}.jpg`, fullPage: true, type: 'jpeg', quality: 92 });
	await shot.screenshot({ path: `${shots}/${name}-hero.png`, fullPage: false });
	await context.close();
}

await browser.close();
server.kill('SIGKILL');

console.log(failures.length === 0 ? '\nall green' : `\n${failures.length} failed:\n${failures.join('\n')}`);
process.exit(failures.length === 0 ? 0 : 1);
