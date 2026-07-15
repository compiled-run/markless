import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { compileTsrxForTypeService } from '@markless/compiler/type-service';
import initRouterPlugin from '@markless/router/typescript-plugin';
import { afterAll, beforeAll, expect, test } from 'vitest';
import typeScript from 'typescript';
import { intrinsicTagNames, snippetCatalog } from '../src/completions.ts';
import { getMarklessTsrxLanguagePlugin } from '../src/language.ts';
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

test('completion catalog insertText is valid strict TSRX in its offered context', () => {
	for (const item of snippetCatalog) {
		const source = catalogValidityFixture(item.context, stripSnippetSyntax(item.insertText));
		expect(
			() => compileTsrxForTypeService(source, `completion-${item.name}.tsrx`, { loose: false }),
			`Catalog entry ${item.name} must insert grammar-valid strict TSRX.`,
		).not.toThrow();
	}
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

const baseConstructEntries = [
	'@{}',
	'@if',
	'@if-@else',
	'@for-of',
	'@for-index',
	'@for-key',
	'@for-index-key',
	'@for-@empty',
	'@switch-@case',
	'@try-@pending',
	'@try-@pending-@catch',
] as const;
const removedCatalogEntries = ['@{', '@for', '@switch', '@try'] as const;

test('M4 real tsserver returns only context-valid TSRX @ construct completions', async () => {
	const fixture = openFixture('constructs.tsrx');
	const contexts = [
		{
			marker: '/*M4_BODY*/',
			included: baseConstructEntries,
			excluded: [...branchEntries, ...removedCatalogEntries],
		},
		{
			marker: '/*M4_AFTER_IF*/',
			included: [...baseConstructEntries, '@else'],
			excluded: [
				...branchEntries.filter((name) => name !== '@else'),
				...removedCatalogEntries,
			],
		},
		{
			marker: '/*M4_AFTER_FOR*/',
			included: [...baseConstructEntries, '@empty'],
			excluded: [
				...branchEntries.filter((name) => name !== '@empty'),
				...removedCatalogEntries,
			],
		},
		{
			marker: '/*M4_IN_SWITCH*/',
			included: ['@case', '@default'],
			excluded: ['@else', '@empty', '@pending', '@catch', ...removedCatalogEntries],
		},
		{
			// PM adjudication (T004): the tsrx grammar REQUIRES @pending/@catch after a
			// @try block (verified: '@try {} @if ...' throws 'Missing @catch or @pending').
			// Offering base constructs there would insert invalid code.
			marker: '/*M4_AFTER_TRY*/',
			included: ['@pending', '@catch'],
			excluded: [
				...baseConstructEntries,
				...removedCatalogEntries,
				'@else',
				'@empty',
				'@case',
				'@default',
			],
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

const childrenBaseEntries = baseConstructEntries;
const childrenBranchEntries = ['@else', '@empty', '@case', '@default', '@pending', '@catch'];

test.each([
	{
		name: 'children base',
		marker: '/*M4B_CHILDREN_BASE*/',
		included: childrenBaseEntries,
		excluded: [...childrenBranchEntries, ...removedCatalogEntries],
		assertTriggerShapeEquivalence: true,
	},
	{
		name: 'children after @if sibling',
		marker: '/*M4B_CHILDREN_AFTER_IF*/',
		included: [...childrenBaseEntries, '@else'],
		excluded: [
			...childrenBranchEntries.filter((name) => name !== '@else'),
			...removedCatalogEntries,
		],
		assertTriggerShapeEquivalence: false,
	},
	{
		name: 'children after @for sibling',
		marker: '/*M4B_CHILDREN_AFTER_FOR*/',
		included: [...childrenBaseEntries, '@empty'],
		excluded: [
			...childrenBranchEntries.filter((name) => name !== '@empty'),
			...removedCatalogEntries,
		],
		assertTriggerShapeEquivalence: false,
	},
])(
	'M4b real tsserver returns context-valid TSRX @ constructs inside JSX children: $name',
	async ({ marker, included, excluded, assertTriggerShapeEquivalence }) => {
		const fixture = openFixture('construct-children.tsrx');
		const position = positionAfterMarker(fixture.marked, marker);
		const completion = await server.completionInfo(fixture.file, position);
		const names = completionNames(completion).filter((name) => name.startsWith('@'));

		if (assertTriggerShapeEquivalence) {
			const triggeredCompletion = await triggeredAtCompletionInfo(
				server,
				fixture.file,
				position,
			);
			expect(
				completionNames(triggeredCompletion).filter((name) => name.startsWith('@')),
				'M4b protocol invariant: triggerKind 2 with triggerCharacter @ must return the same @ entries as plain completionInfo.',
			).toEqual(names);
		}

		expect(
			names,
			`M4b missing capability: ${marker} must offer its context-valid TSRX constructs inside JSX children.`,
		).toEqual(expect.arrayContaining(included));
		for (const excludedName of excluded) {
			expect(
				names,
				`M4b invalid capability: ${excludedName} must not be offered at ${marker}.`,
			).not.toContain(excludedName);
		}

		const entries = completionEntries(completion).filter((entry) =>
			included.includes(entry.name),
		);
		const details = await server.completionEntryDetails(
			fixture.file,
			position,
			entries.map(({ name, source, data }) => ({ name, source, data })),
		);
		for (const expectedName of included) {
			const entry = entries.find((candidate) => candidate.name === expectedName);
			expect(
				entry?.isSnippet,
				`M4b missing capability: ${expectedName} must be a snippet completion inside JSX children.`,
			).toBe(true);
			expect(
				entry?.insertText,
				`M4b missing capability: ${expectedName} must carry snippet insertion text inside JSX children.`,
			).toMatch(/\$\{?\d/);
			const span = entry?.replacementSpan;
			expect(
				span && span.end.line === span.start.line && span.end.offset - span.start.offset,
				`M4b missing capability: ${expectedName} must replace the typed @ prefix inside JSX children.`,
			).toBe(1);
			expect(
				details?.some((detail: any) => detail.name === expectedName),
				`M4b missing capability: completionEntryDetails must resolve ${expectedName} inside JSX children.`,
			).toBe(true);
		}
	},
	30_000,
);

test.each([
	{ name: 'JSX attribute string value', marker: '/*M4B_ATTRIBUTE*/' },
	{ name: 'JSX expression container', marker: '/*M4B_EXPRESSION_CONTAINER*/' },
	{ name: 'ordinary component-body string literal', marker: '/*M4B_STRING_LITERAL*/' },
])('M4b real tsserver excludes TSRX @ constructs inside $name', async ({ marker }) => {
	const fixture = openFixture('construct-children.tsrx');
	const completion = await server.completionInfo(
		fixture.file,
		positionAfterMarker(fixture.marked, marker),
	);
	expect(
		completionNames(completion).filter((name) => name.startsWith('@')),
		`M4b invalid capability: TSRX constructs must not be offered at ${marker}.`,
	).toEqual([]);
});

test('M4d real tsserver completes intrinsic and in-scope tag names', async () => {
	const fixture = openFixture('tag-completions.tsrx');
	const childrenPosition = positionAfterMarker(fixture.marked, '/*TAG_CHILDREN*/');
	const childrenCompletion = await server.completionInfo(fixture.file, childrenPosition);
	const childrenEntries = completionEntries(childrenCompletion);
	const expectedNames = ['div', 'span', 'Nav', 'Inner'];
	expect(intrinsicTagNames).toEqual(expect.arrayContaining(['div', 'span']));
	expect(
		childrenEntries.map((entry) => entry.name),
		'M4d missing capability: bare < in element children must offer intrinsic tags plus imported and local components.',
	).toEqual(expect.arrayContaining(expectedNames));
	expect(
		childrenEntries.find((entry) => entry.name === 'Nav')?.sortText <
			childrenEntries.find((entry) => entry.name === 'div')?.sortText,
	).toBe(true);
	expect(childrenEntries.find((entry) => entry.name === 'div')).toMatchObject({
		isSnippet: true,
		insertText: 'div$1>$0</div>',
	});
	expect(childrenEntries.find((entry) => entry.name === 'Nav')).toMatchObject({
		isSnippet: true,
		insertText: 'Nav$1 />',
	});

	const childrenDetails = await server.completionEntryDetails(
		fixture.file,
		childrenPosition,
		childrenEntries
			.filter((entry) => expectedNames.includes(entry.name))
			.map(({ name, source, data }) => ({ name, source, data })),
	);
	expect(childrenDetails?.map((detail: any) => detail.name)).toEqual(
		expect.arrayContaining(expectedNames),
	);

	const partialFixture = openFixture('tag-completions-partial.tsrx');
	const partialPosition = positionAfterMarker(partialFixture.marked, '/*TAG_PARTIAL*/');
	const partialCompletion = await server.completionInfo(partialFixture.file, partialPosition);
	const partialEntries = completionEntries(partialCompletion);
	const nav = partialEntries.find((entry) => entry.name === 'Nav');
	expect(
		partialEntries.map((entry) => entry.name),
		'M4d missing capability: <Na must retain the full synthesized tag catalog so the client can filter it to Nav.',
	).toEqual(expect.arrayContaining(['Nav', 'div']));
	expect(nav?.replacementSpan).toEqual({
		start: { line: partialPosition.line, offset: partialPosition.offset - 2 },
		end: partialPosition,
	});
	expect(nav).toMatchObject({
		isSnippet: true,
		insertText: 'Nav$1 />',
	});

	for (const [fixtureName, marker] of [
		['tag-completions-string.tsrx', '/*TAG_STRING*/'],
		['tag-completions-expression.tsrx', '/*TAG_EXPRESSION*/'],
	] as const) {
		const negativeFixture = openFixture(fixtureName);
		const completion = await server.completionInfo(
			negativeFixture.file,
			positionAfterMarker(negativeFixture.marked, marker),
		);
		expect(
			completionNames(completion).filter((name) =>
				intrinsicTagNames.includes(name as (typeof intrinsicTagNames)[number]),
			),
			`M4d invalid capability: tag names must not be synthesized at ${marker}.`,
		).toEqual([]);
	}
}, 20_000);

const catalogBaseEntries = baseConstructEntries;
const catalogClauseEntries = [
	'@else',
	'@else if',
	'@empty',
	'@case',
	'@default',
	'@pending',
	'@catch',
] as const;
const catalogEntries = [
	'function Component(props) @{ }',
	...catalogBaseEntries,
	...catalogClauseEntries,
] as const;
const catalogInsertText = {
	'@if-@else': '@if (${1:condition}) {\n\t$2\n} @else {\n\t$3\n}',
	'@for-index': '@for (const ${1:item} of ${2:items}; index ${3:i}) {\n\t$0\n}',
	'@for-key': '@for (const ${1:item} of ${2:items}; key ${1:item}.${3:id}) {\n\t$0\n}',
	'@for-index-key':
		'@for (const ${1:item} of ${2:items}; index ${3:i}; key ${1:item}.${4:id}) {\n\t$0\n}',
	'@try-@pending-@catch': '@try {\n\t$1\n} @pending {\n\t$2\n} @catch (${3:e}) {\n\t$0\n}',
	'@else if': '@else if (${1:condition}) {\n\t$0\n}',
} as const;

test.each([
	{
		name: 'module scope',
		marker: '/*M4C_MODULE*/',
		expected: ['function Component(props) @{ }'],
	},
	{
		name: 'statement base position',
		marker: '/*M4C_STATEMENT_BASE*/',
		expected: ['function Component(props) @{ }', ...catalogBaseEntries],
	},
	{
		name: 'JSX-children base position',
		marker: '/*M4C_CHILDREN_BASE*/',
		expected: catalogBaseEntries,
	},
	{
		name: 'statement sibling after @if',
		marker: '/*M4C_STATEMENT_AFTER_IF*/',
		expected: [...catalogBaseEntries, '@else', '@else if'],
	},
	{
		name: 'JSX-children sibling after @if',
		marker: '/*M4C_CHILDREN_AFTER_IF*/',
		expected: [...catalogBaseEntries, '@else', '@else if'],
	},
	{
		name: 'statement sibling after @for',
		marker: '/*M4C_STATEMENT_AFTER_FOR*/',
		expected: [...catalogBaseEntries, '@empty'],
	},
	{
		name: 'JSX-children sibling after @for',
		marker: '/*M4C_CHILDREN_AFTER_FOR*/',
		expected: [...catalogBaseEntries, '@empty'],
	},
	{
		name: 'statement sibling after @try',
		marker: '/*M4C_AFTER_TRY*/',
		expected: ['@pending', '@catch'],
	},
	{
		name: 'switch region',
		marker: '/*M4C_SWITCH_REGION*/',
		expected: ['@case', '@default'],
	},
])(
	'M4c catalog: $name exposes the context label set and snippet shapes',
	async ({ marker, expected }) => {
		const fixture = openFixture('catalog.tsrx');
		const position = positionAfterMarker(fixture.marked, marker);
		const completion = await server.completionInfo(fixture.file, position);
		const entries = completionEntries(completion);
		const expectedNames = [...expected];
		const actualCatalogNames = entries
			.map((entry) => entry.name)
			.filter((name) => catalogEntries.includes(name))
			.sort();

		expect(
			actualCatalogNames,
			`M4c catalog missing capability: ${marker} must expose exactly its context-valid catalog labels.`,
		).toEqual(expectedNames.toSorted());
		for (const removedName of removedCatalogEntries) {
			expect(
				entries.map((entry) => entry.name),
				`M4c catalog invalid capability: removed duplicate or invalid label ${removedName} must stay absent at ${marker}.`,
			).not.toContain(removedName);
		}

		for (const name of expectedNames) {
			const expectedInsertText =
				name === 'function Component(props) @{ }'
					? marker === '/*M4C_MODULE*/'
						? 'export function ${1:ComponentName}(${2:props}) @{\n\t$0\n}'
						: 'function ${1:ComponentName}(${2:props}) @{\n\t$0\n}'
					: catalogInsertText[name as keyof typeof catalogInsertText];
			if (expectedInsertText === undefined) continue;
			const entry = entries.find((candidate) => candidate.name === name);
			expect(
				entry?.isSnippet,
				`M4c catalog missing capability: ${name} must be a snippet at ${marker}.`,
			).toBe(true);
			expect(
				entry?.insertText,
				`M4c catalog missing capability: ${name} must preserve its catalog insertText at ${marker}.`,
			).toBe(expectedInsertText);
		}

		if (expectedNames.includes('function Component(props) @{ }')) {
			const entry = entries.find(
				(candidate) => candidate.name === 'function Component(props) @{ }',
			);
			expect(entry?.name).toContain('@');
			expect(entry?.filterText).toMatch(/^@/);
			const details = await server.completionEntryDetails(fixture.file, position, [
				{ name: entry?.name ?? '' },
			]);
			expect(details?.some((detail: any) => detail.name === entry?.name)).toBe(true);
			expect(
				entry?.labelDetails?.description,
				'M4c catalog missing capability: the function component must carry its catalog detail.',
			).toBe('Markless component function');
		}

		if (marker === '/*M4C_CHILDREN_BASE*/') {
			expect(
				actualCatalogNames,
				'M4c catalog invalid capability: JSX children must not offer a function component declaration.',
			).not.toContain('function Component(props) @{ }');
		}

		if (marker === '/*M4C_AFTER_TRY*/') {
			expect(
				actualCatalogNames,
				'M4c catalog invalid capability: @else if is not valid after @try.',
			).not.toContain('@else if');
		}
	},
	30_000,
);

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

test('M8 real tsserver diagnoses wrong, missing, and mistyped component props at mapped source tokens', async () => {
	const unknownFixture = openFixture('component-props.tsrx');
	const missingFixture = openFixture('component-props-missing.tsrx');
	const mistypedFixture = openFixture('component-props-mistyped.tsrx');
	const [unknownDiagnostics, missingDiagnostics, mistypedDiagnostics] = await Promise.all([
		server.semanticDiagnosticsSync(unknownFixture.file),
		server.semanticDiagnosticsSync(missingFixture.file),
		server.semanticDiagnosticsSync(mistypedFixture.file),
	]);
	const unknown = diagnosticMatching(unknownDiagnostics, /mystery/i);
	const missing = diagnosticMatching(missingDiagnostics, /property 'label' is missing/i);
	const mistyped = diagnosticMatching(mistypedDiagnostics, /number.*not assignable.*string/i);

	expect(unknown?.start).toEqual(positionAtSearch(unknownFixture.source, 'mystery'));
	expect(missing?.start).toEqual(positionAtSearch(missingFixture.source, 'Nav active'));
	expectDiagnosticSpan(mistypedFixture.source, mistyped, 'label');
}, 20_000);

test('M9 real tsserver completes component props only inside opening tags', async () => {
	const fixture = openFixture('component-prop-completions.tsrx');
	const imported = completionNames(
		await server.completionInfo(
			fixture.file,
			positionAfterMarker(fixture.marked, '/*M9_IMPORTED*/'),
		),
	);
	const sameFile = completionNames(
		await server.completionInfo(
			fixture.file,
			positionAfterMarker(fixture.marked, '/*M9_SAME_FILE*/'),
		),
	);
	const children = completionNames(
		await server.completionInfo(
			fixture.file,
			positionAfterMarker(fixture.marked, '/*M9_CHILDREN*/'),
		),
	);
	const statement = completionNames(
		await server.completionInfo(
			fixture.file,
			positionAfterMarker(fixture.marked, '/*M9_STATEMENT*/'),
		),
	);

	expect(imported).toEqual(expect.arrayContaining(['label', 'active', 'children']));
	expect(sameFile).toEqual(expect.arrayContaining(['title', 'compact']));
	for (const name of ['label', 'active', 'children', 'title', 'compact']) {
		expect(children, `M9 prop ${name} must not leak into component children.`).not.toContain(
			name,
		);
		expect(statement, `M9 prop ${name} must not leak into statement positions.`).not.toContain(
			name,
		);
	}
}, 20_000);

test('M11 real tsserver hovers and defines component tags in authored TSRX sources', async () => {
	const fixture = openFixture('component-navigation.tsrx');
	const opening = positionAtSearch(fixture.source, 'Nav label');
	const closing = positionAtSearch(fixture.source, 'Nav>', 0);
	const local = positionAtSearch(fixture.source, 'LocalBadge text');
	const [info, openingDefinition, closingDefinition, localInfo] = await Promise.all([
		server.quickinfo(fixture.file, opening),
		server.definitionAndBoundSpan(fixture.file, opening),
		server.definitionAndBoundSpan(fixture.file, closing),
		server.quickinfo(fixture.file, local),
	]);
	const importedSource = realpathSync(fixturePath(project, 'Nav.tsrx'));

	expect(displayText(info)).toMatch(
		/Nav\([\s\S]*label: string;[\s\S]*active\?: boolean;[\s\S]*children\?: unknown/,
	);
	for (const definition of [openingDefinition, closingDefinition]) {
		expect(definition?.definitions?.map((item: any) => realpathSync(item.file))).toContain(
			importedSource,
		);
		expect(definition?.definitions?.some((item: any) => item.file.endsWith('.tsx'))).toBe(
			false,
		);
	}
	expect(displayText(localInfo)).toMatch(/LocalBadge\([\s\S]*text: string/);
}, 20_000);

test('M10a intrinsic class attribute is accepted', async () => {
	const fixture = openFixture('intrinsic-class.tsrx');
	const generated = compileTsrxForTypeService(fixture.source, fixture.file, { loose: true });
	const syntactic = await server.syntacticDiagnosticsSync(fixture.file);
	const semantic = await server.semanticDiagnosticsSync(fixture.file);
	const classPosition = positionAtSearch(fixture.source, 'class=');

	expect(syntactic).toEqual([]);
	expect(generated.code).toContain('<div class="accepted" nonsense>accepted</div>');
	expect(
		semantic.some(
			(diagnostic) =>
				diagnostic.start?.line === classPosition.line &&
				diagnostic.start?.offset === classPosition.offset,
		),
		'M10a intrinsic class must not produce a semantic diagnostic; nonsense rejection is deferred to W4.',
	).toBe(false);
}, 20_000);

test('M10 cold-start: the intrinsic contract is present at the very first request', async () => {
	const coldProject = copyFixtureProject(fixtureDirectory, workspaceRoot);
	const coldServer = new TsserverHarness({
		project: coldProject,
		workspaceRoot,
		globalPlugins: [corePlugin],
	});
	try {
		const fixture = openFixture('intrinsic-contract.tsrx', coldProject, coldServer);
		const diagnostics = await coldServer.semanticDiagnosticsSync(fixture.file);

		expect(
			diagnostics.filter((diagnostic) => [7016, 7026].includes(diagnostic.code)),
			'M10 cold-start missing capability: the first semantic request must see the Markless JSX intrinsic contract.',
		).toEqual([]);
	} finally {
		await coldServer.close();
		removeFixtureProject(coldProject);
	}
}, 20_000);

test('M10 intrinsic contract accepts Markless spellings, native events, element bindings, and tag-specific attributes', async () => {
	const fixture = openFixture('intrinsic-contract.tsrx');
	const syntactic = await server.syntacticDiagnosticsSync(fixture.file);
	const semantic = await server.semanticDiagnosticsSync(fixture.file);

	expect(syntactic).toEqual([]);
	expect(
		semantic,
		'M10 accepted intrinsic attributes must use native DOM event types and concrete host element types without diagnostics.',
	).toEqual([]);
}, 20_000);

test('M10 intrinsic contract rejects className, bogus and tag-wrong attributes, object style, and object children at authored tokens', async () => {
	const fixture = openFixture('intrinsic-contract-errors.tsrx');
	const diagnostics = await server.semanticDiagnosticsSync(fixture.file);

	expectDiagnosticSpan(fixture.source, diagnosticMatching(diagnostics, /className/), 'className');
	expectDiagnosticSpan(
		fixture.source,
		diagnosticMatching(diagnostics, /bogusAttribute/),
		'bogusAttribute',
	);
	expectDiagnosticSpan(
		fixture.source,
		diagnosticMatching(diagnostics, /not assignable to type 'string'/),
		'style',
	);
	expectDiagnosticSpan(fixture.source, diagnosticMatching(diagnostics, /src/), 'src');
	expectDiagnosticSpan(fixture.source, diagnosticMatching(diagnostics, /invalid/), 'invalid');
	expect(diagnostics).toHaveLength(5);
}, 20_000);

test('M10 plugin does not add the Markless declaration to a project without TSRX', async () => {
	const plainProject = mkdtempSync(join(tmpdir(), 'markless-plain-tsx-'));
	writeFileSync(
		join(plainProject, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: { jsx: 'preserve', noEmit: true, strict: true },
			include: ['*.tsx'],
		}),
	);
	const file = join(plainProject, 'Plain.tsx');
	const source = 'export const plain = <div class="reactless" />;\n';
	writeFileSync(file, source);
	const plainServer = new TsserverHarness({
		project: plainProject,
		workspaceRoot,
		globalPlugins: [corePlugin],
	});
	try {
		plainServer.open(file, source);
		const diagnostics = await plainServer.semanticDiagnosticsSync(file);
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(7026);
		expect(plainServer.readLog()).not.toContain('markless-jsx.d.ts');
	} finally {
		await plainServer.close();
		rmSync(plainProject, { recursive: true, force: true });
	}
}, 20_000);

test('M10 Markless JSX contract does not pollute an adjacent plain TSX file', async () => {
	const fixture = openFixture('plain-adjacent.tsx');
	const diagnostics = await server.semanticDiagnosticsSync(fixture.file);

	expect(diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				start: expect.objectContaining(positionAtSearch(fixture.source, '<div')),
				text: expect.stringMatching(/JSX element implicitly has type 'any'.*JSX\.IntrinsicElements/i),
			}),
		]),
	);
}, 20_000);

test('M12a the service script is TSX', () => {
	const languagePlugin = getMarklessTsrxLanguagePlugin();
	const virtualCode = languagePlugin.createVirtualCode?.(
		'/workspace/App.tsrx',
		'markless-tsrx',
		{
			getText: () => 'export function App() @{ <div class="app">ok</div> }',
			getLength: () => 57,
			getChangeRange: () => undefined,
		},
	);
	const serviceScript = languagePlugin.typescript?.getServiceScript?.(virtualCode);

	expect(serviceScript).toMatchObject({ extension: '.tsx', scriptKind: 4 });
	expect(virtualCode?.generatedCode).toContain('<div class="app">ok</div>');
});

test('M12 native jsxClosingTag answers through authored TSRX coordinates', async () => {
	const fixture = openFixture('tag-closing-protocol.tsrx');
	const answer = await server.jsxClosingTag(
		fixture.file,
		positionAtSearch(fixture.source, '<div>\n', '<div>'.length),
	);

	expect(answer).toEqual({ newText: '</div>', caretOffset: 0 });
}, 20_000);

test('M12 linkedEditingRange returns authored opening and closing tag-name spans', async () => {
	const fixture = openFixture('tag-protocol.tsrx');
	const answer = await server.linkedEditingRange(
		fixture.file,
		positionAtSearch(fixture.source, 'strong>linked'),
	);

	expect(answer?.ranges).toEqual([
		protocolRangeAtSearch(fixture.source, 'strong>linked', 'strong'.length),
		protocolRangeAtSearch(fixture.source, 'strong></section>', 'strong'.length),
	]);
	expect(answer?.wordPattern).toContain('a-zA-Z0-9');
}, 20_000);

test('M13 real tsserver type-checks construct branches without scaffolding diagnostics', async () => {
	const fixture = openFixture('construct-typing.tsrx');
	const syntactic = await server.syntacticDiagnosticsSync(fixture.file);
	const semantic = await server.semanticDiagnosticsSync(fixture.file);

	expect(syntactic).toEqual([]);
	expect(
		semantic,
		'M13 clean construct branches must narrow locally and produce no diagnostics from authored code or synthetic IIFE scaffolding.',
	).toEqual([]);
}, 20_000);

test('M13 real tsserver maps a branch-local type error to the authored token', async () => {
	const fixture = openFixture('construct-typing-error.tsrx');
	const diagnostics = await server.semanticDiagnosticsSync(fixture.file);
	const authored = diagnosticMatching(diagnostics, /property 'missing' does not exist/i);

	expect(diagnostics).toHaveLength(1);
	expectDiagnosticSpan(fixture.source, authored, 'missing');
}, 20_000);

test('M14 real tsserver offers native state auto-import and maps its code action to TSRX source', async () => {
	const fixture = openFixture('auto-import.tsrx');
	const position = positionAfterMarker(fixture.marked, '/*M14_STATE*/');
	const completion = await server.completionInfo(fixture.file, position);
	const entry = completionEntries(completion).find(
		(candidate) => candidate.name === 'state' && candidate.source === '@markless/core',
	);

	expect(
		entry,
		'M14 missing capability: bare stat must offer state as a native @markless/core module export.',
	).toMatchObject({ name: 'state', source: '@markless/core', hasAction: true });

	const details = await server.completionEntryDetails(fixture.file, position, [
		{ name: entry?.name ?? 'state', source: entry?.source, data: entry?.data },
	]);
	const detail = details?.find((candidate: any) => candidate.name === 'state');
	const action = detail?.codeActions?.find((candidate: any) =>
		candidate.changes?.some((change: any) => change.fileName === fixture.file),
	);
	const sourceChanges = action?.changes?.filter(
		(change: any) => change.fileName === fixture.file,
	);

	expect(
		action,
		`M14 missing capability: completion details must return a source-file import code action. Details: ${JSON.stringify(details)}`,
	).toBeDefined();
	expect(action?.changes?.map((change: any) => change.fileName)).toEqual([fixture.file]);
	expect(
		sourceChanges?.flatMap((change: any) => change.textChanges).map((change: any) => change.newText.trim()),
	).toContain("import { state } from '@markless/core';");
	expect(applyProtocolChanges(fixture.source, sourceChanges?.[0]?.textChanges ?? [])).toContain(
		"import { state } from '@markless/core';",
	);
	expect(JSON.stringify(action)).not.toContain('@jsxImportSource');
}, 20_000);

test('M15 real tsserver exposes routes only in strings and href attribute values', async () => {
	const dualProject = copyFixtureProject(fixtureDirectory, workspaceRoot);
	const dualServer = new TsserverHarness({
		project: dualProject,
		workspaceRoot,
		globalPlugins: [corePlugin, routerPlugin],
	});
	try {
		const fixture = openFixture('router-contexts.tsrx', dualProject, dualServer);
		for (const marker of [
			'/*M15_STRING*/',
			'/*M15_HREF_STRING*/',
			'/*M15_HREF_EXPRESSION*/',
		]) {
			const completion = await dualServer.completionInfo(
				fixture.file,
				positionAfterMarker(fixture.marked, marker),
			);
			expect(
				completionNames(completion),
				`M15 missing capability: ${marker} must offer both fixture routes.`,
			).toEqual(expect.arrayContaining(['/', '/library']));
		}

		for (const marker of [
			'/*M15_IMPORT*/',
			'/*M15_MEMBER*/',
			'/*M15_IDENTIFIER*/',
			'/*M15_EXPRESSION*/',
		]) {
			const completion = await dualServer.completionInfo(
				fixture.file,
				positionAfterMarker(fixture.marked, marker),
			);
			expect(
				completionNames(completion),
				`M15 invalid capability: ${marker} must not receive route completions.`,
			).not.toEqual(expect.arrayContaining(['/', '/library']));
		}
	} finally {
		await dualServer.close();
		removeFixtureProject(dualProject);
	}
}, 30_000);

test('M15 router skips page-directory scanning outside allowed source contexts', () => {
	const source = `export function Probe() @{\n\tconst route = '';\n\tconst value = rou;\n}`;
	const fileName = '/project/probe.tsrx';
	let pageDirectoryScans = 0;
	const instrumentedTypeScript = {
		...typeScript,
		sys: {
			...typeScript.sys,
			directoryExists: () => true,
			readDirectory() {
				pageDirectoryScans += 1;
				return ['/project/pages/index.tsrx'];
			},
		},
	};
	const languageService = {
		getCompletionsAtPosition: () => undefined,
	};
	const info = {
		config: { pagesDir: 'pages' },
		languageService,
		languageServiceHost: {
			getCurrentDirectory: () => '/project',
			getScriptFileNames: () => [fileName],
		},
		project: {
			getCurrentDirectory: () => '/project',
			getScriptInfo: () => ({ getSnapshot: () => typeScript.ScriptSnapshot.fromString(source) }),
			projectService: {},
		},
	};
	const plugin = initRouterPlugin({ typescript: instrumentedTypeScript as typeof typeScript });
	const proxy = plugin.create(info as any);

	proxy.getCompletionsAtPosition(fileName, source.indexOf('rou') + 3, {});
	expect(pageDirectoryScans).toBe(0);
	const stringCompletion = proxy.getCompletionsAtPosition(fileName, source.indexOf("''") + 1, {});
	expect(pageDirectoryScans).toBe(1);
	expect(completionNames(stringCompletion)).toContain('/');
});

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
	expect(manifest).toMatchObject({
		name: 'markless',
		displayName: 'Markless',
		publisher: 'markless',
	});
	const language = manifest.contributes?.languages?.find(
		(item: any) => item.id === 'markless-tsrx',
	);
	expect(
		language,
		'M7b missing capability: contributes.languages must register markless-tsrx.',
	).toMatchObject({
		id: 'markless-tsrx',
		aliases: ['Markless', 'markless-tsrx'],
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
	expect(manifest.main, 'M7b missing capability: the extension runtime entry must be declared.').toBe(
		'./dist/extension.cjs',
	);
	expect(
		manifest.activationEvents,
		'M7b missing capability: TSRX documents must activate the extension runtime.',
	).toContain('onLanguage:markless-tsrx');
	expect(
		manifest.contributes?.configuration?.properties?.['markless.autoClosingTags'],
		'M7b missing capability: users must be able to disable automatic closing tags.',
	).toMatchObject({ type: 'boolean', default: true });
});

test('M7c packaged VSIX contains both plugins and a valid extension runtime', () => {
	const extensionDirectory = resolve(workspaceRoot, 'packages/vscode-plugin');
	expect(
		existsSync(extensionDirectory),
		'M7c missing capability: packages/vscode-plugin does not exist, so no packaged VSIX can be inspected.',
	).toBe(true);
	const vsix = resolve(extensionDirectory, 'dist/markless.vsix');
	expect(
		existsSync(vsix),
		'M7c missing capability: no built .vsix exists; run pnpm --dir packages/vscode-plugin package:vsix.',
	).toBe(true);
	const runStartedAt = Number(process.env.MARKLESS_COMPLETION_MATRIX_STARTED_AT);
	expect(
		Number.isFinite(runStartedAt) && statSync(vsix).mtimeMs > runStartedAt,
		'M7c missing capability: the inspected VSIX must be rebuilt after test:completion-matrix starts.',
	).toBe(true);

	const extracted = mkdtempSync(join(tmpdir(), 'markless-vsix-matrix-'));
	try {
		const unzip = spawnSync('unzip', ['-q', vsix, '-d', extracted], { encoding: 'utf8' });
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
			if (pluginName === corePlugin) {
				expect(
					existsSync(join(dirname(entry), 'markless-jsx.d.ts')),
					'M7c missing capability: the plugin-managed JSX contract must ship beside the bundled core plugin.',
				).toBe(true);
			}
		}
		const runtime = join(extensionRoot, 'dist/extension.cjs');
		expect(
			existsSync(runtime),
			'M7c missing capability: the extension runtime bundle must exist inside the extracted VSIX.',
		).toBe(true);
		const syntaxCheck = spawnSync(process.execPath, ['--check', runtime], { encoding: 'utf8' });
		expect(
			syntaxCheck.status,
			`M7c extension runtime bundle must pass node --check: ${syntaxCheck.stderr || syntaxCheck.stdout}`,
		).toBe(0);
	} finally {
		rmSync(extracted, { recursive: true, force: true });
	}
});

const branchEntries = ['@else', '@empty', '@case', '@default', '@pending', '@catch'];

function stripSnippetSyntax(insertText: string): string {
	return insertText
		.replace(/\$\{\d+:([^}]*)\}/g, '$1')
		.replace(/\$\{\d+\}/g, '')
		.replace(/^([\t ]*)\$\d+([\t ]*)$/gm, '$1$2')
		.replace(/\$\d+/g, 'true');
}

function catalogValidityFixture(
	context: (typeof snippetCatalog)[number]['context'],
	insertText: string,
): string {
	const contexts = Array.isArray(context) ? context : [context];
	if (contexts.includes('module')) return insertText;

	let body = insertText;
	if (contexts.includes('after-if')) body = `@if (true) {}\n${insertText}`;
	else if (contexts.includes('after-for')) {
		body = `const items = [];\n@for (const item of items) {}\n${insertText}`;
	} else if (contexts.includes('switch')) body = `@switch (true) {\n${insertText}\n}`;
	else if (contexts.includes('after-try')) body = `@try {}\n${insertText}`;

	return `export function CatalogValidityGuard() @{\n${body}\n}`;
}

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

function diagnosticMatching(diagnostics: any[], pattern: RegExp): any {
	return diagnostics.find((diagnostic) => pattern.test(String(diagnostic.text)));
}

function expectDiagnosticSpan(source: string, diagnostic: any, token: string): void {
	const start = positionAtSearch(source, token);
	const end = positionAtSearch(source, token, token.length);
	expect(diagnostic?.start).toEqual(start);
	expect(diagnostic?.end).toEqual(end);
}

function protocolRangeAtSearch(source: string, token: string, length: number): {
	start: { line: number; offset: number };
	end: { line: number; offset: number };
} {
	return {
		start: positionAtSearch(source, token),
		end: positionAtSearch(source, token, length),
	};
}

function applyProtocolChanges(source: string, textChanges: readonly any[]): string {
	return [...textChanges]
		.sort(
			(left, right) =>
				protocolPositionOffset(source, right.start) -
				protocolPositionOffset(source, left.start),
		)
		.reduce((current, change) => {
			const start = protocolPositionOffset(source, change.start);
			const end = protocolPositionOffset(source, change.end);
			return `${current.slice(0, start)}${change.newText}${current.slice(end)}`;
		}, source);
}

function protocolPositionOffset(
	source: string,
	position: { readonly line: number; readonly offset: number },
): number {
	const lines = source.split('\n');
	return (
		lines.slice(0, position.line - 1).reduce((length, line) => length + line.length + 1, 0) +
		position.offset -
		1
	);
}

function triggeredAtCompletionInfo(
	harness: TsserverHarness,
	file: string,
	position: { line: number; offset: number },
): Promise<any> {
	return (harness as any).requestBody('completionInfo', {
		file,
		...position,
		includeExternalModuleExports: true,
		includeInsertTextCompletions: true,
		triggerKind: 2,
		triggerCharacter: '@',
	});
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
