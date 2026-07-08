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

export function missingElementLocatorError(
	locator: ProtocolViewPayload['locators'][number],
): RuntimeResumeError {
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISSING',
		message: `Resume locator ${locator.hostNodeId} expected <${locator.tagName}> at DOM order index ${String(locator.index)}.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING',
	});
}
export function mismatchedElementLocatorError(
	locator: ProtocolViewPayload['locators'][number],
	actualTagName: string,
): RuntimeResumeError {
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISMATCH',
		message: `Resume locator ${locator.hostNodeId} expected <${locator.tagName.toLowerCase()}> at DOM order index ${String(locator.index)} but found <${actualTagName}>.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISMATCH',
	});
}
export function domOrderCommentLocator(index: number): string {
	return `dom-order-comment:${String(index)}`;
}
