import type { ProtocolStatePayload } from '@markless/serializer';
import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeRuntimeInput,
} from './resume-types.ts';

type ResumeSyncComputedRecord = ProtocolStatePayload['computed'][number] & {
	readonly deriveSymbolId: string;
};

export async function refreshSyncComputed(input: {
	readonly computed: ResumeSyncComputedRecord;
	readonly graph: RuntimeGraph;
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ElementHandleRegistry;
}): Promise<void> {
	const result = (await input.loadSymbol(input.computed.deriveSymbolId))({
		graph: input.graph,
		read: input.graph.read,
		element: input.root,
		getElementHandle: input.elementHandles.get,
	});
	input.graph.write({
		graphNodeId: input.computed.graphNodeId,
		value: await result,
	});
}
