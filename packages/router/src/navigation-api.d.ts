// Minimal Navigation API types. TypeScript 5.9's DOM lib does not ship these
// yet, so this declares only the surface `spa-navigation.ts` and the router's
// client entry actually touch. Delete once lib.dom.d.ts covers the Navigation
// API and the names resolve on their own.

type NavigationScrollBehavior = 'after-transition' | 'manual';
type NavigationFocusReset = 'after-transition' | 'manual';
type NavigationTypeString = 'push' | 'replace' | 'reload' | 'traverse';

interface NavigationDestination {
	readonly url: string;
}

interface NavigationInterceptOptions {
	readonly focusReset?: NavigationFocusReset;
	readonly scroll?: NavigationScrollBehavior;
	readonly handler?: () => Promise<void>;
}

interface NavigateEvent extends Event {
	readonly canIntercept: boolean;
	readonly destination: NavigationDestination;
	readonly downloadRequest: string | null;
	readonly formData: FormData | null;
	readonly hashChange: boolean;
	// Caller-supplied value passed through `navigate({ info })`; untyped by the spec.
	readonly info: unknown;
	readonly navigationType: NavigationTypeString;
	readonly signal: AbortSignal;
	intercept(options?: NavigationInterceptOptions): void;
}

interface NavigationNavigateOptions {
	readonly history?: 'auto' | 'push' | 'replace';
	readonly info?: unknown;
	readonly state?: unknown;
}

interface NavigationResult {
	readonly committed: Promise<unknown>;
	readonly finished: Promise<unknown>;
}

interface NavigationEventMap {
	navigate: NavigateEvent;
}

interface Navigation extends EventTarget {
	addEventListener<K extends keyof NavigationEventMap>(
		type: K,
		listener: (event: NavigationEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
	navigate(url: string, options?: NavigationNavigateOptions): NavigationResult;
}
