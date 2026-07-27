import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileTsrxForTypeService } from '@markless/compiler/type-service';
import initRouterPlugin from '@markless/router/typescript-plugin';
import { afterAll, beforeAll, expect, test } from 'vitest';
import typeScript from 'typescript';
import { intrinsicTagNames, snippetCatalog } from '../src/completions.ts';
import { MARKLESS_TSRX_PARSE_ERROR_CODE, MarklessTsrxVirtualCode } from '../src/language.ts';
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
// The tsconfig key the upstream TSRX language server reads to find the Markless compiler.
const volarCompiler = '@markless/typescript-plugin/volar';

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
			() =>
				compileTsrxForTypeService(source, `completion-${item.name}.tsrx`, { loose: false }),
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

test('real tsserver reports the current TSRX parse failure and no parse error for clean source', async () => {
	const broken = openFixture('parse-error.tsrx');
	const clean = openFixture('framework.tsrx');
	const brokenDiagnostics = await server.syntacticDiagnosticsSync(broken.file);
	const cleanDiagnostics = await server.syntacticDiagnosticsSync(clean.file);
	const expectedStart = positionAtSearch(broken.source, '</button>>');
	expectedStart.offset += '</button>'.length;
	const parseDiagnostics = brokenDiagnostics.filter(
		(diagnostic) =>
			diagnostic.source === 'markless' && diagnostic.code === MARKLESS_TSRX_PARSE_ERROR_CODE,
	);

	expect(parseDiagnostics).toHaveLength(1);
	expect(parseDiagnostics[0]).toMatchObject({
		category: 'error',
		code: MARKLESS_TSRX_PARSE_ERROR_CODE,
		source: 'markless',
		start: expectedStart,
		text: expect.stringMatching(/^Markless TSRX parse error: /),
	});
	expect(
		cleanDiagnostics.filter(
			(diagnostic) =>
				diagnostic.source === 'markless' &&
				diagnostic.code === MARKLESS_TSRX_PARSE_ERROR_CODE,
		),
	).toEqual([]);
}, 20_000);

test('real tsserver keeps typed features and reports no parse error while a construct is half typed', async () => {
	// constructs.tsrx is unparseable as written: every marker sits after a bare @. Without
	// Markless recovery the host has no virtual code for it, so hover answers nothing and
	// the file looks broken to the user mid-keystroke.
	const fixture = openFixture('constructs.tsrx');
	const hover = await server.quickinfo(fixture.file, positionAtSearch(fixture.source, 'value)'));
	const diagnostics = await server.syntacticDiagnosticsSync(fixture.file);

	expect(
		displayText(hover),
		'A half-typed @ construct must not cost the rest of the file its types.',
	).toContain('(parameter) value: string');
	expect(
		diagnostics.filter(
			(diagnostic) =>
				diagnostic.source === 'markless' &&
				diagnostic.code === MARKLESS_TSRX_PARSE_ERROR_CODE,
		),
		'A recovered file is still being typed, not broken: it must not report a parse error.',
	).toEqual([]);
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
				text: expect.stringMatching(
					/JSX element implicitly has type 'any'.*JSX\.IntrinsicElements/i,
				),
			}),
		]),
	);
}, 20_000);

test('M12a the Markless virtual code is TSX carrying the authored markup', () => {
	// @tsrx/typescript-plugin registers .tsrx with Volar and decides the service script's
	// extension and script kind; that .tsrx reaches TypeScript as TSX is proven live by
	// M10, M12 and M13 rather than by inspecting a registration object here. What stays
	// Markless-owned is the compile: the generated document must be TSX that preserves the
	// authored markup, because every mapped editor answer is resolved against it.
	const virtualCode = new MarklessTsrxVirtualCode('/workspace/App.tsrx', {
		getText: () => 'export function App() @{ <div class="app">ok</div> }',
		getLength: () => 57,
		getChangeRange: () => undefined,
	});

	expect(virtualCode.generatedCode).toContain('<div class="app">ok</div>');
	expect(
		virtualCode.generatedCode,
		'M12a missing capability: the generated document must be TSX, not a compiled render call.',
	).toContain('return <div');
	expect(virtualCode.snapshot.getText(0, virtualCode.snapshot.getLength())).toBe(
		virtualCode.generatedCode,
	);
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
		sourceChanges
			?.flatMap((change: any) => change.textChanges)
			.map((change: any) => change.newText.trim()),
	).toContain("import { state } from '@markless/core';");
	expect(applyProtocolChanges(fixture.source, sourceChanges?.[0]?.textChanges ?? [])).toContain(
		"import { state } from '@markless/core';",
	);
	expect(JSON.stringify(action)).not.toContain('@jsxImportSource');
}, 20_000);

test('M14 real tsserver adds an auto-imported name to an existing import clause', async () => {
	// The other M14 case has no imports, so TypeScript writes a whole new import at the
	// very top of the document. Here the insertion lands inside the existing clause, which
	// is the branch that must keep mapping through the ordinary token mappings.
	const fixture = openFixture('auto-import-existing.tsrx');
	const position = positionAfterMarker(fixture.marked, '/*M14_COMPUTED*/');
	const completion = await server.completionInfo(fixture.file, position);
	const entry = completionEntries(completion).find(
		(candidate) => candidate.name === 'computed' && candidate.source === '@markless/core',
	);

	expect(
		entry,
		'M14 missing capability: bare compu must offer computed as a native @markless/core module export.',
	).toMatchObject({ name: 'computed', source: '@markless/core', hasAction: true });

	const details = await server.completionEntryDetails(fixture.file, position, [
		{ name: entry?.name ?? 'computed', source: entry?.source, data: entry?.data },
	]);
	const action = details
		?.find((candidate: any) => candidate.name === 'computed')
		?.codeActions?.find((candidate: any) =>
			candidate.changes?.some((change: any) => change.fileName === fixture.file),
		);
	const textChanges = action?.changes
		?.filter((change: any) => change.fileName === fixture.file)
		.flatMap((change: any) => change.textChanges);

	expect(
		action,
		`M14 missing capability: completion details must return a source-file import code action. Details: ${JSON.stringify(details)}`,
	).toBeDefined();
	expect(applyProtocolChanges(fixture.source, textChanges ?? [])).toContain(
		"import { computed, state } from '@markless/core';",
	);
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
		for (const marker of ['/*M15_STRING*/', '/*M15_HREF_STRING*/', '/*M15_HREF_EXPRESSION*/']) {
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
			getScriptInfo: () => ({
				getSnapshot: () => typeScript.ScriptSnapshot.fromString(source),
			}),
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

test('M7a plugin-resolution check still catches a plugin that cannot be resolved', async () => {
	const missingPlugin = '@markless/typescript-plugin-that-is-not-installed';
	const failingProject = copyFixtureProject(fixtureDirectory, workspaceRoot);
	const failingServer = new TsserverHarness({
		project: failingProject,
		workspaceRoot,
		globalPlugins: [corePlugin, routerPlugin, missingPlugin],
	});
	try {
		const fixture = openFixture('router.tsrx', failingProject, failingServer);
		await failingServer.quickinfo(
			fixture.file,
			positionAfterMarker(fixture.marked, '/*M7_CORE*/'),
		);
		// Every fixture with `error` in its name is compiled into this project, and
		// tsserver's watchers log `Failed Lookup Locations` for the plugin directory, so
		// this log carries exactly the noise that must not be read as a failure.
		const log = failingServer.readLog();
		expect(log).toContain('component-prop-error.tsrx');
		expect(log).toContain('WatchType: Failed Lookup Locations');

		const missingPluginErrors = pluginResolutionErrors(log, [missingPlugin]);
		expect(
			missingPluginErrors,
			`A plugin tsserver could not resolve must still be reported. Log tail: ${log.slice(-2000)}`,
		).not.toEqual([]);
		expect(missingPluginErrors.every((line) => line.includes(missingPlugin))).toBe(true);
		expect(pluginResolutionErrors(log, [corePlugin, routerPlugin])).toEqual([]);
	} finally {
		await failingServer.close();
		removeFixtureProject(failingProject);
	}
}, 20_000);

// M7b' replaces M7b. M7b read the VS Code extension manifest, because that manifest was
// where a Markless app declared "load these two plugins". In an app that uses the upstream
// TSRX extension the same declaration lives in the app's own tsconfig.json, so the successor
// pins it in both places a real app gets it from: the create-markless scaffold template and
// the reference app (docs). It also proves the declaration resolves to loadable code.
test("M7b' scaffold and reference-app tsconfigs declare both plugins and a loadable tsrx compiler", () => {
	for (const relativePath of [
		'packages/cli/templates/common/tsconfig.json',
		'docs/tsconfig.json',
	]) {
		const tsconfigPath = resolve(workspaceRoot, relativePath);
		expect(
			existsSync(tsconfigPath),
			`M7b' missing capability: ${relativePath} must exist — it is where a Markless app declares its editor plugins.`,
		).toBe(true);
		const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as any;
		expect(
			tsconfig.tsrx?.compiler,
			`M7b' missing capability: ${relativePath} must point the editor language server at the Markless compiler.`,
		).toBe(volarCompiler);
		expect(
			(tsconfig.compilerOptions?.plugins ?? []).map((plugin: any) => plugin?.name),
			`M7b' missing capability: ${relativePath} must declare both Markless tsserver plugins by exact name.`,
		).toEqual([corePlugin, routerPlugin]);
	}

	const pluginRoot = resolve(workspaceRoot, 'packages/typescript-plugin');
	const manifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8')) as any;
	const volarSubpath = volarCompiler.slice(corePlugin.length + 1);
	const volarRequireTarget = manifest.exports?.[`./${volarSubpath}`]?.require;
	expect(
		volarRequireTarget,
		`M7b' missing capability: ${corePlugin} must expose a require-condition export for ./${volarSubpath}; a tsconfig tsrx.compiler entry is loaded with require().`,
	).toEqual(expect.any(String));
	const volarEntry = resolve(pluginRoot, volarRequireTarget);
	expect(
		existsSync(volarEntry),
		`M7b' missing capability: ${volarCompiler} must resolve to a file that exists after build:cjs (looked for ${volarEntry}).`,
	).toBe(true);
	expect(
		typeof createRequire(join(pluginRoot, 'package.json'))(volarEntry),
		`M7b' missing capability: ${volarCompiler} must be require()-able, not merely present on disk.`,
	).toBe('object');
});

// M7c' replaces M7c. M7c unzipped the packaged extension and proved both plugins resolved
// inside its private node_modules tree — a packaging detail of an artifact this repository
// stops producing. The successor proves the delivery path every scaffolded app actually
// uses: no --globalPlugins is passed at all, so the only thing that can load either plugin
// is the project tsconfig's compilerOptions.plugins block.
test("M7c' tsserver loads both plugins from compilerOptions.plugins alone, with no globalPlugins", async () => {
	const scaffoldProject = copyFixtureProject(fixtureDirectory, workspaceRoot);
	const scaffoldServer = new TsserverHarness({
		project: scaffoldProject,
		workspaceRoot,
		globalPlugins: [],
	});
	try {
		expect(
			scaffoldServer.serverArguments,
			"M7c' harness invariant: the server must be started without --globalPlugins, otherwise this test cannot attribute plugin loading to the project tsconfig.",
		).not.toContain('--globalPlugins');

		const constructs = openFixture('constructs.tsrx', scaffoldProject, scaffoldServer);
		const catalog = await scaffoldServer.completionInfo(
			constructs.file,
			positionAfterMarker(constructs.marked, '/*M4_BODY*/'),
		);
		expect(
			completionNames(catalog).filter((name) => name.startsWith('@')),
			`M7c' missing capability: the core plugin's @ construct catalog must answer when only compilerOptions.plugins loads it.`,
		).toEqual(expect.arrayContaining([...baseConstructEntries]));

		const routerContexts = openFixture('router-contexts.tsrx', scaffoldProject, scaffoldServer);
		const hrefCompletion = await scaffoldServer.completionInfo(
			routerContexts.file,
			positionAfterMarker(routerContexts.marked, '/*M15_HREF_STRING*/'),
		);
		expect(
			completionNames(hrefCompletion),
			`M7c' missing capability: the router plugin must add the /library href completion when only compilerOptions.plugins loads it.`,
		).toContain('/library');

		const log = scaffoldServer.readLog();
		expect(
			log,
			`M7c' missing capability: the router plugin must log successful initialization, not merely appear resolvable.`,
		).toContain('[markless-router] TypeScript plugin loaded');
		expect(
			pluginResolutionErrors(log, [corePlugin, routerPlugin]),
			`M7c' missing capability: both plugins must initialize without resolution errors on the compilerOptions.plugins path.`,
		).toEqual([]);

		// Asserted last, so that removing a plugin entry from the fixture tsconfig fails on
		// the behaviour above first and names the capability that was lost, rather than
		// failing here on the declaration and saying nothing about what stopped working.
		const projectTsconfig = JSON.parse(
			readFileSync(join(scaffoldProject, 'tsconfig.json'), 'utf8'),
		) as any;
		expect(
			(projectTsconfig.compilerOptions?.plugins ?? []).map((plugin: any) => plugin?.name),
			"M7c' harness invariant: the behaviour above must be attributable to the fixture project declaring both plugins the way a scaffolded app does.",
		).toEqual([corePlugin, routerPlugin]);
	} finally {
		await scaffoldServer.close();
		removeFixtureProject(scaffoldProject);
	}
}, 30_000);

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

function protocolRangeAtSearch(
	source: string,
	token: string,
	length: number,
): {
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

// tsserver writes plugin resolution and activation failures with fixed message shapes.
// Anchoring on those shapes keeps this check on real failures: a bare `failed|error`
// substring also matches routine `WatchType: Failed Lookup Locations` watcher records and
// any log line naming a fixture such as component-prop-error.tsrx.
const pluginFailureShapes = [
	{ pattern: /^Failed to (?:load|dynamically import) module '([^']+)' from /, named: true },
	{ pattern: /^Couldn't find (\S+)$/, named: true },
	{ pattern: /^Skipped loading plugin (\S+) because /, named: true },
	// tsserver does not name the plugin on this one, so it is reported for any plugin.
	{ pattern: /^Plugin activation failed: /, named: false },
] as const;

const tsserverLogPrefix = /^(?:Err|Info|Perf)\s+\d+\s+\[[^\]]*\]\s*/;

function pluginResolutionErrors(log: string, pluginNames: readonly string[]): string[] {
	return log.split('\n').filter((line) => {
		const message = line.replace(tsserverLogPrefix, '');
		return pluginFailureShapes.some(({ pattern, named }) => {
			const match = pattern.exec(message);
			if (!match) return false;
			return !named || pluginNames.includes(match[1]);
		});
	});
}
