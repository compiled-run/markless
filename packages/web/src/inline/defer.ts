import {
	PROTOCOL_IDLE_EVENT_NAME,
	PROTOCOL_VISIBLE_EVENT_NAME,
} from '../../../serializer/src/protocol-event-names.ts';
import { PROTOCOL_LOCATOR_PATHS_ATTRIBUTE } from '../../../serializer/src/protocol-locator-paths.ts';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE } from '../../../serializer/src/protocol-event-host.ts';

// The attribute name as a CSS attribute selector spells it: its `:` escaped.
const PROTOCOL_EVENT_HOST_SELECTOR = PROTOCOL_EVENT_HOST_ATTRIBUTE.replace(':', '\\:');
import {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
} from '../../../serializer/src/protocol-page-markers.ts';

/** Test seam: a root (or its prototype) may carry a clock that replaces the browser's frame and idle scheduling. */
export type MarklessDeferClock = {
	readonly idle: (run: () => void) => unknown;
	readonly frame: (run: () => void) => unknown;
};

export type MarklessDeferLane = 'visible' | 'idle';

type DeferRoot = Element & {
	__mFired?: WeakSet<Element>;
	__mClock?: MarklessDeferClock;
	__asyncResumeRuntimeStarted?: boolean;
	__marklessDelegatedDispatch?: boolean | string;
	__marklessArmRegistering?: Set<unknown>;
	__marklessCensus?: Array<Element | null>;
	__marklessShifted?: number;
	__marklessDispatch?: (input: Parameters<DeferModule['resumeContainerEvent']>[0]) => unknown;
	__mResume?: Promise<DeferModule>;
	__mL?: object;
};

type DeferModule = {
	resumeContainerEvent(input: {
		readonly root: Element;
		readonly event: {
			readonly type: string;
			readonly target: Element;
			readonly bubbles: false;
		};
		readonly element: Element;
	}): unknown;
};

export type MarklessDefer = ((
	root: Element | null | undefined,
	lane: MarklessDeferLane,
	ownsRoot: 0 | 1,
	eventName: string,
) => void) & {
	/** Runs `run` once the page has loaded, streamed arms have landed, and the browser is idle. */
	readonly idle: (root: Element, run: () => void) => void;
};

/**
 * The one startup helper deferred triggers share. Serialized whole into a served
 * page that has one; a client mount and the runtime call it directly. Hosts are
 * the elements whose event host attribute (`hostSelector`, escaped for a CSS
 * attribute selector) names the lane's event with a record;
 * `ownsRoot` adds the container itself, which hands records the runtime owns
 * (arms, rows) to the runtime.
 */
export function createMarklessDefer(
	loadModule: (url: string) => Promise<DeferModule>,
	pageStart: string,
	pageEnd: string,
	pathsAttribute: string,
	hostSelector: string,
): MarklessDefer {
	const scope = globalThis as typeof globalThis & {
		scheduler?: { postTask?: (run: () => void, options: { priority: string }) => unknown };
		__mArm?: { idle?: (run: () => void) => void };
	};
	const clockOf = (root: DeferRoot): MarklessDeferClock =>
		root.__mClock || {
			frame: (run) => requestAnimationFrame(run),
			idle: (run) =>
				scope.scheduler?.postTask
					? scope.scheduler.postTask(run, { priority: 'background' })
					: typeof requestIdleCallback === 'function'
						? requestIdleCallback(run, { timeout: 2000 })
						: setTimeout(run, 200),
		};
	// The page's elements only: an author's element as the container marks where the page starts and ends.
	const census = (root: DeferRoot): Element[] => {
		const live: Element[] = [root];
		const walker = document.createTreeWalker(root, 129);
		for (let next = walker.nextNode(); next; next = walker.nextNode())
			if (next.nodeType !== 8) live.push(next as Element);
			else if ((next as Comment).data === pageStart) live.length = 1;
			else if ((next as Comment).data === pageEnd) break;
		const paths = pathsAttribute && root.getAttribute?.(pathsAttribute);
		const order = paths && paths.split('|')[3];
		let signature = 0;
		if (order)
			for (const element of live.slice(1)) {
				const name = element.localName ?? element.tagName ?? '';
				signature = (signature * 31 + name.length * 32 + (name.charCodeAt(0) | 32)) | 0;
			}
		if (paths && (parseInt(paths) !== live.length || (order && order !== (signature >>> 0).toString(36))))
			root.__marklessShifted = 1;
		return live;
	};
	const idle = (root: DeferRoot, run: () => void) => {
		const clock = clockOf(root);
		// Records an arm is still registering would leave the event unmatched, so wait one more idle period.
		const next = () => clock.idle(() => (root.__marklessArmRegistering?.size ? next() : run()));
		const loaded = () =>
			clock.frame(() => (scope.__mArm?.idle ? scope.__mArm.idle(next) : next()));
		if (document.readyState === 'complete') loaded();
		else addEventListener('load', loaded, { once: true });
	};
	const trigger = (
		target: Element | null | undefined,
		lane: MarklessDeferLane,
		ownsRoot: 0 | 1,
		eventName: string,
	) => {
		const root = target as DeferRoot | null | undefined;
		const url = document.currentScript?.getAttribute('data-markless-resume-module');
		if (!root || !url) return;
		const life = (root.__mL ||= {});
		const fired = (root.__mFired ||= new WeakSet());
		const claimed = new WeakSet<Element>();
		let pending = 0;
		// A visible handler a started runtime would run itself is marked fired only once a lean run has.
		const claim = (host: Element): void => {
			if (fired.has(host) || claimed.has(host) || root.__mL !== life) return;
			const input = {
				root,
				event: { type: eventName, target: host, bubbles: false as const },
				element: host,
			};
			// A gesture already forwarded owns the root until its queue exists; join that queue behind it.
			const queue = root.__marklessDispatch;
			if (!queue && root.__marklessDelegatedDispatch === true)
				return idle(root, () => claim(host));
			claimed.add(host);
			if (lane !== 'visible') fired.add(host);
			root.__marklessCensus ||= census(root);
			root.__marklessDelegatedDispatch ||= eventName;
			pending++;
			(queue
				? Promise.resolve(queue(input))
				: (root.__mResume ||= loadModule(url)).then(
						(module) => root.__mL === life && module.resumeContainerEvent(input),
					)
			).then(() => {
				if (root.__asyncResumeRuntimeStarted) return;
				fired.add(host);
				if (!--pending && root.__marklessDelegatedDispatch === eventName)
					root.__marklessDelegatedDispatch = undefined;
			});
		};
		const hosts: Element[] = ownsRoot ? [root] : [];
		hosts.push(
			...root.querySelectorAll(
				`[${hostSelector}^="${eventName}:"],[${hostSelector}*=";${eventName}:"]`,
			),
		);
		if (lane === 'idle') return idle(root, () => hosts.forEach(claim));
		const observer = new IntersectionObserver((entries) => {
			if (root.__mL !== life) return observer.disconnect();
			for (const entry of entries)
				if (entry.isIntersecting) {
					observer.unobserve(entry.target);
					claim(entry.target);
				}
		});
		for (const host of hosts) observer.observe(host);
	};
	return Object.assign(trigger, { idle });
}

export const INLINE_DEFER_LOADER_SOURCE = '(url) => import(/* @vite-ignore */ url)';

/** An expression that installs the helper once per document and evaluates to it; a build passes the factory minified. */
export function inlineDeferSource(factory = createMarklessDefer.toString()): string {
	return `(globalThis.__mDefer||=(${factory})(${INLINE_DEFER_LOADER_SOURCE},${JSON.stringify(PROTOCOL_CONTAINER_START_COMMENT)},${JSON.stringify(PROTOCOL_CONTAINER_END_COMMENT)},${JSON.stringify(PROTOCOL_LOCATOR_PATHS_ATTRIBUTE)},${JSON.stringify(PROTOCOL_EVENT_HOST_SELECTOR)}))`;
}

/** One lane's registration, appended only to a served page whose records name that lane's event. */
export function createInlineDeferTriggerSource(lane: MarklessDeferLane, ownsRoot: boolean): string {
	const eventName = lane === 'idle' ? PROTOCOL_IDLE_EVENT_NAME : PROTOCOL_VISIBLE_EVENT_NAME;
	return `;${inlineDeferSource()}(document.currentScript?.closest('[data-async-container]'),${JSON.stringify(lane)},${ownsRoot ? 1 : 0},${JSON.stringify(eventName)});`;
}

let moduleDefer: MarklessDefer | undefined;

/** The helper for code that runs as a module: the served page's copy when it has one, never installed over it. */
export function marklessDefer(): MarklessDefer {
	return (
		(globalThis as typeof globalThis & { __mDefer?: MarklessDefer }).__mDefer ??
		(moduleDefer ||= createMarklessDefer(
			(url) => import(/* @vite-ignore */ url),
			PROTOCOL_CONTAINER_START_COMMENT,
			PROTOCOL_CONTAINER_END_COMMENT,
			PROTOCOL_LOCATOR_PATHS_ATTRIBUTE,
			PROTOCOL_EVENT_HOST_SELECTOR,
		))
	);
}
