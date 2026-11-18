// Turns one compile of a .tsrx file into the pieces the compiler figure lists: each with its stable ID, a short label, and the source span it came from.
import type { CompileTsrxModuleResult } from '../../../../packages/compiler/src/artifacts.ts';

export type PieceKind = 'state' | 'handler' | 'update';
/** `line` is zero-based; `from` and `to` are columns on that line, the span the figure washes. */
export type Piece = { readonly id: string; readonly kind: PieceKind; readonly what: string; readonly line: number; readonly from: number; readonly to: number };
export type Explored = { readonly pieces: Piece[]; readonly errors: string[] };

/** The source with comments blanked to spaces, so offsets still line up and a comment never matches a declaration. */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, ' '));

function place(source: string, start: number, end: number) {
	if (start < 0) return { line: -1, from: 0, to: 0 };
	const before = source.slice(0, start);
	const lineStart = before.lastIndexOf('\n') + 1;
	const next = source.indexOf('\n', start);
	return { line: before.split('\n').length - 1, from: start - lineStart, to: Math.min(end, next < 0 ? source.length : next) - lineStart };
}

export function piecesOf(result: CompileTsrxModuleResult, source: string): Explored {
	const graph = result.semanticGraph;
	const code = withoutComments(source);
	const pieces: Piece[] = [];
	for (const binding of graph.graphBindings) {
		if (binding.kind !== 'state') continue;
		const found = new RegExp(`\\b(let|const)\\s+${binding.name}\\b[^;\\n]*`).exec(code);
		pieces.push({ id: binding.id, kind: 'state', what: 'a watched value', ...place(source, found ? found.index : -1, found ? found.index + found[0].length : -1) });
	}
	for (const symbol of result.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const span = (symbol as { sourceSpan?: { start: number; end: number } }).sourceSpan;
			let start = span?.start ?? -1;
			let end = span?.end ?? -1;
			const attribute = span ? code.lastIndexOf('on', start) : -1;
			if (attribute >= 0 && /^on\w+=\{\s*$/.test(code.slice(attribute, start))) start = attribute;
			if (code[end] === '}') end += 1;
			pieces.push({ id: symbol.id, kind: 'handler', what: 'runs on ' + ((symbol as { eventName?: string }).eventName ?? 'an event'), ...place(source, start, end) });
		} else if (symbol.kind === 'dom-update') {
			const host = (symbol as { hostNodeId?: string }).hostNodeId;
			const from = (symbol as { source?: string }).source;
			const read = graph.templateReads.find((r) => r.hostNodeId === host && r.source === from) ?? graph.templateReads.find((r) => r.hostNodeId === host);
			let start = read?.sourceSpan?.start ?? -1;
			let end = read?.sourceSpan?.end ?? -1;
			if (start > 0 && code[start - 1] === '{' && code[end] === '}') {
				start -= 1;
				end += 1;
			}
			pieces.push({ id: symbol.id, kind: 'update', what: `updates the <${graph.hostNodes.find((h) => h.id === host)?.tagName ?? 'element'}>`, ...place(source, start, end) });
		}
	}
	pieces.sort((a, b) => (a.line < 0 ? 1e9 : a.line) - (b.line < 0 ? 1e9 : b.line));
	const errors = [graph.diagnostics, result.captureAnalysis.diagnostics, result.publicRenderModule.diagnostics]
		.flat()
		.filter((d) => d?.severity === 'error')
		.map((d) => d.code);
	return { pieces, errors: [...new Set(errors)] };
}
