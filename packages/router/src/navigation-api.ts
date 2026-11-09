// The Navigation API surface the router touches, which TypeScript 5.9's DOM lib lacks. A module, not a
// global script, so the published declarations carry it and never collide with a lib that has it.

export type NavigationScrollBehavior = 'after-transition' | 'manual';
export type NavigationFocusReset = 'after-transition' | 'manual';
export type NavigationTypeString = 'push' | 'replace' | 'reload' | 'traverse';

export interface NavigationDestination {
	readonly url: string;
}

export interface NavigationInterceptOptions {
	readonly focusReset?: NavigationFocusReset;
	readonly scroll?: NavigationScrollBehavior;
	readonly handler?: () => Promise<void>;
}

export interface NavigateEvent extends Event {
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

export interface NavigationNavigateOptions {
	readonly history?: 'auto' | 'push' | 'replace';
	readonly info?: unknown;
	readonly state?: unknown;
}

export interface NavigationResult {
	readonly committed?: Promise<unknown>;
	readonly finished?: Promise<unknown>;
}

export interface NavigationEventMap {
	navigate: NavigateEvent;
}

export interface Navigation extends EventTarget {
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
