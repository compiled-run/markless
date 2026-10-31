import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type BrowserType } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');

// Shelf pages that each count their own taps and link the next one, plus an MDX guide rendering a shared tally.
async function writeApp(root: string, count: number) {
	await mkdir(join(root, 'pages/shelf'), { recursive: true });
	await mkdir(join(root, 'components'), { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	await writeFile(
		join(root, 'components/Tally.tsrx'),
		[
			'import { state } from "@markless/core";',
			'export default function Tally() @{',
			'\tlet marks = state(0);',
			'\t<button class="tally" onClick={() => (marks += 2)}>{marks}</button>',
			'}',
		].join('\n'),
	);
	await writeFile(
		join(root, 'pages/guide.mdx'),
		'import Tally from "../components/Tally.tsrx";\n\n# Guide\n\n<Tally />\n',
	);
	for (let index = 0; index < count; index++)
		await writeFile(
			join(root, `pages/shelf/item-${index}.tsrx`),
			[
				'import { state } from "@markless/core";',
				'export default function Page() @{',
				'\tlet taps = state(0);',
				`\t<section><h2>{"item ${index}"}</h2>`,
				`\t\t<button class="tap" onClick={() => taps++}>{taps}</button>`,
				`\t\t<a href="/shelf/item-${(index + 1) % count}">next</a>`,
				'\t</section>',
				'}',
			].join('\n'),
		);
}

type Built = { root: string; server: BuiltServer };

async function buildApp(count: number): Promise<Built> {
	const root = await mkdtemp(join(tmpdir(), 'markless-landing-resume-'));
	await writeApp(root, count);
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	return {
		root,
		server: await startBuiltServer(join(root, '.output/server/index.mjs'), { cwd: root }),
	};
}

async function landing(built: Built, path: string) {
	const html = await (await fetch(`${built.server.origin}${path}`)).text();
	const hrefs = [
		...html.matchAll(/<link rel="modulepreload" href="(\/(?!_markless\/)[^"]+)"/g),
	].map((match) => match[1]!);
	const chunks = await Promise.all(
		hrefs.map((href) => readFile(join(built.root, '.output/public', href), 'utf8')),
	);
	const route = JSON.parse(
		/<script type="@markless\/core\/route">([^<]*)<\/script>/.exec(html)![1]!,
	) as { file: string; resume?: [string, string?] };
	return { hrefs, chunks, route };
}

describe('the code a landing page loads to resume', () => {
	let few: Built;
	let many: Built;
	beforeAll(async () => {
		[few, many] = await Promise.all([buildApp(3), buildApp(9)]);
	}, 240_000);
	afterAll(async () => {
		for (const built of [few, many]) {
			await built?.server.close();
			if (built) await rm(built.root, { recursive: true, force: true });
		}
	});

	test('stays the same size as routes are added and names no other route', async () => {
		const small = await landing(few, '/shelf/item-0');
		const large = await landing(many, '/shelf/item-0');
		const bytes = (chunks: string[]) => chunks.map((code) => code.length).sort((a, b) => a - b);
		expect(bytes(large.chunks)).toEqual(bytes(small.chunks));
		for (const code of large.chunks) {
			expect(code).not.toMatch(/shelf\/item-[1-8]\b/);
			expect(code).not.toContain('guide.mdx');
		}
	});

	test.each(['/shelf/item-0', '/guide'])(
		'%s names its own resume module, and the landing preloads it',
		async (path) => {
			const { hrefs, route } = await landing(many, path);
			expect(route.resume?.[0]).toMatch(/^\/build\/.+\.js$/);
			expect(hrefs).toContain(route.resume![0]);
		},
	);

	describe.each([
		['chromium', chromium],
		['webkit', webkit],
	] as const)('in %s', (_name, browserType: BrowserType) => {
		test('a first click resumes without fetching code, and a page swapped in place resumes too', async () => {
			const browser = await browserType.launch();
			try {
				const page = await browser.newPage();
				const scripts: string[] = [];
				page.on('request', (request) => {
					if (request.resourceType() === 'script') scripts.push(request.url());
				});
				await page.goto(`${few.server.origin}/shelf/item-1`);
				await page.waitForLoadState('networkidle');
				const loaded = scripts.length;
				await page.locator('button.tap').click();
				await expect.poll(() => page.locator('button.tap').textContent()).toBe('1');
				expect(scripts.slice(loaded).filter((url) => url.includes('/build/'))).toEqual([]);

				await page.evaluate(() => ((window as { stayed?: boolean }).stayed = true));
				await page.locator('a', { hasText: 'next' }).click();
				await expect.poll(() => page.locator('h2').textContent()).toBe('item 2');
				expect(await page.evaluate(() => (window as { stayed?: boolean }).stayed)).toBe(
					true,
				);
				await page.locator('button.tap').click();
				await page.locator('button.tap').click();
				await expect.poll(() => page.locator('button.tap').textContent()).toBe('2');

				await page.goto(`${few.server.origin}/guide`);
				await page.locator('button.tally').click();
				await expect.poll(() => page.locator('button.tally').textContent()).toBe('2');
			} finally {
				await browser.close();
			}
		}, 60_000);
	});
});
