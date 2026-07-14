import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
	TsserverHarness,
	copyFixtureProject,
	fixturePath,
	positionAfterMarker,
	positionAtSearch,
	removeFixtureProject,
	sourceWithoutMarkers,
} from './tsserver-harness.ts';

const workspaceRoot = process.cwd();
const fixtureDirectory = resolve(
	workspaceRoot,
	'packages/typescript-plugin/test/fixtures/completion-matrix',
);
const corePlugin = '@markless/typescript-plugin';
const routerPlugin = '@markless/router/typescript-plugin';

let project = '';
let server: TsserverHarness;

beforeAll(() => {
	const builtPlugin = resolve(workspaceRoot, 'packages/typescript-plugin/dist/index.cjs');
	expect(
		existsSync(builtPlugin),
		'Matrix setup requires the built core CJS plugin. Run pnpm --dir packages/typescript-plugin test:completion-matrix.',
	).toBe(true);
	project = copyFixtureProject(fixtureDirectory, workspaceRoot);
	server = new TsserverHarness({ project, workspaceRoot, globalPlugins: [corePlugin] });
}, 20_000);

afterAll(async () => {
	await server?.close();
	if (project) removeFixtureProject(project);
});

test('M1 real tsserver completes and hovers Markless framework APIs', async () => {
	const fixture = openFixture('framework.tsrx');
	const completion = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M1_IMPORT*/'),
	);
	const names = completionNames(completion);
	expect(
		names,
		'M1 missing capability: real tsserver must complete state and computed from the real @markless/core declarations in .tsrx.',
	).toEqual(expect.arrayContaining(['state', 'computed']));

	const stateInfo = await server.quickinfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M1_STATE*/'),
	);
	const computedInfo = await server.quickinfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M1_COMPUTED*/'),
	);
	expect(
		displayText(stateInfo),
		'M1 missing capability: state hover must preserve its generic (initial: T) => T type.',
	).toContain('state<T>(initial: T): T');
	expect(
		displayText(computedInfo),
		'M1 missing capability: computed hover must preserve its generic derived-value type.',
	).toMatch(/computed<T>\(derive: \(\) => T\).*AsyncComputedValue<T>/);
}, 20_000);

test('M2 real tsserver completes members through state() and computed() inference', async () => {
	const fixture = openFixture('framework.tsrx');
	const stateCompletion = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M2_STATE*/'),
	);
	const computedCompletion = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M2_COMPUTED*/'),
	);
	expect(
		completionNames(stateCompletion),
		'M2 missing capability: state() object inference must expose title and count after a member dot.',
	).toEqual(expect.arrayContaining(['title', 'count']));
	expect(
		completionNames(computedCompletion),
		'M2 missing capability: computed() inference must expose summary and doubled after a member dot.',
	).toEqual(expect.arrayContaining(['summary', 'doubled']));
}, 20_000);

test('M3 real tsserver serves DOM, standard-library, local, generic, hover, and semantic-diagnostic behavior', async () => {
	const fixture = openFixture('typescript.tsrx');
	const dom = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M3_DOM*/'),
	);
	const standardLibrary = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M3_STDLIB*/'),
	);
	const local = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M3_LOCAL*/'),
	);
	const generic = await server.quickinfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M3_GENERIC*/'),
	);
	const diagnostics = await server.semanticDiagnosticsSync(fixture.file);
	// PM adjudication (T004): TS2322 anchors on the declared variable name, not the
	// string initializer — anchor where TypeScript actually reports it.
	const errorAnchor = positionAtSearch(fixture.source, 'deliberateTypeError');

	expect(
		completionNames(dom),
		'M3 missing capability: DOM member completions must survive TSRX mapping.',
	).toContain('createElement');
	expect(
		completionNames(standardLibrary),
		'M3 missing capability: standard-library array completions must survive TSRX mapping.',
	).toEqual(expect.arrayContaining(['map', 'filter']));
	expect(
		completionNames(local),
		'M3 missing capability: local declarations must complete inside a .tsrx component body.',
	).toContain('identity');
	// PM adjudication (T004): hovering a generic call site shows TypeScript's
	// INSTANTIATED signature (real TS behavior); asserting it still proves hover
	// maps through the .tsrx virtual code on a generic call.
	expect(
		displayText(generic),
		'M3 missing capability: quickinfo must preserve the local generic function signature.',
	).toContain('identity<"typed">(value: "typed"): "typed"');
	expect(
		diagnostics,
		'M3 missing capability: the deliberate string-to-number error must surface at its mapped .tsrx source position.',
	).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				start: expect.objectContaining(errorAnchor),
				text: expect.stringMatching(/not assignable to type 'number'/),
			}),
		]),
	);
}, 20_000);

test('M4 real tsserver returns only context-valid TSRX @ construct completions', async () => {
	const fixture = openFixture('constructs.tsrx');
	const base = ['@{', '@if', '@for', '@switch', '@try'];
	const contexts = [
		{ marker: '/*M4_BODY*/', included: base, excluded: branchEntries },
		{
			marker: '/*M4_AFTER_IF*/',
			included: [...base, '@else'],
			excluded: branchEntries.filter((name) => name !== '@else'),
		},
		{
			marker: '/*M4_AFTER_FOR*/',
			included: [...base, '@empty'],
			excluded: branchEntries.filter((name) => name !== '@empty'),
		},
		{
			marker: '/*M4_IN_SWITCH*/',
			included: ['@case', '@default'],
			excluded: ['@else', '@empty', '@pending', '@catch'],
		},
		{
			// PM adjudication (T004): the tsrx grammar REQUIRES @pending/@catch after a
			// @try block (verified: '@try {} @if ...' throws 'Missing @catch or @pending').
			// Offering base constructs there would insert invalid code.
			marker: '/*M4_AFTER_TRY*/',
			included: ['@pending', '@catch'],
			excluded: [...base, '@else', '@empty', '@case', '@default'],
		},
	] as const;

	for (const context of contexts) {
		const position = positionAfterMarker(fixture.marked, context.marker);
		const completion = await server.completionInfo(fixture.file, position);
		const names = completionNames(completion).filter((name) => name.startsWith('@'));
		expect(
			names,
			`M4 missing capability: ${context.marker} must offer its context-valid TSRX constructs.`,
		).toEqual(expect.arrayContaining([...context.included]));
		for (const excluded of context.excluded) {
			expect(
				names,
				`M4 invalid capability: ${excluded} must not be offered at ${context.marker}.`,
			).not.toContain(excluded);
		}

		const entries = completionEntries(completion).filter((entry) =>
			context.included.includes(entry.name as never),
		);
		const details = await server.completionEntryDetails(
			fixture.file,
			position,
			entries.map(({ name, source, data }) => ({ name, source, data })),
		);
		for (const expectedName of context.included) {
			const entry = entries.find((candidate) => candidate.name === expectedName);
			expect(
				entry?.isSnippet,
				`M4 missing capability: ${expectedName} must be a snippet completion.`,
			).toBe(true);
			expect(
				entry?.insertText,
				`M4 missing capability: ${expectedName} must carry snippet insertion text.`,
			).toMatch(/\$\{?\d/);
			// PM adjudication (T004): the tsserver protocol converts replacementSpan to
			// {start:{line,offset}, end:{line,offset}} — assert the same one-character
			// intent in protocol shape.
			const span = entry?.replacementSpan;
			expect(
				span && span.end.line === span.start.line && span.end.offset - span.start.offset,
				`M4 missing capability: ${expectedName} must replace the typed @ prefix.`,
			).toBe(1);
			expect(
				details?.some((detail: any) => detail.name === expectedName),
				`M4 missing capability: completionEntryDetails must resolve ${expectedName}.`,
			).toBe(true);
		}
	}

	for (const marker of ['/*M4_EXPRESSION*/', '/*M4_MODULE*/']) {
		const completion = await server.completionInfo(
			fixture.file,
			positionAfterMarker(fixture.marked, marker),
		);
		expect(
			completionNames(completion).filter((name) => name.startsWith('@')),
			`M4 invalid capability: TSRX constructs must not be offered at ${marker}.`,
		).toEqual([]);
	}
}, 30_000);

test('M5 real tsserver resolves and defines cross-file .tsrx imports', async () => {
	const fixture = openFixture('imports.tsrx');
	const completion = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M5_IMPORT*/'),
	);
	const definition = await server.definitionAndBoundSpan(
		fixture.file,
		positionAfterMarker(fixture.marked, '/*M5_DEFINITION*/'),
	);
	expect(
		completionNames(completion),
		'M5 missing capability: named exports from ./Nav.tsrx must complete at the real import site.',
	).toEqual(expect.arrayContaining(['Nav', 'navLabel']));
	expect(
		definition?.definitions?.map((item: any) => realpathSync(item.file)),
		'M5 missing capability: Nav definition must land in the imported Nav.tsrx source file.',
	).toContain(realpathSync(fixturePath(project, 'Nav.tsrx')));
}, 20_000);

test('M6 real tsserver preserves member completion immediately after a freshly typed dot', async () => {
	const fixture = openFixture('dot-stitch.tsrx');
	const dot = positionAfterMarker(fixture.marked, '/*M6_DOT*/');
	server.change(fixture.file, dot, dot, '.');
	const completion = await server.completionInfo(fixture.file, {
		line: dot.line,
		offset: dot.offset + 1,
	});
	expect(
		completionNames(completion),
		'M6 missing capability: a freshly typed dot must stitch to the loose compile and preserve profile member completions.',
	).toEqual(expect.arrayContaining(['displayName', 'active']));
}, 20_000);

test('M7a real tsserver activates built core and router CJS plugins together and exposes route href completions', async () => {
	const dualProject = copyFixtureProject(fixtureDirectory, workspaceRoot);
	const dualServer = new TsserverHarness({
		project: dualProject,
		workspaceRoot,
		globalPlugins: [corePlugin, routerPlugin],
	});
	try {
		const fixture = openFixture('router.tsrx', dualProject, dualServer);
		const coreInfo = await dualServer.quickinfo(
			fixture.file,
			positionAfterMarker(fixture.marked, '/*M7_CORE*/'),
		);
		const routeCompletion = await dualServer.completionInfo(
			fixture.file,
			positionAfterMarker(fixture.marked, '/*M7_ROUTE*/'),
		);
		const log = dualServer.readLog();

		expect(
			displayText(coreInfo),
			'M7a missing capability: the built core CJS plugin must answer a mapped .tsrx quickinfo request during dual activation.',
		).toContain('(property) ready: boolean');
		expect(
			completionNames(routeCompletion),
			'M7a missing capability: the built router CJS plugin must add the /library route completion behaviorally.',
		).toContain('/library');
		expect(
			log,
			'M7a missing capability: the router must log successful initialization, not merely appear by package name.',
		).toContain('[markless-router] TypeScript plugin loaded');
		expect(
			pluginResolutionErrors(log, [corePlugin, routerPlugin]),
			'M7a missing capability: both built CJS plugins must initialize without resolution errors.',
		).toEqual([]);
	} finally {
		await dualServer.close();
		removeFixtureProject(dualProject);
	}
}, 20_000);

test('M7b VSIX manifest exposes markless-tsrx to both plugins and enables workspace TypeScript', () => {
	const manifestPath = resolve(workspaceRoot, 'packages/vscode-plugin/package.json');
	expect(
		existsSync(manifestPath),
		'M7b missing capability: packages/vscode-plugin/package.json does not exist.',
	).toBe(true);
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as any;
	const language = manifest.contributes?.languages?.find(
		(item: any) => item.id === 'markless-tsrx',
	);
	expect(
		language,
		'M7b missing capability: contributes.languages must register markless-tsrx.',
	).toMatchObject({
		id: 'markless-tsrx',
		extensions: ['.tsrx'],
		icon: { light: expect.any(String), dark: expect.any(String) },
	});
	expect(
		manifest.contributes?.typescriptServerPlugins,
		'M7b missing capability: both tsserver plugins must be exposed to workspace TypeScript.',
	).toEqual([
		{
			name: corePlugin,
			enableForWorkspaceTypeScriptVersions: true,
			languages: ['markless-tsrx'],
		},
		{
			name: routerPlugin,
			enableForWorkspaceTypeScriptVersions: true,
			languages: ['markless-tsrx'],
		},
	]);
	expect(
		manifest.engines?.vscode,
		'M7b missing capability: VS Code engine floor is fixed by T002.',
	).toBe('^1.128.0');
});

test('M7c packaged VSIX contains and can require both extension-local plugin entries', () => {
	const extensionDirectory = resolve(workspaceRoot, 'packages/vscode-plugin');
	expect(
		existsSync(extensionDirectory),
		'M7c missing capability: packages/vscode-plugin does not exist, so no packaged VSIX can be inspected.',
	).toBe(true);
	const vsix = findVsix(extensionDirectory);
	expect(
		vsix,
		'M7c missing capability: no built .vsix exists; run pnpm --dir packages/vscode-plugin package:vsix.',
	).toBeDefined();

	const extracted = mkdtempSync(join(tmpdir(), 'markless-vsix-matrix-'));
	try {
		const unzip = spawnSync('unzip', ['-q', vsix!, '-d', extracted], { encoding: 'utf8' });
		expect(
			unzip.status,
			`M7c harness could not extract ${vsix}: ${unzip.stderr || unzip.stdout}`,
		).toBe(0);
		const extensionRoot = join(extracted, 'extension');
		const extensionRequire = createRequire(join(extensionRoot, 'package.json'));
		for (const pluginName of [corePlugin, routerPlugin]) {
			const entry = extensionRequire.resolve(pluginName);
			expect(
				realpathSync(entry).startsWith(`${realpathSync(extensionRoot)}/`),
				`M7c missing capability: ${pluginName} must resolve inside the extracted extension/node_modules tree.`,
			).toBe(true);
			expect(
				typeof extensionRequire(pluginName),
				`M7c missing capability: extracted extension-local ${pluginName} must be require()-able without repository node_modules.`,
			).toBe('function');
		}
	} finally {
		rmSync(extracted, { recursive: true, force: true });
	}
});

const branchEntries = ['@else', '@empty', '@case', '@default', '@pending', '@catch'];

function openFixture(
	name: string,
	fixtureProject = project,
	fixtureServer = server,
): { file: string; marked: string; source: string } {
	const file = fixturePath(fixtureProject, name);
	const marked = readFileSync(file, 'utf8');
	const source = sourceWithoutMarkers(marked);
	fixtureServer.open(file, source);
	return { file, marked, source };
}

function completionEntries(completion: any): any[] {
	return Array.isArray(completion?.entries) ? completion.entries : [];
}

function completionNames(completion: any): string[] {
	return completionEntries(completion).map((entry) => entry.name);
}

function displayText(info: any): string {
	return info?.displayString ?? info?.displayParts?.map((part: any) => part.text).join('') ?? '';
}

function pluginResolutionErrors(log: string, pluginNames: readonly string[]): string[] {
	return log
		.split('\n')
		.filter(
			(line) =>
				/(failed|error|exception)/i.test(line) &&
				pluginNames.some((pluginName) => line.includes(pluginName)),
		);
}

function findVsix(extensionDirectory: string): string | undefined {
	const candidates = [extensionDirectory, join(extensionDirectory, 'dist')];
	for (const directory of candidates) {
		if (!existsSync(directory)) continue;
		const file = readdirSync(directory).find((name) => name.endsWith('.vsix'));
		if (file) return join(directory, file);
	}
}
