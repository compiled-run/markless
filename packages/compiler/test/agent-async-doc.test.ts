import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { markdownToMdast, type MdastNode } from 'satteri';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../src/collect-diagnostics.ts';
import { compileTsrxModule } from '../src/index.ts';

// agent/async.md ships in the @markless/core tarball and is what agents copy from.
const doc = readFileSync(resolve(import.meta.dirname, '../../core/agent/async.md'), 'utf8');
const tree = markdownToMdast(doc);

function nodes(node: MdastNode, type: string): MdastNode[] {
	const own = node.type === type ? [node] : [];
	const children = 'children' in node && Array.isArray(node.children) ? (node.children as MdastNode[]) : [];
	return [...own, ...children.flatMap((child) => nodes(child, type))];
}

const blocks = nodes(tree, 'code').filter((node) => 'lang' in node && node.lang === 'tsrx');

test('the page has tsrx examples to check', () => {
	expect(blocks.length).toBeGreaterThan(1);
});

test.each(blocks.map((block, index) => [index, 'value' in block ? String(block.value) : '']))(
	'tsrx block %i compiles as a whole component with no errors',
	async (index, source) => {
		const result = await compileTsrxModule({ filename: `src/block-${index}.tsrx`, source, symbols: [] });
		const errors = collectTsrxModuleDiagnostics(result).filter((diagnostic) => diagnostic.severity === 'error');
		expect(errors.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)).toEqual([]);
	},
);

// The codes are checked by the type checker against the compiler's own diagnostic code unions.
function codesOutsideUnion(codes: readonly string[]): string[] {
	const artifacts = resolve(import.meta.dirname, '../src/artifacts.ts');
	const probe = resolve(import.meta.dirname, '../src/__agent-doc-codes.ts');
	const probeSource = `import type { SemanticGraphDiagnostic, StateLoweringDiagnostic } from './artifacts.ts';
type Code = SemanticGraphDiagnostic['code'] | StateLoweringDiagnostic['code'];
${codes.map((code, index) => `export const code${index}: Code = ${JSON.stringify(code)};`).join('\n')}
`;
	const options: ts.CompilerOptions = {
		noEmit: true,
		strict: true,
		skipLibCheck: true,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		allowImportingTsExtensions: true,
	};
	const host = ts.createCompilerHost(options);
	const readFile = host.readFile.bind(host);
	const getSourceFile = host.getSourceFile.bind(host);
	host.readFile = (file) => (file === probe ? probeSource : readFile(file));
	host.fileExists = (file) => file === probe || ts.sys.fileExists(file);
	host.getSourceFile = (file, version) =>
		file === probe ? ts.createSourceFile(file, probeSource, version) : getSourceFile(file, version);
	const program = ts.createProgram({ rootNames: [probe, artifacts], options, host });
	const probeFile = program.getSourceFile(probe)!;
	return program
		.getSemanticDiagnostics(probeFile)
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

test('every build error the page lists is a compiler code', { timeout: 60_000 }, () => {
	const named = [
		...new Set(
			nodes(tree, 'inlineCode')
				.map((node) => ('value' in node ? String(node.value) : ''))
				.filter((value) => value.startsWith('MARKLESS_')),
		),
	];
	expect(named.length).toBeGreaterThan(3);
	expect(codesOutsideUnion(named)).toEqual([]);
});
