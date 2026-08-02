import type { ResumePreparedCore, ResumeRuntimeInput } from './resume-types.ts';

type SyncComputedRecord = NonNullable<ResumeRuntimeInput['state']>['computed'][number] & {
	readonly deriveSymbolId: string;
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
	});
}

export function wireSyncComputedDemandRecordsWithoutLoadingCapability(input: {
	readonly graph: ResumeRuntimeInput['graph'];
	readonly computed: NonNullable<ResumeRuntimeInput['state']>['computed'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ResumePreparedCore['elementHandles'];
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	for (const record of input.computed) {
		if (record.async !== false || typeof record.deriveSymbolId !== 'string') continue;
		const computed = record as SyncComputedRecord;
		for (const dependency of computed.dependencies ?? []) {
			input.storeContainerSubscription(
				input.graph.subscribe({
					id: `sync-computed-demand:${computed.graphNodeId}:${dependency.graphNodeId}:${dependency.path.join('.')}`,
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
