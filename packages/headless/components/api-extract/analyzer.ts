import { Analyzer, type Binding, type Module } from 'yuku/analyzer';
import { compileTsrxForTypeService } from '../../../compiler/src/type-service.ts';

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

export type YukuModule = Module;
export type YukuSymbol = Binding;
export type YukuAnalyzer = Analyzer;

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
	const prepared = new Map<string, { source: string; lang: 'ts' | 'tsx' }>();
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
	for (const [path, file] of prepared) analyzer.setFile(path, file.source, { lang: file.lang });
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

	return (module.parentOf(declaration) ?? declaration) as unknown as AstNode;
}

/** The doc comment immediately above `node`, unwrapped, or undefined. */
export function docCommentAbove(module: YukuModule, node: AstNode): string | undefined {
	let best: YukuComment | undefined;
	for (const comment of module.comments as YukuComment[]) {
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
