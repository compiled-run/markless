import type {
	NativeAppPayload,
	NativeJournalEntry,
	NativeValue,
	NativeViewPayload,
} from '@markless/serializer';
import {
	createNativeRuntime,
	nativeRoutePath,
	type NativeAction,
	type NativeRuntime,
	type NativeScriptHost,
} from './runtime.ts';

export { nativeRoutePath };

/** One screen on the stack: the route it shows, the path it opened at and its page's live runtime. */
export type NativeScreen = {
	readonly route: string;
	readonly params: Readonly<Record<string, string>>;
	readonly path: string;
	/** The query it opened with (`?tab=done`, or ''). */
	readonly search: string;
	readonly runtime: NativeRuntime;
};

/** What a host does with one person's action in an app: run a handler on the top screen, or go back. */
export type NativeAppAction = NativeAction | { readonly event: 'back' };

export type NativeAppRuntime = {
	/** The stack, bottom first; the last screen is the one shown. */
	readonly screens: () => ReadonlyArray<NativeScreen>;
	/**
	 * Runs an action on the top screen. A `navigate` entry pushes the new page's screen (or, with `replace`, puts it in
	 * the top screen's place); `back` pops the top screen and shows the one below exactly as it was left.
	 */
	readonly dispatch: (action: NativeAppAction) => ReadonlyArray<NativeJournalEntry>;
	/** What starting the screens the app opened with asked for, bottom first (their async values' requests and timers). */
	readonly started: ReadonlyArray<NativeJournalEntry>;
};

const decode = (segment: string): string => {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
};

const segmentsOf = (path: string): string[] =>
	path.split('/').filter((segment) => segment.length > 0);

/**
 * The route a path opens, as every host matches it: the first route in payload order (the router's: static segments
 * before `[name]`) whose segments all match, a `[name]` segment taking one path segment, URL-decoded.
 */
export function matchNativeRoute(
	app: NativeAppPayload,
	path: string,
):
	| {
			readonly route: NativeAppPayload['routes'][number];
			readonly params: Record<string, string>;
	  }
	| undefined {
	const segments = segmentsOf(path);
	for (const route of app.routes) {
		const pattern = segmentsOf(route.pattern);
		if (pattern.length !== segments.length) continue;
		const params: Record<string, string> = {};
		const matches = pattern.every((part, index) => {
			const segment = decode(segments[index]!);
			if (part.startsWith('[') && part.endsWith(']')) {
				params[part.slice(1, -1)] = segment;
				return true;
			}
			return part === segment;
		});
		if (matches) return { route, params };
	}
	return undefined;
}

/**
 * The back stack an app opens with at `path`: every leading part of the path that is itself a route, shortest first,
 * ending with the path. `/orders/42` in an app with `/`, `/orders` and `/orders/[id]` opens three screens deep.
 */
export function nativeBackStack(app: NativeAppPayload, path: string): string[] {
	const segments = segmentsOf(path);
	const stack: string[] = [];
	for (let length = 0; length <= segments.length; length++) {
		const prefix = `/${segments.slice(0, length).join('/')}`;
		if (matchNativeRoute(app, prefix)) stack.push(prefix);
	}
	if (stack.at(-1) !== `/${segments.join('/')}`)
		throw new Error(`${path} is not a route of this app`);
	return stack;
}

/** The reference meaning of an app's navigation; the hosts' stacks are checked against it. */
export function createNativeAppRuntime(
	app: NativeAppPayload,
	path: string,
	store: Map<string, NativeValue> = new Map(),
	/** One engine for the whole app, as a phone has: started by the first screen that needs it. */
	scriptHost?: NativeScriptHost,
): NativeAppRuntime {
	const session = new Map<string, NativeValue>();
	const open = (
		route: string,
		params: Readonly<Record<string, string>>,
		search = '',
	): NativeScreen => {
		const entry = app.routes.find((candidate) => candidate.pattern === route);
		if (!entry) throw new Error(`no page for ${route}`);
		return {
			route,
			params,
			path: nativeRoutePath(route, params),
			search,
			runtime: createNativeRuntime(
				entry.page as NativeViewPayload,
				store,
				params,
				undefined,
				undefined,
				scriptHost,
				session,
				undefined,
				undefined,
				undefined,
				search,
			),
		};
	};
	const screens: NativeScreen[] = nativeBackStack(app, path).map((prefix) => {
		const matched = matchNativeRoute(app, prefix)!;
		return open(matched.route.pattern, matched.params);
	});
	const started = screens.flatMap((screen) => screen.runtime.start());
	return {
		screens: () => [...screens],
		started,
		// A screen that leaves aborts its async values; a new one starts its own after the `navigate` entry.
		dispatch(action) {
			if (action.event === 'back') {
				if (screens.length < 2) throw new Error('back on the first screen leaves the app');
				return [...screens.pop()!.runtime.leave(), ...screens.at(-1)!.runtime.resume()];
			}
			const journal = screens.at(-1)!.runtime.dispatch(action);
			const last = journal.at(-1);
			if (last?.op === 'navigate') {
				const next = open(last.route, last.params, last.search);
				const left = last.replace ? screens.pop()!.runtime.leave() : [];
				screens.push(next);
				return [...journal, ...left, ...next.runtime.start()];
			}
			return journal;
		},
	};
}
