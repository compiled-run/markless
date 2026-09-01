import {
	marklessInstancePath,
	marklessInstanceScopedLoadSymbol,
} from '../../../../web/src/fns/instance-scope.ts';
import {
	protocolInstancePath,
	protocolInstanceQualifies,
	protocolStateVersion,
} from '../../../../serializer/src/protocol-constants.ts';

export type MdxRoutePart =
	| {
			readonly kind: 'html';
			readonly elementCount: number;
			readonly html?: string;
			readonly elementTags?: ReadonlyArray<string>;
	  }
	| {
			readonly kind: 'component';
			readonly componentIndex: number;
	  };

export type MdxRenderOutput = {
	readonly html?: string;
	readonly root?: ChildNode;
	readonly state?: MdxStatePayload;
	readonly view?: MdxViewPayload;
	readonly loadSymbol?: (symbolId: string) => unknown;
};

export type MdxChild = {
	readonly componentIndex: number;
	readonly hostPrefix: string;
	readonly symbolPrefix: string;
	readonly output?: MdxRenderOutput;
};

export type MdxComponentArtifact = {
	// MaybePromise: compiled artifacts are async — a sync type here is what
	// let unawaited .html reads slip past vp check.
	readonly renderSsr?: (props?: unknown) => MdxRenderOutput | Promise<MdxRenderOutput>;
	readonly renderCsr?: (props?: unknown) => MdxRenderOutput | Promise<MdxRenderOutput>;
};

export type MdxSymbolLoader = {
	readonly prefix: string;
	readonly loadSymbol: (symbolId: string) => unknown;
};

type MdxRenderDataSurface = {
	readonly rootComponentName: string | null;
	readonly renderData: Readonly<Record<string, unknown>>;
	readonly components: Readonly<Record<string, unknown>>;
	readonly imports: Readonly<Record<string, MdxRenderDataSurface>>;
};

type MdxRenderDataChild = {
	readonly componentIndex: number;
	readonly hostPrefix: string;
	readonly symbolPrefix: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly surface: MdxRenderDataSurface;
};

// MDX contributes only static markup records. Imported TSRX children keep their
// compiler-emitted render-data surfaces and compose through ordinary child edges.
export function createMdxRenderDataSurface(
	parts: ReadonlyArray<MdxRoutePart>,
	children: ReadonlyArray<MdxRenderDataChild>,
): MdxRenderDataSurface {
	const componentName = 'MarklessMdxRoute';
	const rootChunkId = `template:${componentName}`;
	const childrenByIndex = new Map(children.map((child) => [child.componentIndex, child]));
	const statics: string[] = [];
	const slots: Array<Record<string, unknown>> = [];
	const hosts: Array<Record<string, unknown>> = [
		{
			hostNodeId: '__mdx:root',
			tagName: 'main',
			coordinate: { kind: 'child-index', path: [0] },
		},
	];
	const edges: Array<Record<string, unknown>> = [];
	let staticHtml = '<main data-markless-mdx-root>';
	let slotIndex = 0;
	for (const [partIndex, part] of parts.entries()) {
		if (part.kind === 'html') {
			staticHtml += part.html ?? '';
			for (const [tagIndex, tagName] of (part.elementTags ?? []).entries()) {
				hosts.push({
					hostNodeId: `__mdx:static:${partIndex}:${tagIndex}`,
					tagName,
					coordinate: { kind: 'child-index', path: [0, partIndex, tagIndex] },
				});
			}
			continue;
		}
		const child = childrenByIndex.get(part.componentIndex);
		if (!child)
			throw new Error(`MARKLESS_MDX_RENDER_DATA_CHILD_MISSING: ${part.componentIndex}`);
		const childComponentName = child.surface.rootComponentName;
		if (!childComponentName) {
			throw new Error(`MARKLESS_MDX_RENDER_DATA_ROOT_MISSING: ${part.componentIndex}`);
		}
		const edgeId = `mdx:edge:${part.componentIndex}`;
		staticHtml += `<!--markless-slot:${slotIndex}-->`;
		statics.push(staticHtml);
		staticHtml = '';
		slots.push({
			kind: 'child-component',
			componentEdgeId: edgeId,
			childComponentName,
			childTemplateId: `template:${childComponentName}`,
			coordinate: { kind: 'comment-anchor', path: [0, partIndex] },
			staticIndex: slotIndex,
		});
		edges.push({
			id: edgeId,
			childComponentName,
			hostPrefix: child.hostPrefix,
			symbolPrefix: child.symbolPrefix,
			props: Object.entries(child.props).map(([name, value]) => ({
				name,
				kind: 'serializable',
				value,
			})),
		});
		slotIndex++;
	}
	statics.push(`${staticHtml}</main>`);
	const state = { version: 1, cells: [], computed: [] };
	const view = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const renderData = {
		root: { componentName, templateId: rootChunkId },
		chunks: [
			{
				id: rootChunkId,
				kind: 'template',
				componentName,
				statics,
				hosts,
				slots,
			},
		],
		initialValues: [],
		branches: [],
		repeats: [],
		boundaries: [],
		interactions: [],
	};
	return {
		rootComponentName: componentName,
		renderData,
		components: {
			[componentName]: {
				name: componentName,
				state,
				view,
				rootChunkId,
				stateGraphNodeIds: [],
				initialValues: [],
				branches: [],
				boundaries: [],
				edges,
				propCellId: null,
			},
		},
		imports: Object.fromEntries(
			children.flatMap((child) =>
				child.surface.rootComponentName
					? [[child.surface.rootComponentName, child.surface] as const]
					: [],
			),
		),
	};
}

type MdxGraphRead = {
	readonly graphNodeId: string;
	readonly [key: string]: unknown;
};

type MdxCellRecord = {
	readonly graphNodeId?: string;
	readonly [key: string]: unknown;
};

type MdxComputedRecord = {
	readonly graphNodeId?: string;
	readonly deriveSymbolId?: string;
	readonly dependencies?: readonly MdxGraphRead[];
	readonly [key: string]: unknown;
};

type MdxSharedDefinitionRecord = {
	readonly id: string;
	readonly scope?: string;
	readonly graphNodeIds?: readonly string[];
	readonly projectionIds?: readonly string[];
	readonly returnProperties?: readonly MdxCellRecord[];
	readonly [key: string]: unknown;
};

type MdxStorageRecord = {
	readonly graphNodeId: string;
	readonly key: string;
};

type MdxStatePayload = {
	readonly version: unknown;
	readonly cells?: readonly MdxCellRecord[];
	readonly computed?: readonly MdxComputedRecord[];
	readonly sharedDefinitions?: readonly MdxSharedDefinitionRecord[];
	readonly storage?: readonly MdxStorageRecord[];
};

type MdxLocator = {
	readonly hostNodeId: string;
	readonly index: number;
	readonly [key: string]: unknown;
};

type MdxEventRecord = {
	readonly hostNodeId: string;
	readonly symbolIds: readonly string[];
	readonly [key: string]: unknown;
};

type MdxSymbolRecord = {
	readonly hostNodeId: string;
	readonly symbolId?: string;
	readonly graphNodeId?: string;
	readonly inputGraphReads?: readonly MdxGraphRead[];
	readonly [key: string]: unknown;
};

type MdxHandleRecord = {
	readonly hostNodeId: string;
	readonly handleId: string;
	readonly [key: string]: unknown;
};

type MdxViewPayload = {
	readonly version: unknown;
	readonly locators?: readonly MdxLocator[];
	readonly events?: readonly MdxEventRecord[];
	readonly domUpdates?: readonly MdxSymbolRecord[];
	readonly behaviors?: readonly MdxSymbolRecord[];
	readonly elementHandles?: readonly MdxHandleRecord[];
	readonly asyncBoundaries?: readonly unknown[];
};

export async function renderMdxChild(
	children: MdxChild[],
	component: MdxComponentArtifact,
	props: unknown,
	child: Omit<MdxChild, 'output'>,
): Promise<string> {
	// Compiled marklessRenderSsr is async (initial render awaits demanded
	// async work); the unawaited Promise passed the truthy guard while .html
	// read undefined — the MDX child silently dropped from SSR html.
	const output = await component.renderSsr?.(props);
	if (output) children.push({ ...child, output });
	return output?.html ?? '';
}

export function composeMdxState(children: readonly MdxChild[]): MdxStatePayload | undefined {
	const childStates = children
		.map((child) => ({ child, state: child.output?.state }))
		.filter((entry): entry is { readonly child: MdxChild; readonly state: MdxStatePayload } =>
			isDefined(entry.state),
		);
	if (childStates.length === 0) {
		return undefined;
	}

	// Storage is page-wide by protocol, so it merges verbatim. Inheriting the
	// first child's version stamped 2 with no storage array, which the client
	// refuses — every island on the page died.
	const storage = childStates.flatMap(({ state }) => state.storage ?? []);
	return {
		version: protocolStateVersion(storage),
		cells: childStates.flatMap(({ child, state }) => {
			const island = islandScope(child, state);
			return (state.cells ?? []).map((cell) => islandScopedGraphRecord(cell, island));
		}),
		computed: childStates.flatMap(({ child, state }) => {
			const island = islandScope(child, state);
			return (state.computed ?? []).map((record) => ({
				...islandScopedGraphRecord(record, island),
				...(record.dependencies
					? {
							dependencies: record.dependencies.map((read) =>
								islandScopedGraphRecord(read, island),
							),
						}
					: {}),
				...(record.deriveSymbolId
					? { deriveSymbolId: child.symbolPrefix + record.deriveSymbolId }
					: {}),
			}));
		}),
		...(childStates.some(({ state }) => state.sharedDefinitions?.length)
			? {
					sharedDefinitions: childStates.flatMap(({ child, state }) => {
						const island = islandScope(child, state);
						return (state.sharedDefinitions ?? []).map((definition) =>
							islandScopedSharedDefinition(definition, island),
						);
					}),
				}
			: {}),
		...(storage.length > 0 ? { storage } : {}),
	};
}

/**
 * The island segment every id this child owns takes, plus the widget-scoped
 * definitions that segment is allowed to reach.
 *
 * The segment is read back out of the child's own prefix rather than minted
 * here: a prefix the instance-path grammar cannot spell is no instance path, and
 * qualifying a graph node id with one would put the payload in a namespace no
 * reader can recover from a symbol id.
 */
type MdxIslandScope = {
	readonly segment: string;
	readonly widgetDefinitionIds: ReadonlySet<string>;
};

function islandScope(child: MdxChild, state: MdxStatePayload): MdxIslandScope {
	const prefix = child.symbolPrefix;
	return {
		segment: prefix && protocolInstancePath(prefix) === prefix ? prefix : '',
		widgetDefinitionIds: new Set(
			(state.sharedDefinitions ?? [])
				.filter((definition) => definition.scope === 'widget')
				.map((definition) => definition.id),
		),
	};
}

/**
 * Which of a child's ids belong to the island, and which are the whole page's.
 *
 * Two islands of one component compose from their own roots, so both spell the
 * same `c`/`p` path and their cells, computeds and element-handle rosters land
 * on one node unless the island segment separates them. What must NOT take the
 * segment is the page-space families that mean one node per page on purpose: a
 * `scope: 'page' | 'container' | 'request'` shared() graph and a storage slot
 * are shared BETWEEN islands, and prefixing them gives each island a private
 * copy of state the author asked to be common.
 *
 * A widget-scoped shared() id is the exception inside the exception — one graph
 * per rendered widget, so it is the island's — and a bare one (no path, because
 * no registered widget root claimed it at compose) is recognised by asking the
 * child's own definitions which scope it was declared at.
 */
function islandScopedGraphNodeId(graphNodeId: string, island: MdxIslandScope): string {
	if (!island.segment) return graphNodeId;
	if (protocolInstancePath(graphNodeId)) return island.segment + graphNodeId;
	if (protocolInstanceQualifies(graphNodeId) !== false) return island.segment + graphNodeId;
	const slash = graphNodeId.lastIndexOf('/');
	const isWidgetOwned =
		island.widgetDefinitionIds.has(graphNodeId) ||
		(slash > 0 && island.widgetDefinitionIds.has(graphNodeId.slice(0, slash)));
	return isWidgetOwned ? island.segment + graphNodeId : graphNodeId;
}

/**
 * The registering half of a handle key, mirrored on the reading half.
 *
 * Resume re-spells only a widget-scoped `shared:` handle id per rendered widget;
 * a component-local handle is already one element per key and the reading symbol
 * asks for it exactly as its module compiled it. Segmenting that second kind
 * here would file it under a key nothing ever asks for.
 */
function islandScopedHandleId(handleId: string, island: MdxIslandScope): string {
	return protocolInstanceQualifies(handleId) !== false
		? handleId
		: islandScopedGraphNodeId(handleId, island);
}

function islandScopedGraphRecord<T extends { readonly graphNodeId?: string }>(
	record: T,
	island: MdxIslandScope,
): T {
	return record.graphNodeId
		? { ...record, graphNodeId: islandScopedGraphNodeId(record.graphNodeId, island) }
		: record;
}

function islandScopedSharedDefinition(
	definition: MdxSharedDefinitionRecord,
	island: MdxIslandScope,
): MdxSharedDefinitionRecord {
	const scoped = (id: string) => islandScopedGraphNodeId(id, island);
	return {
		...definition,
		id: scoped(definition.id),
		...(definition.graphNodeIds ? { graphNodeIds: definition.graphNodeIds.map(scoped) } : {}),
		...(definition.projectionIds ? { projectionIds: definition.projectionIds.map(scoped) } : {}),
		...(definition.returnProperties
			? {
					returnProperties: definition.returnProperties.map((property) =>
						islandScopedGraphRecord(property, island),
					),
				}
			: {}),
	};
}

export function composeMdxView(
	parts: readonly MdxRoutePart[],
	children: readonly MdxChild[],
	initialElementOffset: number,
): MdxViewPayload | undefined {
	const childViews = children
		.map((child) => ({
			...child,
			view: child.output?.view,
			hostCount: child.output?.view?.locators?.length ?? 0,
		}))
		.filter((child): child is typeof child & { readonly view: MdxViewPayload } =>
			Boolean(child.view),
		);
	if (childViews.length === 0) {
		return undefined;
	}

	const childByIndex = new Map(childViews.map((child) => [child.componentIndex, child]));
	const locators: MdxLocator[] = [];
	const events: MdxEventRecord[] = [];
	const domUpdates: MdxSymbolRecord[] = [];
	const behaviors: MdxSymbolRecord[] = [];
	const elementHandles: MdxHandleRecord[] = [];
	let elementOffset = initialElementOffset;

	for (const part of parts) {
		if (part.kind === 'html') {
			elementOffset += part.elementCount;
			continue;
		}

		const child = childByIndex.get(part.componentIndex);
		if (!child) continue;
		appendMdxChildView({
			child,
			elementOffset,
			locators,
			events,
			domUpdates,
			behaviors,
			elementHandles,
		});
		elementOffset += child.hostCount;
	}

	locators.sort((a, b) => a.index - b.index);
	return {
		version: childViews[0]!.view.version,
		locators,
		events,
		domUpdates,
		behaviors,
		elementHandles,
		asyncBoundaries: [],
	};
}

export function loadMdxSymbol(
	symbolId: string,
	children: readonly MdxChild[],
	loaders: readonly MdxSymbolLoader[],
): unknown {
	for (const child of children) {
		if (!symbolId.startsWith(child.symbolPrefix)) continue;
		const load = child.output?.loadSymbol?.bind(child.output);
		if (load) return loadScopedMdxSymbol(symbolId, child.symbolPrefix, load);
	}

	for (const loader of loaders) {
		if (symbolId.startsWith(loader.prefix)) {
			return loadScopedMdxSymbol(symbolId, loader.prefix, (id) =>
				loader.loadSymbol(loader.prefix + id),
			);
		}
	}

	return Promise.reject(new Error(`Unknown Markless MDX symbol ${symbolId}`));
}

type MdxInstanceScopedLoad = Parameters<typeof marklessInstanceScopedLoadSymbol>[0];

// The WHOLE path scopes the symbol, island segment included: composeMdxState
// spelled this child's cells under `m<n>:` + the child's own `c`/`p` run, so a
// handler scoped by anything less writes to a node the composed page does not
// carry. The loader still gets the id in the child's own space.
function loadScopedMdxSymbol(
	symbolId: string,
	prefix: string,
	load: (symbolId: string) => unknown,
): unknown {
	const loadChildLocal = ((childSymbolId: string) =>
		load(childSymbolId.slice(prefix.length))) as MdxInstanceScopedLoad;
	return marklessInstanceScopedLoadSymbol(loadChildLocal)(symbolId);
}

function appendMdxChildView(context: {
	readonly child: MdxChild & { readonly view: MdxViewPayload };
	readonly elementOffset: number;
	readonly locators: MdxLocator[];
	readonly events: MdxEventRecord[];
	readonly domUpdates: MdxSymbolRecord[];
	readonly behaviors: MdxSymbolRecord[];
	readonly elementHandles: MdxHandleRecord[];
}) {
	const childView = context.child.view;
	const island = islandScope(context.child, context.child.output?.state ?? { version: 1 });

	for (const locator of childView.locators ?? []) {
		context.locators.push({
			...locator,
			hostNodeId: context.child.hostPrefix + locator.hostNodeId,
			index: context.elementOffset + locator.index,
		});
	}
	for (const event of childView.events ?? []) {
		context.events.push({
			...event,
			hostNodeId: context.child.hostPrefix + event.hostNodeId,
			symbolIds: event.symbolIds.map((symbolId) => context.child.symbolPrefix + symbolId),
		});
	}
	for (const update of childView.domUpdates ?? []) {
		context.domUpdates.push(prefixMdxSymbolRecord(update, context.child, island));
	}
	for (const behavior of childView.behaviors ?? []) {
		context.behaviors.push(prefixMdxSymbolRecord(behavior, context.child, island));
	}
	// A widget-scoped handle id IS the roster key, so an island-blind one merges
	// two islands' plural handles into one roster and the arrow walk leaves the
	// island it was pressed in.
	for (const handle of childView.elementHandles ?? []) {
		context.elementHandles.push({
			...handle,
			hostNodeId: context.child.hostPrefix + handle.hostNodeId,
			handleId: islandScopedHandleId(handle.handleId, island),
		});
	}
}

// A view record reads the state records composeMdxState just wrote, so its graph
// node ids take the same island segment those did — one namespace, or the dom
// update watches a node the handler never writes.
function prefixMdxSymbolRecord(
	record: MdxSymbolRecord,
	child: MdxChild,
	island: MdxIslandScope,
): MdxSymbolRecord {
	return {
		...islandScopedGraphRecord(record, island),
		hostNodeId: child.hostPrefix + record.hostNodeId,
		...(record.inputGraphReads
			? {
					inputGraphReads: record.inputGraphReads.map((read) =>
						islandScopedGraphRecord(read, island),
					),
				}
			: {}),
		...(record.symbolId ? { symbolId: child.symbolPrefix + record.symbolId } : {}),
	};
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
