import type { ResumePreparedCore, ResumeRuntimeInput } from './resume-types.ts';

type SyncComputedRecord = NonNullable<ResumeRuntimeInput['state']>['computed'][number] & {
	readonly deriveSymbolId: string;
};

export function hasSyncComputedDemandTriggers(state: ResumeRuntimeInput['state']): boolean {
	return syncComputedDemandRecords(state).length > 0;
}

export function wireSyncComputedDemandTriggersWithoutLoadingCapability(input: {
	readonly graph: ResumeRuntimeInput['graph'];
	readonly state: ResumeRuntimeInput['state'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ResumePreparedCore['elementHandles'];
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	let syncComputedRuntimeWired = false;
	for (const computed of syncComputedDemandRecords(input.state)) {
		for (const dependency of computed.dependencies ?? []) {
			input.storeContainerSubscription(
				input.graph.subscribe({
					id: `sync-computed-demand:${computed.graphNodeId}:${dependency.graphNodeId}:${dependency.path.join('.')}`,
					graphNodeId: dependency.graphNodeId,
					path: dependency.path,
					async run() {
						if (syncComputedRuntimeWired) return;
						syncComputedRuntimeWired = true;
						(await import('./resume-sync-computed.ts')).wireSyncComputed({
							graph: input.graph,
							state: input.state,
							root: input.root,
							loadSymbol: input.loadSymbol,
							elementHandles: input.elementHandles,
							storeContainerSubscription: input.storeContainerSubscription,
						});
					},
				}),
			);
		}
	}
}

function syncComputedDemandRecords(state: ResumeRuntimeInput['state']): SyncComputedRecord[] {
	return (state?.computed ?? []).filter(
		(computed): computed is SyncComputedRecord =>
			computed.async === false &&
			typeof (computed as { readonly deriveSymbolId?: unknown }).deriveSymbolId === 'string',
	);
}
