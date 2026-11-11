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
const disposedPayloadContainers = new WeakMap<ResumeContainerKey, ResumePayloadScriptsResult>();

export function getAlreadyResumedPayload(
	root: ResumeDomElement,
): ResumePayloadScriptsResult | undefined {
	const resumed = resumedPayloadContainers.get(root);
	return resumed && { ...resumed, warnings: [alreadyResumedWarning] };
}

/**
 * The answer for a gesture that reached the runtime after its container was
 * disposed AND taken out of the document: a resume that no longer has a page to
 * run on. Booting one again re-reads the served locators against DOM the first
 * runtime already edited, which refuses with a locator mismatch nothing can act
 * on; the event resolves as a no-op instead. A disposed container still in the
 * document is the documented dispose-then-resume-again case and re-boots.
 *
 * A wake gets the same answer on any out-of-document root, filed or not: a
 * container torn down before its first resume finished never reached
 * `setResumedPayload`, so nothing files it, and the late wake would boot a whole
 * runtime against a dead page. The generated wake handoff marks the root with
 * `__asyncResumeRuntimeStarted` before calling in; an explicit
 * `resumeFromPayloadDocument` carries no such mark and stays loud on a detached
 * element.
 */
export function getRetiredResumedPayload(
	root: ResumeContainerKey,
): ResumePayloadScriptsResult | undefined {
	if ((root as { readonly isConnected?: boolean }).isConnected !== false) return undefined;
	const disposed = disposedPayloadContainers.get(root);
	if (disposed)
		return { ...disposed, runtime: { ...disposed.runtime, dispatch: () => Promise.resolve() } };
	return (root as { readonly __asyncResumeRuntimeStarted?: boolean }).__asyncResumeRuntimeStarted
		? wakeNoopResume
		: undefined;
}

// Wake callers read `runtime` and dispatch through it; a container with no live
// resume behind it has no records left to reconstruct.
export const wakeNoopResume = {
	runtime: { dispatch: () => Promise.resolve() },
} as unknown as ResumePayloadScriptsResult;

export function setResumedPayload(
	root: ResumeDomElement,
	result: ResumePayloadScriptsResult,
): void {
	disposedPayloadContainers.delete(root);
	resumedPayloadContainers.set(root, result);
}

export function deleteResumedPayload(
	root: ResumeContainerKey,
): ResumePayloadScriptsResult | undefined {
	const resumed = resumedPayloadContainers.get(root);
	resumedPayloadContainers.delete(root);
	if (resumed) disposedPayloadContainers.set(root, resumed);
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

// A navigation that removes a container calls this on its root: listeners, subscriptions, overlays and storage writes stop with it.
export const CONTAINER_RETIRE_PROPERTY = '__marklessRetire';

export type RetirableContainer = { [CONTAINER_RETIRE_PROPERTY]?: () => void };

// The events a container has received and not yet handled: an in-place navigation retires the page only once they are.
export const CONTAINER_HANDLING_PROPERTY = '__mH';

// By event: a promise and what settles it, settled once the handlers ran, one awaits its own work, or one returns a promise. Only a started runtime opens entries.
export type ContainerHandling = Map<object, readonly [handled: Promise<unknown>, settle: () => void]>;
export type HandlingRoot = { [CONTAINER_HANDLING_PROPERTY]?: ContainerHandling };

export function marklessEventReceived(root: object, event: object): () => void {
	const handling = ((root as HandlingRoot)[CONTAINER_HANDLING_PROPERTY] ??= new Map());
	const entry = handling.get(event);
	if (entry) return entry[1];
	let resolve!: () => void;
	const handled = new Promise<void>((done) => (resolve = done));
	const settle = () => (resolve(), handling.delete(event));
	handling.set(event, [handled, settle]);
	return settle;
}

export function marklessEventHandled(root: object, event: object): void {
	(root as HandlingRoot)[CONTAINER_HANDLING_PROPERTY]?.get(event)?.[1]();
}
