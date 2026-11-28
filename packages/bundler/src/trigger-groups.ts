import type {
	BoundSymbolResolverRow,
	RenderDataArtifact,
	SemanticBranchSite,
	SemanticComponentEdge,
	SemanticGraphBinding,
	SymbolResolverModuleInput,
	SymbolResolverPlan,
	TriggerGroupArtifact,
} from '@markless/compiler';
import {
	PROTOCOL_EVENT_ACTION_KIND,
	protocolEventActionKind,
	type ProtocolEventActionKind,
	type ProtocolEventRecord,
} from '@markless/serializer';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import {
	emitSymbolResolverHelpersModule,
	emitSymbolResolverModule,
	symbolResolverHelpersVariant,
} from '@markless/compiler';
import type { SourceSymbolRow } from './source-module.ts';
import type { SourceLazySymbolRoute } from './source-module.ts';
import { emitSymbolRouteTable } from './rebound-symbol-route.ts';

export type PrerenderTriggerGroup = {
	readonly id: string;
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly hostIndex: number;
	readonly hostTagName: string;
	readonly branchStartIndex?: number;
	readonly branchEndIndex?: number;
	readonly hostPath?: ReadonlyArray<number>;
	readonly graphNodeIds: ReadonlyArray<string>;
	readonly symbolIds: ReadonlyArray<string>;
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	/** Set when this group adopts an arm the settle boot filled. */
	readonly armRendererModuleId?: string;
};

const EVENT_STAGES_BROWSER_TRIGGER = {
	[PROTOCOL_EVENT_ACTION_KIND.event]: true,
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: false,
} as const satisfies Record<ProtocolEventActionKind, boolean>;

export function triggerGroupVirtualModuleId(filename: string, index: number): string {
	return `virtual:markless:trigger-group:${encodeURIComponent(filename)}:${index}`;
}

export function triggerGroupVirtualModuleSourceFile(moduleId: string): string | null {
	const bare = moduleId.startsWith('\0') ? moduleId.slice(1) : moduleId;
	const match = /^virtual:markless:trigger-group:([^:]+):\d+$/.exec(bare);
	if (!match?.[1]) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return null;
	}
}

/** The resolver one trigger group carries: only the symbols and bound rows its event wakes. */
export function prerenderTriggerGroupResolverInput(input: {
	readonly group: PrerenderTriggerGroup;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
	readonly literalImports?: boolean;
}): SymbolResolverModuleInput {
	const ids = new Set(input.group.symbolIds);
	const boundRows = input.boundRows.filter((row) => ids.has(row.id));
	return {
		symbols: input.symbols.filter((symbol) => ids.has(symbol.id)),
		boundSymbols: boundRows,
		importedCaptureRows: boundRows.some((row) => row.loaderSymbolId !== undefined),
		literalImports: input.literalImports,
		bundlerVisibleImports: input.literalImports,
	};
}

// Trigger groups needing the same bound-row helpers import one copy; a variant only one group needs stays inline.
export function planTriggerGroupHelpers(input: {
	readonly filename: string;
	readonly groups: ReadonlyArray<PrerenderTriggerGroup>;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
	readonly literalImports?: boolean;
}): {
	readonly helpersModuleIds: ReadonlyArray<string | undefined>;
	readonly modules: ReadonlyArray<{ readonly id: string; readonly source: string }>;
} {
	const resolvers = input.groups.map((group) =>
		prerenderTriggerGroupResolverInput({ ...input, group }),
	);
	const variants = resolvers.map(symbolResolverHelpersVariant);
	const shared = [
		...new Set(
			variants.filter(
				(variant, index): variant is string =>
					variant !== undefined && variants.indexOf(variant) !== index,
			),
		),
	];
	// Past the self-wake arm renderer's index, which is the group count.
	const idOf = (variant: string) =>
		triggerGroupVirtualModuleId(input.filename, input.groups.length + 1 + shared.indexOf(variant));
	return {
		helpersModuleIds: variants.map((variant) =>
			variant !== undefined && shared.includes(variant) ? idOf(variant) : undefined,
		),
		modules: shared.map((variant) => ({
			id: idOf(variant),
			source: emitSymbolResolverHelpersModule(resolvers[variants.indexOf(variant)]!),
		})),
	};
}

export function emitPrerenderTriggerGroupModule(input: {
	readonly group: PrerenderTriggerGroup;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
	readonly symbolRoutes?: ReadonlyArray<SourceLazySymbolRoute>;
	readonly armRendererModuleId?: string;
	readonly literalImports?: boolean;
	readonly helpersModuleId?: string;
}): string {
	const armRendererModuleId = input.armRendererModuleId ?? input.group.armRendererModuleId;
	const ids = new Set(input.group.symbolIds);
	let source = emitSymbolResolverModule({
		...prerenderTriggerGroupResolverInput(input),
		helpersModuleId: input.helpersModuleId,
	});
	// Keep routes exhaustive while demand-loading only their symbols.
	// This group's resolver holds only its own bound rows.
	const ownRows = (rows: Readonly<Record<string, string>>) =>
		Object.fromEntries(Object.entries(rows).filter(([, rowId]) => ids.has(rowId)));
	const routes = (input.symbolRoutes ?? []).map((route) => ({
		...route,
		...(route.boundSymbols ? { boundSymbols: ownRows(route.boundSymbols) } : {}),
		...('forwardedSymbols' in route && route.forwardedSymbols
			? { forwardedSymbols: ownRows(route.forwardedSymbols) }
			: {}),
	}));
	if (routes.length > 0) {
		source = source.replaceAll('loadSymbol(', 'marklessLoadLocalSymbol(');
		source +=
			'\n' +
			emitSymbolRouteTable({
				routes: routes.map((route) =>
					'importSource' in route
						? { ...route, importSource: symbolRouteImportSource(route.importSource) }
						: route,
				),
				functionName: 'loadSymbol',
				fallbackName: 'marklessLoadLocalSymbol',
				reboundName: 'marklessLoadSymbolRebound',
				exported: true,
			});
	}
	return [
		armRendererModuleId
			? [
					`import { prepareBoundaryArm as marklessPrepareBoundaryArm, renderBoundaryArm as marklessRenderBoundaryArm } from ${JSON.stringify(armRendererModuleId)};`,
					'export function prepareBoundaryArm(boundaryId, status, graph) {',
					'\treturn marklessPrepareBoundaryArm(boundaryId, status, graph, loadSymbol);',
					'}',
					'export function renderBoundaryArm(boundaryId, status, graph) {',
					'\treturn marklessRenderBoundaryArm(boundaryId, status, graph, loadSymbol);',
					'}',
				].join('\n')
			: '',
		source,
		`export const groupId=${JSON.stringify(input.group.id)};`,
		`export const state=${JSON.stringify(input.group.state)};`,
		`export const view=${JSON.stringify(input.group.view)};`,
		`export const graphNodeIds=${JSON.stringify(input.group.graphNodeIds)};`,
	].join('\n');
}

export function emitPrerenderBoundaryRendererModule(
	renderDataId: string,
	rowBoundarySites?: Readonly<Record<string, string>>,
): string {
	return [
		`import { marklessPrerenderData } from ${JSON.stringify(renderDataId)};`,
		"import { renderPrerenderBoundary } from '@markless/web/fns/prerender-resume';",
		// Keyed by graph: two trigger groups can re-settle one boundary at once.
		'const marklessPreparedBoundaryArms = new WeakMap();',
		'export async function prepareBoundaryArm(boundaryId, status, graph, loadSymbol) {',
		...(rowBoundarySites
			? [
					`\tconst site = ${JSON.stringify(rowBoundarySites)}[boundaryId];`,
					'\tconst rendered = await (site ? renderPrerenderBoundary(marklessPrerenderData, site, status, graph, loadSymbol, boundaryId) : renderPrerenderBoundary(marklessPrerenderData, boundaryId, status, graph, loadSymbol));',
				]
			: [
					'\tconst rendered = await renderPrerenderBoundary(marklessPrerenderData, boundaryId, status, graph, loadSymbol);',
				]),
		'\tif (!marklessPreparedBoundaryArms.has(graph)) marklessPreparedBoundaryArms.set(graph, new Map());',
		'\tmarklessPreparedBoundaryArms.get(graph).set(`${boundaryId}:${status}`, rendered);',
		'}',
		'export function renderBoundaryArm(boundaryId, status, graph) {',
		'\tconst key = `${boundaryId}:${status}`;',
		'\tconst prepared = marklessPreparedBoundaryArms.get(graph);',
		'\tconst rendered = prepared?.get(key);',
		'\tif (!rendered) throw new Error(`Markless prerender arm ${key} was not prepared.`);',
		'\tprepared.delete(key);',
		'\treturn rendered;',
		'}',
	].join('\n');
}

/** The keyed-row @try boundaries this module's own view renders, each mapped to the boundary it was rendered from. */
export function prerenderRowBoundarySites(
	completeView: ProtocolViewPayload,
	boundarySites: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
	if (!boundarySites) return undefined;
	const own = new Set(completeView.asyncBoundaries.map((boundary) => boundary.id));
	const sites = Object.entries(boundarySites).filter(([, site]) => own.has(site));
	return sites.length > 0 ? Object.fromEntries(sites) : undefined;
}

// Each row's served boundary takes the compiler's record for its site, under the row's id and anchors.
function withRowBoundaries(
	completeView: ProtocolViewPayload,
	servedView: ProtocolViewPayload,
	rowBoundarySites: Readonly<Record<string, string>> | undefined,
): ProtocolViewPayload {
	if (!rowBoundarySites) return completeView;
	const rows = new Map<string, Array<ProtocolViewPayload['asyncBoundaries'][number]>>();
	for (const served of servedView.asyncBoundaries) {
		const site = rowBoundarySites[served.id];
		if (site) rows.set(site, [...(rows.get(site) ?? []), served]);
	}
	return {
		...completeView,
		asyncBoundaries: completeView.asyncBoundaries.flatMap(
			(boundary) =>
				rows.get(boundary.id)?.map((served) => ({
					...boundary,
					id: served.id,
					startAnchor: served.startAnchor,
					endAnchor: served.endAnchor,
				})) ?? [boundary],
		),
	};
}

function symbolRouteImportSource(importSource: string): string {
	return importSource.includes('?')
		? `${importSource}&markless-symbols`
		: `${importSource}?markless-symbols`;
}

export function planPrerenderTriggerGroups(input: {
	readonly filename: string;
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly completeView?: ProtocolViewPayload;
	readonly triggerGroups: TriggerGroupArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
	readonly componentEdges?: ReadonlyArray<SemanticComponentEdge>;
	readonly graphBindings?: ReadonlyArray<Pick<SemanticGraphBinding, 'id' | 'componentName'>>;
	readonly branchSites?: ReadonlyArray<Pick<SemanticBranchSite, 'id' | 'componentName'>>;
	readonly renderData?: RenderDataArtifact;
	readonly boundarySites?: Readonly<Record<string, string>>;
}): PrerenderTriggerGroup[] {
	const symbols = new Map(input.symbolResolver.symbols.map((symbol) => [symbol.id, symbol]));
	const bounds = new Map(input.boundRows.map((row) => [row.id, row]));
	const compilerView = input.completeView ?? input.view;
	const compilerBoundaries = new Map(
		compilerView.asyncBoundaries.map((boundary) => [boundary.id, boundary]),
	);
	const rowBoundarySites = prerenderRowBoundarySites(compilerView, input.boundarySites);
	const completeView = withRowBoundaries(compilerView, input.view, rowBoundarySites);
	const completeBoundaries = new Map(
		completeView.asyncBoundaries.map((boundary) => [boundary.id, boundary]),
	);
	const selfWakeBoundaries = unsettledAsyncBoundaryIndexes(input.state, input.view);
	const servedBoundaryIds = new Set(input.view.asyncBoundaries.map((boundary) => boundary.id));
	// One route shape for the three sources: self-wake, view events, branch-arm events.
	const routes: ReadonlyArray<{
		readonly event: ProtocolEventRecord;
		readonly branch?: NonNullable<ProtocolViewPayload['branches']>[number];
		readonly branchIndex?: number;
		readonly hostPath?: ReadonlyArray<number>;
		readonly selfWakeBoundaries?: ReadonlyArray<number>;
	}> = [
		...(selfWakeBoundaries.length > 0
			? [
					{
						event: { hostNodeId: 'self-wake', eventName: 'self-wake', symbolIds: [] },
						selfWakeBoundaries,
					},
				]
			: []),
		...input.view.events
			.filter((event) => EVENT_STAGES_BROWSER_TRIGGER[protocolEventActionKind(event)])
			.map((event) => ({ event })),
		...(input.view.branches ?? []).flatMap((branch, branchIndex) => {
			const events = new Map<
				string,
				{ eventName: string; hostPath: ReadonlyArray<number>; symbolIds: Set<string> }
			>();
			for (const arm of branch.armRecords ?? [])
				for (const event of arm.events) {
					const key = `${event.eventName}:${event.hostPath.join('.')}`;
					const route = events.get(key) ?? {
						eventName: event.eventName,
						hostPath: event.hostPath,
						symbolIds: new Set<string>(),
					};
					for (const symbolId of event.symbolIds ?? []) route.symbolIds.add(symbolId);
					events.set(key, route);
				}
			return [...events.values()].map((route) => ({
				event: {
					hostNodeId: `branch:${branch.id}:${route.hostPath.join('.')}`,
					eventName: route.eventName,
					symbolIds: [...route.symbolIds],
				},
				branch,
				branchIndex,
				hostPath: route.hostPath,
			}));
		}),
	];
	const groups: Array<PrerenderTriggerGroup & { adoptsSettledArm?: true }> = routes.flatMap(
		({ event, branch, branchIndex, hostPath, selfWakeBoundaries }) => {
			const closureView = selfWakeBoundaries ? completeView : input.view;
			const host = branch
				? undefined
				: input.view.locators.find((locator) => locator.hostNodeId === event.hostNodeId);
			if (!host && !branch && !selfWakeBoundaries) return [];
			const compilerGroup = input.triggerGroups.groups.find(
				(group) =>
					group.hostNodeId === event.hostNodeId && group.eventName === event.eventName,
			);
			const graphNodeIds = new Set<string>();
			const symbolIds = new Set(event.symbolIds ?? []);
			const selected = {
				domUpdates: new Set<number>(),
				behaviors: new Set<number>(),
				branches: new Set<number>(),
				boundaries: new Set<number>(),
				repeats: new Set<number>(),
				elementHandles: new Set<number>(),
			};
			if (branch && branchIndex !== undefined) {
				selected.branches.add(branchIndex);
				if (branch.symbolId) symbolIds.add(branch.symbolId);
				for (const read of branch.testReads ?? []) graphNodeIds.add(read.graphNodeId);
				for (const arm of branch.armRecords ?? [])
					collectCompleteArmRecordClosure(arm, graphNodeIds, symbolIds);
			}
			const adoptedBoundaryIds = new Set<string>();
			const escalatedHostNodeIds = new Set<string>();
			for (const boundaryIndex of selfWakeBoundaries ?? []) {
				const servedBoundary = input.view.asyncBoundaries[boundaryIndex]!;
				// Indexes into the view this route closes over, which is not the served one.
				const closureIndex = closureView.asyncBoundaries.findIndex(
					(boundary) => boundary.id === servedBoundary.id,
				);
				selected.boundaries.add(closureIndex === -1 ? boundaryIndex : closureIndex);
				collectSettledBoundaryClosure(
					input,
					completeBoundaries.get(servedBoundary.id) ?? servedBoundary,
					graphNodeIds,
					symbolIds,
				);
				collectEnclosingRowLists(
					input.renderData,
					completeView,
					rowBoundarySites?.[servedBoundary.id] ?? servedBoundary.id,
					graphNodeIds,
				);
			}
			closureView.behaviors.forEach((behavior, index) => {
				if (selfWakeBoundaries) return;
				const recordId = `behavior:${behavior.hostNodeId}:${behavior.symbolId ?? ''}`;
				// Zero-input host behavior closes over linked child triggers too.
				if (
					(behavior.inputGraphReads?.length ?? 0) > 0 &&
					!compilerGroup?.payloadRecordIds.includes(recordId)
				)
					return;
				selected.behaviors.add(index);
				if (behavior.symbolId) symbolIds.add(behavior.symbolId);
			});
			let changed = true;
			while (changed) {
				const before = closureSize(graphNodeIds, symbolIds, selected);
				// Snapshot: the loop grows symbolIds while iterating the closure.
				const currentSymbolIds = Array.from(symbolIds);
				for (const symbolId of currentSymbolIds) {
					const bound = bounds.get(symbolId);
					if (bound) {
						symbolIds.add(bound.loaderSymbolId ?? bound.baseSymbolId);
						for (const slot of bound.captureSlots) {
							if (slot.route.kind === 'graph-reference')
								graphNodeIds.add(slot.route.graphNodeId);
							if (slot.route.kind === 'callback-route')
								symbolIds.add(slot.route.callbackSymbolId);
						}
					}
					const symbol = symbols.get(symbolId);
					if (!symbol) continue;
					if ('reads' in symbol)
						for (const read of symbol.reads ?? []) graphNodeIds.add(read.graphNodeId);
					if ('writes' in symbol)
						for (const write of symbol.writes ?? [])
							graphNodeIds.add(write.graphNodeId);
					if (
						symbol.kind === 'async-computed-runner' ||
						symbol.kind === 'sync-computed-derive'
					) {
						graphNodeIds.add(symbol.graphNodeId);
						for (const dependency of symbol.dependencies ?? [])
							graphNodeIds.add(dependency.graphNodeId);
					}
					if ('elementHandleCalls' in symbol)
						for (const call of symbol.elementHandleCalls ?? [])
							closureView.elementHandles.forEach((handle, index) => {
								if (handle.name === call.handleName)
									selected.elementHandles.add(index);
							});
					// A handle read as a VALUE needs its record in this page's payload
					// just as much as a method call on it does: without the record the
					// resume registry has no entry and the handler reads `undefined`.
					if ('elementHandleReads' in symbol)
						for (const read of symbol.elementHandleReads ?? [])
							closureView.elementHandles.forEach((handle, index) => {
								if (
									handle.handleId === read.handleId ||
									handle.name === read.handleName
								)
									selected.elementHandles.add(index);
							});
				}
				closeComputedGraph(graphNodeIds, input.state);
				for (const computed of input.state.computed)
					if (computed.deriveSymbolId && graphNodeIds.has(computed.graphNodeId))
						symbolIds.add(computed.deriveSymbolId);
				for (const graphNodeId of graphNodeIds) {
					const runnerSymbolId = closureView.asyncRunners?.[graphNodeId];
					if (runnerSymbolId) symbolIds.add(runnerSymbolId);
				}
				selectViewSubscribers(closureView, graphNodeIds, symbolIds, selected);
				for (const index of selected.repeats)
					collectRowComponentSymbols(input, closureView.keyedRepeats![index]!, symbols, symbolIds);
				const escalatedBranchIds = new Set<string>();
				for (const index of selected.branches) {
					const record = closureView.branches?.[index];
					if (record?.escalates) escalatedBranchIds.add(record.id);
				}
				for (const index of selected.boundaries) {
					const served = closureView.asyncBoundaries[index]!;
					for (const arm of boundaryArmRecordSets(
						completeBoundaries.get(served.id) ?? served,
					))
						collectEscalatedArmBranchIds(arm, escalatedBranchIds);
					// A @try inside this one's arm is wired by this group when the arm lands.
					for (const nestedId of nestedBoundaryIds(
						input.renderData,
						rowBoundarySites?.[served.id] ?? served.id,
					)) {
						const nested = compilerBoundaries.get(nestedId);
						if (!nested) continue;
						collectSettledBoundaryClosure(input, nested, graphNodeIds, symbolIds);
						collectSettledArmHostRecordClosure(compilerView, nested, graphNodeIds, symbolIds);
					}
				}
				for (const branchId of escalatedBranchIds)
					collectEscalatedBranchClosure(
						input,
						branchId,
						graphNodeIds,
						symbolIds,
						escalatedHostNodeIds,
					);
				// A gesture whose cells the settled arm reads must OWN that arm, or its
				// write lands on a graph no record inside the arm is bound to and the
				// next interaction there forks a second runtime off the raw prerender
				// records. Same closure the self-wake route takes, on the same arm.
				if (!selfWakeBoundaries)
					input.view.asyncBoundaries.forEach((servedBoundary, index) => {
						if (adoptedBoundaryIds.has(servedBoundary.id)) return;
						const boundary =
							completeBoundaries.get(servedBoundary.id) ?? servedBoundary;
						if (
							!settledArmReadGraphNodeIds(input, completeView, boundary).some((graphNodeId) =>
								graphNodeIds.has(graphNodeId),
							)
						)
							return;
						adoptedBoundaryIds.add(servedBoundary.id);
						selected.boundaries.add(index);
						collectSettledBoundaryClosure(input, boundary, graphNodeIds, symbolIds);
						collectSettledArmHostRecordClosure(
							completeView,
							boundary,
							graphNodeIds,
							symbolIds,
						);
					});
				if (selfWakeBoundaries || adoptedBoundaryIds.size > 0) {
					// Boundary rendering consumes render-data initial values through this
					// group's resolver. Claim each non-literal initializer for its graph.
					for (const symbol of symbols.values())
						if (
							symbol.kind === 'state-initializer' &&
							graphNodeIds.has(symbol.graphNodeId)
						)
							symbolIds.add(symbol.id);
				}
				changed = closureSize(graphNodeIds, symbolIds, selected) !== before;
			}

			// The arm commit registers an escalated arm's own hosts against the DOM it renders.
			dropEscalatedHostRecords(closureView, selected, escalatedHostNodeIds);
			const neededHosts = new Set<string>(branch ? [] : [event.hostNodeId]);
			for (const index of selected.domUpdates)
				neededHosts.add(closureView.domUpdates[index]!.hostNodeId);
			for (const index of selected.behaviors)
				neededHosts.add(closureView.behaviors[index]!.hostNodeId);
			for (const index of selected.repeats)
				neededHosts.add(closureView.keyedRepeats![index]!.parentHostNodeId);
			for (const index of selected.elementHandles)
				neededHosts.add(closureView.elementHandles[index]!.hostNodeId);
			const selectedBoundaryIds = new Set(
				[...selected.boundaries].map((index) => closureView.asyncBoundaries[index]!.id),
			);
			const view: ProtocolViewPayload = {
				...input.view,
				locators: closureView.locators.filter((locator) =>
					neededHosts.has(locator.hostNodeId),
				),
				events: branch || selfWakeBoundaries ? [] : [event],
				domUpdates: closureView.domUpdates.filter((_, index) =>
					selected.domUpdates.has(index),
				),
				behaviors: closureView.behaviors.filter((_, index) =>
					selected.behaviors.has(index),
				),
				elementHandles: closureView.elementHandles.filter((_, index) =>
					selected.elementHandles.has(index),
				),
				keyedRepeats: closureView.keyedRepeats?.filter((_, index) =>
					selected.repeats.has(index),
				),
				branches: closureView.branches?.filter((_, index) => selected.branches.has(index)),
				// Self-wake carries the build-emitted per-arm record sets. The demand-
				// loaded update symbol renders HTML; settle selects the matching records
				// here and commits both through the ordinary arm machinery. An adopting
				// gesture group takes the same complete record set: the served one
				// describes @pending, which is not what its wake will find in the DOM.
				// A @try the served page did not draw, such as one inside another's unsettled arm, is wired by the arm that draws it.
				asyncBoundaries: closureView.asyncBoundaries
					.filter(
						(boundary) =>
							selectedBoundaryIds.has(boundary.id) && servedBoundaryIds.has(boundary.id),
					)
					.map((boundary) =>
						adoptedBoundaryIds.has(boundary.id)
							? (completeBoundaries.get(boundary.id) ?? boundary)
							: boundary,
					),
				...(closureView.asyncRunners
					? {
							asyncRunners: Object.fromEntries(
								Object.entries(closureView.asyncRunners).filter(([graphNodeId]) =>
									graphNodeIds.has(graphNodeId),
								),
							),
						}
					: {}),
			};
			const graphIds = [...graphNodeIds].sort();
			return [
				{
					id: selfWakeBoundaries
						? 'self-wake'
						: branch
							? `branch:${branch.id}:${event.eventName}:${hostPath!.join('.')}`
							: `${event.hostNodeId}:${event.eventName}`,
					hostNodeId: event.hostNodeId,
					eventName: event.eventName,
					hostIndex: host?.index ?? -1,
					hostTagName: host?.tagName ?? '*',
					...(branch
						? {
								branchStartIndex: branch.startAnchor.index,
								branchEndIndex: branch.endAnchor.index,
								hostPath,
							}
						: {}),
					graphNodeIds: graphIds,
					symbolIds: [...symbolIds].sort(),
					state: filterState(input.state, new Set(graphIds)),
					view,
					...(adoptedBoundaryIds.size > 0 ? { adoptsSettledArm: true as const } : {}),
				},
			];
		},
	);
	// The boundary renderer the self-wake group already ships is emitted one slot
	// past the groups; an adopting group re-derives its arm through the same one.
	const armRendererModuleId = groups.some((group) => group.id === 'self-wake')
		? triggerGroupVirtualModuleId(input.filename, groups.length)
		: undefined;
	return groups.map(({ adoptsSettledArm, ...group }) =>
		adoptsSettledArm && armRendererModuleId ? { ...group, armRendererModuleId } : group,
	);
}

// A component row this group builds runs its components' code: what they bind under the repeat, and every symbol they own.
function collectRowComponentSymbols(
	input: Parameters<typeof planPrerenderTriggerGroups>[0],
	repeat: NonNullable<ProtocolViewPayload['keyedRepeats']>[number],
	symbols: ReadonlyMap<string, SymbolResolverPlan['symbols'][number]>,
	symbolIds: Set<string>,
): void {
	if (!repeat.rowComponent) return;
	for (const row of input.boundRows)
		if (row.ancestry.some((step) => step.keyedRepeatScopeIds.includes(repeat.id)))
			symbolIds.add(row.id);
	const edges = input.componentEdges ?? [];
	const components = new Set(
		edges
			.filter((edge) => !edge.importSource && edge.keyedRepeatScopeIds.includes(repeat.id))
			.map((edge) => edge.childComponentName),
	);
	for (const name of components)
		for (const edge of edges)
			if (!edge.importSource && edge.parentComponentName === name)
				components.add(edge.childComponentName);
	const hostOwners = new Map(
		(input.renderData?.chunks ?? []).flatMap((chunk) =>
			chunk.hosts.map((host) => [host.hostNodeId, chunk.componentName] as const),
		),
	);
	const graphOwners = new Map(
		(input.graphBindings ?? []).map((binding) => [binding.id, binding.componentName]),
	);
	const branchOwners = new Map((input.branchSites ?? []).map((site) => [site.id, site.componentName]));
	const edgeOwners = new Map(edges.map((edge) => [edge.id, edge.parentComponentName]));
	for (const symbol of symbols.values()) {
		const owner =
			'hostNodeId' in symbol
				? hostOwners.get(symbol.hostNodeId)
				: symbol.kind === 'callback-prop'
					? edgeOwners.get(symbol.componentEdgeId)
					: symbol.kind === 'branch-update'
						? branchOwners.get(symbol.branchSiteId)
						: symbol.kind === 'shared-seed'
							? symbol.componentName
							: 'graphNodeId' in symbol
								? graphOwners.get(symbol.graphNodeId)
								: undefined;
		if (owner !== undefined && components.has(owner)) symbolIds.add(symbol.id);
	}
}

// Graph cells a settled arm reads: its own records, page records bound to its hosts, and props it forwards to children inside it.
function settledArmReadGraphNodeIds(
	input: { readonly componentEdges?: ReadonlyArray<SemanticComponentEdge> },
	completeView: ProtocolViewPayload,
	boundary: ProtocolViewPayload['asyncBoundaries'][number],
): string[] {
	const graphNodeIds = new Set<string>();
	for (const arm of boundaryArmRecordSets(boundary))
		collectCompleteArmRecordClosure(arm, graphNodeIds, new Set<string>());
	collectSettledArmHostRecordClosure(completeView, boundary, graphNodeIds, new Set<string>());
	for (const edge of input.componentEdges ?? [])
		if (edge.asyncBoundaryId === boundary.id)
			for (const prop of edge.props)
				if (prop.kind === 'graph-reference') graphNodeIds.add(prop.graphNodeId);
	return [...graphNodeIds];
}

function collectSettledBoundaryClosure(
	input: {
		readonly componentEdges?: ReadonlyArray<SemanticComponentEdge>;
		readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
	},
	boundary: ProtocolViewPayload['asyncBoundaries'][number],
	graphNodeIds: Set<string>,
	symbolIds: Set<string>,
): void {
	if (boundary.updateSymbolId) symbolIds.add(boundary.updateSymbolId);
	for (const read of boundary.asyncReads) {
		graphNodeIds.add(read.graphNodeId);
		if (read.runnerSymbolId) symbolIds.add(read.runnerSymbolId);
	}
	for (const arm of boundaryArmRecordSets(boundary))
		collectCompleteArmRecordClosure(arm, graphNodeIds, symbolIds);
	// Settled-arm child props belong to the same graph segment.
	const settledEdgeIds = new Set<string>();
	for (const edge of input.componentEdges ?? []) {
		if (edge.asyncBoundaryId !== boundary.id) continue;
		settledEdgeIds.add(edge.id);
		for (const prop of edge.props)
			if (prop.kind === 'graph-reference') graphNodeIds.add(prop.graphNodeId);
	}
	// Claim edge-bound derives before the settled arm registers them.
	for (const row of input.boundRows)
		if (row.componentEdgePath.some((edgeId) => settledEdgeIds.has(edgeId)))
			symbolIds.add(row.id);
}

// The records binding a settled arm's own hosts sit at the complete view's top
// level, not inside its arm record sets. The wake re-derives the arm from render
// data and that rendering names these symbols, so an adopting group's resolver
// has to carry them or the wake throws MARKLESS_SYMBOL_UNKNOWN.
function collectSettledArmHostRecordClosure(
	completeView: ProtocolViewPayload,
	boundary: ProtocolViewPayload['asyncBoundaries'][number],
	graphNodeIds: Set<string>,
	symbolIds: Set<string>,
): void {
	const armHosts = new Set<string>();
	for (const arm of boundaryArmRecordSets(boundary))
		for (const locator of (arm as { readonly locators?: ReadonlyArray<{ hostNodeId: string }> })
			.locators ?? [])
			armHosts.add(locator.hostNodeId);
	if (armHosts.size === 0) return;
	for (const record of completeView.events)
		if (armHosts.has(record.hostNodeId))
			for (const symbolId of record.symbolIds ?? []) symbolIds.add(symbolId);
	for (const record of completeView.domUpdates)
		if (armHosts.has(record.hostNodeId)) {
			graphNodeIds.add(record.graphNodeId);
			if (record.symbolId) symbolIds.add(record.symbolId);
		}
	for (const record of completeView.behaviors)
		if (armHosts.has(record.hostNodeId)) {
			for (const read of record.inputGraphReads ?? []) graphNodeIds.add(read.graphNodeId);
			if (record.symbolId) symbolIds.add(record.symbolId);
		}
	for (const record of completeView.keyedRepeats ?? [])
		if (armHosts.has(record.parentHostNodeId)) {
			if (record.collectionGraphNodeId) graphNodeIds.add(record.collectionGraphNodeId);
			for (const rowEvent of record.rowEvents)
				for (const symbolId of rowEvent.symbolIds ?? []) symbolIds.add(symbolId);
		}
}

function dropEscalatedHostRecords(
	view: ProtocolViewPayload,
	selected: {
		readonly domUpdates: Set<number>;
		readonly behaviors: Set<number>;
		readonly elementHandles: Set<number>;
		readonly repeats: Set<number>;
	},
	hostNodeIds: ReadonlySet<string>,
): void {
	if (hostNodeIds.size === 0) return;
	const drop = (indexes: Set<number>, hostOf: (index: number) => string | undefined) => {
		for (const index of indexes)
			if (hostNodeIds.has(hostOf(index) ?? '')) indexes.delete(index);
	};
	drop(selected.domUpdates, (index) => view.domUpdates[index]?.hostNodeId);
	drop(selected.behaviors, (index) => view.behaviors[index]?.hostNodeId);
	drop(selected.elementHandles, (index) => view.elementHandles[index]?.hostNodeId);
	drop(selected.repeats, (index) => view.keyedRepeats?.[index]?.parentHostNodeId);
}

// An arm branch that flips with no update symbol of its own escalates through its boundary.
function collectEscalatedArmBranchIds(
	arm: {
		readonly branches?: ReadonlyArray<{
			readonly id: string;
			readonly symbolId?: string;
			readonly testReads?: ReadonlyArray<unknown>;
			readonly armRecords?: ReadonlyArray<unknown>;
		}>;
	},
	branchIds: Set<string>,
): void {
	for (const branch of arm.branches ?? []) {
		// An escalated record ships no per-arm records: its flip renders the arm, components and all.
		if ((!branch.symbolId || !branch.armRecords) && (branch.testReads?.length ?? 0) > 0)
			branchIds.add(branch.id);
		for (const nested of branch.armRecords ?? [])
			collectEscalatedArmBranchIds(
				nested as Parameters<typeof collectEscalatedArmBranchIds>[0],
				branchIds,
			);
	}
}

// A @try inside keyed rows settles by rendering those rows again, so it reads the lists they come from.
function collectEnclosingRowLists(
	renderData: RenderDataArtifact | undefined,
	view: ProtocolViewPayload,
	boundaryId: string,
	graphNodeIds: Set<string>,
): void {
	if (!renderData) return;
	const parents = new Map<string, { readonly chunkId: string; readonly repeatId?: string }>();
	let holder: string | undefined;
	for (const chunk of renderData.chunks)
		for (const slot of chunk.slots) {
			if (slot.kind === 'async' && slot.boundaryId === boundaryId) holder = chunk.id;
			for (const id of ownedChunkIds(slot))
				parents.set(id, {
					chunkId: chunk.id,
					...(slot.kind === 'repeat' && id === slot.rowTemplateId && { repeatId: slot.repeatId }),
				});
		}
	for (let at = holder && parents.get(holder); at; at = parents.get(at.chunkId)) {
		const repeat = at.repeatId && view.keyedRepeats?.find((record) => record.id === at!.repeatId);
		if (repeat && repeat.collectionGraphNodeId) graphNodeIds.add(repeat.collectionGraphNodeId);
	}
}

// The @try blocks drawn inside a @try's arms, at any depth of this module's markup.
function nestedBoundaryIds(renderData: RenderDataArtifact | undefined, boundaryId: string): string[] {
	if (!renderData) return [];
	const chunks = new Map(renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const outer = renderData.chunks
		.flatMap((chunk) => chunk.slots)
		.find((slot) => slot.kind === 'async' && slot.boundaryId === boundaryId);
	if (!outer) return [];
	const found: string[] = [];
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of chunks.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'async') found.push(slot.boundaryId);
			for (const id of ownedChunkIds(slot)) walk(id);
		}
	};
	for (const id of ownedChunkIds(outer)) walk(id);
	return found;
}

// The chunks a slot draws in this module, excluding a child component's own template.
function ownedChunkIds(slot: RenderDataArtifact['chunks'][number]['slots'][number]): string[] {
	const ids =
		slot.kind === 'repeat'
			? [slot.rowTemplateId, slot.emptyTemplateId]
			: slot.kind === 'branch'
				? slot.armTemplateIds
				: slot.kind === 'async'
					? Object.values(slot.armTemplateIds)
					: slot.kind === 'dynamic-host'
						? [slot.childChunkId]
						: slot.kind === 'child-component'
							? [slot.projectionChunkId]
							: [];
	return ids.filter((id): id is string => !!id);
}

// An escalated flip runs the arm's components, naming their symbols through this group's resolver.
function collectEscalatedBranchClosure(
	input: {
		readonly renderData?: RenderDataArtifact;
		readonly symbolResolver: SymbolResolverPlan;
		readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
	},
	branchSiteId: string,
	graphNodeIds: Set<string>,
	symbolIds: Set<string>,
	hostNodeIds: Set<string>,
): void {
	const renderData = input.renderData;
	const branch = renderData?.branches.find(
		(candidate) => candidate.branchSiteId === branchSiteId,
	);
	if (!renderData || !branch) return;
	const chunks = new Map(renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const edgeIds = new Set<string>();
	const walked = new Set<string>();
	const walk = (chunkId: string | undefined) => {
		if (!chunkId || walked.has(chunkId)) return;
		walked.add(chunkId);
		const chunk = chunks.get(chunkId);
		if (!chunk) return;
		for (const host of chunk.hosts) hostNodeIds.add(host.hostNodeId);
		for (const slot of chunk.slots) {
			if (slot.kind === 'child-component') {
				edgeIds.add(slot.componentEdgeId);
				walk(slot.childTemplateId);
				walk(slot.projectionChunkId);
			} else if (slot.kind === 'branch') for (const armId of slot.armTemplateIds) walk(armId);
			else if (slot.kind === 'repeat') {
				walk(slot.rowTemplateId);
				walk(slot.emptyTemplateId);
			} else if (slot.kind === 'async') {
				walk(slot.armTemplateIds.try);
				walk(slot.armTemplateIds.pending);
				walk(slot.armTemplateIds.catch);
			} else if (slot.kind === 'dynamic-host') walk(slot.childChunkId);
			else if ('residue' in slot && slot.residue.kind === 'graph-read')
				graphNodeIds.add(slot.residue.graphNodeId);
		}
	};
	for (const armId of branch.armChunkIds) walk(armId);
	// A text joining several holes reads its own derived node, not a template slot residue.
	for (const symbol of input.symbolResolver.symbols)
		if (symbol.kind === 'dom-update' && hostNodeIds.has(symbol.hostNodeId))
			graphNodeIds.add(symbol.graphNodeId);
	for (const symbol of input.symbolResolver.symbols) {
		if (
			('hostNodeId' in symbol && hostNodeIds.has(symbol.hostNodeId)) ||
			(symbol.kind === 'callback-prop' && edgeIds.has(symbol.componentEdgeId)) ||
			((symbol.kind === 'state-initializer' ||
				symbol.kind === 'sync-computed-derive' ||
				symbol.kind === 'async-computed-runner') &&
				graphNodeIds.has(symbol.graphNodeId))
		)
			symbolIds.add(symbol.id);
	}
	for (const row of input.boundRows)
		if (row.componentEdgePath.some((edgeId) => edgeIds.has(edgeId))) symbolIds.add(row.id);
}

function boundaryArmRecordSets(boundary: ProtocolViewPayload['asyncBoundaries'][number]) {
	return Array.isArray(boundary.armRecords)
		? boundary.armRecords
		: boundary.armRecords
			? [boundary.armRecords]
			: [];
}

function unsettledAsyncBoundaryIndexes(
	state: ProtocolStatePayload,
	view: ProtocolViewPayload,
): number[] {
	const computed = new Map(state.computed.map((record) => [record.graphNodeId, record]));
	const runners = { ...view.asyncRunners };
	for (const boundary of view.asyncBoundaries)
		for (const read of boundary.asyncReads)
			if (read.runnerSymbolId) runners[read.graphNodeId] ??= read.runnerSymbolId;
	return view.asyncBoundaries.flatMap((boundary, index) => {
		const reachable = new Set(boundary.asyncReads.map((read) => read.graphNodeId));
		for (const graphNodeId of reachable) {
			const record = computed.get(graphNodeId);
			if (!record) continue;
			if (
				runners[graphNodeId] &&
				record.snapshot?.status !== 'fulfilled' &&
				record.snapshot?.status !== 'rejected'
			)
				return [index];
			for (const dependency of record.dependencies ?? [])
				reachable.add(dependency.graphNodeId);
		}
		return [];
	});
}

function selectViewSubscribers(
	view: ProtocolViewPayload,
	// Arm-record closure grows the set, so this stays the caller's mutable set.
	graphNodeIds: Set<string>,
	symbolIds: Set<string>,
	selected: {
		domUpdates: Set<number>;
		behaviors: Set<number>;
		branches: Set<number>;
		boundaries: Set<number>;
		repeats: Set<number>;
		elementHandles: Set<number>;
	},
): void {
	view.domUpdates.forEach((record, index) => {
		if (!graphNodeIds.has(record.graphNodeId)) return;
		selected.domUpdates.add(index);
		if (record.symbolId) symbolIds.add(record.symbolId);
	});
	view.behaviors.forEach((record, index) => {
		if (!(record.inputGraphReads ?? []).some((read) => graphNodeIds.has(read.graphNodeId)))
			return;
		selected.behaviors.add(index);
		if (record.symbolId) symbolIds.add(record.symbolId);
	});
	(view.branches ?? []).forEach((record, index) => {
		if (!(record.testReads ?? []).some((read) => graphNodeIds.has(read.graphNodeId))) return;
		selected.branches.add(index);
		if (record.symbolId) symbolIds.add(record.symbolId);
		for (const arm of record.armRecords ?? [])
			collectCompleteArmRecordClosure(arm, graphNodeIds, symbolIds);
	});
	view.asyncBoundaries.forEach((record, index) => {
		if (!record.asyncReads.some((read) => graphNodeIds.has(read.graphNodeId))) return;
		selected.boundaries.add(index);
		if (record.updateSymbolId) symbolIds.add(record.updateSymbolId);
		for (const read of record.asyncReads)
			if (read.runnerSymbolId) symbolIds.add(read.runnerSymbolId);
		const arms = Array.isArray(record.armRecords)
			? record.armRecords
			: record.armRecords
				? [record.armRecords]
				: [];
		for (const arm of arms) collectCompleteArmRecordClosure(arm, graphNodeIds, symbolIds);
	});
	(view.keyedRepeats ?? []).forEach((record, index) => {
		if (!record.collectionGraphNodeId || !graphNodeIds.has(record.collectionGraphNodeId))
			return;
		selected.repeats.add(index);
		for (const rowEvent of record.rowEvents)
			for (const symbolId of rowEvent.symbolIds ?? []) symbolIds.add(symbolId);
	});
}

// Boundary arms carry view-shaped events; branch arms carry hostPath-keyed ones.
type BranchArmRecord = NonNullable<
	NonNullable<ProtocolViewPayload['branches']>[number]['armRecords']
>[number];

function collectCompleteArmRecordClosure(
	arm: {
		readonly events?: ProtocolViewPayload['events'] | BranchArmRecord['events'];
		readonly domUpdates?: ReadonlyArray<{
			readonly graphNodeId?: unknown;
			readonly symbolId?: unknown;
		}>;
		readonly behaviors?: ReadonlyArray<{
			readonly symbolId?: unknown;
			readonly inputGraphReads?: ReadonlyArray<{ readonly graphNodeId?: unknown }>;
		}>;
		readonly keyedRepeats?: ProtocolViewPayload['keyedRepeats'];
		readonly branches?: ReadonlyArray<{
			readonly symbolId?: string;
			readonly testReads?: ReadonlyArray<{ readonly graphNodeId: string }>;
			readonly armRecords?: NonNullable<
				ProtocolViewPayload['branches']
			>[number]['armRecords'];
		}>;
	},
	graphNodeIds: Set<string>,
	symbolIds: Set<string>,
): void {
	for (const event of arm.events ?? [])
		for (const symbolId of event.symbolIds ?? []) symbolIds.add(symbolId);
	for (const update of arm.domUpdates ?? []) {
		if (typeof update.graphNodeId === 'string') graphNodeIds.add(update.graphNodeId);
		if (typeof update.symbolId === 'string') symbolIds.add(update.symbolId);
	}
	for (const behavior of arm.behaviors ?? []) {
		for (const read of behavior.inputGraphReads ?? [])
			if (typeof read.graphNodeId === 'string') graphNodeIds.add(read.graphNodeId);
		if (typeof behavior.symbolId === 'string') symbolIds.add(behavior.symbolId);
	}
	for (const repeat of arm.keyedRepeats ?? []) {
		if (repeat.collectionGraphNodeId) graphNodeIds.add(repeat.collectionGraphNodeId);
		for (const event of repeat.rowEvents)
			for (const symbolId of event.symbolIds ?? []) symbolIds.add(symbolId);
	}
	for (const branch of arm.branches ?? []) {
		if (branch.symbolId) symbolIds.add(branch.symbolId);
		for (const read of branch.testReads ?? []) graphNodeIds.add(read.graphNodeId);
		for (const nested of branch.armRecords ?? [])
			collectCompleteArmRecordClosure(nested, graphNodeIds, symbolIds);
	}
}

function closeComputedGraph(graphNodeIds: Set<string>, state: ProtocolStatePayload): void {
	let changed = true;
	while (changed) {
		changed = false;
		for (const computed of state.computed) {
			const dependencies = computed.dependencies ?? [];
			if (
				!graphNodeIds.has(computed.graphNodeId) &&
				!dependencies.some((dependency) => graphNodeIds.has(dependency.graphNodeId))
			)
				continue;
			if (!graphNodeIds.has(computed.graphNodeId)) {
				graphNodeIds.add(computed.graphNodeId);
				changed = true;
			}
			for (const dependency of dependencies)
				if (!graphNodeIds.has(dependency.graphNodeId)) {
					graphNodeIds.add(dependency.graphNodeId);
					changed = true;
				}
		}
	}
}

function filterState(
	state: ProtocolStatePayload,
	graphNodeIds: ReadonlySet<string>,
): ProtocolStatePayload {
	return {
		...state,
		cells: state.cells.filter((cell) => graphNodeIds.has(cell.graphNodeId)),
		computed: state.computed.filter((computed) => graphNodeIds.has(computed.graphNodeId)),
		storage: state.storage?.filter((cell) => graphNodeIds.has(cell.graphNodeId)),
		sharedDefinitions: state.sharedDefinitions?.filter((definition) =>
			definition.graphNodeIds.some((graphNodeId) => graphNodeIds.has(graphNodeId)),
		),
	};
}

function closureSize(
	graphNodeIds: ReadonlySet<string>,
	symbolIds: ReadonlySet<string>,
	selected: Record<string, ReadonlySet<number>>,
): number {
	return (
		graphNodeIds.size +
		symbolIds.size +
		Object.values(selected).reduce((total, records) => total + records.size, 0)
	);
}
