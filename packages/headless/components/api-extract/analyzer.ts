import { createRequire } from 'node:module';
import { compileTsrxForTypeService } from '../../../compiler/src/type-service.ts';

// yuku is the compiler's declared dependency, not @markless/ui's, so the house
// analyzer is resolved from the package that owns it rather than re-declared.
const requireFromCompiler = createRequire(
	new URL('../../../compiler/package.json', import.meta.url),
);

export type AstNode = {
	type: string;
	start: number;
	end: number;
	[key: string]: unknown;
};

export type YukuComment = {
	type: 'Line' | 'Block';
	value: string;
	start: number;
	end: number;
};

export type YukuSymbol = {
	name: string;
	declarations: AstNode[];
};

export type YukuExport = {
	name: string | null;
	fromName: string | null;
	specifier: string | null;
	typeOnly: boolean;
	isStar: boolean;
	isNamespaceReexport: boolean;
	local: YukuSymbol | null;
	resolvedModule: YukuModule | null;
	node: AstNode;
};

export type YukuModule = {
	path: string;
	source: string;
	ast: AstNode & { body: AstNode[] };
	comments: YukuComment[];
	exports: YukuExport[];
	resolve(name: string, from?: unknown, space?: string): YukuSymbol | null;
	parentOf(node: AstNode): AstNode | null;
};

export type YukuAnalyzer = {
	addFile(path: string, source: string, options?: { lang?: string }): YukuModule;
	module(path: string): YukuModule | undefined;
	link(): void;
	definitionOf(symbol: YukuSymbol): { module: YukuModule; symbol: YukuSymbol | null } | null;
};

type AnalyzerConstructor = new (options?: {
	resolve?: (specifier: string, importerPath: string) => string | null;
}) => YukuAnalyzer;

const { Analyzer } = requireFromCompiler('yuku-analyzer') as { Analyzer: AnalyzerConstructor };

const joinModulePath = (importerPath: string, specifier: string): string => {
	const base = importerPath.slice(0, importerPath.lastIndexOf('/'));
	const segments: string[] = [];
	for (const segment of `${base}/${specifier}`.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') segments.pop();
		else segments.push(segment);
	}

	return segments.join('/');
};

/**
 * One analyzed project over a set of package-relative sources. `.tsrx` members
 * are lowered by the compiler's type service first, which is the same TSX the
 * editor type-checks, so the analyzer sees one language across the graph.
 */
export function analyzeSources(sources: ReadonlyMap<string, string>): YukuAnalyzer {
	const prepared = new Map<string, { source: string; lang: string }>();
	for (const [path, source] of sources) {
		if (path.endsWith('.tsrx')) {
			prepared.set(path, {
				source: compileTsrxForTypeService(source, path, { loose: true }).code,
				lang: 'tsx',
			});
			continue;
		}
		prepared.set(path, { source, lang: 'ts' });
	}

	const analyzer = new Analyzer({
		resolve(specifier, importerPath) {
			if (!specifier.startsWith('.')) return null;
			const resolved = joinModulePath(importerPath, specifier);

			return prepared.has(resolved) ? resolved : null;
		},
	});
	for (const [path, file] of prepared) analyzer.addFile(path, file.source, { lang: file.lang });
	analyzer.link();

	return analyzer;
}

/**
 * The declaration a symbol names. The analyzer records the declaring
 * identifier, so the statement that owns it is the identifier's parent.
 */
export function declarationOf(module: YukuModule, symbol: YukuSymbol): AstNode | null {
	const declaration = symbol.declarations[0];
	if (!declaration) return null;

	return module.parentOf(declaration) ?? declaration;
}

/** The doc comment immediately above `node`, unwrapped, or undefined. */
export function docCommentAbove(module: YukuModule, node: AstNode): string | undefined {
	let best: YukuComment | undefined;
	for (const comment of module.comments) {
		if (comment.type !== 'Block' || !comment.value.startsWith('*')) continue;
		if (comment.end > node.start) continue;
		if (module.source.slice(comment.end, node.start).trim() !== '') continue;
		if (!best || comment.end > best.end) best = comment;
	}
	if (!best) return undefined;

	const lines = best.value
		.slice(1)
		.split('\n')
		.map((line) => line.replace(/^\s*\* ?/, '').trimEnd());
	while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
	while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
	const text = lines.join('\n').trim();

	return text === '' ? undefined : text;
}
