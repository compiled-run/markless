import type {
	BoundSymbolResolverRow,
	SymbolResolverPlan,
	TriggerGroupArtifact,
} from '@markless/compiler';
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
};

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
}): string {
	const ids = new Set(input.group.symbolIds);
	const boundRows = input.boundRows.filter((row) => ids.has(row.id));
	let source = emitSymbolResolverModule({
		symbols: input.symbols.filter((symbol) => ids.has(symbol.id)),
		boundSymbols: boundRows,
	});
	// Routes are cheap build tables and remain exhaustive. Only the symbols
	// behind them are demand-loaded; slicing routes makes complete structural
	// records point at a resolver that cannot serve all of their lazy symbols.
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
		adaptImportedCaptureResolver(source, boundRows.some((row) => row.loaderSymbolId !== undefined)),
		`export const groupId=${JSON.stringify(input.group.id)};`,
		`export const state=${JSON.stringify(input.group.state)};`,
		`export const view=${JSON.stringify(input.group.view)};`,
		`export const graphNodeIds=${JSON.stringify(input.group.graphNodeIds)};`,
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
	readonly triggerGroups: TriggerGroupArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly boundRows: ReadonlyArray<BoundSymbolResolverRow>;
}): PrerenderTriggerGroup[] {
	const symbols = new Map(input.symbolResolver.symbols.map((symbol) => [symbol.id, symbol]));
	const bounds = new Map(input.boundRows.map((row) => [row.id, row]));
	const routes = [
		...input.view.events.map((event) => ({ event })),
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
	return routes.flatMap(({ event, branch, branchIndex, hostPath }) => {
		if (event.eventName === 'visible') return [];
		const host = branch
			? undefined
			: input.view.locators.find((locator) => locator.hostNodeId === event.hostNodeId);
		if (!host && !branch) return [];
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
		input.view.behaviors.forEach((behavior, index) => {
			const recordId = `behavior:${behavior.hostNodeId}:${behavior.symbolId ?? ''}`;
			// The compiler group is module-local. Composed child triggers are bound
			// only after compilation, so a zero-input host behavior must also close
			// over every final build-known trigger without inventing graph demand.
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
				if (symbol.kind === 'async-computed-runner' || symbol.kind === 'sync-computed-derive') {
					graphNodeIds.add(symbol.graphNodeId);
					for (const dependency of symbol.dependencies ?? [])
						graphNodeIds.add(dependency.graphNodeId);
				}
				if ('elementHandleCalls' in symbol)
					for (const call of symbol.elementHandleCalls ?? [])
						input.view.elementHandles.forEach((handle, index) => {
							if (handle.name === call.handleName) selected.elementHandles.add(index);
						});
			}
			closeComputedGraph(graphNodeIds, input.state);
			selectViewSubscribers(input.view, graphNodeIds, symbolIds, selected);
			changed = closureSize(graphNodeIds, symbolIds, selected) !== before;
		}

		const neededHosts = new Set<string>(branch ? [] : [event.hostNodeId]);
		for (const index of selected.domUpdates) neededHosts.add(input.view.domUpdates[index]!.hostNodeId);
		for (const index of selected.behaviors) neededHosts.add(input.view.behaviors[index]!.hostNodeId);
		for (const index of selected.repeats)
			neededHosts.add(input.view.keyedRepeats![index]!.parentHostNodeId);
		for (const index of selected.elementHandles)
			neededHosts.add(input.view.elementHandles[index]!.hostNodeId);
		const view: ProtocolViewPayload = {
			...input.view,
			locators: input.view.locators.filter((locator) => neededHosts.has(locator.hostNodeId)),
			events: branch ? [] : [event],
			domUpdates: input.view.domUpdates.filter((_, index) => selected.domUpdates.has(index)),
			behaviors: input.view.behaviors.filter((_, index) => selected.behaviors.has(index)),
			elementHandles: input.view.elementHandles.filter((_, index) =>
				selected.elementHandles.has(index),
			),
			keyedRepeats: input.view.keyedRepeats?.filter((_, index) => selected.repeats.has(index)),
			branches: input.view.branches?.filter((_, index) => selected.branches.has(index)),
			asyncBoundaries: input.view.asyncBoundaries.filter((_, index) =>
				selected.boundaries.has(index),
			),
		};
		const graphIds = [...graphNodeIds].sort();
		return [
			{
				id: branch
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
			},
		];
	});
}

function selectViewSubscribers(
	view: ProtocolViewPayload,
	graphNodeIds: ReadonlySet<string>,
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
		for (const read of record.asyncReads) if (read.runnerSymbolId) symbolIds.add(read.runnerSymbolId);
		const arms = Array.isArray(record.armRecords)
			? record.armRecords
			: record.armRecords
				? [record.armRecords]
				: [];
		for (const arm of arms) collectCompleteArmRecordClosure(arm, graphNodeIds, symbolIds);
	});
	(view.keyedRepeats ?? []).forEach((record, index) => {
		if (!graphNodeIds.has(record.collectionGraphNodeId)) return;
		selected.repeats.add(index);
		for (const rowEvent of record.rowEvents)
			for (const symbolId of rowEvent.symbolIds ?? []) symbolIds.add(symbolId);
	});
}

function collectCompleteArmRecordClosure(
	arm: {
		readonly events?: ProtocolViewPayload['events'];
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
			readonly armRecords?: NonNullable<ProtocolViewPayload['branches']>[number]['armRecords'];
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

function filterState(state: ProtocolStatePayload, graphNodeIds: ReadonlySet<string>): ProtocolStatePayload {
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
