import type { ProtocolViewPayload } from '../../../serializer/src/protocol.ts';

export type RuntimeResumeErrorCode =
	| 'MARKLESS_RESUME_LOCATOR_MISSING'
	| 'MARKLESS_RESUME_LOCATOR_MISMATCH'
	| 'MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS';
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

// Arm-relative locators reach here too; only the described fields are read.
export function missingElementLocatorError(
	locator: Pick<ProtocolViewPayload['locators'][number], 'hostNodeId' | 'tagName' | 'index'>,
): RuntimeResumeError {
	return runtimeResumeError(
		'MARKLESS_RESUME_LOCATOR_MISSING',
		`Resume locator ${locator.hostNodeId} expected <${locator.tagName}> at DOM order index ${locator.index}.`,
	);
}
export function mismatchedElementLocatorError(
	locator: Pick<ProtocolViewPayload['locators'][number], 'hostNodeId' | 'tagName' | 'index'>,
	actualTagName: string,
): RuntimeResumeError {
	return runtimeResumeError(
		'MARKLESS_RESUME_LOCATOR_MISMATCH',
		`Resume locator ${locator.hostNodeId} expected <${locator.tagName.toLowerCase()}> at DOM order index ${locator.index} but found <${actualTagName}>.`,
	);
}
// More than one rendered widget registered this handle, and the reading handler
// did not say which one it is part of. Answering with any of them is the silent
// wrong-element delivery this refusal replaces.
export function ambiguousElementHandleError(
	handleIdOrName: string,
	registrations: number,
): RuntimeResumeError {
	return runtimeResumeError(
		'MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS',
		`Element handle ${handleIdOrName} is registered by ${registrations} rendered widgets on this page, and the reading handler named no instance. Read the handle from a part of the widget that binds it.`,
	);
}
export function domOrderCommentLocator(index: number): string {
	return `dom-order-comment:${index}`;
}
