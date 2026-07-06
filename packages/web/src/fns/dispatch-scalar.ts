import type {
	EventOnlyResumeContainer,
	EventOnlyResumeDomElement,
	EventOnlyResumeDomEvent,
	EventOnlyResumeRecord,
} from '../event-only-lean/types.ts';

export async function marklessDispatchScalar(input: {
	readonly container: EventOnlyResumeContainer;
	readonly event: EventOnlyResumeDomEvent;
	readonly element?: EventOnlyResumeDomElement;
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly syncPolicyAlreadyApplied?: boolean;
}): Promise<void> {
	if (!input.eventRecord) {
		const error = new Error('MARKLESS_SCALAR_DISPATCH_RECORD_MISSING: Cannot dispatch scalar event without a matched event record.');
		Object.assign(error, {
			code: 'MARKLESS_SCALAR_DISPATCH_RECORD_MISSING',
			severity: 'error',
			phase: 'runtime',
			docsUrl: 'https://markless.dev/errors/MARKLESS_SCALAR_DISPATCH_RECORD_MISSING',
		});
		throw error;
	}
	return input.container.dispatch(input.event, {
		element: input.element,
		eventRecord: input.eventRecord,
		syncPolicyAlreadyApplied: input.syncPolicyAlreadyApplied,
	});
}
