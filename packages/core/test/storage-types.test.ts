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
import { describe, expect, test } from 'vitest';

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

describe.skipIf(!existsSync(packedDeclaration))(
	'packed declaration agrees with the packed agent doc (run `pnpm build` first)',
	() => {
		test('dist/index.d.ts declares both storage overloads', () => {
			const declaration = readFileSync(packedDeclaration, 'utf8');

			expect(declaration).toMatch(/storage\(fallback: string\): string/);
			expect(declaration).toMatch(/storage\(key: string, fallback: string\): string/);
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
function diagnosticsForCallSite(body: string): string[] {
	const sources = new Map([
		[frameworkApiPath, frameworkApiSource],
		[callSitePath, `import { storage } from './framework-api';\n${body}\n`],
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

	return ts
		.getPreEmitDiagnostics(program)
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
