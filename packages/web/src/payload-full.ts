import {
	decodePayloadScripts as decodePayloadScriptsClient,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
} from '../../serializer/src/protocol-client.ts';
import type { ResumeDomElement, ResumeRuntime, ResumeRuntimeInput } from './resume.ts';
import {
	deleteResumedPayload,
	type ResumeAlreadyResumedWarning,
} from './payload-resume-registry.ts';
export type {
	PayloadScriptDocument,
	PayloadScriptElement,
	ResumePayloadDocumentInput,
} from './payload-document.ts';

export {
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
};
type DevProtocolValidationModule = typeof import('../../serializer/src/protocol-validation.ts');
type RuntimeGraph = import('@markless/runtime').RuntimeGraph;

export type ResumePayloadScriptsInput = EncodedPayloadScripts & Pick<
	ResumeRuntimeInput,
	| 'loadSymbol'
	| 'createVisibilityObserver'
	| 'createRemovalObserver'
	| 'applyDomJournal'
	| 'renderBranchHtml'> & { readonly root: ResumeDomElement };

export type ResumePayloadScriptsResult = {
	readonly decoded: DecodedPayloadScripts;
	readonly graph: RuntimeGraph;
	readonly runtime: ResumeRuntime;
	readonly warnings?: ReadonlyArray<ResumeAlreadyResumedWarning>;
};

let devPayloadValidator: DevProtocolValidationModule['decodePayloadScripts'] | undefined;

declare global {
	interface ImportMeta {
		readonly env: { readonly DEV?: boolean };
	}
}

if (import.meta.env?.DEV) {
	const { decodePayloadScripts: decodePayloadScriptsDev } = await import(
		'../../serializer/src/protocol-validation.ts'
	);
	devPayloadValidator = decodePayloadScriptsDev;
}

export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	try {
		devPayloadValidator?.(input);
	} catch (error) {
		throw normalizeRuntimePayloadError(error);
	}
	return decodePayloadScriptsClient(input);
}

function normalizeRuntimePayloadError(error: unknown): Error {
	if (
		error &&
		typeof error === 'object' &&
		'code' in error &&
		'payloadType' in error &&
		'payloadScript' in error
	) {
		return new RuntimePayloadError(error as RuntimePayloadDiagnostic);
	}
	return error instanceof Error ? error : new Error(String(error));
}

// Static edge: the demand map co-demands graph construction with payload-full
// on every tier that loads it (DISPATCH_CORE and FULL_TIER); the bundler chunk
// groups keep payload-graph-construct in its own capability chunk.
export {
	createRuntimeGraphFromResumePayload,
	createRuntimeGraphFromStatePayload,
} from './payload-graph-construct.ts';

export async function resumeFromPayloadScripts(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	const resume = await import('./payload-resume.ts');
	return resume.resumeFromPayloadScriptsImpl(input);
}

export async function resumeFromPayloadDocument(
	input: import('./payload-document.ts').ResumePayloadDocumentInput,
): Promise<ResumePayloadScriptsResult> {
	const documentPayload = await import('./payload-document.ts');
	return documentPayload.resumeFromPayloadDocument(input);
}

export function disposeResumedPayload(root: ResumeDomElement): void {
	const resumed = deleteResumedPayload(root);
	resumed?.runtime.dispose();
	delete (root as ResumeDomElement & { __asyncResumeRuntimeStarted?: boolean })
		.__asyncResumeRuntimeStarted;
}
