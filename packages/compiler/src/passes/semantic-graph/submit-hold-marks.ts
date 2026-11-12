import type { SemanticGraphArtifact, SemanticGraphDiagnostic } from '../../artifacts.ts';
import { submitHoldAriaDiagnostic } from './diagnostics.ts';
import type { AuthoredAriaBusy } from './types.ts';

type SubmitGraph = Pick<SemanticGraphArtifact, 'hostNodes'> & {
	events: SemanticGraphArtifact['events'][number][];
	diagnostics: SemanticGraphDiagnostic[];
};

// While a submit handler runs, the runtime owns aria-busy on the form, and aria-disabled on its submitter unless the author writes one there.
export function collectSubmitHoldFacts(
	graph: SubmitGraph,
	hostParents: ReadonlyMap<string, string>,
	authored: {
		readonly ariaBusy: ReadonlyArray<AuthoredAriaBusy>;
		readonly submitAriaDisabled: ReadonlyArray<AuthoredAriaBusy>;
	},
): void {
	if (authored.ariaBusy.length === 0 && authored.submitAriaDisabled.length === 0) return;
	const tags = new Map(graph.hostNodes.map((host) => [host.id, host.tagName]));
	const ancestors = (hostNodeId: string) => {
		const hosts: string[] = [];
		for (let host = hostParents.get(hostNodeId); host; host = hostParents.get(host)) hosts.push(host);
		return hosts;
	};
	// A submit event bubbles, so a handler on the form or on any element around it holds the form.
	const submitEvents = (formId: string) => {
		const hosts = new Set([formId, ...ancestors(formId)]);
		return graph.events.filter((event) => event.eventName === 'submit' && hosts.has(event.hostNodeId));
	};
	for (const { hostNodeId, sourceSpan } of authored.ariaBusy) {
		if (tags.get(hostNodeId) !== 'form') continue;
		const events = submitEvents(hostNodeId);
		if (events.some((event) => event.handlerReturnsPromise || event.handlerMayReject))
			graph.diagnostics.push(submitHoldAriaDiagnostic(sourceSpan));
		else if (events.some((event) => event.inPlaceSubmit))
			graph.diagnostics.push(submitHoldAriaDiagnostic(sourceSpan, true));
	}
	const leaveAlone = new Set<SemanticGraphArtifact['events'][number]>();
	for (const { hostNodeId } of authored.submitAriaDisabled) {
		const form = ancestors(hostNodeId).find((host) => tags.get(host) === 'form');
		if (form) for (const event of submitEvents(form)) leaveAlone.add(event);
	}
	if (leaveAlone.size > 0)
		graph.events = graph.events.map((event) =>
			leaveAlone.has(event) ? { ...event, authoredSubmitAriaDisabled: true as const } : event,
		);
}
