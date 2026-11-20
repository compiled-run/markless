import type { NativeAppPayload, NativeJournalEntry, NativeViewPayload } from '@markless/serializer';
import { createNativeAppRuntime, type NativeAppAction } from './app.ts';
import { createNativeRuntime, type NativeAction, type NativeScriptHost } from './runtime.ts';

export const NATIVE_CONFORMANCE_VERSION = 'markless.native-conformance/0';

/** What every host must reproduce for a payload: the texts it mounts with, then the journal of each action in turn. */
export type NativeConformance = {
	readonly version: typeof NATIVE_CONFORMANCE_VERSION;
	readonly payload: NativeViewPayload;
	/** Present for a page: the route params it opens with. */
	readonly params?: Readonly<Record<string, string>>;
	/** Present when the device's preferred languages matter (the web's messages); otherwise `['en']`. */
	readonly preferredLanguages?: ReadonlyArray<string>;
	/** Present when the payload reads the clock: what the device's clock reads throughout, in ms since 1970 (UTC). */
	readonly now?: number;
	readonly initial: ReadonlyArray<readonly [node: string, text: string]>;
	/** Present when the payload binds attributes: `[node, name, value]`, value null when absent. */
	readonly initialAttributes?: ReadonlyArray<
		readonly [node: string, name: string, value: string | null]
	>;
	/** Present when the payload binds an input's value: `[node, 'value', text]`. */
	readonly initialProperties?: ReadonlyArray<
		readonly [node: string, name: 'value', value: string]
	>;
	/** Present when the payload has lists: `[repeat, keys]`. */
	readonly initialRows?: ReadonlyArray<readonly [node: string, keys: ReadonlyArray<string>]>;
	/** Present when the payload has checkboxes or radio buttons: `[node, checked]`. */
	readonly initialChecks?: ReadonlyArray<readonly [node: string, checked: boolean]>;
	/** Present when the payload has selects: `[option, selected]` for each shown option, in tree order. */
	readonly initialSelections?: ReadonlyArray<readonly [node: string, selected: boolean]>;
	/** Present when the payload has branches: `[branch, arm]`, arm null when none is shown. */
	readonly initialArms?: ReadonlyArray<readonly [node: string, index: number | null]>;
	/** Present when the payload has system sheets: `[sheet, open]`. */
	readonly initialSheets?: ReadonlyArray<readonly [node: string, open: boolean]>;
	/** Present when the payload has task cells: the calls a host starts at mount, in cell order. */
	readonly tasks?: ReadonlyArray<Extract<NativeJournalEntry, { op: 'call' }>>;
	/** Present when the payload has async values the script computes: the journal of starting them, after the tasks. */
	readonly start?: ReadonlyArray<NativeJournalEntry>;
	/** Present when leaving the screen after the last step cancels requests: that journal. */
	readonly leave?: ReadonlyArray<NativeJournalEntry>;
	readonly steps: ReadonlyArray<{
		readonly action: NativeAction;
		readonly journal: ReadonlyArray<NativeJournalEntry>;
	}>;
};

export function nativeConformance(
	payload: NativeViewPayload,
	actions: ReadonlyArray<NativeAction>,
	params?: Readonly<Record<string, string>>,
	preferredLanguages?: ReadonlyArray<string>,
	now?: number,
	/** The engine a payload with a script runs in; a host's own (JavaScriptCore, Hermes) must give the same journals. */
	scriptHost?: NativeScriptHost,
): NativeConformance {
	const runtime = createNativeRuntime(payload, new Map(), params, preferredLanguages, now === undefined ? undefined : () => now, scriptHost);
	const initial = runtime.texts();
	const initialAttributes = runtime.attributes();
	const initialArms = runtime.arms();
	const initialProperties = runtime.properties();
	const initialRows = runtime.rows();
	const initialSheets = runtime.sheets();
	const tasks = runtime.tasks();
	const initialChecks = runtime.checks();
	const initialSelections = runtime.selections();
	const start = runtime.start();
	const steps = actions.map((action) => ({ action, journal: runtime.dispatch(action) }));
	const leave = payload.cells.some((cell) => cell.async) ? runtime.leave() : [];
	return {
		version: NATIVE_CONFORMANCE_VERSION,
		payload,
		...(params ? { params } : {}),
		...(preferredLanguages ? { preferredLanguages } : {}),
		...(now === undefined ? {} : { now }),
		initial,
		...(initialAttributes.length > 0 ? { initialAttributes } : {}),
		...(initialProperties.length > 0 ? { initialProperties } : {}),
		...(initialArms.length > 0 ? { initialArms } : {}),
		...(initialRows.length > 0 ? { initialRows } : {}),
		...(initialSheets.length > 0 ? { initialSheets } : {}),
		...(tasks.length > 0 ? { tasks } : {}),
		...(initialChecks.length > 0 ? { initialChecks } : {}),
		...(initialSelections.length > 0 ? { initialSelections } : {}),
		...(start.length > 0 ? { start } : {}),
		steps,
		...(leave.length > 0 ? { leave } : {}),
	};
}

export const NATIVE_APP_CONFORMANCE_VERSION = 'markless.native-app-conformance/0';

/**
 * What every host's stack must reproduce for an app: the screens it opens with at `open`, then for each action (a tap
 * or input on the top screen, or `back`) its journal, the stack after it (paths, bottom first) and what the top screen
 * shows: its title and texts, which after `back` are the ones the screen was left with.
 */
export type NativeAppConformance = {
	readonly version: typeof NATIVE_APP_CONFORMANCE_VERSION;
	readonly app: NativeAppPayload;
	readonly open: string;
	/** Present when a screen it opens with has async values the script computes: the journal of starting them. */
	readonly started?: ReadonlyArray<NativeJournalEntry>;
	readonly initial: NativeAppConformanceScreen;
	readonly steps: ReadonlyArray<
		{
			readonly action: NativeAppAction;
			readonly journal: ReadonlyArray<NativeJournalEntry>;
		} & NativeAppConformanceScreen
	>;
};

type NativeAppConformanceScreen = {
	readonly stack: ReadonlyArray<string>;
	readonly title: string | null;
	readonly texts: ReadonlyArray<readonly [node: string, text: string]>;
};

export function nativeAppConformance(
	app: NativeAppPayload,
	open: string,
	actions: ReadonlyArray<NativeAppAction>,
	scriptHost?: NativeScriptHost,
): NativeAppConformance {
	const runtime = createNativeAppRuntime(app, open, new Map(), scriptHost);
	const look = (): NativeAppConformanceScreen => {
		const screens = runtime.screens();
		const top = screens.at(-1)!.runtime;
		return {
			stack: screens.map((screen) => screen.path),
			title: top.title(),
			texts: top.texts(),
		};
	};
	return {
		version: NATIVE_APP_CONFORMANCE_VERSION,
		app,
		open,
		...(runtime.started.length > 0 ? { started: runtime.started } : {}),
		initial: look(),
		steps: actions.map((action) => ({ action, journal: runtime.dispatch(action), ...look() })),
	};
}
