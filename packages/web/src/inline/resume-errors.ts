import type { ProtocolViewPayload } from '../../../serializer/src/protocol.ts';

export type RuntimeResumeErrorCode =
	| 'MARKLESS_RESUME_LOCATOR_MISSING'
	| 'MARKLESS_RESUME_LOCATOR_MISMATCH';

export type RuntimeResumeDiagnostic = {
	readonly code: RuntimeResumeErrorCode;
	readonly severity: 'error';
	readonly phase: 'resume';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly hostNodeId?: string;
	readonly boundaryId?: string;
	readonly elementLocator?: string;
	readonly expectedTagName?: string;
	readonly actualTagName?: string;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class RuntimeResumeError extends Error implements RuntimeResumeDiagnostic {
	readonly code: RuntimeResumeErrorCode;
	readonly severity: 'error';
	readonly phase: 'resume';
	readonly title: string;
	readonly why: string;
	readonly hostNodeId?: string;
	readonly boundaryId?: string;
	readonly elementLocator?: string;
	readonly expectedTagName?: string;
	readonly actualTagName?: string;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;

	constructor(diagnostic: RuntimeResumeDiagnostic) {
		super(diagnostic.message);
		this.name = 'RuntimeResumeError';
		this.code = diagnostic.code;
		this.severity = diagnostic.severity;
		this.phase = diagnostic.phase;
		this.title = diagnostic.title;
		this.why = diagnostic.why;
		this.hostNodeId = diagnostic.hostNodeId;
		this.boundaryId = diagnostic.boundaryId;
		this.elementLocator = diagnostic.elementLocator;
		this.expectedTagName = diagnostic.expectedTagName;
		this.actualTagName = diagnostic.actualTagName;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
	}
}

export function missingElementLocatorError(
	locator: ProtocolViewPayload['locators'][number],
): RuntimeResumeError {
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISSING',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator did not match the document',
		message: `Resume locator ${locator.hostNodeId} expected <${locator.tagName}> at DOM order index ${String(locator.index)}.`,
		why: 'The markless/view payload points at an element that was not present in the resumed document. The runtime cannot safely attach events, behaviors, element handles, or DOM updates to a missing host node.',
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName: locator.tagName.toLowerCase(),
		suggestions: [
			{
				message:
					'Regenerate the markless/view payload from the same initial render output that the browser is resuming.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING',
	});
}

export function mismatchedElementLocatorError(
	locator: ProtocolViewPayload['locators'][number],
	actualTagName: string,
): RuntimeResumeError {
	const expectedTagName = locator.tagName.toLowerCase();
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISMATCH',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator matched a different element',
		message: `Resume locator ${locator.hostNodeId} expected <${expectedTagName}> at DOM order index ${String(locator.index)} but found <${actualTagName}>.`,
		why: 'The markless/view payload no longer matches the document being resumed. The runtime cannot safely reuse a DOM-order locator when the element at that position has a different tag.',
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName,
		actualTagName,
		suggestions: [
			{
				message:
					'Resume the exact document produced with the matching markless/view payload, or regenerate the payload after changing markup.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISMATCH',
	});
}

export function domOrderCommentLocator(index: number): string {
	return `dom-order-comment:${String(index)}`;
}

function domOrderLocator(index: number): string {
	return `dom-order:${String(index)}`;
}
