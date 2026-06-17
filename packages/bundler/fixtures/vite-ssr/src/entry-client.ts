import { resumeEventOnlyFromPayloadDocument } from '@arcadejs/runtime/event-only-resume';
import { loadSymbol } from './root.tsrx';

type ResumeContainerEventInput = {
	readonly root: Element;
	readonly event: Event;
	readonly element?: Element;
	readonly eventRecord?: {
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly symbolIds: readonly string[];
	};
};

export async function resumeContainerEvent(input: ResumeContainerEventInput): Promise<void> {
	await resumeEventOnlyFromPayloadDocument({
		document: input.root as never,
		root: input.root as never,
		event: input.event as never,
		element: input.element as never,
		eventRecord: input.eventRecord as never,
		loadSymbol,
	});
}
