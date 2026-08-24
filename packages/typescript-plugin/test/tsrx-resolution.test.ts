import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import typescript from 'typescript';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
	installMarklessTsrxModuleResolution,
	resolveMarklessTsrxModule,
} from '../src/resolution.ts';
import {
	TsserverHarness,
	copyFixtureProject,
	fixturePath,
	positionAtSearch,
	removeFixtureProject,
} from './tsserver-harness.ts';

/**
 * The editor path, driven end to end: a real tsserver with the Markless plugin installed,
 * against a project whose `.ts` files import `.tsrx` modules. No declaration file anywhere
 * in the fixture - resolution has to come from the plugin, or these go red with TS2307.
 */
const workspaceRoot = process.cwd();
const fixtureDirectory = resolve(
	workspaceRoot,
	'packages/typescript-plugin/test/fixtures/tsrx-resolution',
);
const MODULE_NOT_FOUND = 2307;

let project = '';
let server: TsserverHarness;

beforeAll(() => {
	ensureGeneratedCjsBuild();
	project = copyFixtureProject(fixtureDirectory, workspaceRoot);
	// The fixture must not smuggle in the very thing this proves unnecessary.
	expect(declarationFilesIn(fixtureDirectory)).toEqual([]);
	server = new TsserverHarness({ project, workspaceRoot, requestTimeoutMs: 30_000 });
}, 240_000);

afterAll(async () => {
	await server?.close();
	if (project) removeFixtureProject(project);
});

test('a .ts barrel re-exporting named parts from a .tsrx resolves with no diagnostics', async () => {
	const barrel = await openFixture('index.ts');

	expect(diagnosticSummary(barrel.semantic)).toEqual([]);
	expect(diagnosticSummary(barrel.syntactic)).toEqual([]);
}, 60_000);

test('a .ts consumer of the barrel sees each part real prop type', async () => {
	const consumer = await openFixture('consumer.ts');
	const rootHover = await server.quickinfo(
		consumer.file,
		positionAtSearch(consumer.source, 'typeof root', 'typeof '.length),
	);
	const itemHover = await server.quickinfo(
		consumer.file,
		positionAtSearch(consumer.source, 'typeof item', 'typeof '.length),
	);

	expect(diagnosticSummary(consumer.semantic)).toEqual([]);
	// The alias resolves to the authored component, typed by its own props file - not to
	// an ambient fallback, whose hover would name a renderable rather than PanelRootProps.
	expect(rootHover.displayString).toContain('PanelRootProps');
	expect(rootHover.displayString).toContain('PanelRoot');
	expect(itemHover.displayString).toContain('PanelItemProps');
	for (const hover of [rootHover, itemHover]) {
		expect(hover.displayString).not.toMatch(/\bany\b/);
		expect(hover.displayString).not.toMatch(/\bunknown\b/);
		expect(hover.displayString).not.toMatch(/CsrRenderable/);
	}
}, 60_000);

test('a .ts driver default-imports a scenario .tsrx and gets the component itself', async () => {
	const driver = await openFixture('driver.ts');
	const hover = await server.quickinfo(
		driver.file,
		positionAtSearch(driver.source, 'export const scenarios = [BasicPanel', 'export const scenarios = ['.length),
	);

	expect(diagnosticSummary(driver.semantic)).toEqual([]);
	expect(hover.displayString).toContain('BasicPanel');
	expect(hover.displayString).not.toMatch(/CsrRenderable/);
}, 60_000);

// Resolution that produced an `any`-shaped module would swallow both of these.
test('real types still go red: a mistyped prop and an export that does not exist', async () => {
	const mistyped = await openFixture('mistyped.ts');
	const codes = mistyped.semantic.map((diagnostic: any) => diagnostic.code).sort();

	expect(codes).not.toContain(MODULE_NOT_FOUND);
	// 2322: number is not the declared string heading. 2614: the module has no NotAPart, and
	// TypeScript can only suggest the default import instead because it read the real exports.
	expect(codes).toEqual([2322, 2614]);
}, 60_000);

test('the same resolution holds for a star re-export of an upper-case .tsrx module', async () => {
	const barrel = await openFixture('alternate/index.ts');
	const reader = await openFixture('alternate/reader.ts');
	const hover = await server.quickinfo(
		reader.file,
		positionAtSearch(reader.source, 'typeof MeterTrack', 'typeof '.length),
	);

	expect(diagnosticSummary(barrel.semantic)).toEqual([]);
	expect(diagnosticSummary(reader.semantic)).toEqual([]);
	expect(hover.displayString).toContain('MeterTrackProps');
}, 60_000);

// The Volar layer can only answer a `.tsrx` specifier when the project declares a TSRX
// compiler, which is what leaves a framework or app repo without one unable to resolve at all.
// The plugin's own resolution does not depend on that declaration: strip it and the barrel
// still resolves, with each part's real props type.
test('resolution holds in a project that declares no TSRX compiler', async () => {
	const bare = copyFixtureProject(fixtureDirectory, workspaceRoot);
	const configPath = fixturePath(bare, 'tsconfig.json');
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	delete config.tsrx;
	writeFileSync(configPath, JSON.stringify(config, null, 2));
	const bareServer = new TsserverHarness({
		project: bare,
		workspaceRoot,
		requestTimeoutMs: 30_000,
	});
	try {
		const file = fixturePath(bare, 'index.ts');
		const source = readFileSync(file, 'utf8');
		bareServer.open(file, source);
		const semantic = await bareServer.semanticDiagnosticsSync(file);
		const hover = await bareServer.quickinfo(
			file,
			positionAtSearch(source, 'PanelRoot as root'),
		);

		expect(diagnosticSummary(semantic)).toEqual([]);
		expect(hover.displayString).toContain('PanelRootProps');
	} finally {
		await bareServer.close();
		removeFixtureProject(bare);
	}
}, 60_000);

// Doc comments live in the gap between top-level statements, which the type-service emitter
// used to drop when it joined per-statement source slices.
test('a .ts consumer reads the doc comments authored above .tsrx declarations', async () => {
	const consumer = await openFixture('documented-consumer.ts');
	const componentHover = await server.quickinfo(
		consumer.file,
		positionAtSearch(consumer.source, 'export const panel = DocumentedPanel', 'export const panel = '.length),
	);
	const propsHover = await server.quickinfo(
		consumer.file,
		positionAtSearch(consumer.source, 'props: DocumentedProps', 'props: '.length),
	);
	const memberHover = await server.quickinfo(
		consumer.file,
		positionAtSearch(consumer.source, "{ heading: 'hello' }", '{ '.length),
	);

	expect(diagnosticSummary(consumer.semantic)).toEqual([]);
	expect(componentHover.documentation).toContain(
		'A panel whose authored documentation must survive the type-service lowering.',
	);
	expect(propsHover.documentation).toContain('Props for the documented panel.');
	expect(memberHover.documentation).toContain('Heading rendered at the top of the panel.');
}, 60_000);

test('resolution failure is still reported when the .tsrx module is absent', async () => {
	const file = fixturePath(project, 'absent.ts');
	writeFileSync(file, "import { Gone } from './scenarios/gone.tsrx';\nexport const gone = Gone;\n");
	server.open(file);
	const semantic = await server.semanticDiagnosticsSync(file);

	// Only a real file is resolved. A wildcard shim answered for every specifier, which is
	// how a typo used to type-check.
	expect(semantic.map((diagnostic: any) => diagnostic.code)).toContain(MODULE_NOT_FOUND);
}, 60_000);

// tsserver answers through resolveModuleNameLiterals, so that is the hook every test above
// exercises. A host still on the pre-5.0 resolveModuleNames shape is covered here instead.
test('the pre-5.0 resolveModuleNames shape is wrapped the same way', () => {
	const existing = fixturePath(project, 'panel.tsrx');
	const calls: string[][] = [];
	const host: any = {
		fileExists: (fileName: string) => fileName === existing,
		resolveModuleNames: (moduleNames: string[]) => {
			calls.push(moduleNames);
			return moduleNames.map(() => undefined);
		},
	};
	installMarklessTsrxModuleResolution(typescript, host);
	const containingFile = fixturePath(project, 'index.ts');
	const resolved = host.resolveModuleNames(
		['./panel.tsrx', './gone.tsrx', 'node:path'],
		containingFile,
	);

	expect(resolved[0]).toEqual({
		resolvedFileName: existing,
		extension: typescript.Extension.Tsx,
		isExternalLibraryImport: false,
	});
	// A .tsrx that is not on disk, and everything that is not .tsrx at all, stay the host's.
	expect(resolved[1]).toBeUndefined();
	expect(resolved[2]).toBeUndefined();
	expect(calls).toEqual([['./panel.tsrx', './gone.tsrx', 'node:path']]);
});

test('a bare package specifier is left to the host resolver', () => {
	const host: any = { fileExists: () => true };

	expect(
		resolveMarklessTsrxModule(typescript, host, '@markless/ui/checkbox.tsrx', '/app/src/a.ts'),
	).toBeUndefined();
	expect(
		resolveMarklessTsrxModule(typescript, host, './checkbox.tsx', '/app/src/a.ts'),
	).toBeUndefined();
	expect(
		resolveMarklessTsrxModule(typescript, host, './checkbox.tsrx', '/app/src/a.ts'),
	).toMatchObject({ resolvedFileName: '/app/src/checkbox.tsrx' });
});

async function openFixture(relativePath: string): Promise<{
	file: string;
	source: string;
	semantic: any[];
	syntactic: any[];
}> {
	const file = fixturePath(project, relativePath);
	const source = readFileSync(file, 'utf8');
	server.open(file);
	const syntactic = await server.syntacticDiagnosticsSync(file);
	const semantic = await server.semanticDiagnosticsSync(file);
	return { file, source, semantic, syntactic };
}

function diagnosticSummary(diagnostics: readonly any[]): string[] {
	return diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.text}`);
}

function declarationFilesIn(directory: string): string[] {
	const found = spawnSync('find', [directory, '-name', '*.d.ts'], { encoding: 'utf8' });
	return found.stdout.split('\n').filter(Boolean);
}

// Mirrors language.test.ts: the CJS build is shared by every file that spawns tsserver, and
// build:cjs opens by deleting dist/, so one lock per run keeps workers from wiping it.
const cjsBuildLockDir = join(
	tmpdir(),
	`markless-tsplugin-cjs-${process.env.MARKLESS_TSPLUGIN_CJS_BUILD_RUN ?? process.ppid}`,
);
let generatedCjsBuildReady = false;

function ensureGeneratedCjsBuild(): void {
	if (generatedCjsBuildReady) return;
	const builtMarker = join(cjsBuildLockDir, 'built');
	const deadline = Date.now() + 120_000;
	while (!existsSync(builtMarker)) {
		try {
			mkdirSync(cjsBuildLockDir);
		} catch {
			if (Date.now() > deadline) {
				throw new Error(`Timed out waiting for the shared build at ${cjsBuildLockDir}.`);
			}
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
			continue;
		}
		try {
			const result = spawnSync(
				'pnpm',
				['--dir', 'packages/typescript-plugin', 'run', 'build:cjs'],
				{ cwd: process.cwd(), encoding: 'utf8' },
			);
			expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
			writeFileSync(builtMarker, '');
		} catch (error) {
			rmSync(cjsBuildLockDir, { recursive: true, force: true });
			throw error;
		}
	}
	generatedCjsBuildReady = true;
}
