// Type-level contract for storage(). @markless/core@0.2.0 shipped a tarball that
// contradicted itself: dist/index.d.ts required two arguments while
// agent/markless.md — inside the same tarball — documented the one-argument
// derived-key form that the compiler already implements
// (packages/compiler/src/passes/semantic-graph/collect-storage.ts). Consumers got
// a type error on code that compiles and runs.
//
// The mechanism here is deliberate. Root tsconfig.json excludes `packages/*/test`
// and no config enables Vitest typecheck, so `expectTypeOf` and a bare
// `@ts-expect-error` written in this file would be silent no-ops asserting
// nothing — they would reproduce the exact defect class. So the real
// src/framework-api.ts is fed to an in-memory `ts.createProgram` over virtual
// sources and the diagnostics are asserted, following
// packages/router/test/route-types.test.ts.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test, vi } from 'vitest';

// A TypeScript program per test: up to 2.8 s alone at load average 54, past 5 s in the pre-commit unit lane.
vi.setConfig({ testTimeout: 30_000 });

const packageRoot = resolve(import.meta.dirname, '..');
const frameworkApiPath = '/framework-api.ts';
const callSitePath = '/call-site.ts';

// The declaration under test, read from the source the published .d.ts is
// generated from rather than restated here.
const frameworkApiSource = readFileSync(resolve(packageRoot, 'src/framework-api.ts'), 'utf8');

test('storage() accepts the documented one-argument derived-key form', () => {
	expect(diagnosticsForCallSite("const theme: string = storage('light');\nvoid theme;")).toEqual(
		[],
	);
});

test('storage() accepts the explicit-key form', () => {
	expect(
		diagnosticsForCallSite("const theme: string = storage('theme', 'light');\nvoid theme;"),
	).toEqual([]);
});

test('storage() rejects zero arguments', () => {
	// A lone argument is the FALLBACK, never a bare key, so no-argument calls stay
	// an error rather than becoming valid when the one-argument form was added.
	const diagnostics = diagnosticsForCallSite('void storage();');

	expect(diagnostics.length).toBeGreaterThan(0);
	expect(diagnostics.join('\n')).toMatch(/argument/i);
});

test('storage() rejects three arguments', () => {
	const diagnostics = diagnosticsForCallSite("void storage('a', 'b', 'c');");

	expect(diagnostics.length).toBeGreaterThan(0);
	expect(diagnostics.join('\n')).toMatch(/argument/i);
});

// Requires `vp pack` output. Skipped when dist is absent (plain `vp test` runs
// without packing), mirroring scripts/release/publish-shape.test.ts. This is the
// assertion that ties the SHIPPED declaration to the SHIPPED doc: both files
// travel inside the same tarball, and their disagreement was the whole defect.
const packedDeclaration = resolve(packageRoot, 'dist/index.d.ts');
const packedEntry = resolve(packageRoot, 'dist/index.js');

describe.skipIf(!existsSync(packedDeclaration))(
	'packed declaration agrees with the packed agent doc (run `pnpm build` first)',
	() => {
		// Through the package's types entry, as a consumer resolves it: the pack may move the overloads into any chunk it emits.
		test('the packed types accept both storage forms and refuse a call without a fallback', () => {
			const callSite = (body: string) =>
				diagnosticsForCallSite(body, `import { storage } from ${JSON.stringify(packedEntry)};`);

			expect(callSite("const theme: string = storage('light');")).toEqual([]);
			expect(callSite("const theme: string = storage('theme', 'light');")).toEqual([]);
			expect(callSite('storage();').join('\n')).toMatch(/argument/i);
		});

		test('agent/markless.md documents both forms the declaration accepts', () => {
			// agent/markless.md ships inside the core tarball and is what agents read.
			const doc = readFileSync(resolve(packageRoot, 'agent/markless.md'), 'utf8');

			expect(doc).toContain("storage('light')");
			expect(doc).toContain("storage('theme', 'light')");
		});
	},
);

/**
 * Typechecks `body` against the real framework API source and returns the
 * flattened diagnostic messages. Empty means the call site typechecks.
 */
function diagnosticsForCallSite(
	body: string,
	imports = "import { storage } from './framework-api';",
): string[] {
	const sources = new Map([
		[frameworkApiPath, frameworkApiSource],
		[callSitePath, `${imports}\n${body}\n`],
	]);
	const program = ts.createProgram(
		[callSitePath],
		{
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			noEmit: true,
			skipLibCheck: true,
			strict: true,
			target: ts.ScriptTarget.ES2023,
		},
		createMemoryCompilerHost(sources),
	);

	// Only the call site's own: the packed types import workspace packages whose sources TypeScript checks on their own terms.
	return ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => diagnostic.file?.fileName === callSitePath)
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

function createMemoryCompilerHost(sources: ReadonlyMap<string, string>) {
	const host = ts.createCompilerHost({});
	const originalFileExists = host.fileExists.bind(host);
	const originalReadFile = host.readFile.bind(host);
	const originalGetSourceFile = host.getSourceFile.bind(host);

	host.fileExists = (fileName) => sources.has(fileName) || originalFileExists(fileName);
	host.readFile = (fileName) => sources.get(fileName) ?? originalReadFile(fileName);
	host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
		const source = sources.get(fileName);
		if (source !== undefined) {
			return ts.createSourceFile(fileName, source, languageVersion);
		}

		return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
	};

	return host;
}
