import type {
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '../../../serializer/src/protocol.ts';
import type {
	EventOnlyResumeContainer,
	EventOnlyResumeRecord,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './types.ts';
import { isScalarCoreLeanResumeShape } from './scalar-core.ts';
import { isScalarRowLeanResumeShape } from './row.ts';

export async function resumeScalarEventFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	if (input.eventRecord) {
		const { resumeScalarCoreEventFromPayloadDocument } = await import('./scalar-core.ts');
		return resumeScalarCoreEventFromPayloadDocument(input);
	}
	const { resumeScalarRowEventFromPayloadDocument } = await import('./row.ts');
	return resumeScalarRowEventFromPayloadDocument(input);
}

export function isScalarLeanResumeShape(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly eventName?: string;
	readonly runtimeDemandMap?: unknown;
}): boolean {
	return input.eventRecord
		? isScalarCoreLeanResumeShape(input)
		: isScalarRowLeanResumeShape(input);
}
