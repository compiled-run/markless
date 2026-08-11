import type { ResumePayloadScriptsResult } from './payload-full.ts';
import type { ResumeDomElement } from './resume.ts';

export type ResumeAlreadyResumedWarning = {
	readonly code: 'MARKLESS_RESUME_ALREADY_RESUMED';
	readonly severity: 'warning';
	readonly phase: 'resume';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

// The registry keys containers by identity alone; browser callers hold real DOM
// elements while resume-side callers hold the structural element surface.
export type ResumeContainerKey = ResumeDomElement | Element;

const resumedPayloadContainers = new WeakMap<ResumeContainerKey, ResumePayloadScriptsResult>();

export function getAlreadyResumedPayload(
	root: ResumeDomElement,
): ResumePayloadScriptsResult | undefined {
	const resumed = resumedPayloadContainers.get(root);
	return resumed && { ...resumed, warnings: [alreadyResumedWarning] };
}

export function setResumedPayload(
	root: ResumeDomElement,
	result: ResumePayloadScriptsResult,
): void {
	resumedPayloadContainers.set(root, result);
}

export function deleteResumedPayload(
	root: ResumeContainerKey,
): ResumePayloadScriptsResult | undefined {
	const resumed = resumedPayloadContainers.get(root);
	resumedPayloadContainers.delete(root);
	return resumed;
}

const alreadyResumedWarning: ResumeAlreadyResumedWarning = {
	code: 'MARKLESS_RESUME_ALREADY_RESUMED',
	severity: 'warning',
	phase: 'resume',
	title: 'This container was already resumed',
	message: 'resumeFromPayloadDocument was called again on an already live container.',
	why: 'Resume attaches graph and event wiring once per payload container.',
	suggestions: [
		{ message: 'Resume each served container once, or dispose before resuming again.' },
	],
	docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_ALREADY_RESUMED',
};
