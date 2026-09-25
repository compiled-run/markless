import {
	renderSsrData,
	type RenderSsrDataOutput,
	type SsrDataReadContext,
	type SsrDataResidue,
	type SsrDataSlot,
	type RenderSsrDataInput,
	type SsrDataStructure,
	type SsrRenderData,
	type StructureToken,
} from '../ssr-data/renderer.ts';
import type { SsrRenderable, SsrRenderOutput } from '../render-to-string.ts';
import type { ResumeArmRecordSet } from '../resume-types.ts';
import type { RuntimeGraph } from '@markless/runtime';
import type { ProtocolStatePayload } from '@markless/serializer';
import { SERIALIZED_NULL_GRAPH_PAYLOAD } from '../../../serializer/src/value-constants.ts';
import { prepareSsrResumeRecords } from './records.ts';
import {
	marklessSsrAttachSnapshots,
	marklessComposeState,
	marklessSsrComposeView,
	marklessSsrMergeBranches,
	marklessSsrRemapGraphOutput,
	marklessSsrSpreadProps,
	type MarklessSsrComposedChild,
} from '../fns/ssr.ts';
import type { ComposeGraphProps } from '../fns/composition.ts';
import { marklessCsrRemapChildGraph } from '../fns/composition.ts';
import { marklessBoundSymbolId, marklessReboundSymbolId } from '../fns/bound-symbol.ts';
import {
	marklessInstancePath,
	marklessRowFreeSymbolId,
	marklessRowSegment,
} from '../fns/instance-scope.ts';
import { prerenderBranchArm } from './branch-arm.ts';
import { registerPrerenderStagedComputeds } from './staged-graph.ts';
import { marklessThen, marklessWalk, type Awaitable } from '../ssr-data/awaitable.ts';
import {
	marklessRosterPositions,
	marklessRosterPositionSeeds,
	marklessRosterRenderContext,
	marklessRosterSeedPass,
	sharedSeedPass,
} from './shared-seed-slot.ts';
import { branchArmIdrefResolution } from '../ssr-data/branch-arm-idrefs.ts';

// This evaluator is the seam where a SERIALIZED protocol payload meets the
// mutable draft the SSR composer works on. They describe the same records; the
// protocol types arm record sets coarsely (opaque bags), so the two shapes do
// not line up structurally and the seam names the crossing explicitly.
export type SsrComposableView = Parameters<typeof marklessSsrComposeView>[1];
export type SsrComposableChildOutput = NonNullable<MarklessSsrComposedChild['output']>;

type GraphValues = ReadonlyMap<string, unknown>;

export type PrerenderRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

export type PrerenderEvaluationContext = {
	readonly values: GraphValues;
	readonly read: PrerenderRead;
};

export type PrerenderRenderData = SsrRenderData & {
	readonly initialValues?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly value:
			| { readonly kind: 'constant'; readonly value: unknown }
			| { readonly kind: 'symbol-function'; readonly symbolId: string };
	}>;
};

export type PrerenderDataDefinition = {
	readonly name: string;
	readonly state: ProtocolStatePayload;
	readonly view: import('@markless/serializer').ProtocolViewPayload;
	readonly rootChunkId: string;
	readonly hostNodeIds?: ReadonlyArray<string>;
	readonly stateGraphNodeIds?: ReadonlyArray<string>;
	// Positions into `state`, emitted when one module declares several
	// components: two of them may spell one graph node id.
	readonly stateCellIndexes?: ReadonlyArray<number>;
	readonly stateComputedIndexes?: ReadonlyArray<number>;
	// Positions into `state.computed` for the sync computeds a handler reads:
	// their derived value travels with the payload so the first read, before any
	// dependency write, answers with it.
	readonly servedComputedIndexes?: ReadonlyArray<number>;
	readonly initialValues?: PrerenderRenderData['initialValues'];
	readonly initialValueKinds?: Readonly<Record<string, string>>;
	readonly initializerResidues?: Readonly<Record<string, string>>;
	readonly initializers?: Readonly<Record<string, unknown>>;
	readonly branches?: PrerenderRenderData['branches'];
	readonly boundaries?: PrerenderRenderData['boundaries'];
	readonly edges?: ReadonlyArray<{
		readonly id: string;
		readonly childComponentName: string;
		readonly asyncBoundaryId?: string;
		readonly hostPrefix: string;
		readonly symbolPrefix: string;
		readonly boundSymbols?: Readonly<Record<string, string>>;
		readonly props: ReadonlyArray<{
			readonly name: string;
			readonly kind: string;
			readonly graphNodeId?: string;
			readonly path?: ReadonlyArray<string>;
			readonly value?: unknown;
			readonly symbolId?: string;
			readonly source?: string;
			readonly excludeNames?: ReadonlyArray<string>;
		}>;
		readonly materialized?: SsrRenderOutput & {
			// Render-data children carry the full ssr-data structure, not just anchors.
			readonly structure?: SsrDataStructure;
			readonly elementCount: number;
			readonly structureTokens?: ReadonlyArray<StructureToken>;
		};
	}>;
	readonly propCellId?: string | null;
	// The shared() element() handles a rendered instance of this component binds,
	// published by the compiler so a widget's seed phase can file them before any
	// part renders. Absent when it binds none.
	readonly boundElementHandles?: ReadonlyArray<string>;
	// The widget families whose cells this component carries WITHOUT rooting: a
	// part of somebody else's widget, holding the cells only so a page that
	// renders no designated root still has them.
	readonly widgetFallbacks?: ReadonlyArray<string>;
	// The root's elements whose handler is a callback prop itself: composition stands its composer's callback in.
	readonly propEvents?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly propName: string;
	}>;
	// Attached only to a component whose keyed rows project elements.
	readonly rowHosts?: {
		readonly qualify: <V extends SsrComposableView>(
			structure: SsrDataStructure,
			view: V,
			idPrefix?: string,
		) => V;
		readonly segment: NonNullable<RenderSsrDataInput['projectionSegment']>;
	};
	// Compiled by the same producer as the server module's reader; the browser
	// never parses or evaluates authored source itself.
	readonly readResidue?: (
		residue: Extract<
			SsrDataResidue,
			{
				readonly kind:
					| 'authored-expression'
					| 'element-handle-id'
					| 'element-handle-id-list';
			}
		>,
		context: {
			readonly repeatItem?: unknown;
			readonly repeatIndex?: number;
			readonly repeatId?: string;
			readonly repeatOuter?: unknown;
			readonly asyncError?: unknown;
			readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
			// What a minted element() id is derived from. The token naming the
			// widget a part belongs to arrives through the seed map, so `read`
			// already answers it.
			readonly idPrefix?: string;
			// Where an expression that SPENDS a roster count goes: the count is a
			// placeholder until the page has composed, so the whole expression is
			// handed over and the resolver splices its answer.
			readonly deferCount?: (
				thunk: (count: (placeholder: unknown) => number) => unknown,
			) => unknown;
		},
	) => unknown;
};

export type PrerenderDataSurface = {
	readonly rootComponentName: string | null;
	readonly renderData: PrerenderRenderData;
	readonly components: Readonly<Record<string, PrerenderDataDefinition>>;
	readonly imports: Readonly<Record<string, PrerenderDataSurface>>;
};

export type PrerenderLoadSymbol = (symbolId: string) => unknown | Promise<unknown>;

function isPrerenderLoadSymbol(value: unknown): value is PrerenderLoadSymbol {
	return typeof value === 'function';
}

export type PrerenderPageClosure = {
	readonly renderData: PrerenderRenderData;
	readonly props?: unknown;
	readonly idPrefix?: string;
	readonly computed?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly evaluate: (context: PrerenderEvaluationContext) => Awaitable<unknown>;
	}>;
	readonly readAuthored?: (
		residue: Extract<
			SsrDataResidue,
			{
				readonly kind:
					| 'authored-expression'
					| 'element-handle-id'
					| 'element-handle-id-list';
			}
		>,
		context: SsrDataReadContext,
		evaluation: PrerenderEvaluationContext,
	) => Awaitable<unknown>;
	readonly selectBranchArm?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'branch' }>,
		context: SsrDataReadContext,
		evaluation: PrerenderEvaluationContext,
	) => Awaitable<number>;
	readonly selectAsyncArm?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'async' }>,
		context: SsrDataReadContext,
		evaluation: PrerenderEvaluationContext,
	) => Awaitable<number | { readonly arm: number; readonly error?: unknown }>;
	readonly children?: Readonly<
		Record<
			string,
			{
				readonly closure: PrerenderPageClosure;
				readonly idPrefix?: string;
				readonly props?: (
					evaluation: PrerenderEvaluationContext,
					context: SsrDataReadContext,
				) => Awaitable<unknown>;
			}
		>
	>;
};

// Evaluates only the already-linked render closure. Authored expressions arrive
// as compiler-created callbacks; this layer never reads or parses source files.
export async function evaluatePrerenderClosure(
	closure: PrerenderPageClosure,
): Promise<RenderSsrDataOutput> {
	const values = new Map<string, unknown>();
	for (const initial of closure.renderData.initialValues ?? []) {
		if (initial.value.kind === 'constant') {
			values.set(initial.graphNodeId, structuredClone(initial.value.value));
		}
	}
	values.set('prop:props', structuredClone(closure.props ?? {}));
	const read: PrerenderRead = (graphNodeId, path = []) => readPath(values.get(graphNodeId), path);
	const evaluation = { values, read };
	for (const computed of closure.computed ?? []) {
		values.set(computed.graphNodeId, await computed.evaluate(evaluation));
	}

	return renderSsrData({
		renderData: closure.renderData,
		idPrefix: closure.idPrefix,
		read: (residue, context) => {
			if (residue.kind === 'repeat-item') return readPath(context.repeatItem, residue.path);
			if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
			if (closure.readAuthored) return closure.readAuthored(residue, context, evaluation);
			throw new Error('MARKLESS_PRERENDER_RESIDUE_MISSING');
		},
		selectBranchArm: closure.selectBranchArm
			? (slot, context) => closure.selectBranchArm!(slot, context, evaluation)
			: undefined,
		selectAsyncArm: closure.selectAsyncArm
			? (slot, context) => closure.selectAsyncArm!(slot, context, evaluation)
			: undefined,
		renderChild: async (slot, context) => {
			const child = closure.children?.[slot.componentEdgeId];
			if (!child)
				throw new Error(`MARKLESS_PRERENDER_CHILD_MISSING: ${slot.componentEdgeId}`);
			const childIndex = Object.keys(closure.children ?? {}).indexOf(slot.componentEdgeId);
			return evaluatePrerenderClosure({
				...child.closure,
				props: child.props ? await child.props(evaluation, context) : child.closure.props,
				idPrefix: `${closure.idPrefix ?? ''}${child.idPrefix ?? `c${childIndex}:`}`,
			});
		},
	});
}

// Production bundles already contain the compiler-linked server closure. This
// entry evaluates that closure directly; it does not import authored modules
// outside the closure and it never recompiles source.
export async function evaluateBuiltPageClosure(
	page: SsrRenderable,
	props?: unknown,
): Promise<SsrRenderOutput> {
	const renderContext = { prerender: true };
	if (typeof page === 'function')
		return (page as (props?: unknown, renderContext?: unknown) => SsrRenderOutput)(
			props,
			renderContext,
		);
	if (page && typeof page.renderSsr === 'function') return page.renderSsr(props, renderContext);
	throw new TypeError('Prerender resume requires a compiled TSRX artifact.');
}

export async function derivePrerenderResumeRecords(
	page: SsrRenderable | PrerenderDataSurface,
	propsOrLoadSymbol?: unknown | PrerenderLoadSymbol,
) {
	if (isPrerenderDataSurface(page)) {
		if (!isPrerenderLoadSymbol(propsOrLoadSymbol)) {
			throw new TypeError('Prerender render data requires a symbol loader.');
		}
		return prepareSsrResumeRecords(
			await evaluatePrerenderDataSurface(page, propsOrLoadSymbol, undefined, false),
		);
	}
	return prepareSsrResumeRecords(await evaluateBuiltPageClosure(page, propsOrLoadSymbol));
}

// Client route mounts evaluate the compiler-linked render-data closure directly.
// This is markup/data evaluation only: no component render body participates.
export async function renderPrerenderDataSurface(
	surface: PrerenderDataSurface,
	loadSymbol: PrerenderLoadSymbol,
	props: unknown = {},
): Promise<SsrRenderOutput> {
	return evaluatePrerenderDataSurface(surface, loadSymbol, undefined, true, asPropsRecord(props));
}

export async function renderPrerenderBoundary(
	page: SsrRenderable | PrerenderDataSurface,
	boundaryId: string,
	_status: 'fulfilled' | 'rejected',
	graph: RuntimeGraph,
	propsOrLoadSymbol?: unknown | PrerenderLoadSymbol,
): Promise<{
	readonly html: string;
	readonly armRecords: ResumeArmRecordSet;
	readonly computed: ProtocolStatePayload['computed'];
	readonly cells?: ReadonlyArray<{ readonly graphNodeId: string; readonly value: unknown }>;
}> {
	if (isPrerenderDataSurface(page)) {
		if (!isPrerenderLoadSymbol(propsOrLoadSymbol)) {
			throw new TypeError('Prerender render data requires a symbol loader.');
		}
		const freshCellIds = new Set<string>();
		const output = await evaluatePrerenderDataSurface(page, propsOrLoadSymbol, graph, true, {}, {
			cellIds: freshCellIds,
		});
		const settled = await settledBoundaryResult(output, boundaryId);
		const cells = freshArmCells(output, freshCellIds);
		return cells.length > 0 ? { ...settled, cells } : settled;
	}
	const output = await renderBuiltPage(page, propsOrLoadSymbol, { prerenderSettle: { graph } });
	return settledBoundaryResult(output, boundaryId);
}

/**
 * Re-render the page and hand back one branch's markup with arm-relative
 * records. The graph the flip already wrote decides the arm, so the render
 * takes the new arm and RUNS the component it holds under that component's own
 * instance identity — the identity a parent rebuilding markup could never
 * spell. `commitArm` registers what comes back against the fresh DOM.
 */
export async function renderPrerenderBranch(
	page: SsrRenderable | PrerenderDataSurface,
	branchSiteId: string,
	graph: RuntimeGraph,
	propsOrLoadSymbol?: unknown | PrerenderLoadSymbol,
): Promise<{
	readonly html: string;
	readonly armRecords: ResumeArmRecordSet;
	readonly computed: ProtocolStatePayload['computed'];
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string; readonly value: unknown }>;
}> {
	let output: SsrRenderOutput;
	const freshCellIds = new Set<string>();
	if (isPrerenderDataSurface(page)) {
		if (!isPrerenderLoadSymbol(propsOrLoadSymbol)) {
			throw new TypeError('Prerender render data requires a symbol loader.');
		}
		output = await evaluatePrerenderDataSurface(page, propsOrLoadSymbol, graph, true, {}, {
			branchSiteId,
			cellIds: freshCellIds,
		});
	} else {
		output = await renderBuiltPage(page, propsOrLoadSymbol, { prerenderSettle: { graph } });
	}
	const records = await prepareSsrResumeRecords(output);
	const arm = prerenderBranchArm({
		structure: output.structure,
		branchSiteId,
		// The structure's element ranges count the render's own elements; the
		// prepared view has already shifted for the container root, so the range
		// has to be read off the render's own locators.
		view: { ...records.view, locators: output.view?.locators ?? [] } as never,
	});
	// An escalating branch is armized while its own view is composed, so its
	// records already left the flat streams as one arm-relative set.
	const served = (
		output.view?.branches as
			| ReadonlyArray<{ readonly id: string; readonly servedArmRecords?: ResumeArmRecordSet }>
			| undefined
	)?.find((branch) => branch.id === branchSiteId)?.servedArmRecords;
	return {
		...arm,
		...(served ? { armRecords: served } : {}),
		computed: records.state.computed,
		cells: freshArmCells(output, freshCellIds),
	};
}

// Taken before serialization: nothing in the live graph answers for a component this render is creating.
function freshArmCells(
	output: SsrRenderOutput,
	freshCellIds: ReadonlySet<string>,
): ReadonlyArray<{ readonly graphNodeId: string; readonly value: unknown }> {
	return (output.state?.cells ?? []).flatMap((cell) =>
		freshCellIds.has(cell.graphNodeId)
			? [
					{
						graphNodeId: cell.graphNodeId,
						value: (cell as { readonly directValue?: unknown }).directValue,
					},
				]
			: [],
	);
}

function isPrerenderDataSurface(value: unknown): value is PrerenderDataSurface {
	return !!value && typeof value === 'object' && 'renderData' in value && 'components' in value;
}

async function evaluatePrerenderDataSurface(
	surface: PrerenderDataSurface,
	loadSymbol: PrerenderLoadSymbol,
	graph: RuntimeGraph | undefined,
	requireHtml: boolean,
	props: Readonly<Record<string, unknown>> = {},
	fresh?: { readonly branchSiteId?: string; readonly cellIds: Set<string> },
): Promise<SsrRenderOutput & { readonly structure?: SsrDataStructure }> {
	const rootName = surface.rootComponentName;
	if (!rootName) throw new Error('MARKLESS_PRERENDER_DATA_ROOT_MISSING');
	const sharedSeeds = marklessRosterPositionSeeds();
	const mountedNow = new Set<string>();
	const rendered = await evaluatePrerenderDataComponent({
		surface,
		componentName: rootName,
		props,
		idPrefix: '',
		symbolPrefix: '',
		loadSymbol,
		graph,
		requireHtml,
		sharedSeeds,
		...(fresh?.branchSiteId ? { freshBranchSiteId: fresh.branchSiteId } : {}),
		...(fresh ? { freshCellIds: fresh.cellIds, mountedInstances: mountedNow } : {}),
	});
	if (fresh && graph) mountedInstances.set(graph, mountedNow);
	// A count is asked before the members it counts have rendered, so the page
	// this render produced is where it becomes a number.
	const positions = marklessRosterPositions(sharedSeeds);
	if (!positions?.counted) return rendered;
	const roster = await (globalThis as RosterResumeHost).__marklessRosterResume?.();
	if (!roster) throw new Error('MARKLESS_ROSTER_COUNT_UNRESOLVED');
	// The spent expressions first: what the placeholder resolver then sees is only
	// the counts that were printed as they stood.
	return roster.marklessResolveRosterCounts(
		roster.marklessResolveDeferredCounts(rendered, positions.deferred ?? []),
	);
}

type RosterResumeHost = {
	readonly __marklessRosterResume?: () => Promise<typeof import('../fns/roster-resume.ts')>;
};

function asPropsRecord(value: unknown): Readonly<Record<string, unknown>> {
	return value !== null && typeof value === 'object'
		? (value as Readonly<Record<string, unknown>>)
		: {};
}

// Whether this component is the one that should run the derive behind a graph
// node's initial value. `stateGraphNodeIds` is every payload node a component
// declared plus the ones its own chunks read, so it is the claim. Deliberately
// conservative: this answers no only when another same-module component
// positively claims the node and this one does not, so an unpartitioned surface
// keeps evaluating exactly what it evaluates today rather than silently
// dropping a derive.
function marklessOwnsDerivedNode(
	surface: PrerenderDataSurface,
	componentName: string,
	graphNodeId: string,
): boolean {
	let claimed = false;
	for (const name in surface.components) {
		if (!surface.components[name]?.stateGraphNodeIds?.includes(graphNodeId)) continue;
		if (name === componentName) return true;
		claimed = true;
	}
	return !claimed;
}

// Whether a graph node id belongs to this surface's own module. Node ids are
// minted per module, so the same id can name unrelated cells on either side of
// an import; this is what keeps a composing parent's value from answering for
// a child's own node of the same name.
function marklessSurfaceDeclaresGraphNode(
	surface: PrerenderDataSurface,
	graphNodeId: string,
): boolean {
	for (const name in surface.components) {
		const definition = surface.components[name];
		if (!definition) continue;
		if (definition.stateGraphNodeIds?.includes(graphNodeId)) return true;
		if (definition.initialValues?.some((initial) => initial.graphNodeId === graphNodeId))
			return true;
		if (definition.state.cells.some((cell) => cell.graphNodeId === graphNodeId)) return true;
		if (definition.state.computed.some((computed) => computed.graphNodeId === graphNodeId))
			return true;
	}
	return false;
}

// A child's derive is compiled against ITS module's node ids, but the symbol a
// composing parent binds is rebound to the parent's route, so it asks this
// evaluation for a node the child's module never declared. Same-module children
// answer by accident - the producer hands every component in a module the whole
// module's initial values - and across an import there is nothing to answer
// with, so the derive used to paint `undefined` on the first client paint.
// Carrying the routed values down closes that, and only for ids foreign to the
// child.
export function marklessBoundGraphValues(
	inherited: ReadonlyMap<string, unknown> | undefined,
	childSurface: PrerenderDataSurface,
	props: NonNullable<PrerenderDataDefinition['edges']>[number]['props'],
	read: PrerenderRead,
): ReadonlyMap<string, unknown> | undefined {
	const seen = new Map<string, unknown>(inherited ?? []);
	for (const prop of props) {
		if (!prop.graphNodeId || seen.has(prop.graphNodeId)) continue;
		seen.set(prop.graphNodeId, read(prop.graphNodeId, []));
	}
	const routed = new Map<string, unknown>();
	for (const [graphNodeId, value] of seen) {
		if (!marklessSurfaceDeclaresGraphNode(childSurface, graphNodeId))
			routed.set(graphNodeId, value);
	}
	return routed.size > 0 ? routed : undefined;
}

// Per live graph, the component instances its last re-render placed on the page.
const mountedInstances = new WeakMap<RuntimeGraph, Set<string>>();

// An instance the last re-render did not place (or, before any, whose cells the graph holds nothing for) starts fresh.
function marklessChildNotYetLive(
	graph: RuntimeGraph | undefined | false,
	definition: PrerenderDataDefinition | undefined,
	instancePrefix: string,
): boolean {
	if (!graph || !definition) return false;
	const mounted = mountedInstances.get(graph);
	if (mounted) return !mounted.has(instancePrefix);
	const ids = [
		...ownedStateCells(definition).map((cell) => cell.graphNodeId),
		...(definition.propCellId ? [definition.propCellId] : []),
	];
	return ids.length > 0 && ids.every((id) => graph.read(instancePrefix + id) === undefined);
}

// The cells this component declares, as against the module's whole list: the
// producer hands every component in a module all of them.
function ownedStateCells(
	definition: PrerenderDataDefinition,
): ProtocolStatePayload['cells'] {
	const cellIndexes = definition.stateCellIndexes;
	if (cellIndexes)
		return cellIndexes.flatMap((index) =>
			definition.state.cells[index] ? [definition.state.cells[index]!] : [],
		);
	const owned = new Set(definition.stateGraphNodeIds ?? []);
	return definition.state.cells.filter((cell) => owned.size === 0 || owned.has(cell.graphNodeId));
}

// A module as one render placed it: its root's prefix, each evaluated instance's reader, and the import edge an outer module claims through.
type PrerenderBoundModule = {
	readonly rootPrefix: string;
	readonly instanceReads: Map<string, PrerenderRead>;
	readonly outer?: {
		readonly boundSymbols: Readonly<Record<string, string>>;
		readonly composer: PrerenderBoundComposer;
	} | undefined;
};

export type PrerenderBoundComposer = {
	readonly symbolPrefix: string;
	readonly read: PrerenderRead;
	readonly module?: PrerenderBoundModule;
};

export function evaluatePrerenderDataComponent(input: {
	readonly surface: PrerenderDataSurface;
	readonly componentName: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly idPrefix: string;
	readonly symbolPrefix: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
	// The component whose edge bound this one's symbols: its resolver loads them, its nodes answer their captures.
	readonly composer?: PrerenderBoundComposer;
	// Set when the composer declares this component in its own module.
	readonly module?: PrerenderBoundModule;
	readonly graphProps?: ReadonlyArray<{
		readonly name: string;
		readonly kind: string;
		readonly graphNodeId?: string;
		readonly path?: ReadonlyArray<string>;
	}>;
	readonly loadSymbol: PrerenderLoadSymbol;
	readonly graph: RuntimeGraph | undefined;
	readonly requireHtml: boolean;
	// What the component this one is projected into seeded into its widget's
	// shared instance, written before this render started.
	readonly sharedSeeds?: ReadonlyMap<string, unknown>;
	// Values for graph nodes a composing ancestor routed into this component and
	// this component's own module never declared.
	readonly boundGraphValues?: ReadonlyMap<string, unknown>;
	// This component is being created by the render, not re-rendered: its own
	// state starts from its declaration, and the commit seeds it into the graph.
	readonly freshInstance?: true;
	readonly freshCellIds?: Set<string>;
	readonly mountedInstances?: Set<string>;
	// The branch site whose arm this render brings in, forwarded to the renderer
	// so it can mark that arm's subtree.
	readonly freshBranchSiteId?: string;
}): Awaitable<
	SsrRenderOutput & {
		// The render-data path emits the full ssr-data structure, not just anchors.
		readonly structure?: SsrDataStructure;
		readonly elementCount: number;
		readonly propEvents: ReadonlyArray<unknown>;
		readonly externalSymbolIds: ReadonlyArray<string>;
		m?: (graphProps: ComposeGraphProps) => void;
	}
> {
	const definition = input.surface.components[input.componentName];
	if (!definition) {
		throw new Error(`MARKLESS_PRERENDER_DATA_COMPONENT_MISSING: ${input.componentName}`);
	}
	const values = new Map<string, unknown>([['prop:props', input.props]]);
	for (const initial of definition.initialValues ?? []) {
		if (initial.value.kind === 'constant') {
			values.set(initial.graphNodeId, structuredClone(initial.value.value));
		}
	}
	for (const [graphNodeId, seeded] of input.sharedSeeds ?? []) values.set(graphNodeId, seeded);
	// Authored state cells belong to the live graph once one exists: an
	// escalated arm re-settle renders what the interaction wrote, not the
	// compile-time initial value seeded into `values`.
	// A fresh instance owns only ITS cells; a module-mate's stay live.
	const freshOwnCellIds = input.freshInstance
		? new Set(ownedStateCells(definition).map((cell) => cell.graphNodeId))
		: undefined;
	// Composition merges a child's nodes under its instance path, which is the
	// prefix its symbols already carry; the commit writes composed ids.
	for (const graphNodeId of freshOwnCellIds ?? [])
		input.freshCellIds?.add(input.symbolPrefix + graphNodeId);
	// Its derives read props off the graph, where nothing has written them yet.
	if (input.freshInstance && definition.propCellId)
		input.freshCellIds?.add(input.symbolPrefix + definition.propCellId);
	const liveCellIds = input.graph
		? new Set(
				definition.state.cells
					.map((cell) => cell.graphNodeId)
					.filter((graphNodeId) => !freshOwnCellIds?.has(graphNodeId)),
			)
		: undefined;
	// The live graph holds a composed instance's own cells under its instance path.
	const instanceCellIds =
		input.graph && input.symbolPrefix
			? new Set(ownedStateCells(definition).map((cell) => cell.graphNodeId))
			: undefined;
	const read = (graphNodeId: string, path: ReadonlyArray<string> = []): unknown => {
		// A minted row loads its symbols through the resume loader, which scopes a
		// symbol's reads by prepending the instance path. With no live graph to
		// resolve that against, this component's own values answer to the
		// compile-time id the symbol was emitted with.
		const instancePath =
			input.graph || values.has(graphNodeId) ? '' : marklessInstancePath(graphNodeId);
		if (instancePath) return read(graphNodeId.slice(instancePath.length), path);
		if (graphNodeId === definition.propCellId || graphNodeId === 'prop:props') {
			return readPath(input.props, path);
		}
		if (graphNodeId.startsWith('prop:')) {
			return readPath(input.props[graphNodeId.slice(5)], path);
		}
		// A settled child can introduce a sync computed that did not exist in the
		// pending group's graph. Its derived value is already known here and must
		// render from this component's evaluation before registration publishes it
		// to the staged graph for later refreshes.
		if (values.has(graphNodeId) && !liveCellIds?.has(graphNodeId))
			return readPath(values.get(graphNodeId), path);
		// Render data carries authored paths; an async computed's graph node is its snapshot.
		const graphPath = definition.state.computed.some(
			(computed) => computed.graphNodeId === graphNodeId && computed.async === true,
		)
			? ['value', ...path]
			: path;
		if (input.graph)
			return input.graph.read(
				instanceCellIds?.has(graphNodeId) ? input.symbolPrefix + graphNodeId : graphNodeId,
				graphPath,
			);
		if (input.boundGraphValues?.has(graphNodeId))
			return readPath(input.boundGraphValues.get(graphNodeId), path);
		return readPath(values.get(graphNodeId), path);
	};
	const ownModule: PrerenderBoundModule = input.module ?? {
		rootPrefix: input.symbolPrefix,
		instanceReads: input.composer?.module?.instanceReads ?? new Map(),
		outer: input.composer && input.boundSymbols && { boundSymbols: input.boundSymbols, composer: input.composer },
	};
	ownModule.instanceReads.set(input.symbolPrefix, read);
	// A part may derive where it stands in its family's roster. First paint has no
	// DOM, so the answer is the order this widget instance emits its members.
	// A row minted after resume is its own small render, with no page seeds to
	// count within: it starts from zero and the roster's revision renumbers it.
	const positions =
		marklessRosterPositions(input.sharedSeeds) ??
		marklessRosterPositions(marklessRosterPositionSeeds())!;
	const rosterPositionContext = marklessRosterRenderContext(positions, input.sharedSeeds);
	const initials = definition.initialValues ?? [];
	const derived = marklessWalk(initials.length, (index) => {
		const initial = initials[index]!;
		const symbolValue = initial.value;
		if (symbolValue.kind !== 'symbol-function') return undefined;
		// A constant initial value is seed data every same-module component may
		// read, so the producer hands the whole list to each of them. Running a
		// derive symbol is not seeding: it belongs to the one component that
		// declared it, and only that component's evaluation carries the edge
		// binding the symbol was compiled against. A page that runs its child's
		// derive reaches it unbound and dies on the capture context it never got.
		if (!marklessOwnsDerivedNode(input.surface, input.componentName, initial.graphNodeId))
			return undefined;
		const symbolId = symbolValue.symbolId;
		const initializer = definition.initializerResidues?.[symbolId];
		if (initializer && definition.readResidue) {
			values.set(initial.graphNodeId, definition.readResidue(
				{ kind: 'authored-expression', source: initializer },
				{ read },
			));
			return undefined;
		}

		// Live graphs and bound captures require the loader's instance scoping.
		const linkedInitializer =
			!input.graph && !input.boundSymbols?.[symbolId]
				? definition.initializers?.[symbolId]
				: undefined;
		let boundSymbolId = input.boundSymbols?.[symbolId];
		let composer = input.composer;
		// An outer module that claimed the row again, through a prop its slot passed through, binds it there.
		for (let outer = composer?.module?.outer; outer && boundSymbolId; outer = composer?.module?.outer) {
			const rebound = marklessReboundSymbolId(outer.boundSymbols, boundSymbolId);
			if (!rebound) break;
			boundSymbolId = rebound;
			composer = outer.composer;
		}
		const scope = composer;
		// Slot routes name the composer's nodes bare and any other instance by its path in the module; a minted row knows only its composer.
		const deriveRead: PrerenderRead =
			boundSymbolId && scope && !input.graph
				? (graphNodeId, path) => {
						const at = marklessInstancePath(graphNodeId),
							local = graphNodeId.slice(at.length),
							holder = at ? scope.module?.instanceReads.get(scope.module.rootPrefix + at) : scope.read;
						if (holder) return holder(local, path);
						const own = read(graphNodeId, path);
						return own === undefined && scope.symbolPrefix.endsWith(at) ? scope.read(local, path) : own;
					}
				: read;
		return marklessThen(
			linkedInitializer ??
				(input.loadSymbol(
					boundSymbolId
						? (composer?.symbolPrefix ?? '') + boundSymbolId
						: marklessRowFreeSymbolId(input.symbolPrefix + symbolId, input.symbolPrefix),
				) as Awaitable<unknown>),
			(loaded) => {
				if (typeof loaded !== 'function') {
					throw new Error(`MARKLESS_PRERENDER_DATA_SYMBOL_MISSING: ${symbolId}`);
				}
				return marklessThen(
					(loaded.length > 0
						? loaded({ graph: { read: deriveRead }, read: deriveRead, ...rosterPositionContext })
						: loaded()) as Awaitable<unknown>,
					(value) => {
						values.set(initial.graphNodeId, value);
					},
				);
			},
		);
	});
	return marklessThen(derived, () =>
		marklessThen(
			registerPrerenderStagedComputeds(
				input.graph,
				definition.state.computed.flatMap((computed) => {
					if (computed.async !== false || !values.has(computed.graphNodeId)) return [];
					return [
						{
							...computed,
							...(computed.deriveSymbolId
								? { deriveSymbolId: marklessBoundSymbolId(input, computed.deriveSymbolId) }
								: {}),
							value: values.get(computed.graphNodeId),
							dependencies: (computed.dependencies ?? []).map((dependency) => {
								const mapped = marklessCsrRemapChildGraph(dependency, input.graphProps);
								return mapped ?? dependency;
							}),
						},
					];
				}),
			),
			() => {

			const owned = new Set(definition.stateGraphNodeIds ?? []);
			const servedComputed = new Set(
				(definition.servedComputedIndexes ?? []).flatMap((index) => {
					const computed = definition.state.computed[index];
					return computed ? [computed.graphNodeId] : [];
				}),
			);
			const computedIndexes = definition.stateComputedIndexes;
			const ownedCells = ownedStateCells(definition);
			const ownedComputed = computedIndexes
				? computedIndexes.flatMap((index) =>
						definition.state.computed[index] ? [definition.state.computed[index]!] : [],
					)
				: definition.state.computed.filter(
						(computed) => owned.size === 0 || owned.has(computed.graphNodeId),
					);
			const state: ProtocolStatePayload = {
				...structuredClone(definition.state),
				cells: ownedCells
					.map((cell) =>
						values.has(cell.graphNodeId)
							? { ...cell, value: undefined, directValue: values.get(cell.graphNodeId) }
							: { ...cell },
					),
				computed: ownedComputed
					.map((computed) =>
						computed.async
							? {
									...computed,
									snapshot: input.graph
										? (input.graph.read(computed.graphNodeId, []) as never)
										: {
												status: 'pending' as const,
												version: 1,
												key: SERIALIZED_NULL_GRAPH_PAYLOAD,
											},
								}
							: servedComputed.has(computed.graphNodeId) && values.has(computed.graphNodeId)
								? { ...computed, directValue: values.get(computed.graphNodeId) }
								: computed,
					),
			};
			if (definition.propCellId) {
				const propCell = state.cells.find((cell) => cell.graphNodeId === definition.propCellId);
				if (propCell) Object.assign(propCell, { value: undefined, directValue: input.props });
				else
					(state.cells as Array<ProtocolStatePayload['cells'][number]>).push({
						graphNodeId: definition.propCellId,
						name: 'props',
						valueKind: 'object',
						directValue: input.props,
					});
			}
			// An arm test or child prop the compiler could not reduce to a graph read is
			// an authored expression, answered by the same compiled reader as markup
			// residue. It decides what renders, so it runs even when the HTML is dropped.
			// The row a decision is evaluated inside is part of the answer: a child prop or
			// arm test written over the `@for` binding reads it from this context.
			const readDecision = (source: string | undefined, context: SsrDataReadContext) =>
				source &&
				definition.readResidue?.(
					{ kind: 'authored-expression', source },
					{
						repeatItem: context.repeatItem,
						repeatIndex: context.repeatIndex,
						repeatId: context.repeatId,
						repeatOuter: context.repeatOuter,
						read,
						idPrefix: input.idPrefix,
					},
				);
			const children: Array<MarklessSsrComposedChild> = [];
			const branches: Array<{ readonly id: string; readonly takenArm: number }> = [];
			const asyncSnapshots = state.computed.flatMap((computed) =>
				computed.async && computed.snapshot
					? [{ graphNodeId: computed.graphNodeId, snapshot: computed.snapshot }]
					: [],
			);
			const renderData = {
				...input.surface.renderData,
				root: { componentName: input.componentName, templateId: definition.rootChunkId },
				chunks: input.surface.renderData.chunks.filter(
					(chunk) => chunk.componentName === input.componentName,
				),
				branches: definition.branches ?? [],
				boundaries: definition.boundaries ?? [],
			};
			return marklessThen(
				renderSsrData({
					renderData,
					idPrefix: input.idPrefix,
					projectionSegment: definition.rowHosts?.segment,
					...(input.freshBranchSiteId ? { freshBranchSiteId: input.freshBranchSiteId } : {}),
					sharedSeeds: input.sharedSeeds,
					read: (residue, context) => {
						if (residue.kind === 'repeat-item') return readPath(context.repeatItem, residue.path);
						if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
						// Initial wake consumes only the reconstructed state/view records. Its
						// rendered HTML is discarded because the prerendered DOM is already live,
						// so authored markup residue is not a dependency of record reconstruction.
						// Skipping the reader here also keeps authored side effects single-run.
						if (!input.requireHtml) return '';
						if (definition.readResidue)
							return definition.readResidue(residue, {
								repeatItem: context.repeatItem,
								repeatIndex: context.repeatIndex,
								repeatId: context.repeatId,
								repeatOuter: context.repeatOuter,
								asyncError: context.asyncError,
								read,
								idPrefix: input.idPrefix,
								deferCount: rosterPositionContext.deferCount,
							});
						throw new Error('MARKLESS_PRERENDER_RESIDUE_MISSING');
					},
					selectBranchArm: (slot, context) => {
						const branch = (definition.branches ?? []).find(
							(candidate) => candidate.branchSiteId === slot.branchSiteId,
						);
						const testRead = branch?.testReads?.length === 1 ? branch.testReads[0] : undefined;
						const value = testRead
							? read(testRead.graphNodeId, testRead.path)
							: readDecision(branch?.testSource, context);
						let arm = value ? 0 : 1;
						if (branch?.armTests) {
							const match = branch.armTests.findIndex(
								(candidate) => candidate !== null && Object.is(candidate, value),
							);
							arm = match >= 0 ? match : branch.armTests.indexOf(null);
						}
						branches.push({
							id: slot.branchSiteId,
							takenArm: arm,
							...branchArmIdrefResolution(
								renderData.chunks,
								slot.armTemplateIds,
								input.idPrefix,
								(handleGraphNodeId) =>
									definition.readResidue?.(
										{ kind: 'element-handle-id', handleGraphNodeId },
										{ read, idPrefix: input.idPrefix },
									),
							),
						});
						return arm;
					},
					selectAsyncArm: (slot) => {
						const boundary = (definition.boundaries ?? []).find(
							(candidate) => candidate.boundaryId === slot.boundaryId,
						);
						const snapshot = boundary?.runnerGraphNodeId
							? state.computed.find(
									(candidate) => candidate.graphNodeId === boundary.runnerGraphNodeId,
								)?.snapshot
							: undefined;
						return snapshot?.status === 'fulfilled' ? 0 : snapshot?.status === 'rejected' ? 2 : 1;
					},
					seedChild: (slot, context) =>
						marklessRosterSeedPass(context.sharedSeeds, () =>
							sharedSeedPass()?.(
								{
									...input,
									// Seeds load by compile-time symbol id; the row reaches them as identity.
									symbolPrefix: marklessRowFreeSymbolId(input.symbolPrefix, input.symbolPrefix),
									rowSegment:
										context.repeatKey === undefined ? '' : marklessRowSegment(context.repeatKey),
									readEdgeProp: (prop) => readDecision(prop.source, context),
								},
								definition,
								slot,
								read,
								context.sharedSeeds,
							),
						),
					renderChild: (slot, context) => {
						const edge = (definition.edges ?? []).find(
							(candidate) => candidate.id === slot.componentEdgeId,
						);
						if (!edge) throw new Error(`MARKLESS_PRERENDER_CHILD_MISSING: ${slot.componentEdgeId}`);
						// One compile-time edge inside a keyed `@for` is many instances at render time.
						const rowSegment = context.repeatKey === undefined ? '' : marklessRowSegment(context.repeatKey);
						const hostPrefix = rowSegment + edge.hostPrefix;
						const symbolPrefix = rowSegment + edge.symbolPrefix;
						if (edge.materialized) {
							const materialized = placeMaterializedChild(
								edge.materialized,
								input.idPrefix + hostPrefix,
							);
							children.push({
								output: materialized as SsrComposableChildOutput,
								hostPrefix,
								symbolPrefix,
								graphProps: edge.props,
								asyncBoundaryId: edge.asyncBoundaryId,
								boundSymbols: edge.boundSymbols ?? {},
								callbackProps: {},
							});
							return materialized;
						}
						const childProps: Record<string, unknown> = {};
						const callbacks: Record<string, string> = {};
						for (const prop of edge.props) {
							if (prop.kind === 'spread' && prop.graphNodeId) {
								Object.assign(
									childProps,
									marklessSsrSpreadProps(read(prop.graphNodeId, prop.path ?? []), prop.excludeNames),
								);
							} else if (prop.kind === 'graph-reference' && prop.graphNodeId) {
								childProps[prop.name] = read(prop.graphNodeId, prop.path ?? []);
								const forwarded = forwardedCallback(
									input.props,
									definition.propCellId,
									prop.graphNodeId,
									prop.path,
								);
								if (forwarded) callbacks[prop.name] = forwarded;
							} else if (
								prop.kind === 'element-handle-id' &&
								prop.graphNodeId &&
								definition.readResidue
							) {
								// The element this IDREF names is rendered by THIS component, so this
								// render spells the id and the child receives a string. The same
								// compiled reader that writes the id onto that element answers here,
								// so the two sides of the relationship cannot disagree.
								childProps[prop.name] = definition.readResidue(
									{ kind: 'element-handle-id', handleGraphNodeId: prop.graphNodeId },
									{ read, idPrefix: input.idPrefix },
								);
							} else if (prop.kind === 'absent') {
								childProps[prop.name] = undefined;
							} else if (prop.kind === 'serializable' && 'value' in prop) {
								childProps[prop.name] = prop.value;
							} else if (prop.kind === 'callback') {
								const symbolId = edge.boundSymbols?.[prop.name] ?? prop.symbolId;
								if (symbolId) callbacks[prop.name] = input.symbolPrefix + symbolId;
							} else if (prop.source !== undefined && definition.readResidue) {
								childProps[prop.name] = readDecision(prop.source, context);
							} else {
								throw new Error(`MARKLESS_PRERENDER_PROP_UNDERIVABLE: ${prop.name}`);
							}
						}
						if (context.projectionHtml !== undefined) {
							childProps.children = context.projectionHtml;
						}
						if (Object.keys(callbacks).length > 0) childProps.__marklessSsrCallbacks = callbacks;
						const childSurface = input.surface.components[edge.childComponentName]
							? input.surface
							: input.surface.imports[edge.childComponentName];
						if (!childSurface) {
							throw new Error(
								`MARKLESS_PRERENDER_DATA_COMPONENT_MISSING: ${edge.childComponentName}`,
							);
						}
						input.mountedInstances?.add(input.symbolPrefix + symbolPrefix);
						return marklessThen(
							evaluatePrerenderDataComponent({
								surface: childSurface,
								componentName: edge.childComponentName,
								props: childProps,
								idPrefix: input.idPrefix + hostPrefix,
								symbolPrefix: input.symbolPrefix + symbolPrefix,
								boundSymbols: edge.boundSymbols,
								composer: { symbolPrefix: input.symbolPrefix, read, module: ownModule },
								...(childSurface === input.surface ? { module: ownModule } : {}),
								graphProps: edge.props,
								loadSymbol: input.loadSymbol,
								graph: input.graph,
								requireHtml: input.requireHtml,
								sharedSeeds: context.sharedSeeds,
								boundGraphValues: marklessBoundGraphValues(
									input.boundGraphValues,
									childSurface,
									edge.props,
									read,
								),
								...(input.freshInstance ||
								context.freshInstances ||
								marklessChildNotYetLive(
									input.freshCellIds && input.graph,
									childSurface.components[edge.childComponentName],
									input.symbolPrefix + symbolPrefix,
								)
									? { freshInstance: true as const }
									: {}),
								...(input.freshCellIds ? { freshCellIds: input.freshCellIds } : {}),
								...(input.mountedInstances ? { mountedInstances: input.mountedInstances } : {}),
							}),
							(output) => {
								children.push({
									output: output as SsrComposableChildOutput,
									hostPrefix,
									symbolPrefix,
									graphProps: edge.props,
									asyncBoundaryId: edge.asyncBoundaryId,
									boundSymbols: edge.boundSymbols ?? {},
									callbackProps: callbacks,
									// Where this child's own composition puts the children written into it,
									// so composition can register the widget a projected part sits beside.
									childrenWidgetRoot: sharedSeedPass()?.childrenWidgetRoot?.(
										childSurface,
										edge.childComponentName,
									),
									widgetFallbacks: sharedSeedPass()?.widgetFallbacks?.(
										childSurface,
										edge.childComponentName,
									),
								});
								return output;
							},
						);
					},
				}),
				(rendered) => {
					const view = structuredClone(definition.view) as SsrComposableView;
					const composition = marklessSsrComposeView(
						rendered.structure,
						definition.rowHosts?.qualify(rendered.structure, view, input.idPrefix) ?? view,
						children,
						asyncSnapshots,
						input.idPrefix,
					);
					const output = {
						html: rendered.html,
						state: marklessSsrAttachSnapshots(marklessComposeState(state, children), asyncSnapshots),
						view: {
							...composition.view,
							branches: marklessSsrMergeBranches(composition.view.branches, branches),
						} as unknown as import('@markless/serializer').ProtocolViewPayload,
						structure: rendered.structure,
						structureTokens: rendered.structureTokens,
						elementCount: composition.elementCount,
						propEvents: definition.propEvents ?? [],
						externalSymbolIds: composition.externalSymbolIds,
						m(graphProps: ComposeGraphProps, instancePath?: string) {
							marklessSsrRemapGraphOutput(output, graphProps, instancePath);
						},
					};
				return output;
				},
			);
			},
		),
	);
}

async function settledBoundaryResult(output: SsrRenderOutput, boundaryId: string) {
	const records = await prepareSsrResumeRecords(output);
	const anchor = output.structure?.anchors.find(
		(candidate) => candidate.kind === 'async' && candidate.id === boundaryId,
	);
	const boundary = records.view.asyncBoundaries.find((candidate) => candidate.id === boundaryId);
	const armRecords = boundary?.armRecords;
	if (!anchor || !armRecords || Array.isArray(armRecords)) {
		throw new Error(`MARKLESS_PRERENDER_BOUNDARY_MISSING: ${boundaryId}`);
	}
	// Array.isArray cannot narrow the readonly per-arm plan out of the union.
	return {
		html: anchor.html,
		armRecords: armRecords as ResumeArmRecordSet,
		computed: records.state.computed,
	};
}

function renderBuiltPage(
	page: SsrRenderable,
	props: unknown,
	renderContext: unknown,
): SsrRenderOutput | Promise<SsrRenderOutput> {
	if (typeof page === 'function')
		return (page as (props?: unknown, renderContext?: unknown) => SsrRenderOutput)(
			props,
			renderContext,
		);
	if (page && typeof page.renderSsr === 'function') return page.renderSsr(props, renderContext);
	throw new TypeError('Prerender resume requires a compiled TSRX artifact.');
}

// A callback the composer handed this component, passed on under the id the composer gave it.
function forwardedCallback(
	props: Readonly<Record<string, unknown>>,
	propCellId: string | null | undefined,
	graphNodeId: string,
	path: ReadonlyArray<string> = [],
): string | undefined {
	const names =
		graphNodeId === 'prop:props' || graphNodeId === propCellId
			? path
			: graphNodeId.startsWith('prop:')
				? [graphNodeId.slice(5), ...path]
				: undefined;
	const symbolId = names && readPath(props.__marklessSsrCallbacks, names);
	return typeof symbolId === 'string' ? symbolId : undefined;
}

export function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function placeMaterializedChild<
	T extends { readonly structureTokens?: ReadonlyArray<StructureToken> },
>(output: T, idPrefix: string): T {
	if (!output.structureTokens || idPrefix === '') return output;
	return {
		...output,
		structureTokens: output.structureTokens.map((token) =>
			token.kind === 'element'
				? { ...token, hostNodeId: idPrefix + token.hostNodeId }
				: { ...token, anchorId: idPrefix + token.anchorId },
		),
	};
}
