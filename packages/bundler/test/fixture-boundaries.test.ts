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
		importLine: "import { state, computed } from 'arcade';",
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
		const ssrEntry = await readFixture('vite-ssr/src/entry-client.ts');

		for (const source of [csrEntry, vitePlusEntry, ssrEntry]) {
			expect(source).not.toContain('data-async-host');
			expect(source).not.toContain('asyncHost');
			expect(source).not.toContain('querySelectorAll');
			expect(source).not.toContain('applyDomJournalEntries');
			expect(source).not.toContain('applyDomJournal');
		}
		expect(csrEntry).toContain("import { render } from 'arcade/runtime/render';");
		expect(csrEntry).toContain('createRoot');
		expect(csrEntry).not.toContain('const counter = document.createElement');
		expect(csrEntry).not.toContain('resumeFromPayloadScripts');
		expect(vitePlusEntry).toContain("import { render } from 'arcade/runtime/render';");
		expect(vitePlusEntry).toContain('createRoot');
		expect(vitePlusEntry).not.toContain('const host = document.createElement');
		expect(vitePlusEntry).not.toContain('resumeFromPayloadScripts');
		expect(ssrEntry).toContain(
			"import { resumeEventOnlyFromPayloadDocument } from 'arcade/runtime/event-only-resume';",
		);
		expect(ssrEntry).toContain('export async function resumeContainerEvent');
		expect(ssrEntry).toContain('eventRecord');
		expect(ssrEntry).not.toContain('__asyncResumeRuntimeStarted');
		expect(ssrEntry).not.toContain('syncPolicyAlreadyApplied: true');
		expect(ssrEntry).not.toContain('await resumeFromPayloadDocument');
		expect(ssrEntry).not.toContain('arcade/runtime/resume');
	});

	test('server entry renders the generated TSRX output instead of a handwritten shell', async () => {
		const entryServer = await readFixture('vite-ssr/src/entry-server.ts');
		const root = await readFixture('vite-ssr/src/root.tsrx');

		expect(entryServer).not.toContain('data-async-host');
		expect(entryServer).not.toContain('hostId');
		expect(entryServer).toContain('renderToString');
		expect(entryServer).toContain('arcade/runtime/render-to-string');
		expect(entryServer).toContain('renderToStringInput');
		expect(entryServer).not.toContain('renderServerShell');
		expect(entryServer).not.toContain("from './render-shell");
		expect(entryServer).not.toContain('<button');
		expect(entryServer).not.toContain('<span>hello</span>');
		expect(entryServer).not.toContain("from 'arcade/runtime/render'");
		expect(entryServer).toContain('resumeModuleUrl');
		expect(root).toContain('data-counter');
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
		expect(config).toContain("index: 'index.html'");
		expect(config).toContain("resume: 'src/entry-client.ts'");
		expect(config).toContain("input: 'src/entry-server.ts'");
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
		expect(box).toContain('CSR startup runtime size');
		expect(box).toContain('CSR interaction runtime size');
		expect(box).toContain('MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES = 0');
		expect(box).toContain('MAX_INTERACTION_SCRIPT_COUNT = 1');
	});
});

function readFixture(path: string): Promise<string> {
	return readFile(resolve(fixtureRoot, path), 'utf8');
}

function readBox(path: string): Promise<string> {
	return readFile(resolve(import.meta.dirname, '../boxes', path), 'utf8');
}
