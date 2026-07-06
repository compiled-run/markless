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
		throw Object.assign(new Error('MARKLESS_SCALAR_DISPATCH_RECORD_MISSING'), {
			code: 'MARKLESS_SCALAR_DISPATCH_RECORD_MISSING',
			site: 'dispatch-record',
		});
	}
	return input.container.dispatch(input.event, {
		element: input.element,
		eventRecord: input.eventRecord,
		syncPolicyAlreadyApplied: input.syncPolicyAlreadyApplied,
	});
}
