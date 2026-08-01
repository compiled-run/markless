import type { DecodedPayloadScripts } from '../../serializer/src/protocol-client.ts';
import {
	decodePayloadScripts,
	resumeFromPayloadScripts,
	type ResumePayloadScriptsResult,
} from './payload-full.ts';
import {
	readPayloadScriptsFromDocument,
	resumeFromPayloadDocumentWith,
	type PayloadScriptDocument,
	type ResumePayloadDocumentInput,
} from './payload-document-common.ts';

export type {
	PayloadScriptDocument,
	PayloadScriptElement,
	ResumePayloadDocumentInput,
} from './payload-document-common.ts';
export { readPayloadScriptsFromDocument } from './payload-document-common.ts';

export function decodePayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): DecodedPayloadScripts {
	return decodePayloadScripts(readPayloadScriptsFromDocument(document));
}

export function resumeFromPayloadDocument(
	input: ResumePayloadDocumentInput,
): Promise<ResumePayloadScriptsResult> {
	return resumeFromPayloadDocumentWith(input, resumeFromPayloadScripts);
}
