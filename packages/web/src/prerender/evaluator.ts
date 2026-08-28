import {
	projectionNotRenderedError,
	renderSsrData,
	withProjectionSpan,
	type RenderSsrDataOutput,
	type SsrDataReadContext,
	type SsrDataResidue,
	type SsrDataSlot,
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
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import type { ComposeGraphProps } from '../fns/composition.ts';
import { marklessCsrRemapChildGraph } from '../fns/composition.ts';
import { marklessBoundSymbolId } from '../fns/bound-symbol.ts';
import {
	marklessEnclosingWidgetGraphNodeId,
	marklessInstancePath,
	marklessRowFreeSymbolId,
	marklessRowSegment,
	marklessWithEnclosingWidgetRoots,
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
type SsrComposableView = Parameters<typeof marklessSsrComposeView>[1];
type SsrComposableChildOutput = NonNullable<MarklessSsrComposedChild['output']>;

type GraphValues = ReadonlyMap<string, unknown>;

export type PrerenderRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

export type PrerenderEvaluationContext = {
	readonly values: GraphValues;
	readonly read: PrerenderRead;
};

type PrerenderRenderData = SsrRenderData & {
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

type PrerenderLoadSymbol = (symbolId: string) => unknown | Promise<unknown>;

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
}> {
	if (isPrerenderDataSurface(page)) {
		if (!isPrerenderLoadSymbol(propsOrLoadSymbol)) {
			throw new TypeError('Prerender render data requires a symbol loader.');
		}
		const output = await evaluatePrerenderDataSurface(page, propsOrLoadSymbol, graph, true);
		return settledBoundaryResult(output, boundaryId);
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
		// The arm's own cells, taken before serialization: nothing in the live
		// graph answers for a component this render is creating.
		cells: (output.state?.cells ?? []).flatMap((cell) =>
			freshCellIds.has(cell.graphNodeId)
				? [
						{
							graphNodeId: cell.graphNodeId,
							value: (cell as { readonly directValue?: unknown }).directValue,
						},
					]
				: [],
		),
	};
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
	fresh?: { readonly branchSiteId: string; readonly cellIds: Set<string> },
): Promise<SsrRenderOutput & { readonly structure?: SsrDataStructure }> {
	const rootName = surface.rootComponentName;
	if (!rootName) throw new Error('MARKLESS_PRERENDER_DATA_ROOT_MISSING');
	const sharedSeeds = marklessRosterPositionSeeds();
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
		...(fresh ? { freshBranchSiteId: fresh.branchSiteId, freshCellIds: fresh.cellIds } : {}),
	});
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
function marklessBoundGraphValues(
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

function evaluatePrerenderDataComponent(input: {
	readonly surface: PrerenderDataSurface;
	readonly componentName: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly idPrefix: string;
	readonly symbolPrefix: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
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
	const liveCellIds = input.graph
		? new Set(
				definition.state.cells
					.map((cell) => cell.graphNodeId)
					.filter((graphNodeId) => !freshOwnCellIds?.has(graphNodeId)),
			)
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
		// A bare read of an async computed means its settled value, not the
		// snapshot object — the same lowering the branch-update producer emits.
		const graphPath =
			path.length === 0 &&
			definition.state.computed.some(
				(computed) => computed.graphNodeId === graphNodeId && computed.async === true,
			)
				? ['value']
				: path;
		if (input.graph) return input.graph.read(graphNodeId, graphPath);
		if (input.boundGraphValues?.has(graphNodeId))
			return readPath(input.boundGraphValues.get(graphNodeId), path);
		return readPath(values.get(graphNodeId), path);
	};
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
		// This component's reads are already the row's, so the loader answers row-free.
		return marklessThen(
			input.loadSymbol(
				input.boundSymbols?.[symbolId] ??
					marklessRowFreeSymbolId(input.symbolPrefix + symbolId, input.symbolPrefix),
			) as Awaitable<unknown>,
			(loaded) => {
				if (typeof loaded !== 'function') {
					throw new Error(`MARKLESS_PRERENDER_DATA_SYMBOL_MISSING: ${symbolId}`);
				}
				return marklessThen(
					(loaded.length > 0
						? loaded({ graph: { read }, read, ...rosterPositionContext })
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
						return marklessThen(
							evaluatePrerenderDataComponent({
								surface: childSurface,
								componentName: edge.childComponentName,
								props: childProps,
								idPrefix: input.idPrefix + hostPrefix,
								symbolPrefix: input.symbolPrefix + symbolPrefix,
								boundSymbols: edge.boundSymbols,
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
								...(input.freshInstance || context.freshInstances
									? { freshInstance: true as const }
									: {}),
								...(input.freshCellIds ? { freshCellIds: input.freshCellIds } : {}),
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
					const composition = marklessSsrComposeView(
						rendered.structure,
						structuredClone(definition.view) as SsrComposableView,
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
						propEvents: [],
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
};

export function renderRepeatRowComponent(
	input: RepeatRowComponentInput,
): Awaitable<RepeatRowComponentRender> {
	// A refusal still answers as a rejection, so only a warm render skips the wait.
	try {
		if (!input.enclosingWidgetRoots?.size) return renderRowComponentEdge(input);
		return marklessWithEnclosingWidgetRoots(rowSegmentOf(input), input.enclosingWidgetRoots, () =>
			renderRowComponentEdge(input),
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
						...(sharedSeeds ? { sharedSeeds } : {}),
						rootContext: { item: input.item, index: input.rowIndex, key: input.rowKey },
						read: (residue, context) => {
							if (residue.kind === 'repeat-item') return readPath(context.repeatItem, residue.path);
							if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
							if (definition.readResidue)
								return definition.readResidue(residue, {
									repeatItem: context.repeatItem,
									repeatIndex: context.repeatIndex,
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
										symbolPrefix: rowSegment + projectedEdge.symbolPrefix,
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
						symbolPrefix,
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
						emptyRowView() as SsrComposableView,
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

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
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
