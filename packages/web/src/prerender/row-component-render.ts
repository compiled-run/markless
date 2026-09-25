import {
	projectionNotRenderedError,
	renderSsrData,
	withProjectionSpan,
	type SsrDataReadContext,
	type SsrDataStructure,
} from '../ssr-data/renderer.ts';
import type { ProtocolStatePayload } from '@markless/serializer';
import {
	marklessSsrAttachSnapshots,
	marklessComposeState,
	marklessSsrComposeView,
	marklessSsrSpreadProps,
	type MarklessSsrComposedChild,
} from '../fns/ssr.ts';
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import {
	marklessEnclosingWidgetGraphNodeId,
	marklessInstancePath,
	marklessRowFreeSymbolId,
	marklessRowSegment,
	marklessWithEnclosingWidgetRoots,
} from '../fns/instance-scope.ts';
import { marklessThen, type Awaitable } from '../ssr-data/awaitable.ts';
import { marklessRosterSeedPass, sharedSeedPass } from './shared-seed-slot.ts';
import {
	evaluatePrerenderDataComponent,
	marklessBoundGraphValues,
	readPath,
	type PrerenderDataDefinition,
	type PrerenderDataSurface,
	type PrerenderLoadSymbol,
	type PrerenderRead,
	type PrerenderRenderData,
	type SsrComposableChildOutput,
	type SsrComposableView,
} from './evaluator.ts';

export type RepeatRowComponentRender = {
	readonly html: string;
	readonly state: ProtocolStatePayload;
	readonly view: import('@markless/serializer').ProtocolViewPayload;
};

// The graph-node grammar for a shared() instance, restating public-render's
// spelling for the reason INSTANCE_PATH in fns/instance-scope restates its own.
const SHARED_INSTANCE_NODE = /^(?:shared|storage):/;

/**
 * The page's own shared instances, read live for a row born after the page was.
 *
 * A minted row renders without the live graph because its own cells do not exist
 * in it yet, but a page-scoped `shared()` instance is not the row's - it is state
 * the page has been writing since load. Left to its compile-time factory the row
 * paints from an empty queue and joins the DOM wrong, with a follow-up refresh to
 * correct it. A widget-scoped id is instance-prefixed in page space, so only a
 * page-scoped instance answers here; what the graph lacks keeps its factory.
 */
function liveSharedInstanceSeeds(
	surface: PrerenderDataSurface,
	componentName: string,
	read: PrerenderRead,
	seeded: ReadonlyMap<string, unknown> | undefined,
): ReadonlyMap<string, unknown> | undefined {
	let merged: Map<string, unknown> | undefined;
	for (const initial of surface.components[componentName]?.initialValues ?? []) {
		const graphNodeId = initial.graphNodeId;
		if (!SHARED_INSTANCE_NODE.test(graphNodeId)) continue;
		if (seeded?.has(graphNodeId) || merged?.has(graphNodeId)) continue;
		const live = read(graphNodeId, []);
		if (live === undefined) continue;
		merged ??= new Map(seeded ?? []);
		merged.set(graphNodeId, live);
	}
	return merged ?? seeded;
}

/**
 * One component edge, rendered for one keyed `@for` row, in page space.
 *
 * This is the same per-row work `renderChild` does - row segment, props off the
 * item, the seed pass, then composition - carved out for a client that has to
 * build a row the server never sent. The row's records are produced here rather
 * than shipped: a component row is one instance per rendered row, so markup
 * could never finish it.
 *
 * The child is evaluated WITHOUT the live graph on purpose. A minted row's cells
 * do not exist in it yet, so reading through it would answer `undefined` for
 * every one of them; the compile-time initial values are what the server's own
 * first render of that row would have used. Values the OWNER holds still cross
 * as props, read live.
 */
export type RepeatRowComponentInput = {
	readonly surface: PrerenderDataSurface;
	readonly ownerComponentName: string;
	readonly componentEdgeId: string;
	readonly itemPropName?: string;
	readonly item: unknown;
	readonly rowKey: unknown;
	readonly rowIndex: number;
	readonly loadSymbol: PrerenderLoadSymbol;
	readonly read: PrerenderRead;
	readonly idPrefix?: string;
	readonly symbolPrefix?: string;
	/**
	 * The live page's widget instances this row is being minted inside, by the
	 * definition id its parts spell. Without them a part reading a widget rooted
	 * outside the row resolves to a fresh instance of its own.
	 */
	readonly enclosingWidgetRoots?: ReadonlyMap<string, string>;
	/**
	 * The live instance path the repeat host stands at. It rides the row's own
	 * segment, because a key is only unique WITHIN one rendered repeat: two
	 * instances of one widget can each mint a row called `file-1`, and ids that
	 * said only `r:file-1:` would be one row to every reader on the page.
	 */
	readonly enclosingInstancePath?: string;
	/** The owner's records for the elements the row projects, which composition files per row. */
	readonly projectedView?: (
		view: import('@markless/serializer').ProtocolViewPayload,
		chunks: ReadonlyArray<PrerenderRenderData['chunks'][number]>,
		projectionChunkId: string,
		structure: SsrDataStructure,
		idPrefix: string,
	) => import('@markless/serializer').ProtocolViewPayload;
};

export function renderRepeatRowComponent(
	input: RepeatRowComponentInput,
): Awaitable<RepeatRowComponentRender> {
	// A refusal still answers as a rejection, so only a warm render skips the wait.
	try {
		if (!input.enclosingWidgetRoots?.size) return renderRowComponentEdge(input);
		// The row's graph ids compose behind the owner's symbol prefix (an island
		// segment, a composed child's edge), so the held segment carries it too.
		return marklessWithEnclosingWidgetRoots(
			marklessInstancePath((input.symbolPrefix ?? '') + rowSegmentOf(input)),
			input.enclosingWidgetRoots,
			() => renderRowComponentEdge(input),
		);
	} catch (error) {
		return Promise.reject(error);
	}
}

export function rowSegmentOf(input: {
	readonly rowKey: unknown;
	readonly enclosingInstancePath?: string;
}): string {
	return marklessRowSegment((input.enclosingInstancePath ?? '') + String(input.rowKey));
}

function renderRowComponentEdge(
	input: RepeatRowComponentInput,
): Awaitable<RepeatRowComponentRender> {
	const definition = input.surface.components[input.ownerComponentName];
	if (!definition)
		throw new Error(`MARKLESS_PRERENDER_DATA_COMPONENT_MISSING: ${input.ownerComponentName}`);
	const edge = (definition.edges ?? []).find(
		(candidate) => candidate.id === input.componentEdgeId,
	);
	if (!edge) throw new Error(`MARKLESS_PRERENDER_CHILD_MISSING: ${input.componentEdgeId}`);
	const ownerIdPrefix = input.idPrefix ?? '',
		ownerSymbolPrefix = input.symbolPrefix ?? '',
		rowSegment = rowSegmentOf(input),
		hostPrefix = rowSegment + edge.hostPrefix,
		symbolPrefix = rowSegment + edge.symbolPrefix,
		// The seed pass asks for a widget's nodes by the bare id the module spells,
		// which names no instance at all; the enclosing root is what turns it into
		// the live widget's node rather than a page-space one nothing ever wrote.
		enclosingRoots = input.enclosingWidgetRoots,
		read: PrerenderRead = enclosingRoots?.size
			? (graphNodeId, path) =>
					input.read(marklessEnclosingWidgetGraphNodeId(graphNodeId, enclosingRoots), path)
			: input.read;
	const readDecision = (source: string | undefined, context: SsrDataReadContext | undefined) =>
		source &&
		definition.readResidue?.(
			{ kind: 'authored-expression', source },
			{
				repeatItem: context?.repeatItem ?? input.item,
				repeatIndex: context?.repeatIndex ?? input.rowIndex,
				repeatId: context?.repeatId,
				repeatOuter: context?.repeatOuter,
				read,
				idPrefix: ownerIdPrefix,
			},
		);
	const ownerChunks = input.surface.renderData.chunks.filter(
		(chunk) => chunk.componentName === input.ownerComponentName,
	);
	// The projection chunk is a fact of the owner's own markup, so the row record
	// names the edge and this render reads the chunk off the surface.
	const projectionChunkId = ownerChunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'child-component' &&
			slot.componentEdgeId === input.componentEdgeId &&
			slot.projectionChunkId
				? [slot.projectionChunkId]
				: [],
		),
	)[0];
	const rowEdgeChildProps = (
		forEdge: NonNullable<PrerenderDataDefinition['edges']>[number],
		context: SsrDataReadContext | undefined,
		itemPropName: string | undefined,
	): { readonly props: Record<string, unknown>; readonly callbacks: Record<string, string> } => {
		const childProps: Record<string, unknown> = {};
		const callbacks: Record<string, string> = {};
		for (const prop of forEdge.props) {
			if (prop.name === itemPropName) {
				childProps[prop.name] = input.item;
			} else if (prop.kind === 'spread' && prop.graphNodeId) {
				Object.assign(
					childProps,
					marklessSsrSpreadProps(read(prop.graphNodeId, prop.path ?? []), prop.excludeNames),
				);
			} else if (prop.kind === 'graph-reference' && prop.graphNodeId) {
				childProps[prop.name] = read(prop.graphNodeId, prop.path ?? []);
			} else if (
				prop.kind === 'element-handle-id' &&
				prop.graphNodeId &&
				definition.readResidue
			) {
				childProps[prop.name] = definition.readResidue(
					{ kind: 'element-handle-id', handleGraphNodeId: prop.graphNodeId },
					{ read, idPrefix: ownerIdPrefix },
				);
			} else if (prop.kind === 'absent') {
				childProps[prop.name] = undefined;
			} else if (prop.kind === 'serializable' && 'value' in prop) {
				childProps[prop.name] = prop.value;
			} else if (prop.kind === 'callback') {
				const symbolId = forEdge.boundSymbols?.[prop.name] ?? prop.symbolId;
				if (symbolId) callbacks[prop.name] = ownerSymbolPrefix + symbolId;
			} else if (prop.source !== undefined && definition.readResidue) {
				childProps[prop.name] = readDecision(prop.source, context);
			} else {
				throw new Error(`MARKLESS_PRERENDER_PROP_UNDERIVABLE: ${prop.name}`);
			}
		}
		if (Object.keys(callbacks).length > 0) childProps.__marklessSsrCallbacks = callbacks;
		return { props: childProps, callbacks };
	};
	const { props: childProps, callbacks } = rowEdgeChildProps(
		edge,
		undefined,
		input.itemPropName,
	);
	const childSurface = input.surface.components[edge.childComponentName]
		? input.surface
		: input.surface.imports[edge.childComponentName];
	if (!childSurface)
		throw new Error(`MARKLESS_PRERENDER_DATA_COMPONENT_MISSING: ${edge.childComponentName}`);
	return marklessThen(
		sharedSeedPass()?.(
			{
				surface: input.surface,
				idPrefix: ownerIdPrefix,
				loadSymbol: input.loadSymbol,
				symbolPrefix: marklessRowFreeSymbolId(ownerSymbolPrefix, ownerSymbolPrefix),
				rowSegment,
				readEdgeProp: (prop) => readDecision(prop.source, undefined),
			},
			definition,
			{ componentEdgeId: edge.id, ...(projectionChunkId ? { projectionChunkId } : {}) },
			read,
			undefined,
		),
		(sharedSeeds) => {
			// The projected children are the OWNER's markup rendered inside this row, so
			// they render here - in the row's identity - and compose beside the row's own
			// child exactly as the served path composes them.
			const projected: Array<MarklessSsrComposedChild> = [];
			const projectedOutputs: Array<
				Awaited<ReturnType<typeof evaluatePrerenderDataComponent>>
			> = [];
			const projecting = projectionChunkId
				? renderSsrData({
						renderData: {
							...input.surface.renderData,
							root: {
								componentName: input.ownerComponentName,
								templateId: projectionChunkId,
							},
							chunks: ownerChunks,
							branches: definition.branches ?? [],
							boundaries: definition.boundaries ?? [],
						},
						idPrefix: ownerIdPrefix,
						projectionSegment: definition.rowHosts?.segment,
						...(sharedSeeds ? { sharedSeeds } : {}),
						rootContext: {
							item: input.item,
							index: input.rowIndex,
							key: input.rowKey,
							hostSegment: rowSegment,
						},
						read: (residue, context) => {
							if (residue.kind === 'repeat-item') return readPath(context.repeatItem, residue.path);
							if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
							if (definition.readResidue)
								return definition.readResidue(residue, {
									repeatItem: context.repeatItem,
									repeatIndex: context.repeatIndex,
									repeatId: context.repeatId,
									repeatOuter: context.repeatOuter,
									read,
									idPrefix: ownerIdPrefix,
								});
							throw new Error('MARKLESS_PRERENDER_RESIDUE_MISSING');
						},
						seedChild: (slot, context) =>
							marklessRosterSeedPass(context.sharedSeeds, () =>
								sharedSeedPass()?.(
									{
										surface: input.surface,
										idPrefix: ownerIdPrefix,
										loadSymbol: input.loadSymbol,
										symbolPrefix: marklessRowFreeSymbolId(ownerSymbolPrefix, ownerSymbolPrefix),
										rowSegment,
										readEdgeProp: (prop) => readDecision(prop.source, context),
									},
									definition,
									slot,
									read,
									context.sharedSeeds,
								),
							),
						renderChild: (slot, context) => {
							const projectedEdge = (definition.edges ?? []).find(
								(candidate) => candidate.id === slot.componentEdgeId,
							);
							if (!projectedEdge)
								throw new Error(`MARKLESS_PRERENDER_CHILD_MISSING: ${slot.componentEdgeId}`);
							const partSurface = input.surface.components[projectedEdge.childComponentName]
								? input.surface
								: input.surface.imports[projectedEdge.childComponentName];
							if (!partSurface)
								throw new Error(
									`MARKLESS_PRERENDER_DATA_COMPONENT_MISSING: ${projectedEdge.childComponentName}`,
								);
							const part = rowEdgeChildProps(projectedEdge, context, undefined);
							const partSeeds = liveSharedInstanceSeeds(
								partSurface,
								projectedEdge.childComponentName,
								read,
								context.sharedSeeds,
							);
							return marklessThen(
								evaluatePrerenderDataComponent({
									surface: partSurface,
									componentName: projectedEdge.childComponentName,
									props:
										context.projectionHtml === undefined
											? part.props
											: { ...part.props, children: context.projectionHtml },
									idPrefix: ownerIdPrefix + rowSegment + projectedEdge.hostPrefix,
									symbolPrefix: ownerSymbolPrefix + rowSegment + projectedEdge.symbolPrefix,
									boundSymbols: projectedEdge.boundSymbols,
									composer: { symbolPrefix: ownerSymbolPrefix, read },
									graphProps: projectedEdge.props,
									loadSymbol: input.loadSymbol,
									graph: undefined,
									requireHtml: true,
									...(partSeeds ? { sharedSeeds: partSeeds } : {}),
									boundGraphValues: marklessBoundGraphValues(
										undefined,
										partSurface,
										projectedEdge.props,
										read,
									),
								}),
								(partOutput) => {
									projectedOutputs.push(partOutput);
									projected.push({
										output: partOutput as SsrComposableChildOutput,
										hostPrefix: rowSegment + projectedEdge.hostPrefix,
										symbolPrefix:
											ownerSymbolPrefix + rowSegment + projectedEdge.symbolPrefix,
										graphProps: projectedEdge.props,
										asyncBoundaryId: projectedEdge.asyncBoundaryId,
										boundSymbols: projectedEdge.boundSymbols ?? {},
										callbackProps: part.callbacks,
										childrenWidgetRoot: sharedSeedPass()?.childrenWidgetRoot?.(
											partSurface,
											projectedEdge.childComponentName,
										),
										widgetFallbacks: sharedSeedPass()?.widgetFallbacks?.(
											partSurface,
											projectedEdge.childComponentName,
										),
									});
									return partOutput;
								},
							);
						},
					})
				: undefined;
			const renderRowChild = (children?: string) =>
				evaluatePrerenderDataComponent({
					surface: childSurface,
					componentName: edge.childComponentName,
					props: children === undefined ? childProps : { ...childProps, children },
					idPrefix: ownerIdPrefix + hostPrefix,
					symbolPrefix: ownerSymbolPrefix + symbolPrefix,
					boundSymbols: edge.boundSymbols,
					composer: { symbolPrefix: ownerSymbolPrefix, read },
					graphProps: edge.props,
					loadSymbol: input.loadSymbol,
					graph: undefined,
					requireHtml: true,
					sharedSeeds: liveSharedInstanceSeeds(
						childSurface,
						edge.childComponentName,
						read,
						sharedSeeds,
					),
					boundGraphValues: marklessBoundGraphValues(undefined, childSurface, edge.props, read),
				});
			return marklessThen(projecting, (projection) =>
				marklessThen(
					projection
						? marklessThen(
								withProjectionSpan(projection.structureTokens, (mark) =>
									renderRowChild(mark + projection.html),
								),
								(placed) => {
									if (!placed.consumed)
										throw projectionNotRenderedError(edge.childComponentName, edge.id);
									return placed.result;
								},
							)
						: renderRowChild(),
					(output) => {
					const child: MarklessSsrComposedChild = {
						output: output as SsrComposableChildOutput,
						hostPrefix,
						// Host ids take the owner's prefix through composition's own
						// argument; symbol ids have no such channel and take it here.
						symbolPrefix: ownerSymbolPrefix + symbolPrefix,
						graphProps: edge.props,
						asyncBoundaryId: edge.asyncBoundaryId,
						boundSymbols: edge.boundSymbols ?? {},
						callbackProps: callbacks,
						childrenWidgetRoot: sharedSeedPass()?.childrenWidgetRoot?.(
							childSurface,
							edge.childComponentName,
						),
						widgetFallbacks: sharedSeedPass()?.widgetFallbacks?.(
							childSurface,
							edge.childComponentName,
						),
					};
					// Projected first, the order the served path pushes them in: the projection
					// renders before the component it is written into.
					const children = [...projected, child];
					const asyncSnapshots = [...projectedOutputs, output].flatMap((composed) =>
						(composed.state?.computed ?? []).flatMap((computed) =>
							computed.async && computed.snapshot
								? [{ graphNodeId: computed.graphNodeId, snapshot: computed.snapshot }]
								: [],
						),
					);
					// The row chunk is nothing but this edge, so the child's own structure IS the
					// row's: view composition first, then state, the order composition requires.
					const composition = marklessSsrComposeView(
						output.structure!,
						((projectionChunkId &&
							input.projectedView?.(
								definition.view,
								ownerChunks,
								projectionChunkId,
								output.structure!,
								ownerIdPrefix,
							)) ??
							emptyRowView()) as SsrComposableView,
						children,
						asyncSnapshots,
						ownerIdPrefix,
					);
					const state = marklessSsrAttachSnapshots(
						marklessComposeState(emptyRowState(), children),
						asyncSnapshots,
					);
					return {
						html: output.html,
						state: state as unknown as ProtocolStatePayload,
						view: composition.view as unknown as import('@markless/serializer').ProtocolViewPayload,
					};
					},
				),
			);
		},
	);
}

function emptyRowState(): ProtocolStatePayload {
	return { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] };
}

function emptyRowView(): import('@markless/serializer').ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

