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

// A container root's boot is one record; `nextBoot` is the only thing that changes it.
// Each event is numbered after the phase it moves to; SETTLE (a start promise settling) resolves to
// ABANDONED when the page lifetime changed under it, else back to DISPOSED or UNWOKEN.
export const UNWOKEN = 0;
export const BOOTING = 1;
export const LIVE = 2;
export const DISPOSED = 3;
export const ABANDONED = 4;
export const WAKE = BOOTING;
export const GO_LIVE = LIVE;
export const DISPOSE = DISPOSED;
export const SETTLE = 5;

export type BootPhase =
	| typeof UNWOKEN
	| typeof BOOTING
	| typeof LIVE
	| typeof DISPOSED
	| typeof ABANDONED;
export type BootEvent = typeof WAKE | typeof GO_LIVE | typeof DISPOSE | typeof SETTLE;

// Short field names: these are rendered into every page that resumes.
export type ContainerBoot = {
	/** The phase; missing means unwoken. */
	p?: BootPhase;
	/** The page lifetime (`__mL`) the latest boot started for. */
	l?: unknown;
	/** The latest boot's start promise. */
	s?: Promise<ResumePayloadScriptsResult>;
	/** The live result while live, else the last disposed one. */
	r?: ResumePayloadScriptsResult;
};

/** Moves `boot` on `event` and returns the phase it left. WAKE takes the start promise, GO_LIVE the result, SETTLE the settling start. */
export function nextBoot(
	boot: ContainerBoot,
	event: BootEvent,
	life?: unknown,
	value?: unknown,
): BootPhase | undefined {
	const phase = boot.p;
	if (event === WAKE) {
		if (import.meta.env?.DEV && (phase === LIVE || (phase === BOOTING && boot.l === life)))
			throw new Error(`Container boot cannot wake in phase ${phase}`);
		boot.l = life;
		boot.s = value as ContainerBoot['s'];
	} else if (event === GO_LIVE) {
		if (import.meta.env?.DEV && phase !== BOOTING)
			throw new Error(`Container boot cannot go live in phase ${phase}`);
		boot.r = value as ContainerBoot['r'];
	} else if (event === DISPOSE ? phase !== LIVE : phase !== BOOTING || boot.s !== value)
		return phase;
	boot.p = event !== SETTLE ? event : boot.l !== life ? ABANDONED : boot.r ? DISPOSED : UNWOKEN;
	return phase;
}

const boots = new WeakMap<object, ContainerBoot>();

export function readBoot(root: object): ContainerBoot {
	let boot = boots.get(root);
	if (!boot) boots.set(root, (boot = {}));
	return boot;
}

export function getAlreadyResumedPayload(
	root: ResumeDomElement,
): ResumePayloadScriptsResult | undefined {
	const { p, r } = readBoot(root);
	return p === LIVE ? { ...r!, warnings: [alreadyResumedWarning] } : undefined;
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
 * the live record, so nothing files it, and the late wake would boot a whole
 * runtime against a dead page. The generated wake handoff marks the root with
 * `__asyncResumeRuntimeStarted` before calling in; an explicit
 * `resumeFromPayloadDocument` carries no such mark and stays loud on a detached
 * element.
 */
export function getRetiredResumedPayload(
	root: ResumeContainerKey,
): ResumePayloadScriptsResult | undefined {
	if ((root as { readonly isConnected?: boolean }).isConnected !== false) return undefined;
	const { p, r: disposed } = readBoot(root);
	if (p !== LIVE && disposed)
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

export function deleteResumedPayload(
	root: ResumeContainerKey,
): ResumePayloadScriptsResult | undefined {
	const boot = readBoot(root);
	return nextBoot(boot, DISPOSE) === LIVE ? boot.r : undefined;
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
