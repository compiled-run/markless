// Turns one compile of a .tsrx file into the pieces the compiler figure lists: each with its stable ID, what it is, and the source line it came from.
import type { CompileTsrxModuleResult } from '../../../../packages/compiler/src/artifacts.ts';

export type Piece = { readonly id: string; readonly what: string; readonly line: number };
export type Explored = { readonly pieces: Piece[]; readonly errors: string[] };

const lineAt = (source: string, offset: number) => source.slice(0, Math.max(0, offset)).split('\n').length - 1;
/** The source with comments blanked to spaces, so offsets still line up and a comment never matches a declaration. */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, ' '));

export function piecesOf(result: CompileTsrxModuleResult, source: string): Explored {
	const graph = result.semanticGraph;
	const code = withoutComments(source);
	const pieces: Piece[] = [];
	for (const binding of graph.graphBindings) {
		if (binding.kind !== 'state') continue;
		const at = code.search(new RegExp(`\\b(let|const)\\s+${binding.name}\\b`));
		pieces.push({ id: binding.id, what: 'a value the page watches', line: at < 0 ? -1 : lineAt(source, at) });
	}
	for (const symbol of result.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const span = (symbol as { sourceSpan?: { start: number } }).sourceSpan;
			pieces.push({ id: symbol.id, what: `the ${(symbol as { eventName?: string }).eventName ?? ''} handler`, line: span ? lineAt(source, span.start) : -1 });
		} else if (symbol.kind === 'dom-update') {
			const host = (symbol as { hostNodeId?: string }).hostNodeId;
			const from = (symbol as { source?: string }).source;
			const read = graph.templateReads.find((r) => r.hostNodeId === host && r.source === from) ?? graph.templateReads.find((r) => r.hostNodeId === host);
			pieces.push({ id: symbol.id, what: `an update for <${graph.hostNodes.find((h) => h.id === host)?.tagName ?? 'element'}>`, line: read?.sourceSpan ? lineAt(source, read.sourceSpan.start) : -1 });
		}
	}
	const errors = [graph.diagnostics, result.captureAnalysis.diagnostics, result.publicRenderModule.diagnostics]
		.flat()
		.filter((d) => d?.severity === 'error')
		.map((d) => d.code);
	return { pieces, errors: [...new Set(errors)] };
}
