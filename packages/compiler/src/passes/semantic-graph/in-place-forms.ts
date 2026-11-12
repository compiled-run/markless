import { IN_PLACE_SUBMIT_POLICY } from '@markless/serializer';
import type { SemanticGraphArtifact } from '../../artifacts.ts';
import type { PostFormCandidate } from './types.ts';

type FormGraph = Pick<SemanticGraphArtifact, 'templateReads'> & {
	events: SemanticGraphArtifact['events'][number][];
};

/**
 * A form that may post, inside a `@try` with a `@catch`, with no submit handler on it or around it: the runtime sends it
 * in place, and a failed send renders in that `@catch`. Runs before the boundary gates are minted, since it makes one.
 */
export function collectInPlaceForms(
	graph: FormGraph,
	hostParents: ReadonlyMap<string, string>,
	forms: ReadonlyArray<PostFormCandidate>,
	nextEventId: () => number,
): void {
	if (forms.length === 0) return;
	const around = (hostNodeId: string) => {
		const hosts = new Set([hostNodeId]);
		for (let host = hostParents.get(hostNodeId); host; host = hostParents.get(host))
			hosts.add(host);
		return hosts;
	};
	const inside = (hostNodeId: string, formId: string) => {
		for (let host: string | undefined = hostNodeId; host; host = hostParents.get(host))
			if (host === formId) return true;
		return false;
	};
	for (const form of forms) {
		const hosts = around(form.hostNodeId);
		if (
			graph.events.some(
				(event) => event.eventName === 'submit' && hosts.has(event.hostNodeId),
			)
		)
			continue;
		// A field whose value or checked state is bound shows state, which a reset would leave out of step.
		const bound = graph.templateReads.some(
			(read) => read.target.kind === 'property' && inside(read.hostNodeId, form.hostNodeId),
		);
		graph.events.push({
			id: `event:${nextEventId()}`,
			hostNodeId: form.hostNodeId,
			eventName: 'submit',
			...(form.componentName ? { componentName: form.componentName } : {}),
			handlerCatchBoundaryId: form.catchBoundaryId,
			handlerParameters: [],
			hasSyncPolicyCandidate: false,
			syncPolicy: IN_PLACE_SUBMIT_POLICY,
			inPlaceSubmit: bound ? 'keep' : 'reset',
		});
	}
}
