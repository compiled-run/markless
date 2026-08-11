import type {
	BoundSymbolResolverRow,
	SemanticComponentEdge,
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
import { emitSymbolResolverModule } from '@markless/compiler';
import type { SourceSymbolRow } from './source-module.ts';
import type { SourceSymbolRoute } from './source-module.ts';
import { adaptImportedCaptureResolver } from './bound-resolver.ts';

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

export function emitPrerenderTriggerGroupModule(input: {
	readonly group: PrerenderTriggerGroup;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
	readonly symbolRoutes?: ReadonlyArray<SourceSymbolRoute>;
	readonly armRendererModuleId?: string;
}): string {
	const armRendererModuleId = input.armRendererModuleId ?? input.group.armRendererModuleId;
	const ids = new Set(input.group.symbolIds);
	const boundRows = input.boundRows.filter((row) => ids.has(row.id));
	let source = emitSymbolResolverModule({
		symbols: input.symbols.filter((symbol) => ids.has(symbol.id)),
		boundSymbols: boundRows,
	});
	// Keep routes exhaustive while demand-loading only their symbols.
	const routes = input.symbolRoutes ?? [];
	if (routes.length > 0) {
		source = source.replaceAll('loadSymbol(', 'marklessLoadLocalSymbol(');
		source += [
			'export function loadSymbol(symbolId) {',
			...routes.flatMap((route) => [
				`\tif (symbolId.startsWith(${JSON.stringify(route.prefix)})) {`,
				`\t\treturn import(${JSON.stringify(symbolRouteImportSource(route.importSource))}).then((mod) => mod.loadSymbol ? mod.loadSymbol(symbolId.slice(${route.prefix.length})) : Promise.reject(new Error(\`Unknown child async symbol \${symbolId}\`)));`,
				'\t}',
			]),
			'\treturn marklessLoadLocalSymbol(symbolId);',
			'}',
		].join('\n');
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
		adaptImportedCaptureResolver(
			source,
			boundRows.some((row) => row.loaderSymbolId !== undefined),
		),
		`export const groupId=${JSON.stringify(input.group.id)};`,
		`export const state=${JSON.stringify(input.group.state)};`,
		`export const view=${JSON.stringify(input.group.view)};`,
		`export const graphNodeIds=${JSON.stringify(input.group.graphNodeIds)};`,
	].join('\n');
}

export function emitPrerenderBoundaryRendererModule(renderDataId: string): string {
	return [
		`import { marklessPrerenderData } from ${JSON.stringify(renderDataId)};`,
		"import { renderPrerenderBoundary } from '@markless/web/fns/prerender-resume';",
		'const marklessPreparedBoundaryArms = new Map();',
		'export async function prepareBoundaryArm(boundaryId, status, graph, loadSymbol) {',
		'\tconst rendered = await renderPrerenderBoundary(marklessPrerenderData, boundaryId, status, graph, loadSymbol);',
		'\tmarklessPreparedBoundaryArms.set(`${boundaryId}:${status}`, rendered);',
		'}',
		'export function renderBoundaryArm(boundaryId, status) {',
		'\tconst key = `${boundaryId}:${status}`;',
		'\tconst rendered = marklessPreparedBoundaryArms.get(key);',
		'\tif (!rendered) throw new Error(`Markless prerender arm ${key} was not prepared.`);',
		'\tmarklessPreparedBoundaryArms.delete(key);',
		'\treturn rendered;',
		'}',
	].join('\n');
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
}): PrerenderTriggerGroup[] {
	const symbols = new Map(input.symbolResolver.symbols.map((symbol) => [symbol.id, symbol]));
	const bounds = new Map(input.boundRows.map((row) => [row.id, row]));
	const completeView = input.completeView ?? input.view;
	const completeBoundaries = new Map(
		completeView.asyncBoundaries.map((boundary) => [boundary.id, boundary]),
	);
	const selfWakeBoundaries = unsettledAsyncBoundaryIndexes(input.state, input.view);
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
		if (event.eventName === 'visible') return [];
		const host = branch
			? undefined
			: input.view.locators.find((locator) => locator.hostNodeId === event.hostNodeId);
		if (!host && !branch && !selfWakeBoundaries) return [];
		const compilerGroup = input.triggerGroups.groups.find(
			(group) => group.hostNodeId === event.hostNodeId && group.eventName === event.eventName,
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
		for (const boundaryIndex of selfWakeBoundaries ?? []) {
			const servedBoundary = input.view.asyncBoundaries[boundaryIndex]!;
			selected.boundaries.add(boundaryIndex);
			collectSettledBoundaryClosure(
				input,
				completeBoundaries.get(servedBoundary.id) ?? servedBoundary,
				graphNodeIds,
				symbolIds,
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
					for (const write of symbol.writes ?? []) graphNodeIds.add(write.graphNodeId);
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
							if (handle.name === call.handleName) selected.elementHandles.add(index);
						});
			}
			closeComputedGraph(graphNodeIds, input.state);
			for (const graphNodeId of graphNodeIds) {
				const runnerSymbolId = closureView.asyncRunners?.[graphNodeId];
				if (runnerSymbolId) symbolIds.add(runnerSymbolId);
			}
			selectViewSubscribers(closureView, graphNodeIds, symbolIds, selected);
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
						!settledArmReadGraphNodeIds(input, boundary).some((graphNodeId) =>
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
			locators: closureView.locators.filter((locator) => neededHosts.has(locator.hostNodeId)),
			events: branch || selfWakeBoundaries ? [] : [event],
			domUpdates: closureView.domUpdates.filter((_, index) => selected.domUpdates.has(index)),
			behaviors: closureView.behaviors.filter((_, index) => selected.behaviors.has(index)),
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
			asyncBoundaries: closureView.asyncBoundaries
				.filter((boundary) => selectedBoundaryIds.has(boundary.id))
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

// Graph cells a settled arm reads: the arm's own records plus the props it
// forwards to child components rendered inside it.
function settledArmReadGraphNodeIds(
	input: { readonly componentEdges?: ReadonlyArray<SemanticComponentEdge> },
	boundary: ProtocolViewPayload['asyncBoundaries'][number],
): string[] {
	const graphNodeIds = new Set<string>();
	for (const arm of boundaryArmRecordSets(boundary))
		collectCompleteArmRecordClosure(arm, graphNodeIds, new Set<string>());
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
		if (!record.collectionGraphNodeId || !graphNodeIds.has(record.collectionGraphNodeId)) return;
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
