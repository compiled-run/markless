import type { ResumeKeyedRepeatRecord, ResumeRenderDataThunk } from '../resume-types.ts';
import { marklessOwningSurface } from '../prerender/owning-surface.ts';
import { marklessThen, type Awaitable } from '../ssr-data/awaitable.ts';
import { marklessComposedGraphNodeId } from './instance-scope.ts';
import * as rowMint from './row-mint.ts';

export type RowSlotReader = (source: string, item: unknown, index: number) => unknown;

/**
 * The template mint plus the reader for a row's expression slots: the owning
 * component's compiled render-data reader, the same one the server render used.
 * A component behind an import is found through the page's import chain, and
 * reads the ids its own module spells, qualified by the repeat's instance path.
 */
export function marklessRowSlotReader(
	renderData: ResumeRenderDataThunk | undefined,
	repeat: ResumeKeyedRepeatRecord,
	graph: rowMint.RowMintGraph,
): Awaitable<RowSlotReader | undefined> {
	const componentName = repeat.rowTemplate?.componentName;
	if (!componentName) return undefined;
	if (!renderData) throw rowSlotReaderMissing(repeat, componentName);
	return marklessThen(renderData(), (surface) => {
		const owner = marklessOwningSurface(
			surface,
			componentName,
			repeat.ownerHostNodeId ?? repeat.parentHostNodeId,
		);
		const read = owner?.surface.components[componentName]?.readResidue;
		if (!read) throw rowSlotReaderMissing(repeat, componentName);
		const instancePath = repeat.instancePath ?? '';
		const graphRead = (graphNodeId: string, path: ReadonlyArray<string> = []) =>
			graph.read(marklessComposedGraphNodeId(graphNodeId, instancePath), path);
		return (source: string, item: unknown, index: number) =>
			read(
				{ kind: 'authored-expression', source },
				{ repeatItem: item, repeatIndex: index, read: graphRead },
			);
	});
}

// A row whose slots nothing can answer would never render, so it refuses instead.
function rowSlotReaderMissing(repeat: ResumeKeyedRepeatRecord, componentName: string): Error {
	const code = 'MARKLESS_REPEAT_ROW_SLOT_READER_MISSING';
	return Object.assign(
		new Error(
			`${code}: ${repeat.id} renders rows through ${componentName}'s render-data reader, but this page's render data holds no reader for it.`,
		),
		{
			name: 'KeyedRepeatRuntimeError',
			code,
			severity: 'error',
			phase: 'runtime',
			repeatId: repeat.id,
			docsUrl: `https://markless.dev/errors/${code}`,
		},
	);
}

export function marklessRowSlotMint(renderData?: ResumeRenderDataThunk) {
	return {
		...rowMint,
		slotReader: (repeat: ResumeKeyedRepeatRecord, graph: rowMint.RowMintGraph) =>
			marklessRowSlotReader(renderData, repeat, graph),
	};
}
