import {
	renderSsrData,
	type RenderSsrDataOutput,
	type SsrDataReadContext,
	type SsrDataResidue,
	type SsrDataSlot,
	type SsrRenderData,
} from '../ssr-data/renderer.ts';
import type { SsrRenderable, SsrRenderOutput } from '../render-to-string.ts';
import type { ResumeArmRecordSet } from '../resume-types.ts';
import type { RuntimeGraph } from '@markless/runtime';
import type { ProtocolStatePayload } from '@markless/serializer';
import { prepareSsrResumeRecords } from './records.ts';
import {
	marklessSsrAttachSnapshots,
	marklessComposeState,
	marklessSsrComposeView,
	marklessSsrMergeBranches,
	marklessSsrRemapGraphOutput,
} from '../fns/ssr.ts';

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
			| { readonly kind: string; readonly [key: string]: unknown };
	}>;
};

type PrerenderDataDefinition = {
	readonly name: string;
	readonly state: ProtocolStatePayload;
	readonly view: import('@markless/serializer').ProtocolViewPayload;
	readonly rootChunkId: string;
	readonly hostNodeIds?: ReadonlyArray<string>;
	readonly stateGraphNodeIds?: ReadonlyArray<string>;
	readonly initialValues?: PrerenderRenderData['initialValues'];
	readonly initialValueKinds?: Readonly<Record<string, string>>;
	readonly branches?: PrerenderRenderData['branches'];
	readonly boundaries?: PrerenderRenderData['boundaries'];
	readonly edges?: ReadonlyArray<{
		readonly id: string;
		readonly childComponentName: string;
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
		}>;
	}>;
	readonly propCellId?: string | null;
};

export type PrerenderDataSurface = {
	readonly rootComponentName: string | null;
	readonly renderData: PrerenderRenderData;
	readonly components: Readonly<Record<string, PrerenderDataDefinition>>;
	readonly imports: Readonly<Record<string, PrerenderDataSurface>>;
};

type PrerenderLoadSymbol = (symbolId: string) => unknown | Promise<unknown>;

export type PrerenderPageClosure = {
	readonly renderData: PrerenderRenderData;
	readonly props?: unknown;
	readonly idPrefix?: string;
	readonly computed?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly evaluate: (context: PrerenderEvaluationContext) => Awaitable<unknown>;
	}>;
	readonly readAuthored?: (
		residue: Extract<SsrDataResidue, { readonly kind: 'authored-expression' }>,
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
			throw new Error(`MARKLESS_PRERENDER_RESIDUE_MISSING: ${residue.source}`);
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
		if (typeof propsOrLoadSymbol !== 'function') {
			throw new TypeError('Prerender render data requires a symbol loader.');
		}
		return prepareSsrResumeRecords(
			await evaluatePrerenderDataSurface(page, propsOrLoadSymbol, undefined),
		);
	}
	return prepareSsrResumeRecords(await evaluateBuiltPageClosure(page, propsOrLoadSymbol));
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
		if (typeof propsOrLoadSymbol !== 'function') {
			throw new TypeError('Prerender render data requires a symbol loader.');
		}
		const output = await evaluatePrerenderDataSurface(page, propsOrLoadSymbol, graph);
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
): Promise<SsrRenderOutput> {
	const rootName = surface.rootComponentName;
	if (!rootName) throw new Error('MARKLESS_PRERENDER_DATA_ROOT_MISSING');
	return evaluatePrerenderDataComponent({
		surface,
		componentName: rootName,
		props: {},
		idPrefix: '',
		symbolPrefix: '',
		loadSymbol,
		graph,
	});
}

async function evaluatePrerenderDataComponent(input: {
	readonly surface: PrerenderDataSurface;
	readonly componentName: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly idPrefix: string;
	readonly symbolPrefix: string;
	readonly loadSymbol: PrerenderLoadSymbol;
	readonly graph: RuntimeGraph | undefined;
}): Promise<
	SsrRenderOutput & {
		readonly elementCount: number;
		readonly propEvents: ReadonlyArray<unknown>;
		readonly externalSymbolIds: ReadonlyArray<string>;
		m?: (graphProps: ReadonlyArray<unknown>) => void;
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
	const read = (graphNodeId: string, path: ReadonlyArray<string> = []) => {
		if (graphNodeId === definition.propCellId || graphNodeId === 'prop:props') {
			return readPath(input.props, path);
		}
		if (graphNodeId.startsWith('prop:')) {
			return readPath(input.props[graphNodeId.slice(5)], path);
		}
		return input.graph
			? input.graph.read(graphNodeId, path)
			: readPath(values.get(graphNodeId), path);
	};
	for (const initial of definition.initialValues ?? []) {
		if (initial.value.kind !== 'symbol-function') continue;
		const loaded = await input.loadSymbol(input.symbolPrefix + initial.value.symbolId);
		if (typeof loaded !== 'function') {
			throw new Error(`MARKLESS_PRERENDER_DATA_SYMBOL_MISSING: ${initial.value.symbolId}`);
		}
		const value =
			definition.initialValueKinds?.[initial.graphNodeId] === 'sync-computed-derive'
				? await loaded({ graph: { read }, read })
				: await loaded();
		values.set(initial.graphNodeId, value);
	}

	const owned = new Set(definition.stateGraphNodeIds ?? []);
	const state: ProtocolStatePayload = {
		...structuredClone(definition.state),
		cells: definition.state.cells
			.filter((cell) => owned.size === 0 || owned.has(cell.graphNodeId))
			.map((cell) =>
				values.has(cell.graphNodeId)
					? { ...cell, value: undefined, directValue: values.get(cell.graphNodeId) }
					: { ...cell },
			),
		computed: definition.state.computed
			.filter((computed) => owned.size === 0 || owned.has(computed.graphNodeId))
			.map((computed) =>
				computed.async
					? {
							...computed,
							snapshot: input.graph
								? (input.graph.read(computed.graphNodeId, []) as never)
								: { status: 'pending' as const, version: 1, key: null },
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
	const children: Array<Record<string, unknown>> = [];
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
		read: (residue, context) => {
			if (residue.kind === 'repeat-item') return readPath(context.repeatItem, residue.path);
			if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
			throw new Error(`MARKLESS_PRERENDER_RESIDUE_MISSING: ${residue.source}`);
		},
		selectBranchArm: (slot) => {
			const branch = (definition.branches ?? []).find(
				(candidate) => candidate.branchSiteId === slot.branchSiteId,
			);
			const testRead = branch?.testReads[0];
			const value = testRead ? read(testRead.graphNodeId, testRead.path) : undefined;
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
		renderChild: async (slot) => {
			const edge = (definition.edges ?? []).find(
				(candidate) => candidate.id === slot.componentEdgeId,
			);
			if (!edge) throw new Error(`MARKLESS_PRERENDER_CHILD_MISSING: ${slot.componentEdgeId}`);
			const childProps: Record<string, unknown> = {};
			const callbacks: Record<string, string> = {};
			for (const prop of edge.props) {
				if (prop.kind === 'graph-reference' && prop.graphNodeId) {
					childProps[prop.name] = read(prop.graphNodeId, prop.path ?? []);
				} else if (prop.kind === 'serializable' && 'value' in prop) {
					childProps[prop.name] = prop.value;
				} else if (prop.kind === 'callback') {
					const symbolId = edge.boundSymbols?.[prop.name] ?? prop.symbolId;
					if (symbolId) callbacks[prop.name] = input.symbolPrefix + symbolId;
				} else {
					throw new Error(`MARKLESS_PRERENDER_PROP_UNDERIVABLE: ${prop.name}`);
				}
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
				idPrefix: input.idPrefix + edge.hostPrefix,
				symbolPrefix: input.symbolPrefix + edge.symbolPrefix,
				loadSymbol: input.loadSymbol,
				graph: input.graph,
			});
			children.push({
				output,
				hostPrefix: edge.hostPrefix,
				symbolPrefix: edge.symbolPrefix,
				graphProps: edge.props,
				boundSymbols: edge.boundSymbols ?? {},
				callbackProps: callbacks,
			});
			return output;
		},
	});
	const composition = marklessSsrComposeView(
		rendered.structure,
		structuredClone(definition.view),
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
		},
		structure: rendered.structure,
		structureTokens: rendered.structureTokens,
		elementCount: composition.elementCount,
		propEvents: [],
		externalSymbolIds: composition.externalSymbolIds,
		m(graphProps: ReadonlyArray<unknown>) {
			marklessSsrRemapGraphOutput(output, graphProps);
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
	return { html: anchor.html, armRecords, computed: records.state.computed };
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
