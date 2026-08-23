import {
	renderSsrData,
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
import type { ComposeGraphProps } from '../fns/composition.ts';
import { marklessCsrRemapChildGraph } from '../fns/composition.ts';
import { marklessBoundSymbolId } from '../fns/bound-symbol.ts';
import { marklessRowFreeSymbolId, marklessRowSegment } from '../fns/instance-scope.ts';
import { registerPrerenderStagedComputeds } from './staged-graph.ts';
import { sharedSeedPass } from './shared-seed-slot.ts';

// This evaluator is the seam where a SERIALIZED protocol payload meets the
// mutable draft the SSR composer works on. They describe the same records; the
// protocol types arm record sets coarsely (opaque bags), so the two shapes do
// not line up structurally and the seam names the crossing explicitly.
type SsrComposableView = Parameters<typeof marklessSsrComposeView>[1];
type SsrComposableChildOutput = NonNullable<MarklessSsrComposedChild['output']>;

type Awaitable<T> = T | Promise<T>;
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
	// Compiled by the same producer as the server module's reader; the browser
	// never parses or evaluates authored source itself.
	readonly readResidue?: (
		residue: Extract<
			SsrDataResidue,
			{
				readonly kind:
					| 'authored-expression'
					| 'element-handle-id'
					| 'element-handle-anchor-style';
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
					| 'element-handle-anchor-style';
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

function isPrerenderDataSurface(value: unknown): value is PrerenderDataSurface {
	return !!value && typeof value === 'object' && 'renderData' in value && 'components' in value;
}

async function evaluatePrerenderDataSurface(
	surface: PrerenderDataSurface,
	loadSymbol: PrerenderLoadSymbol,
	graph: RuntimeGraph | undefined,
	requireHtml: boolean,
	props: Readonly<Record<string, unknown>> = {},
): Promise<SsrRenderOutput & { readonly structure?: SsrDataStructure }> {
	const rootName = surface.rootComponentName;
	if (!rootName) throw new Error('MARKLESS_PRERENDER_DATA_ROOT_MISSING');
	return evaluatePrerenderDataComponent({
		surface,
		componentName: rootName,
		props,
		idPrefix: '',
		symbolPrefix: '',
		loadSymbol,
		graph,
		requireHtml,
	});
}

function asPropsRecord(value: unknown): Readonly<Record<string, unknown>> {
	return value !== null && typeof value === 'object'
		? (value as Readonly<Record<string, unknown>>)
		: {};
}

async function evaluatePrerenderDataComponent(input: {
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
}): Promise<
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
	const liveCellIds = input.graph
		? new Set(definition.state.cells.map((cell) => cell.graphNodeId))
		: undefined;
	const read = (graphNodeId: string, path: ReadonlyArray<string> = []) => {
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
		return input.graph
			? input.graph.read(graphNodeId, graphPath)
			: readPath(values.get(graphNodeId), path);
	};
	for (const initial of definition.initialValues ?? []) {
		if (initial.value.kind !== 'symbol-function') continue;
		const symbolId = initial.value.symbolId;
		// This component's reads are already the row's, so the loader answers row-free.
		const loaded = await input.loadSymbol(
			input.boundSymbols?.[symbolId] ??
				marklessRowFreeSymbolId(input.symbolPrefix + symbolId, input.symbolPrefix),
		);
		if (typeof loaded !== 'function') {
			throw new Error(`MARKLESS_PRERENDER_DATA_SYMBOL_MISSING: ${symbolId}`);
		}
		const value =
			loaded.length > 0
				? await loaded({ graph: { read }, read })
				: await loaded();
		values.set(initial.graphNodeId, value);
	}
	await registerPrerenderStagedComputeds(
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
	);

	const owned = new Set(definition.stateGraphNodeIds ?? []);
	const cellIndexes = definition.stateCellIndexes;
	const computedIndexes = definition.stateComputedIndexes;
	const ownedCells = cellIndexes
		? cellIndexes.flatMap((index) =>
				definition.state.cells[index] ? [definition.state.cells[index]!] : [],
			)
		: definition.state.cells.filter((cell) => owned.size === 0 || owned.has(cell.graphNodeId));
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
	const rendered = await renderSsrData({
		renderData,
		idPrefix: input.idPrefix,
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
			branches.push({ id: slot.branchSiteId, takenArm: arm });
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
				slot.componentEdgeId,
				read,
				context.sharedSeeds,
			),
		renderChild: async (slot, context) => {
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
			const output = await evaluatePrerenderDataComponent({
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
			});
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
			});
			return output;
		},
	});
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
