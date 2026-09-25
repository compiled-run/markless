import type { ResumeKeyedRepeatRecord, ResumeRenderDataThunk } from '../resume-types.ts';
import { marklessOwningSurface } from '../prerender/owning-surface.ts';
import { marklessThen, type Awaitable } from '../ssr-data/awaitable.ts';
import {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX as PROP,
	PROTOCOL_PROPS_GRAPH_NODE_ID as PROPS,
} from '../../../serializer/src/protocol-constants.ts';
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
		const routes = repeat.propRoutes;
		const own = (graphNodeId: string, path: ReadonlyArray<string>) =>
			graph.read(marklessComposedGraphNodeId(graphNodeId, instancePath), path);
		// A prop the row reads follows the parent node composition routed it to.
		const graphRead = (graphNodeId: string, path: ReadonlyArray<string> = []) => {
			const whole = graphNodeId === PROPS;
			const name = whole
				? path[0]
				: graphNodeId.startsWith(PROP)
					? graphNodeId.slice(PROP.length)
					: undefined;
			const route = routes?.find((entry) => entry.name === name);
			if (route) return graph.read(route.graphNodeId, [...route.path, ...path.slice(+whole)]);
			const value = own(graphNodeId, path);
			if (!whole) return value ?? (name === undefined ? value : own(PROPS, [name, ...path]));
			if (path.length > 0 || !routes) return value;
			const props: Record<string, unknown> = { ...(value as object) };
			for (const entry of routes)
				props[entry.name] = graph.read(entry.graphNodeId, entry.path);
			return props;
		};
		// A nested instance names the row enclosing it, so its slots read an enclosing item by repeat.
		const { authoredId, rowOuter } = repeat as {
			readonly authoredId?: string;
			readonly rowOuter?: () => unknown;
		};
		return (source: string, item: unknown, index: number) =>
			read(
				{ kind: 'authored-expression', source },
				{
					repeatItem: item,
					repeatIndex: index,
					...(rowOuter && { repeatId: authoredId ?? repeat.id, repeatOuter: rowOuter() }),
					read: graphRead,
				},
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
