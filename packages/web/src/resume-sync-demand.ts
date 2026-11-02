import type { RuntimeGraph } from '@markless/runtime';
import type { ResumePreparedCore, ResumeRuntimeInput } from './resume-types.ts';

type Records = NonNullable<ResumeRuntimeInput['state']>['computed'];

// Held once loaded: every import() of an evaluated module still resolves a task later.
let syncComputedModule: typeof import('./resume-sync-computed.ts') | undefined;

// Both record kinds answer the same two questions: which node to write, and
// which symbol derives it. A sync computed derives its own value; a shared seed
// re-runs the component's own seed expression over the props it reads.
type DemandRecord = {
	readonly graphNodeId: string;
	readonly deriveSymbolId: string;
	readonly deriveOnRead?: true;
	readonly dependencies?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
};

// Spec 03: the record lists a computed that only markup reads re-derives from when read.
const onReadBatches = new WeakMap<RuntimeGraph, Records[]>();

export function wireSyncComputedDemandTriggersWithoutLoadingCapability(input: {
	readonly graph: ResumeRuntimeInput['graph'];
	readonly state: ResumeRuntimeInput['state'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ResumePreparedCore['elementHandles'];
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	wireSyncComputedDemandRecordsWithoutLoadingCapability({
		...input,
		computed: input.state?.computed ?? [],
		sharedSeeds: input.state?.sharedSeeds,
	});
}

export function wireSyncComputedDemandRecordsWithoutLoadingCapability(input: {
	readonly graph: ResumeRuntimeInput['graph'];
	readonly computed: NonNullable<ResumeRuntimeInput['state']>['computed'];
	readonly allComputed?: NonNullable<ResumeRuntimeInput['state']>['computed'];
	readonly sharedSeeds?: NonNullable<ResumeRuntimeInput['state']>['sharedSeeds'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ResumePreparedCore['elementHandles'];
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	const records = [
		...input.computed.filter(
			(record) => record.async === false && typeof record.deriveSymbolId === 'string',
		),
		...(input.sharedSeeds ?? []),
	] as ReadonlyArray<DemandRecord>;
	const graph = input.graph;
	const all = input.allComputed ?? input.computed;
	const batches = graph.pullBeforeRead && (onReadBatches.get(graph) ?? []);
	if (batches) onReadBatches.set(graph, [...batches, all]);
	for (const computed of records) {
		for (const dependency of computed.dependencies ?? []) {
			input.storeContainerSubscription(
				input.graph.subscribe({
					id: `sync-computed-demand:${computed.graphNodeId}:${computed.deriveSymbolId}:${dependency.graphNodeId}:${dependency.path.join('.')}`,
					graphNodeId: dependency.graphNodeId,
					path: dependency.path,
					async run() {
						const module = (syncComputedModule ??=
							await import('./resume-sync-computed.ts'));
						const refresh = {
							computed,
							records: all,
							graph,
							root: input.root,
							loadSymbol: input.loadSymbol,
							elementHandles: input.elementHandles,
						};
						await (batches && computed.deriveOnRead
							? module.refreshWhenShown(refresh, onReadBatches.get(graph)!)
							: module.refreshSyncComputed(refresh));
					},
				}),
			);
		}
	}
}
