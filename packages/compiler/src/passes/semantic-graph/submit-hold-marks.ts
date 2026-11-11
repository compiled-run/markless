import type { SemanticGraphArtifact, SemanticGraphDiagnostic } from '../../artifacts.ts';
import { submitHoldAriaDiagnostic } from './diagnostics.ts';
import type { AuthoredAriaBusy } from './types.ts';

type SubmitGraph = Pick<SemanticGraphArtifact, 'hostNodes' | 'events'> & {
	diagnostics: SemanticGraphDiagnostic[];
};

// While a submit handler's promise runs, the runtime owns aria-busy on the form and aria-disabled on the control that submitted it.
export function collectSubmitHoldAriaDiagnostics(
	graph: SubmitGraph,
	hostParents: ReadonlyMap<string, string>,
	authored: { readonly ariaBusy: ReadonlyArray<AuthoredAriaBusy>; readonly submitAriaDisabled: ReadonlyArray<AuthoredAriaBusy> },
): void {
	if (authored.ariaBusy.length === 0 && authored.submitAriaDisabled.length === 0) return;
	const tags = new Map(graph.hostNodes.map((host) => [host.id, host.tagName]));
	const asyncSubmit = new Set(
		graph.events.flatMap((event) =>
			event.eventName === 'submit' && (event.handlerReturnsPromise || event.handlerMayReject)
				? [event.hostNodeId]
				: [],
		),
	);
	const ancestors = function* (hostNodeId: string) {
		for (let host = hostParents.get(hostNodeId); host; host = hostParents.get(host)) yield host;
	};
	// A submit event bubbles, so a handler on the form or on any element around it holds the form.
	const heldForm = (formId: string) =>
		asyncSubmit.has(formId) || [...ancestors(formId)].some((host) => asyncSubmit.has(host));
	for (const { hostNodeId, sourceSpan } of authored.ariaBusy)
		if (tags.get(hostNodeId) === 'form' && heldForm(hostNodeId))
			graph.diagnostics.push(submitHoldAriaDiagnostic(sourceSpan, 'form'));
	for (const { hostNodeId, sourceSpan } of authored.submitAriaDisabled) {
		const form = [...ancestors(hostNodeId)].find((host) => tags.get(host) === 'form');
		if (form && heldForm(form))
			graph.diagnostics.push(submitHoldAriaDiagnostic(sourceSpan, 'submitter'));
	}
}
