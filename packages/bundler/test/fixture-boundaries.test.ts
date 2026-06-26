import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const fixtureRoot = resolve(import.meta.dirname, '../fixtures');
const tsrxFixtureImports = [
	{
		path: 'rolldown-basic/src/root.tsrx',
		importLine: "import { state } from 'arcade';",
	},
	{
		path: 'vite-csr/src/root.tsrx',
		importLine: "import { state } from 'arcade';",
	},
	{
		path: 'vite-library/src/card.tsrx',
		importLine: "import { state } from 'arcade';",
	},
	{
		path: 'vite-plus/src/root.tsrx',
		importLine: "import { state } from 'arcade';",
	},
	{
		path: 'vite-ssr/src/root.tsrx',
		importLine: "import { state } from 'arcade';",
	},
] as const;

describe('fixture framework boundaries', () => {
	test('TSRX fixtures import framework APIs explicitly', async () => {
		for (const fixture of tsrxFixtureImports) {
			await expect(readFixture(fixture.path)).resolves.toContain(fixture.importLine);
		}
	});

	test('browser entries use CSR render and SSR resume runtime helpers at the right boundary', async () => {
		const csrEntry = await readFixture('vite-csr/src/main.ts');
		const vitePlusEntry = await readFixture('vite-plus/src/main.ts');

		for (const source of [csrEntry, vitePlusEntry]) {
			expect(source).not.toContain('data-async-host');
			expect(source).not.toContain('asyncHost');
			expect(source).not.toContain('querySelectorAll');
			expect(source).not.toContain('applyDomJournalEntries');
			expect(source).not.toContain('applyDomJournal');
		}
		expect(csrEntry).toContain("import { render } from 'arcade';");
		expect(csrEntry).not.toContain('resumeFromPayloadScripts');
		expect(vitePlusEntry).toContain("import { render } from 'arcade';");
		expect(vitePlusEntry).not.toContain('resumeFromPayloadScripts');
	});

	test('SSR fixtures do not contain app-authored render ceremony files', async () => {
		for (const path of [
			'vite-ssr/src/entry-client.ts',
			'vite-ssr/src/entry-server.ts',
			'vite-ssr/src/render-shell.ts',
			'vite-ssr-preloader/src/entry-client.ts',
			'vite-ssr-preloader/src/entry-server.ts',
			'vite-ssr-preloader/src/render-shell.ts',
		]) {
			await expect(readFixture(path)).rejects.toMatchObject({ code: 'ENOENT' });
		}
	});

	test('SSR fixture host renders the compiled TSRX artifact directly', async () => {
		const host = await readFixture('vite-ssr/src/dev-server.ts');

		expect(host).toContain('import { renderToString');
		expect(host).toContain("runner.import('/src/root.tsrx')");
		expect(host).toContain('renderToString(entry.default');
		expect(host).not.toContain('entry-client');
		expect(host).not.toContain('entry-server');
		expect(host).not.toContain('renderServerShell');
		expect(host).not.toContain('render-shell');
	});

	test('SSR fixture config keeps framework compilation out of app config', async () => {
		const config = await readFixture('vite-ssr/vite.config.ts');

		expect(config).not.toContain('node:fs');
		expect(config).not.toContain('compileTsrxModule');
		expect(config).not.toContain('ssrLoadModule');
		expect(config).not.toContain('transformIndexHtml');
		expect(config).not.toContain('renderServerShell');
		expect(config).not.toContain('consumer:');
		expect(config).not.toContain('outDir:');
		expect(config).not.toContain('entryFileNames:');
		expect(config).toContain("input: 'index.html'");
		expect(config).not.toContain("symbols: 'src/root.tsrx'");
		expect(config).toContain("input: 'src/root.tsrx'");
		expect(config).toContain("preserveEntrySignatures: 'exports-only'");
	});

	test('SSR fixture advertises an interactive dev command', async () => {
		const packageJson = JSON.parse(await readFixture('vite-ssr/package.json')) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts?.dev).toBe('vite --mode ssr');
	});

	test('SSR fixture advertises the real Vite app build command', async () => {
		const packageJson = JSON.parse(await readFixture('vite-ssr/package.json')) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts?.build).toBe('vite build --app');
	});

	test('SSR preview box uses built app output without rewriting preview HTML', async () => {
		const box = await readBox('ssr-preview.box.ts');

		expect(box).not.toContain('pathToFileURL');
		expect(box).not.toContain('nativeImport');
		expect(box).not.toContain('project.edit');
		expect(box).not.toContain('render?.');
		expect(box).not.toContain('serverHtml');
	});

	test('CSR fixture preview exposes browser script requests for size receipts', async () => {
		const config = await readFixture('vite-csr/vite.config.ts');

		expect(config).toContain('configurePreviewServer');
		expect(config).toContain('__arcade-fixture-requests');
		expect(config).toContain('isScriptRequest');
	});

	test('CSR preview box records startup and interaction runtime sizes', async () => {
		const box = await readBox('csr-preview.box.ts');

		expect(box).toContain('runtimeSizeReport');
		expect(box).toContain('CSR preloaded runtime size');
		expect(box).toContain('CSR interaction runtime size');
		expect(box).toContain('MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES = 0');
		expect(box).toContain('MAX_INTERACTION_SCRIPT_COUNT = 0');
	});
});

function readFixture(path: string): Promise<string> {
	return readFile(resolve(fixtureRoot, path), 'utf8');
}

function readBox(path: string): Promise<string> {
	return readFile(resolve(import.meta.dirname, '../boxes', path), 'utf8');
}
