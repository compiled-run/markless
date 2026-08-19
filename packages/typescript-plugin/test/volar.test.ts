import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compileToVolarMappings } from '@markless/typescript-plugin/volar';
import ts from 'typescript';
import { beforeAll, expect, test } from 'vitest';

type VolarResult = ReturnType<typeof compileToVolarMappings>;

const expectedFeatureData = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
};

// language.test.ts needs the same dist/ and runs as a separate worker, while build:cjs
// opens by deleting dist/ - so the run builds it once behind this shared lock.
const cjsBuildLockDir = join(
	tmpdir(),
	`markless-tsplugin-cjs-${process.env.MARKLESS_TSPLUGIN_CJS_BUILD_RUN ?? process.ppid}`,
);

beforeAll(() => {
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
			// Release the lock so the waiting worker fails on the build, not on a timeout.
			rmSync(cjsBuildLockDir, { recursive: true, force: true });
			throw error;
		}
	}
}, 180_000);

test('built CommonJS Volar entry resolves through the published package subpath', () => {
	const require = createRequire(join(process.cwd(), 'package.json'));
	const cjsVolar = require('@markless/typescript-plugin/volar') as {
		compileToVolarMappings?: typeof compileToVolarMappings;
	};

	expect(typeof cjsVolar.compileToVolarMappings).toBe('function');
	const result = cjsVolar.compileToVolarMappings?.(
		'export default function ShippedEntry() @{ <main>ready</main> }',
		'ShippedEntry.tsrx',
		{ loose: true },
	);
	expect(result).toMatchObject({
		code: expect.any(String),
		mappings: expect.any(Array),
		cssMappings: expect.any(Array),
		errors: expect.any(Array),
	});
});

test('compileToVolarMappings emits typed TSX and fully featured source mappings', () => {
	const source = `import { state } from '@markless/core';

function StatusBadge({ label }: { label: string }) @{
	<strong class="status">{label}</strong>
}

export default function Home() @{
	let visits = state(0);
	<main class="home">
		<button onClick={() => visits++}>Visited {visits}</button>
		<StatusBadge label={\`Visit ${'${visits}'}\`} />
		<style>
			.home { display: grid; }
		</style>
	</main>
}`;

	const result = compileToVolarMappings(source, 'Home.tsrx', { loose: true });

	expect(result.errors).toEqual([]);
	expect(result.sourceAst.type).toBe('Program');
	expect(result.code).toContain("import { state } from '@markless/core';");
	expect(result.code).toContain('export default function Home()');
	expect(result.code).toContain('let visits = state(0);');
	expect(result.code).toContain('<button onClick={() => visits++}>');
	expect(result.code).toContain('<StatusBadge label={`Visit ${visits}`} />');
	expect(result.code).not.toContain('<style>');
	expect(result.cssMappings[0]?.data.customData.content).toContain('.home { display: grid; }');

	for (const [text, from] of [
		['main', source.indexOf('<main')],
		['label', source.indexOf('label=', source.indexOf('<StatusBadge'))],
		['visits', source.indexOf('let visits')],
	] as const) {
		const sourceOffset = source.indexOf(text, from);
		const mapping = exactMappingAt(result, source, sourceOffset, text.length);
		expect(mapping?.data, `Volar features for ${text}`).toMatchObject(expectedFeatureData);
		expect(mapping?.generatedLengths).toEqual([text.length]);
		expect(
			result.code.slice(
				mapping?.generatedOffsets[0],
				(mapping?.generatedOffsets[0] ?? 0) + (mapping?.generatedLengths[0] ?? 0),
			),
			`generated round trip for ${text}`,
		).toBe(source.slice(sourceOffset, sourceOffset + text.length));
	}
});

test('style mappings have stable document-scoped embedded IDs', () => {
	const source = `export default function Palette() @{
	<section>
		<style>.swatch { color: rebeccapurple; }</style>
		<div class="swatch">Sample</div>
		<style>section { padding: 2rem; }</style>
	</section>
}`;
	const recompiledSource = source.replace('rebeccapurple', 'darkorange');
	const first = compileToVolarMappings(source, 'themes/Palette.tsrx', { loose: true });
	const second = compileToVolarMappings(recompiledSource, 'themes/Palette.tsrx', {
		loose: true,
	});
	const firstIds = first.cssMappings.map((mapping) => mapping.data.customData.embeddedId);
	const secondIds = second.cssMappings.map((mapping) => mapping.data.customData.embeddedId);

	expect(firstIds).toHaveLength(2);
	expect(firstIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
	// URI-authority-safe: the host lowercases the authority, so any other charset breaks lookup.
	expect(firstIds.every((id) => /^[a-z0-9_-]+$/.test(id as string))).toBe(true);
	expect(new Set(firstIds).size).toBe(firstIds.length);
	expect(secondIds).toEqual(firstIds);
	expect(
		compileToVolarMappings(source, 'themes/AlternatePalette.tsrx', { loose: true })
			.cssMappings[0]?.data.customData.embeddedId,
	).not.toBe(firstIds[0]);
});

test('imported component prop expressions retain mapped TypeScript diagnostics', () => {
	const gaugeSource = `export function Gauge({ enabled }: { enabled: boolean }) @{
	<aside>{enabled ? 'On' : 'Off'}</aside>
}`;
	const panelSource = `import { Gauge } from './Gauge.tsrx';

export default function ControlPanel() @{
	<nav>
		<span>Power</span>
		<Gauge enabled={42} />
	</nav>
}`;
	const gauge = compileToVolarMappings(gaugeSource, 'Gauge.tsrx', { loose: true });
	const panel = compileToVolarMappings(panelSource, 'ControlPanel.tsrx', { loose: true });
	const propNameOffset = panelSource.indexOf('enabled={42}');
	const expressionOffset = panelSource.indexOf('42', propNameOffset);
	const diagnostics = typeCheckGeneratedSources({
		'ControlPanel.tsrx.tsx': panel.code,
		'Gauge.tsrx.tsx': gauge.code,
	});
	const propDiagnostic = diagnostics.find((diagnostic) =>
		ts
			.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
			.includes("Type 'number' is not assignable to type 'boolean'"),
	);

	expect(
		exactMappingAt(panel, panelSource, propNameOffset, 'enabled'.length)?.data,
	).toMatchObject({
		verification: true,
	});
	expect(exactMappingAt(panel, panelSource, expressionOffset, '42'.length)?.data).toMatchObject({
		verification: true,
	});
	expect(propDiagnostic, formatDiagnostics(diagnostics).join('\n')).toBeDefined();
	expect(mapGeneratedDiagnosticToSource(panel, propDiagnostic)?.start).toBe(propNameOffset);
});

test('alternate component shape preserves mapped TypeScript prop diagnostics', () => {
	const source = `import { state } from '@markless/core';

function Meter({ amount }: { amount: number }) @{
	<output class="meter">{amount}</output>
}

export default function Dashboard() @{
	let total = state(1);
	<article class="dashboard">
		<Meter amount="many" />
		<a href="/next" onClick={() => total++}>Next {total}</a>
		<style>.dashboard { gap: 1rem; }</style>
	</article>
}`;
	const result = compileToVolarMappings(source, 'Dashboard.tsrx', { loose: true });
	const diagnostics = typeCheckGeneratedSource('Dashboard.tsrx', result.code);
	const propDiagnostic = diagnostics.find((diagnostic) =>
		ts
			.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
			.includes("Type 'string' is not assignable to type 'number'"),
	);

	expect(result.code).toContain('<output class="meter">');
	expect(result.code).toContain('<Meter amount="many" />');
	expect(propDiagnostic, formatDiagnostics(diagnostics).join('\n')).toBeDefined();
	expect(mapGeneratedDiagnosticToSource(result, propDiagnostic)?.start).toBe(
		source.indexOf('amount="many"'),
	);
	expect(
		exactMappingAt(result, source, source.indexOf('article'), 'article'.length)?.data,
	).toMatchObject(expectedFeatureData);
});

test('returns recoverable usage errors and throws unusable files as fatal errors', () => {
	const recoverableSource = `export default function Duplicate() @{
	let repeated = 1;
	let repeated = 2;
	<span>{repeated}</span>
}`;
	const recoverable = compileToVolarMappings(recoverableSource, 'Duplicate.tsrx', {
		loose: true,
	});

	expect(recoverable.code).toContain('return <span>{repeated}</span>');
	expect(recoverable.errors).toEqual([
		expect.objectContaining({
			message: expect.stringContaining("Identifier 'repeated' has already been declared"),
			type: 'usage',
			pos: recoverableSource.indexOf('repeated', recoverableSource.indexOf('repeated') + 1),
		}),
	]);

	let fatal: unknown;
	try {
		compileToVolarMappings('export default function Broken() @{ <div>', 'Broken.tsrx', {
			loose: true,
		});
	} catch (error) {
		fatal = error;
	}
	expect(fatal).toMatchObject({ type: 'fatal', pos: expect.any(Number) });
});

// The editor host compiles .tsrx through this module and turns any throw into a fatal
// file with no virtual code at all, so half-finished edits have to be recovered here.
test('a member dot with nothing after it keeps the file compiling and stays typed', () => {
	const source = `export default function Panel() @{
	const model = { title: 'Markless', count: 1 };
	model.;
	<span>{model.title}</span>
}`;
	const result = compileToVolarMappings(source, 'Panel.tsrx', { loose: true });
	const dotOffset = source.indexOf('model.;') + 'model'.length;
	const modelMapping = exactMappingAt(result, source, source.indexOf('model.;'), 'model'.length);
	// The typed dot itself must map, or member completion has nothing to attach to.
	const dotMapping = result.mappings.find((mapping) => mapping.sourceOffsets[0] === dotOffset);

	expect(result.code).toContain('model.');
	expect(modelMapping?.data).toMatchObject({ completion: true });
	expect(dotMapping).toMatchObject({ lengths: [1], generatedLengths: [1] });
	expect(
		result.code.slice(
			dotMapping?.generatedOffsets[0],
			(dotMapping?.generatedOffsets[0] ?? 0) + 1,
		),
	).toBe('.');
});

test('a bare @ construct keeps the rest of the file compiled and mapped', () => {
	const source = `export default function Draft({ label }: { label: string }) @{
	const heading = label.toUpperCase();
	@
	<h1>{heading}</h1>
}`;
	const result = compileToVolarMappings(source, 'Draft.tsrx', { loose: true });
	const headingOffset = source.indexOf('heading');

	expect(result.code).toContain('label.toUpperCase()');
	expect(exactMappingAt(result, source, headingOffset, 'heading'.length)?.data).toMatchObject({
		verification: true,
		completion: true,
	});
});

// `<style>` content is parsed as structured CSS, so a mid-typing rule throws even though
// the rest of the file is intact - the style text has to be recovered, not the whole file.
test('a half-typed CSS selector keeps the file compiling with its authored style text', () => {
	const source = `export default function Card() @{
	let hits = 1;
	<article class="card">
		<button onClick={() => hits++}>Hits {hits}</button>
		<style>
			.card { display: grid; }
			.
		</style>
	</article>
}`;
	const result = compileToVolarMappings(source, 'Card.tsrx', { loose: true });
	const styleStart = source.indexOf('<style>') + '<style>'.length;
	const styleEnd = source.indexOf('</style>');

	expect(result.code).toContain('<button onClick={() => hits++}>');
	expect(result.cssMappings).toHaveLength(1);
	expect(result.cssMappings[0]?.data.customData.content).toBe(
		source.slice(styleStart, styleEnd),
	);
	expect(result.cssMappings[0]?.sourceOffsets).toEqual([styleStart]);
	expect(result.cssMappings[0]?.lengths).toEqual([styleEnd - styleStart]);
	expect(
		exactMappingAt(result, source, source.indexOf('hits'), 'hits'.length)?.data,
	).toMatchObject(expectedFeatureData);
});

test('an unclosed CSS rule keeps the file compiling with its authored style text', () => {
	const source = `export default function Toolbar() @{
	const label = 'Save';
	<nav class="toolbar">
		<button>{label}</button>
		<style>
			.toolbar { display: flex; }
			.my-button {
		</style>
	</nav>
}`;
	const result = compileToVolarMappings(source, 'Toolbar.tsrx', { loose: true });
	const styleStart = source.indexOf('<style>') + '<style>'.length;
	const styleEnd = source.indexOf('</style>');

	expect(result.code).toContain("const label = 'Save';");
	expect(result.cssMappings).toHaveLength(1);
	expect(result.cssMappings[0]?.data.customData.content).toBe(
		source.slice(styleStart, styleEnd),
	);
	expect(result.cssMappings[0]?.sourceOffsets).toEqual([styleStart]);
	expect(result.cssMappings[0]?.lengths).toEqual([styleEnd - styleStart]);
	expect(
		exactMappingAt(result, source, source.indexOf('label'), 'label'.length)?.data,
	).toMatchObject(expectedFeatureData);
});

// A `<style>` next to another root element makes the component multi-sibling, so the
// fragment-wrapping recovery rung compiles a source whose offsets no longer line up with
// the authored file. The markup text spans come off that recovered AST while the mappings
// were translated back to authored offsets, and correlating the two spaces directly used
// to land the text spans on the `<section>` tags - escaping them into `&lt;` and emitting
// a document TypeScript could not parse.
test('a style element beside sibling markup leaves the sibling tags unescaped', () => {
	const source = `export function App() @{
	<style>.counter { color: red; }</style>
	<section>hello</section>
}`;
	const result = compileToVolarMappings(source, 'Style.tsrx', { loose: true });

	expect(result.code).toContain('<section>hello</section>');
	expect(result.code).not.toContain('&lt;');
	expect(
		exactMappingAt(result, source, source.indexOf('section'), 'section'.length)?.data,
	).toMatchObject(expectedFeatureData);
});

test('a half-typed CSS declaration beside sibling markup keeps both usable', () => {
	const source = `export function App() @{
	<style>.counter { colo</style>
	<section>hello</section>
}`;
	const result = compileToVolarMappings(source, 'Half.tsrx', { loose: true });
	const styleStart = source.indexOf('<style>') + '<style>'.length;
	const styleEnd = source.indexOf('</style>');

	expect(result.code).toContain('<section>hello</section>');
	expect(result.code).not.toContain('&lt;');
	expect(result.cssMappings).toHaveLength(1);
	expect(result.cssMappings[0]?.data.customData.content).toBe(source.slice(styleStart, styleEnd));
	expect(result.cssMappings[0]?.sourceOffsets).toEqual([styleStart]);
	expect(result.cssMappings[0]?.lengths).toEqual([styleEnd - styleStart]);
	expect(
		exactMappingAt(result, source, source.indexOf('section'), 'section'.length)?.data,
	).toMatchObject(expectedFeatureData);
});

test('an unusable file without a style element still throws as fatal', () => {
	let fatal: unknown;
	try {
		compileToVolarMappings('export default function Sketch() @{ <section>', 'Sketch.tsrx', {
			loose: true,
		});
	} catch (error) {
		fatal = error;
	}

	expect(fatal).toMatchObject({ type: 'fatal' });
});

test('an import clause maps its interior, not only its specifier tokens', () => {
	const source = `import { Nav } from './Nav.tsrx';

export default function Shell() @{
	<Nav />
}`;
	const result = compileToVolarMappings(source, 'Shell.tsrx', { loose: true });
	const interiorOffset = source.indexOf('{ Nav }') + 1;
	const covering = result.mappings.filter(
		(mapping) =>
			mapping.sourceOffsets[0] <= interiorOffset &&
			mapping.sourceOffsets[0] + mapping.lengths[0] > interiorOffset &&
			mapping.lengths[0] > 'Nav'.length,
	);

	expect(covering).toHaveLength(1);
	expect(
		source.slice(
			covering[0].sourceOffsets[0],
			covering[0].sourceOffsets[0] + covering[0].lengths[0],
		),
	).toBe(' Nav ');
	expect(
		result.code.slice(
			covering[0].generatedOffsets[0],
			covering[0].generatedOffsets[0] + covering[0].generatedLengths[0],
		),
	).toBe(' Nav ');
});

function exactMappingAt(
	result: VolarResult,
	source: string,
	sourceOffset: number,
	length: number,
): VolarResult['mappings'][number] | undefined {
	return result.mappings.find(
		(mapping) =>
			mapping.sourceOffsets[0] === sourceOffset &&
			mapping.lengths[0] === length &&
			result.code.slice(
				mapping.generatedOffsets[0],
				mapping.generatedOffsets[0] + mapping.generatedLengths[0],
			) === source.slice(sourceOffset, sourceOffset + length),
	);
}

function mapGeneratedDiagnosticToSource(
	result: VolarResult,
	diagnostic: ts.Diagnostic,
): { start: number; length: number } | undefined {
	if (diagnostic.start === undefined) return undefined;
	const generatedEnd = diagnostic.start + (diagnostic.length ?? 1);
	const mapping = result.mappings.find((candidate) => {
		const mappingStart = candidate.generatedOffsets[0];
		const mappingEnd = mappingStart + candidate.generatedLengths[0];
		return (
			candidate.data.verification &&
			mappingStart <= diagnostic.start! &&
			generatedEnd <= mappingEnd
		);
	});
	if (!mapping) return undefined;

	const delta = diagnostic.start - mapping.generatedOffsets[0];
	return {
		start: mapping.sourceOffsets[0] + Math.min(delta, mapping.lengths[0]),
		length: Math.min(diagnostic.length ?? 1, mapping.lengths[0]),
	};
}

function typeCheckGeneratedSource(fileName: string, source: string): readonly ts.Diagnostic[] {
	return typeCheckGeneratedSources({ [`${fileName}.tsx`]: source });
}

function typeCheckGeneratedSources(
	sources: Readonly<Record<string, string>>,
): readonly ts.Diagnostic[] {
	const configPath = ts.findConfigFile('.', ts.sys.fileExists, 'tsconfig.json');
	if (!configPath) throw new Error('Expected root tsconfig.json.');
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsedConfig = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		dirname(configPath),
	);
	const virtualSources = new Map(
		Object.entries(sources).map(([fileName, source]) => [
			join(process.cwd(), 'packages/typescript-plugin/test', fileName),
			source,
		]),
	);
	const host = ts.createCompilerHost(parsedConfig.options);
	const fileExists = host.fileExists.bind(host);
	const readFile = host.readFile.bind(host);
	host.fileExists = (candidate) => virtualSources.has(candidate) || fileExists(candidate);
	host.readFile = (candidate) => virtualSources.get(candidate) ?? readFile(candidate);

	const program = ts.createProgram(
		[...virtualSources.keys()],
		{
			...parsedConfig.options,
			jsx: ts.JsxEmit.Preserve,
			noEmit: true,
			strict: true,
		},
		host,
	);
	return ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => virtualSources.has(diagnostic.file?.fileName ?? ''));
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
	return diagnostics.map((diagnostic) =>
		ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
	);
}
