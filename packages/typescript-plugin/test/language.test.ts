import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';
import {
	MARKLESS_TSRX_LANGUAGE_ID,
	getMarklessTsrxLanguagePlugin,
	isMarklessTsrxFile,
} from '../src/language.ts';
import { TsserverHarness } from './tsserver-harness.ts';

const require = createRequire(import.meta.url);

test('registers .tsrx through the Markless language plugin without mixed TSX parsing', () => {
	const plugin = getMarklessTsrxLanguagePlugin();

	expect(isMarklessTsrxFile('/workspace/src/App.tsrx')).toBe(true);
	expect(isMarklessTsrxFile('/workspace/src/App.tsx')).toBe(false);
	expect(plugin.getLanguageId?.('/workspace/src/App.tsrx')).toBe(MARKLESS_TSRX_LANGUAGE_ID);
	expect(
		plugin.createVirtualCode?.(
			'/workspace/src/App.tsrx',
			'typescriptreact',
			ts.ScriptSnapshot.fromString('export function App() @{}'),
		)?.languageId,
	).toBe(MARKLESS_TSRX_LANGUAGE_ID);
	expect(plugin.typescript?.extraFileExtensions).toEqual([
		{ extension: 'tsrx', isMixedContent: false, scriptKind: ts.ScriptKind.Deferred },
	]);
});

test('configures Zed to highlight .tsrx as TSX and load the workspace plugin', () => {
	const settings = JSON.parse(readFileSync('.zed/settings.json', 'utf8')) as any;
	const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8')) as any;

	expect(settings.file_types?.TSX).toEqual(['tsrx', '**/*.tsrx']);
	expect(settings.file_types?.TSRX).toBeUndefined();
	expect(tsconfig.include).toContain('packages/*/src/**/*.tsrx');
	expect(settings.lsp?.vtsls?.settings).toMatchObject({
		typescript: { tsdk: './node_modules/typescript/lib' },
		vtsls: { autoUseWorkspaceTsdk: true },
	});
	expect(settings.lsp?.vtsls?.settings?.vtsls?.tsserver?.globalPlugins).toEqual([
		{
			name: '@markless/typescript-plugin',
			location: './node_modules/@markless/typescript-plugin',
			languages: ['typescriptreact'],
			configNamespace: 'typescript',
		},
	]);
});

test('feeds TypeScript a virtual .tsx service script for TSRX source', () => {
	const plugin = getMarklessTsrxLanguagePlugin();
	const source = `
		import { state } from '@markless/core';

		export function Counter() @{
			let count = state(0);
			<button class="counter" onClick={() => count++}>{count}</button>
		}
	`;
	const fileName = join(process.cwd(), 'packages/core/src/Counter.tsrx');
	const virtualCode = plugin.createVirtualCode?.(
		fileName,
		MARKLESS_TSRX_LANGUAGE_ID,
		ts.ScriptSnapshot.fromString(source),
	);
	const serviceScript = virtualCode && plugin.typescript?.getServiceScript?.(virtualCode);

	expect(serviceScript).toMatchObject({ extension: '.tsx', scriptKind: ts.ScriptKind.TSX });
	expect(virtualCode?.generatedCode).toContain("import { state } from '@markless/core';");
	expect(virtualCode?.generatedCode).toContain('count++');
	expect(virtualCode?.generatedCode).toContain('return <button');
	expect(virtualCode?.generatedCode).not.toContain('react/jsx-runtime');
	expect(
		formatDiagnostics(
			typeCheckVirtualSource(fileName, virtualCode?.generatedCode ?? '', {
				noUnusedLocals: true,
			}),
		),
	).toEqual([]);
});

test('populates virtual code from the Markless compiler type-service artifact', () => {
	const plugin = getMarklessTsrxLanguagePlugin();
	const source = `import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<section>
		<button onClick={() => count++}>{count}</button>
		<style>.counter { color: red; }</style>
	</section>
}`;
	const fileName = join(process.cwd(), 'packages/core/src/App.tsrx');
	const virtualCode = plugin.createVirtualCode?.(
		fileName,
		MARKLESS_TSRX_LANGUAGE_ID,
		ts.ScriptSnapshot.fromString(source),
	) as any;

	expect(virtualCode?.sourceAst?.type).toBe('Program');
	expect(virtualCode?.usageErrors).toEqual([]);
	expect(virtualCode?.generatedCode).toContain('count++');
	expect(virtualCode?.generatedCode).toContain('<button');
	expect(virtualCode?.embeddedCodes[0]?.languageId).toBe('css');
	expect(virtualCode?.embeddedCodes[0]?.snapshot.getText(0, 100)).toContain('.counter');
});

test('package CommonJS entry is generated into dist instead of maintained in src', () => {
	ensureGeneratedCjsBuild();
	const packageJson = JSON.parse(
		readFileSync('packages/typescript-plugin/package.json', 'utf8'),
	) as any;

	expect(packageJson.main).toBe('./dist/index.cjs');
	expect(packageJson.exports['.'].require).toBe('./dist/index.cjs');
	expect(packageJson.scripts?.['build:cjs']).toContain('vp pack src/index.ts');
	expect(packageJson.publishConfig.exports['./jsx-runtime'].types).toBe(
		'./dist/markless-jsx.d.ts',
	);
	expect(existsSync('packages/typescript-plugin/dist/markless-jsx.d.ts')).toBe(true);
	expect(existsSync('packages/typescript-plugin/src/index.cjs')).toBe(false);
});

test('exports a generated CommonJS factory for tsserver plugin loading', () => {
	ensureGeneratedCjsBuild();
	const cjsPlugin = require('@markless/typescript-plugin') as any;
	const languagePlugin = cjsPlugin.__getMarklessTsrxLanguagePlugin?.();
	const virtualCode = languagePlugin?.createVirtualCode?.(
		join(process.cwd(), 'packages/core/src/App.tsrx'),
		MARKLESS_TSRX_LANGUAGE_ID,
		ts.ScriptSnapshot.fromString('export function App() @{ <span>ok</span> }'),
	) as any;

	expect(typeof cjsPlugin).toBe('function');
	expect(virtualCode?.sourceAst?.type).toBe('Program');
});

test('tsserver protocol opens configured .tsrx files without JSX or parser diagnostics', async () => {
	const result = await runTsrxTsserverProbe();

	expect(result.loadedPlugin).toBe(true);
	expect(result.results).toEqual([
		{ file: 'Counter.tsrx', syntactic: [], semantic: [] },
		{ file: 'NoImports.tsrx', syntactic: [], semantic: [] },
		{ file: 'Style.tsrx', syntactic: [], semantic: [] },
		{ file: 'List.tsrx', syntactic: [], semantic: [] },
		{ file: 'Control.tsrx', syntactic: [], semantic: [] },
	]);
}, 20_000);

function typeCheckVirtualSource(
	sourceFileName: string,
	source: string,
	options: ts.CompilerOptions = {},
): readonly ts.Diagnostic[] {
	const configPath = ts.findConfigFile('.', ts.sys.fileExists, 'tsconfig.json');
	if (!configPath) throw new Error('Expected root tsconfig.json.');

	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsedConfig = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		dirname(configPath),
	);
	const virtualPath = `${sourceFileName}.tsx`;
	const host = ts.createCompilerHost(parsedConfig.options);
	const fileExists = host.fileExists.bind(host);
	const readFile = host.readFile.bind(host);

	host.fileExists = (fileName) => fileName === virtualPath || fileExists(fileName);
	host.readFile = (fileName) => (fileName === virtualPath ? source : readFile(fileName));

	const program = ts.createProgram(
		[virtualPath],
		{ ...parsedConfig.options, jsx: ts.JsxEmit.Preserve, ...options },
		host,
	);
	return ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => diagnostic.file?.fileName === virtualPath);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
	return diagnostics.map((diagnostic) =>
		ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
	);
}

async function runTsrxTsserverProbe(): Promise<{
	loadedPlugin: boolean;
	results: Array<{ file: string; syntactic: unknown[]; semantic: unknown[] }>;
}> {
	ensureGeneratedCjsBuild();
	const root = process.cwd();
	const project = mkdtempSync(join(tmpdir(), 'markless-tsserver-project-'));
	const fixtures = [
		{
			name: 'Counter.tsrx',
			source: `import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<section>
		<button data-counter onClick={() => count++}>{count}</button>
		<span>hello</span>
	</section>
}`,
		},
		{
			name: 'NoImports.tsrx',
			source: `export function App() @{
	let count = 0;
	<button onClick={() => count++}>{count}</button>
}`,
		},
		{
			name: 'Style.tsrx',
			source: `export function App() @{
	<style>.counter { color: red; }</style>
	<section>hello</section>
}`,
		},
		{
			name: 'List.tsrx',
			source: `export function List({ items }: { items: { id: string; tag: string; active: boolean; select(index: number): void }[] }) @{
	@for (const item of items; index i; key item.id) {
		<{item.tag} class={item.active ? 'on' : 'off'} onClick={() => item.select(i)}>{item.id}</{item.tag}>
	} @empty {
		<span>None</span>
	}
}`,
		},
		{
			name: 'Control.tsrx',
			source: `export function Control({ ready, kind, pending, message, load }: { ready: boolean; kind: 'a' | 'b'; pending: string; message: string; load(): Promise<string> }) @{
	<section>
		@if (ready && kind === 'a') {
			<span>{message}</span>
		} @else {
			<span>{pending}</span>
		}
		@switch (kind) {
			@case 'a': { <span>{message.toUpperCase()}</span> }
			@default: { <span>{pending}</span> }
		}
		@try { <span>{load().then(Boolean)}</span> } @pending { <span>{pending}</span> } @catch (error) { <span>{error.message}</span> }
	</section>
}`,
		},
	];
	mkdirSync(join(project, 'node_modules/@markless/core'), { recursive: true });
	writeFileSync(
		join(project, 'node_modules/@markless/core/package.json'),
		JSON.stringify({ name: '@markless/core', version: '0.0.0', types: './index.d.ts' }),
	);
	writeFileSync(
		join(project, 'node_modules/@markless/core/index.d.ts'),
		'export declare function state<T>(initial: T): T;\n',
	);
	writeFileSync(
		join(project, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				lib: ['ES2022', 'DOM'],
				module: 'ESNext',
				moduleResolution: 'Bundler',
				noEmit: true,
				plugins: [{ name: '@markless/typescript-plugin' }],
				skipLibCheck: true,
				target: 'ES2022',
			},
			include: ['*.tsrx'],
		}),
	);
	for (const fixture of fixtures) writeFileSync(join(project, fixture.name), fixture.source);

	const server = new TsserverHarness({ project, workspaceRoot: root });
	try {
		const results = [];
		for (const fixture of fixtures) {
			const file = join(project, fixture.name);
			server.open(file);
			const syntactic = await server.syntacticDiagnosticsSync(file);
			const semantic = await server.semanticDiagnosticsSync(file);
			results.push({ file: fixture.name, syntactic, semantic });
		}
		const log = server.readLog();
		return { loadedPlugin: log.includes('@markless/typescript-plugin'), results };
	} finally {
		await server.close();
	}
}

let generatedCjsBuildReady = false;

function ensureGeneratedCjsBuild(): void {
	if (generatedCjsBuildReady) return;
	const result = spawnSync('pnpm', ['--dir', 'packages/typescript-plugin', 'run', 'build:cjs'], {
		cwd: process.cwd(),
		encoding: 'utf8',
	});
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
	generatedCjsBuildReady = true;
}
