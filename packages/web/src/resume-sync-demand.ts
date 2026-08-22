import type { ResumePreparedCore, ResumeRuntimeInput } from './resume-types.ts';

// Both record kinds answer the same two questions: which node to write, and
// which symbol derives it. A sync computed derives its own value; a shared seed
// re-runs the component's own seed expression over the props it reads.
type DemandRecord = {
	readonly graphNodeId: string;
	readonly deriveSymbolId: string;
	readonly dependencies?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
};

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
	for (const computed of records) {
		for (const dependency of computed.dependencies ?? []) {
			input.storeContainerSubscription(
				input.graph.subscribe({
					id: `sync-computed-demand:${computed.graphNodeId}:${computed.deriveSymbolId}:${dependency.graphNodeId}:${dependency.path.join('.')}`,
					graphNodeId: dependency.graphNodeId,
					path: dependency.path,
					async run() {
						await (
							await import('./resume-sync-computed.ts')
						).refreshSyncComputed({
							computed,
							graph: input.graph,
							root: input.root,
							loadSymbol: input.loadSymbol,
							elementHandles: input.elementHandles,
						});
					},
				}),
			);
		}
	}
}
