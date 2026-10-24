import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { createBuilder } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
const TEXT_COUNT = 40;

// A lookup table of loaders, one per page, as markless-migrate writes copied page text:
// the target is chosen at run time, so every target has to stay fetchable on its own.
async function writeApp(root: string) {
	await mkdir(join(root, 'pages'));
	await mkdir(join(root, 'lib/texts'), { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	for (let index = 0; index < TEXT_COUNT; index++)
		await writeFile(
			join(root, `lib/texts/${index}.ts`),
			`export default ${JSON.stringify(`text ${index} lorem `.repeat(300))};\n`,
		);
	await writeFile(
		join(root, 'lib/copy.ts'),
		[
			'const TEXTS: Record<string, () => Promise<{ default: string }>> = {',
			...Array.from({ length: TEXT_COUNT }, (_, index) => `\t"/p${index}": () => import("./texts/${index}.ts"),`),
			'};',
			'export function copyFor(path: string): void {',
			'\tvoid TEXTS[path]?.().then((m) => navigator.clipboard.writeText(m.default));',
			'}',
		].join('\n'),
	);
	for (const page of ['p0', 'p1'])
		await writeFile(
			join(root, `pages/${page}.tsrx`),
			[
				'import { copyFor } from "../lib/copy.ts";',
				'export default function Page() @{',
				`\t<main><h1>${page}</h1><button onClick={() => copyFor("/${page}")}>Copy page</button></main>`,
				'}',
			].join('\n'),
		);
}

const textsIn = (code: string) => new Set(code.match(/text \d+ lorem/g) ?? []).size;

test('a lookup table of import() loaders keeps each target in its own chunk, fetched only when chosen', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-lookup-imports-'));
	try {
		await writeApp(root);
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		});
		await builder.buildApp();

		const clientDir = join(root, '.output/public/build');
		const chunks = (await readdir(clientDir)).filter((file) => file.endsWith('.js'));
		for (const file of chunks)
			expect(textsIn(await readFile(join(clientDir, file), 'utf8')), file).toBeLessThanOrEqual(1);

		const server = await startBuiltServer(join(root, '.output/server/index.mjs'), { cwd: root });
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			await page.addInitScript(() => {
				Object.defineProperty(navigator, 'clipboard', {
					value: { writeText: async (text: string) => ((globalThis as { copied?: string }).copied = text) },
				});
			});
			const fetched: Array<{ phase: string; texts: number }> = [];
			let phase = 'load';
			page.on('response', async (response) => {
				if (!response.url().endsWith('.js')) return;
				const at = phase;
				fetched.push({ phase: at, texts: textsIn(await response.text().catch(() => '')) });
			});
			await page.goto(`${server.origin}/p1`);
			await page.waitForLoadState('networkidle');
			phase = 'click';
			await page.locator('button').click();
			await expect
				.poll(() => page.evaluate(() => (globalThis as { copied?: string }).copied?.slice(0, 12)))
				.toBe('text 1 lorem');
			const loadTexts = fetched.filter((one) => one.phase === 'load').reduce((sum, one) => sum + one.texts, 0);
			const clickTexts = fetched.filter((one) => one.phase === 'click').reduce((sum, one) => sum + one.texts, 0);
			expect({ loadTexts, clickTexts }).toEqual({ loadTexts: 0, clickTexts: 1 });
		} finally {
			await browser.close();
			await server.close();
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 180_000);
