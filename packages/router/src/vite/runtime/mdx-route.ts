import { marklessInstanceScopedLoadSymbol } from '../../../../web/src/fns/instance-scope.ts';
import { marklessSsrRosterPositionContext } from '../../../../web/src/fns/roster-position.ts';
import { marklessSsrIslandRosterAnswered } from '../../../../web/src/prerender/island-roster.ts';
import {
	protocolInstancePath,
	protocolInstanceQualifies,
	protocolStateVersion,
} from '../../../../serializer/src/protocol-constants.ts';
import { isArmBranchAnchorComment } from '../../../../web/src/resume-anchor-census.ts';
import type { ProtocolViewPayload } from '../../../../serializer/src/protocol.ts';

export type MdxRoutePart =
	| {
			readonly kind: 'html';
			readonly elementCount: number;
			readonly commentCount?: number;
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
	// What the compiled artifact counted as it rendered: every element it
	// emitted, arm content and repeat rows included.
	readonly elementCount?: number;
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
	readonly renderSsr?: (
		props?: unknown,
		renderContext?: unknown,
	) => MdxRenderOutput | Promise<MdxRenderOutput>;
	readonly renderCsr?: (props?: unknown) => MdxRenderOutput | Promise<MdxRenderOutput>;
	readonly headInjections?: ReadonlyArray<unknown>;
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

type MdxSharedSeedRecord = {
	readonly graphNodeId: string;
	readonly deriveSymbolId: string;
	readonly dependencies?: readonly (MdxGraphRead & { readonly reads?: MdxGraphRead })[];
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
	readonly sharedSeeds?: readonly MdxSharedSeedRecord[];
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

type MdxFamilyRecord = Readonly<Record<string, unknown>>;

type MdxViewPayload = {
	readonly version: unknown;
	readonly locators?: readonly MdxLocator[];
	readonly events?: readonly MdxEventRecord[];
	readonly domUpdates?: readonly MdxSymbolRecord[];
	readonly behaviors?: readonly MdxSymbolRecord[];
	readonly elementHandles?: readonly MdxHandleRecord[];
	readonly keyedRepeats?: readonly MdxFamilyRecord[];
	readonly branches?: readonly MdxFamilyRecord[];
	readonly asyncBoundaries?: readonly MdxFamilyRecord[];
	readonly asyncRunners?: Readonly<Record<string, string>>;
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
	//
	// Each island renders under its own roster context and answers its own
	// counts here: this render is the only place the island's handles are still
	// spelled the way the counts it minted name them.
	const renderContext = marklessSsrRosterPositionContext(undefined);
	const rendered = await component.renderSsr?.(props, renderContext);
	const output =
		rendered && typeof rendered.html === 'string'
			? await marklessSsrIslandRosterAnswered(
					renderContext,
					rendered as MdxRenderOutput & { readonly html: string },
				)
			: rendered;
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
		// Dropping a seed here stops a prop bound into an island following its page cell.
		...(childStates.some(({ state }) => state.sharedSeeds?.length)
			? {
					sharedSeeds: childStates.flatMap(({ child, state }) => {
						const island = islandScope(child, state);
						return (state.sharedSeeds ?? []).map((seed) => ({
							...islandScopedGraphRecord(seed, island),
							deriveSymbolId: child.symbolPrefix + seed.deriveSymbolId,
							...(seed.dependencies
								? {
										dependencies: seed.dependencies.map((dependency) => ({
											...islandScopedGraphRecord(dependency, island),
											// The seed's symbol runs instance-scoped, so the id reaching its read router is already segmented.
											...(dependency.reads
												? {
														reads: islandScopedGraphRecord(
															dependency.reads,
															island,
														),
													}
												: {}),
										})),
									}
								: {}),
						}));
					}),
				}
			: {}),
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
		...(definition.projectionIds
			? { projectionIds: definition.projectionIds.map(scoped) }
			: {}),
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
	initialCommentOffset = 0,
): MdxViewPayload | undefined {
	const childCensus = children.map((child) => ({
		...child,
		view: child.output?.view,
		census: mdxRenderedCensus(child.output),
	}));
	const firstView = childCensus.find((child) => child.view)?.view;
	if (!firstView) {
		return undefined;
	}

	const childByIndex = new Map(childCensus.map((child) => [child.componentIndex, child]));
	const locators: MdxLocator[] = [];
	const events: MdxEventRecord[] = [];
	const domUpdates: MdxSymbolRecord[] = [];
	const behaviors: MdxSymbolRecord[] = [];
	const elementHandles: MdxHandleRecord[] = [];
	const keyedRepeats: MdxFamilyRecord[] = [];
	const branches: MdxFamilyRecord[] = [];
	const asyncBoundaries: MdxFamilyRecord[] = [];
	const asyncRunners: Record<string, string> = {};
	let elementOffset = initialElementOffset;
	let commentOffset = initialCommentOffset;

	for (const part of parts) {
		if (part.kind === 'html') {
			elementOffset += part.elementCount;
			commentOffset += part.commentCount ?? 0;
			continue;
		}

		const child = childByIndex.get(part.componentIndex);
		if (!child) continue;
		if (child.view) {
			appendMdxChildView({
				child: child as MdxChild & { readonly view: MdxViewPayload },
				elementOffset,
				commentOffset,
				locators,
				events,
				domUpdates,
				behaviors,
				elementHandles,
				keyedRepeats,
				branches,
				asyncBoundaries,
				asyncRunners,
			});
		}
		// The island's own markup — every element and comment of it, not just the
		// hosts it locates — is what the client census walks past to reach the
		// next island.
		elementOffset += child.census.elements;
		commentOffset += child.census.comments;
	}

	locators.sort((a, b) => a.index - b.index);
	return {
		version: firstView.version,
		locators,
		events,
		domUpdates,
		behaviors,
		elementHandles,
		...(keyedRepeats.length > 0 ? { keyedRepeats } : {}),
		...(branches.length > 0 ? { branches } : {}),
		asyncBoundaries,
		...(Object.keys(asyncRunners).length > 0 ? { asyncRunners } : {}),
	};
}

type MdxNodeCensus = { readonly elements: number; readonly comments: number };

/**
 * The tally the client keeps of one island's markup.
 *
 * Resume pins a depth-first census of every element under the container and
 * resolves each locator by its index into it, and it walks comments the same
 * way for anchors, so both offsets have to be counted the way the DOM counts
 * them or a later island's records land on the wrong nodes.
 */
function mdxRenderedCensus(output: MdxRenderOutput | undefined): MdxNodeCensus {
	if (!output) return { elements: 0, comments: 0 };
	if (output.root) return mdxDomCensus(output.root as unknown as MdxCensusNode);
	const scanned = typeof output.html === 'string' ? mdxHtmlCensus(output.html) : undefined;
	return {
		elements:
			typeof output.elementCount === 'number'
				? output.elementCount
				: (scanned?.elements ?? 0),
		comments: scanned?.comments ?? 0,
	};
}

type MdxCensusNode = {
	readonly nodeType?: number;
	readonly data?: string;
	readonly childNodes?: ArrayLike<MdxCensusNode>;
};

function mdxDomCensus(root: MdxCensusNode): MdxNodeCensus {
	let elements = 0;
	let comments = 0;
	(function visit(node: MdxCensusNode): void {
		if (node.nodeType === 1) elements++;
		else if (node.nodeType === 8 && !isArmBranchAnchorComment({ nodeType: 8, data: node.data }))
			comments++;
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	})(root);
	return { elements, comments };
}

// Template content is a fragment the census never walks, and raw-text content
// is text however much it looks like markup.
const MDX_RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

function mdxHtmlCensus(html: string): MdxNodeCensus {
	let elements = 0;
	let comments = 0;
	let templateDepth = 0;
	let at = 0;
	while (at < html.length) {
		const open = html.indexOf('<', at);
		if (open < 0) break;
		if (html.startsWith('<!--', open)) {
			const close = html.indexOf('-->', open + 4);
			const text = html.slice(open + 4, close < 0 ? html.length : close);
			if (templateDepth === 0 && !isArmBranchAnchorComment({ nodeType: 8, data: text }))
				comments++;
			at = close < 0 ? html.length : close + 3;
			continue;
		}
		if (html[open + 1] === '!' || html[open + 1] === '?') {
			at = mdxTagEnd(html, open);
			continue;
		}
		const closing = html[open + 1] === '/';
		const name = mdxTagName(html, open + (closing ? 2 : 1));
		if (!name) {
			at = open + 1;
			continue;
		}
		const tagEnd = mdxTagEnd(html, open);
		at = tagEnd;
		if (closing) {
			if (name === 'template' && templateDepth > 0) templateDepth--;
			continue;
		}
		if (templateDepth === 0) elements++;
		const selfClosing = html.slice(open, tagEnd).trimEnd().endsWith('/>');
		if (selfClosing) continue;
		if (name === 'template') templateDepth++;
		else if (MDX_RAW_TEXT_TAGS.has(name)) {
			const close = html.toLowerCase().indexOf(`</${name}`, tagEnd);
			at = close < 0 ? html.length : close;
		}
	}
	return { elements, comments };
}

function mdxTagName(html: string, at: number): string {
	let end = at;
	while (end < html.length && !/[\s/>]/.test(html[end]!)) end++;
	const name = html.slice(at, end).toLowerCase();
	return /^[a-z][a-z0-9:-]*$/.test(name) ? name : '';
}

// Quote-aware: an attribute value may hold a `>`, and stopping there would read
// the rest of the value as markup.
function mdxTagEnd(html: string, at: number): number {
	let quote = '';
	for (let index = at + 1; index < html.length; index++) {
		const character = html[index]!;
		if (quote) {
			if (character === quote) quote = '';
			continue;
		}
		if (character === '"' || character === "'") quote = character;
		else if (character === '>') return index + 1;
	}
	return html.length;
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
	readonly commentOffset: number;
	readonly locators: MdxLocator[];
	readonly events: MdxEventRecord[];
	readonly domUpdates: MdxSymbolRecord[];
	readonly behaviors: MdxSymbolRecord[];
	readonly elementHandles: MdxHandleRecord[];
	readonly keyedRepeats: MdxFamilyRecord[];
	readonly branches: MdxFamilyRecord[];
	readonly asyncBoundaries: MdxFamilyRecord[];
	readonly asyncRunners: Record<string, string>;
}) {
	const childView = context.child.view;
	const island = islandScope(context.child, context.child.output?.state ?? { version: 1 });
	const familyContext: MdxFamilyContext = {
		child: context.child,
		island,
		commentOffset: context.commentOffset,
	};
	for (const repeat of childView.keyedRepeats ?? [])
		context.keyedRepeats.push(islandScopedFamilyRecord(repeat, familyContext));
	for (const branch of childView.branches ?? [])
		context.branches.push(islandScopedFamilyRecord(branch, familyContext));
	for (const boundary of childView.asyncBoundaries ?? [])
		context.asyncBoundaries.push(islandScopedFamilyRecord(boundary, familyContext));
	for (const [graphNodeId, symbolId] of Object.entries(childView.asyncRunners ?? {}))
		context.asyncRunners[islandScopedGraphNodeId(graphNodeId, island)] =
			context.child.symbolPrefix + symbolId;

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

type MdxFamilyContext = {
	readonly child: MdxChild;
	readonly island: MdxIslandScope;
	readonly commentOffset: number;
};

type MdxAnchorStrategy = NonNullable<
	ProtocolViewPayload['branches']
>[number]['startAnchor']['strategy'];

// The page-wide comment walk is what a `dom-order-comment` anchor indexes into.
// An arm-branch anchor indexes its own boundary's local census and never moves.
const MDX_PAGE_ANCHOR_STRATEGY: MdxAnchorStrategy = 'dom-order-comment';

const MDX_HOST_ID_KEYS = ['hostNodeId', 'parentHostNodeId', 'ownerHostNodeId'] as const;
const MDX_SYMBOL_ID_KEYS = ['symbolId', 'updateSymbolId', 'runnerSymbolId'] as const;
const MDX_GRAPH_ID_KEYS = ['graphNodeId', 'runnerGraphNodeId', 'collectionGraphNodeId'] as const;
const MDX_INSTANCE_PATH_KEYS = ['instancePath', 'composedInstancePath'] as const;
const MDX_NESTED_RECORD_KEYS = [
	'testReads',
	'contentReads',
	'asyncReads',
	'inputGraphReads',
	'composedGraphProps',
	'idrefSites',
	'locators',
	'events',
	'domUpdates',
	'behaviors',
	'elementHandles',
	'rowEvents',
	'rowElementHandles',
	'keyedRepeats',
	'branches',
	'armRecords',
	'servedArmRecords',
] as const;

/**
 * One island's repeat / branch / boundary record in the composed page's spaces.
 *
 * Every id the record carries takes the island's own prefix for the same reason
 * the flat records do — two embeds of one component spell identical ids — and
 * the two comment anchors take the page's comment offset. Arm-relative
 * coordinates inside an arm record set are island-local by construction and are
 * deliberately left alone.
 */
function islandScopedFamilyRecord(
	record: MdxFamilyRecord,
	context: MdxFamilyContext,
): MdxFamilyRecord {
	const { child, island } = context;
	const mapped: Record<string, unknown> = { ...record };
	if (typeof record.id === 'string') mapped.id = child.hostPrefix + record.id;
	for (const key of MDX_HOST_ID_KEYS)
		if (typeof record[key] === 'string') mapped[key] = child.hostPrefix + record[key];
	for (const key of MDX_SYMBOL_ID_KEYS)
		if (typeof record[key] === 'string') mapped[key] = child.symbolPrefix + record[key];
	if (Array.isArray(record.symbolIds))
		mapped.symbolIds = record.symbolIds.map(
			(symbolId) => child.symbolPrefix + String(symbolId),
		);
	for (const key of MDX_GRAPH_ID_KEYS)
		if (typeof record[key] === 'string')
			mapped[key] = islandScopedGraphNodeId(record[key] as string, island);
	if (typeof record.handleId === 'string')
		mapped.handleId = islandScopedHandleId(record.handleId, island);
	for (const key of MDX_INSTANCE_PATH_KEYS)
		if (typeof record[key] === 'string') mapped[key] = island.segment + record[key];
	if (isFamilyRecord(record.elementHandleIds))
		mapped.elementHandleIds = Object.fromEntries(
			Object.entries(record.elementHandleIds).map(([readId, handleId]) => [
				readId,
				islandScopedHandleId(String(handleId), island),
			]),
		);
	for (const key of ['startAnchor', 'endAnchor'] as const) {
		const anchor = record[key];
		if (isFamilyRecord(anchor) && anchor.strategy === MDX_PAGE_ANCHOR_STRATEGY)
			mapped[key] = { ...anchor, index: context.commentOffset + Number(anchor.index) };
	}
	for (const key of MDX_NESTED_RECORD_KEYS) {
		const nested = record[key];
		if (Array.isArray(nested))
			mapped[key] = nested.map((entry) =>
				isFamilyRecord(entry) ? islandScopedFamilyRecord(entry, context) : entry,
			);
		else if (isFamilyRecord(nested)) mapped[key] = islandScopedFamilyRecord(nested, context);
	}
	return mapped;
}

function isFamilyRecord(value: unknown): value is MdxFamilyRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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
