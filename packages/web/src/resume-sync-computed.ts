import type { ProtocolStatePayload } from '@markless/serializer';
import type { RuntimeGraph } from '@markless/runtime';
import type { ElementHandleRegistry, ResumeDomElement, ResumeRuntimeInput } from './resume-types.ts';

type ResumeSyncComputedRecord = ProtocolStatePayload['computed'][number] & { readonly deriveSymbolId: string };

export function wireSyncComputed(input: { readonly graph: RuntimeGraph; readonly state?: ProtocolStatePayload; readonly root: ResumeDomElement; readonly loadSymbol: ResumeRuntimeInput['loadSymbol']; readonly elementHandles: ElementHandleRegistry; readonly storeContainerSubscription: (release: () => void) => void }): void {
	for (const computed of syncComputedRecords(input.state)) for (const dependency of computed.dependencies ?? []) {
		input.storeContainerSubscription(input.graph.subscribe({ id: `sync-computed:${computed.graphNodeId}`, graphNodeId: dependency.graphNodeId, path: dependency.path, async run() {
			const symbol = await input.loadSymbol(computed.deriveSymbolId);
			const result = symbol({ graph: input.graph, read: input.graph.read, element: input.root, getElementHandle: input.elementHandles.get });
			input.graph.write({ graphNodeId: computed.graphNodeId, value: isPromiseLike(result) ? await result : result });
		} }));
	}
}
export function hasSyncComputed(state: ProtocolStatePayload | undefined): boolean { return syncComputedRecords(state).length > 0; }
function syncComputedRecords(state: ProtocolStatePayload | undefined): ResumeSyncComputedRecord[] {
	return (state?.computed ?? []).filter((computed): computed is ResumeSyncComputedRecord => computed.async === false && typeof (computed as ResumeSyncComputedRecord).deriveSymbolId === 'string');
}
function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof (value as { readonly then?: unknown }).then === 'function';
}
