import type { ProtocolViewPayload } from '../../../serializer/src/protocol.ts';

export type RuntimeResumeErrorCode =
	| 'MARKLESS_RESUME_LOCATOR_MISSING'
	| 'MARKLESS_RESUME_LOCATOR_MISMATCH';
export type RuntimeResumeDiagnostic = {
	readonly code: RuntimeResumeErrorCode;
	readonly message: string;
	readonly docsUrl: string;
};

export class RuntimeResumeError extends Error implements RuntimeResumeDiagnostic {
	readonly code: RuntimeResumeErrorCode;
	readonly docsUrl: string;
	constructor(diagnostic: RuntimeResumeDiagnostic) {
		super(diagnostic.message);
		this.name = 'RuntimeResumeError';
		this.code = diagnostic.code;
		this.docsUrl = diagnostic.docsUrl;
	}
}

export function runtimeResumeError(
	code: RuntimeResumeErrorCode,
	message: string,
): RuntimeResumeError {
	return new RuntimeResumeError({
		code,
		message,
		docsUrl: `https://markless.dev/errors/${code}`,
	});
}

export function missingElementLocatorError(
	locator: ProtocolViewPayload['locators'][number],
): RuntimeResumeError {
	return runtimeResumeError(
		'MARKLESS_RESUME_LOCATOR_MISSING',
		`Resume locator ${locator.hostNodeId} expected <${locator.tagName}> at DOM order index ${locator.index}.`,
	);
}
export function mismatchedElementLocatorError(
	locator: ProtocolViewPayload['locators'][number],
	actualTagName: string,
): RuntimeResumeError {
	return runtimeResumeError(
		'MARKLESS_RESUME_LOCATOR_MISMATCH',
		`Resume locator ${locator.hostNodeId} expected <${locator.tagName.toLowerCase()}> at DOM order index ${locator.index} but found <${actualTagName}>.`,
	);
}
export function domOrderCommentLocator(index: number): string {
	return `dom-order-comment:${index}`;
}
