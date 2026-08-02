import {
	decodePayloadScripts as decodePayloadScriptsClient,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
} from '../../serializer/src/protocol-client.ts';
import type { ResumeDomElement } from './resume.ts';
import type { ResumePayloadScriptsInput, ResumePayloadScriptsResult } from './payload-full.ts';
import {
	readPayloadScriptsFromDocument,
	resumeFromPayloadDocumentWith,
	type ResumePayloadDocumentInput,
} from './payload-document-common.ts';
import { deleteResumedPayload } from './payload-resume-registry.ts';

export {
	RuntimePayloadError,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
};
export type {
	PayloadScriptDocument,
	PayloadScriptElement,
	ResumePayloadDocumentInput,
} from './payload-document-common.ts';
export type { ResumePayloadScriptsInput, ResumePayloadScriptsResult } from './payload-full.ts';
export {
	createRuntimeGraphFromResumePayload,
	createRuntimeGraphFromStatePayload,
} from './payload-graph-construct.ts';

type DevProtocolValidationModule = typeof import('../../serializer/src/protocol-validation.ts');
declare const __MARKLESS_DEV_ENABLED__: boolean;

export const decodePayloadScripts =
	typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__
		? decodeWithDevValidation(
				(await import('../../serializer/src/protocol-validation.ts')).decodePayloadScripts,
			)
		: decodePayloadScriptsClient;

function decodeWithDevValidation(
	validate: DevProtocolValidationModule['decodePayloadScripts'],
): typeof decodePayloadScriptsClient {
	return (input) => {
		try {
			validate(input);
		} catch (error) {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				'payloadType' in error &&
				'payloadScript' in error
			)
				throw new RuntimePayloadError(error as RuntimePayloadDiagnostic);
			throw error instanceof Error ? error : new Error(String(error));
		}
		return decodePayloadScriptsClient(input);
	};
}

export async function resumeFromPayloadScripts(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	return (await import('./payload-resume.ts')).resumeFromPayloadScriptsImpl(
		input,
		decodePayloadScripts,
	);
}

export function resumeFromPayloadDocument(
	input: ResumePayloadDocumentInput,
): Promise<ResumePayloadScriptsResult> {
	return resumeFromPayloadDocumentWith(input, resumeFromPayloadScripts);
}

export function decodePayloadScriptsFromDocument(
	document: ResumePayloadDocumentInput['document'],
): DecodedPayloadScripts {
	return decodePayloadScripts(readPayloadScriptsFromDocument(document));
}

export function disposeResumedPayload(root: ResumeDomElement): void {
	const resumed = deleteResumedPayload(root);
	resumed?.runtime.dispose();
	delete (root as ResumeDomElement & { __asyncResumeRuntimeStarted?: boolean })
		.__asyncResumeRuntimeStarted;
}
