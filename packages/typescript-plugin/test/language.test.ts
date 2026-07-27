import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { beforeAll, expect, test } from 'vitest';
import {
	MARKLESS_TSRX_LANGUAGE_ID,
	MARKLESS_TSRX_PARSE_ERROR_CODE,
	MarklessTsrxVirtualCode,
	clampMarklessDiagnosticStart,
	getMarklessTsrxParseFailure,
	isMarklessTsrxFile,
} from '../src/language.ts';
import { TsserverHarness } from './tsserver-harness.ts';

const require = createRequire(import.meta.url);

// Registering .tsrx with Volar - the language id, the extra file extension and its script
// kind - is @tsrx/typescript-plugin's job now, so there is no Markless registration object
// left to assert on. What src/index.ts still decides for itself is which files are Markless
// TSRX at all: every hook it layers on the host is gated on this predicate.
test('recognizes .tsrx as Markless TSRX and leaves other extensions alone', () => {
	expect(isMarklessTsrxFile('/workspace/src/App.tsrx')).toBe(true);
	expect(isMarklessTsrxFile('/workspace/src/App.tsx')).toBe(false);
	expect(isMarklessTsrxFile('/workspace/src/App.ts')).toBe(false);
	expect(isMarklessTsrxFile({ fsPath: 'C:\\workspace\\src\\App.tsrx' })).toBe(true);
	expect(
		new MarklessTsrxVirtualCode(
			'/workspace/src/App.tsrx',
			ts.ScriptSnapshot.fromString('export function App() @{}'),
		).languageId,
	).toBe(MARKLESS_TSRX_LANGUAGE_ID);
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

test('compiles TSRX source into type-checkable TSX for TypeScript', () => {
	const source = `
		import { state } from '@markless/core';

		export function Counter() @{
			let count = state(0);
			<button class="counter" onClick={() => count++}>{count}</button>
		}
	`;
	const fileName = join(process.cwd(), 'packages/core/src/Counter.tsrx');
	const virtualCode = new MarklessTsrxVirtualCode(fileName, ts.ScriptSnapshot.fromString(source));

	expect(virtualCode.generatedCode).toContain("import { state } from '@markless/core';");
	expect(virtualCode.generatedCode).toContain('count++');
	expect(virtualCode.generatedCode).toContain('return <button');
	expect(virtualCode.generatedCode).not.toContain('react/jsx-runtime');
	// The generated document is what every mapped editor answer is resolved against, so it
	// has to type-check as TSX on its own - a scaffolding diagnostic here would surface to
	// the user on a file they wrote correctly.
	expect(
		formatDiagnostics(
			typeCheckVirtualSource(fileName, virtualCode.generatedCode, {
				noUnusedLocals: true,
			}),
		),
	).toEqual([]);
});

test('populates virtual code from the Markless compiler type-service artifact', () => {
	const source = `import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<section>
		<button onClick={() => count++}>{count}</button>
		<style>.counter { color: red; }</style>
	</section>
}`;
	const fileName = join(process.cwd(), 'packages/core/src/App.tsrx');
	const virtualCode = new MarklessTsrxVirtualCode(
		fileName,
		ts.ScriptSnapshot.fromString(source),
	) as any;

	expect(virtualCode?.sourceAst?.type).toBe('Program');
	expect(virtualCode?.usageErrors).toEqual([]);
	expect(virtualCode?.generatedCode).toContain('count++');
	expect(virtualCode?.generatedCode).toContain('<button');
	expect(virtualCode?.embeddedCodes[0]?.languageId).toBe('css');
	expect(virtualCode?.embeddedCodes[0]?.snapshot.getText(0, 100)).toContain('.counter');
});

test.each([
	{
		name: 'a stray greater-than token after a closing tag',
		good: 'export function Controls() @{ <button>Save</button> }',
		broken: 'export function Controls() @{ <button>Save</button>> }',
		expectedPosition(source: string) {
			return source.indexOf('</button>>') + '</button>'.length;
		},
	},
	{
		name: 'an alternate element with a mismatched closing tag',
		good: 'export function Notice() @{ <article><strong>Ready</strong></article> }',
		broken: 'export function Notice() @{ <article>Waiting</section> }',
		expectedPosition(source: string) {
			return source.indexOf('</section>');
		},
	},
])(
	'records $name without replacing the last-good virtual document',
	({ good, broken, expectedPosition }) => {
		const fileName = join(process.cwd(), `packages/core/src/parse-failure-${good.length}.tsrx`);
		const virtualCode = new MarklessTsrxVirtualCode(
			fileName,
			ts.ScriptSnapshot.fromString(good),
		);
		const lastGoodGeneratedCode = virtualCode.generatedCode;
		const lastGoodSnapshot = virtualCode.snapshot;

		virtualCode.update(ts.ScriptSnapshot.fromString(broken));

		expect(getMarklessTsrxParseFailure(fileName)).toMatchObject({
			message: expect.any(String),
			pos: expectedPosition(broken),
		});
		expect(virtualCode.generatedCode).toBe(lastGoodGeneratedCode);
		expect(virtualCode.snapshot).toBe(lastGoodSnapshot);
		expect(virtualCode.snapshot.getText(0, virtualCode.snapshot.getLength())).toBe(
			lastGoodGeneratedCode,
		);

		virtualCode.update(ts.ScriptSnapshot.fromString(good));
		expect(getMarklessTsrxParseFailure(fileName)).toBeUndefined();
	},
);

test('finds and clears parse failures across file-name casing and separators', () => {
	const fileName = join(process.cwd(), 'packages/core/src/Canonical-Failure.tsrx');
	const good = 'export function Notice() @{ <article>Ready</article> }';
	const broken = 'export function Notice() @{ <article>Waiting</section> }';
	const virtualCode = new MarklessTsrxVirtualCode(fileName, ts.ScriptSnapshot.fromString(good));
	const alternateFileNames = [fileName.toUpperCase(), fileName.replaceAll('/', '\\')];

	virtualCode.update(ts.ScriptSnapshot.fromString(broken));
	for (const alternateFileName of alternateFileNames) {
		expect(getMarklessTsrxParseFailure(alternateFileName)).toMatchObject({
			message: expect.any(String),
			pos: broken.indexOf('</section>'),
		});
	}

	virtualCode.update(ts.ScriptSnapshot.fromString(good));
	for (const alternateFileName of alternateFileNames) {
		expect(getMarklessTsrxParseFailure(alternateFileName)).toBeUndefined();
	}
});

test('clamps a parse diagnostic start to both current source lengths', () => {
	expect(clampMarklessDiagnosticStart(20, 12, 8)).toBe(8);
	expect(clampMarklessDiagnosticStart(-4, 12, 8)).toBe(0);
	expect(clampMarklessDiagnosticStart(6, 12, undefined)).toBe(6);
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

	// TypeScript's plugin loader requires the module itself to be callable and loads the
	// plugin as a silent no-op when it is not, so this is the contract that decides whether
	// any Markless editor behaviour runs at all.
	expect(typeof cjsPlugin).toBe('function');
});

test('the CommonJS volar entry compiles TSRX the way the host reaches it', () => {
	ensureGeneratedCjsBuild();
	// @tsrx/typescript-plugin resolves the tsconfig `tsrx.compiler` declaration and requires
	// this subpath - it is the only seam through which upstream reaches the Markless
	// compiler, so the packaged CommonJS build has to answer on it.
	const compileToVolarMappings = (require('@markless/typescript-plugin/volar') as any)
		.compileToVolarMappings;
	const compiled = compileToVolarMappings(
		'export function App() @{ <span>ok</span> }',
		join(process.cwd(), 'packages/core/src/App.tsrx'),
		{ loose: true },
	);

	expect(typeof compileToVolarMappings).toBe('function');
	expect(compiled.sourceAst?.type).toBe('Program');
	expect(compiled.code).toContain('<span>ok</span>');
	expect(compiled.mappings.length).toBeGreaterThan(0);
});

test('tsserver protocol opens configured .tsrx files without JSX or parser diagnostics', async () => {
	const result = await runTsrxTsserverProbe();

	expect(result.loadedPlugin).toBe(true);
	expect(result.loadedContract).toBe(true);
	expect(result.results).toEqual([
		{ file: 'Counter.tsrx', syntactic: [], semantic: [] },
		{ file: 'NoImports.tsrx', syntactic: [], semantic: [] },
		{ file: 'Style.tsrx', syntactic: [], semantic: [] },
		{ file: 'List.tsrx', syntactic: [], semantic: [] },
		{ file: 'Control.tsrx', syntactic: [], semantic: [] },
	]);
}, 20_000);

test('a project that also lists the nested upstream plugin installs Markless behaviour once', async () => {
	const result = await runDoubleRegistrationProbe();

	expect(result.loadedMarklessPlugin).toBe(true);
	expect(result.loadedUpstreamPlugin).toBe(true);
	// Both plugin entries decorate the same language service host. If the Markless
	// wrapper installed its hooks a second time on top of the short-circuited upstream
	// service, its parse diagnostic would be appended twice for the same file.
	expect(result.parseErrorCount).toBe(1);
	expect(result.cleanFileParseErrorCount).toBe(0);
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
	loadedContract: boolean;
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
	// The nested upstream plugin resolves the tsconfig `tsrx.compiler` specifier from the
	// project directory, exactly as a real Markless app does.
	symlinkSync(
		join(root, 'packages/typescript-plugin'),
		join(project, 'node_modules/@markless/typescript-plugin'),
		'dir',
	);
	writeFileSync(
		join(project, 'tsconfig.json'),
		JSON.stringify({
			tsrx: { compiler: '@markless/typescript-plugin/volar' },
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
		return {
			loadedPlugin: log.includes('@markless/typescript-plugin'),
			loadedContract: log.includes('markless-jsx.d.ts'),
			results,
		};
	} finally {
		await server.close();
	}
}

// A consumer who copies upstream's README ends up listing @tsrx/typescript-plugin next to
// @markless/typescript-plugin. Upstream is loaded first here so that the Markless wrapper
// takes the branch where its nested upstream create() short-circuits on the already
// decorated host and hands back the language service untouched.
async function runDoubleRegistrationProbe(): Promise<{
	loadedMarklessPlugin: boolean;
	loadedUpstreamPlugin: boolean;
	parseErrorCount: number;
	cleanFileParseErrorCount: number;
}> {
	ensureGeneratedCjsBuild();
	const root = process.cwd();
	const project = mkdtempSync(join(tmpdir(), 'markless-double-registration-'));
	mkdirSync(join(project, 'node_modules/@markless'), { recursive: true });
	symlinkSync(
		join(root, 'packages/typescript-plugin'),
		join(project, 'node_modules/@markless/typescript-plugin'),
		'dir',
	);
	writeFileSync(
		join(project, 'tsconfig.json'),
		JSON.stringify({
			tsrx: { compiler: '@markless/typescript-plugin/volar' },
			compilerOptions: {
				lib: ['ES2022', 'DOM'],
				module: 'ESNext',
				moduleResolution: 'Bundler',
				noEmit: true,
				plugins: [
					{ name: '@tsrx/typescript-plugin' },
					{ name: '@markless/typescript-plugin' },
				],
				skipLibCheck: true,
				target: 'ES2022',
			},
			include: ['*.tsrx'],
		}),
	);
	writeFileSync(
		join(project, 'Broken.tsrx'),
		'export function Broken() @{\n\t<button>Save</button>>\n}\n',
	);
	writeFileSync(
		join(project, 'Clean.tsrx'),
		'export function Clean() @{\n\t<span>ok</span>\n}\n',
	);

	const server = new TsserverHarness({
		project,
		workspaceRoot: root,
		globalPlugins: ['@tsrx/typescript-plugin', '@markless/typescript-plugin'],
		pluginProbeLocations: [
			join(root, 'packages/typescript-plugin/node_modules'),
			join(root, 'node_modules'),
		],
	});
	try {
		const brokenFile = join(project, 'Broken.tsrx');
		const cleanFile = join(project, 'Clean.tsrx');
		server.open(brokenFile);
		server.open(cleanFile);
		const brokenDiagnostics = await server.syntacticDiagnosticsSync(brokenFile);
		const cleanDiagnostics = await server.syntacticDiagnosticsSync(cleanFile);
		const log = server.readLog();
		return {
			loadedMarklessPlugin: log.includes('@markless/typescript-plugin'),
			loadedUpstreamPlugin: log.includes('@tsrx/typescript-plugin'),
			parseErrorCount: countMarklessParseErrors(brokenDiagnostics),
			cleanFileParseErrorCount: countMarklessParseErrors(cleanDiagnostics),
		};
	} finally {
		await server.close();
	}
}

function countMarklessParseErrors(diagnostics: readonly any[]): number {
	return diagnostics.filter(
		(diagnostic) =>
			diagnostic.source === 'markless' && diagnostic.code === MARKLESS_TSRX_PARSE_ERROR_CODE,
	).length;
}

let generatedCjsBuildReady = false;

// Five tests need the generated CommonJS build. Running it lazily inside
// whichever test happened to run first meant that test paid the whole build
// cost against the default 5s timeout, and it began timing out in CI at 5346ms
// once the ./volar entry made build:cjs two `vp pack` passes instead of one.
// It kept passing locally only because dist/ was already warm. Hoisting it into
// beforeAll gives the build its own generous budget and stops the cost landing
// on an arbitrary test.
beforeAll(() => {
	ensureGeneratedCjsBuild();
}, 180_000);

function ensureGeneratedCjsBuild(): void {
	if (generatedCjsBuildReady) return;
	const result = spawnSync('pnpm', ['--dir', 'packages/typescript-plugin', 'run', 'build:cjs'], {
		cwd: process.cwd(),
		encoding: 'utf8',
	});
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
	generatedCjsBuildReady = true;
}
