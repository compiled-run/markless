import type { NativeJournalEntry, NativeViewPayload } from '@markless/serializer';
import { createNativeRuntime, type NativeAction } from './runtime.ts';

export const NATIVE_CONFORMANCE_VERSION = 'markless.native-conformance/0';

/** What every host must reproduce for a payload: the texts it mounts with, then the journal of each action in turn. */
export type NativeConformance = {
	readonly version: typeof NATIVE_CONFORMANCE_VERSION;
	readonly payload: NativeViewPayload;
	/** Present for a page: the route params it opens with. */
	readonly params?: Readonly<Record<string, string>>;
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
	/** Present when the payload has branches: `[branch, arm]`, arm null when none is shown. */
	readonly initialArms?: ReadonlyArray<readonly [node: string, index: number | null]>;
	/** Present when the payload has system sheets: `[sheet, open]`. */
	readonly initialSheets?: ReadonlyArray<readonly [node: string, open: boolean]>;
	readonly steps: ReadonlyArray<{
		readonly action: NativeAction;
		readonly journal: ReadonlyArray<NativeJournalEntry>;
	}>;
};

export function nativeConformance(
	payload: NativeViewPayload,
	actions: ReadonlyArray<NativeAction>,
	params?: Readonly<Record<string, string>>,
): NativeConformance {
	const runtime = createNativeRuntime(payload, new Map(), params);
	const initial = runtime.texts();
	const initialAttributes = runtime.attributes();
	const initialArms = runtime.arms();
	const initialProperties = runtime.properties();
	const initialRows = runtime.rows();
	const initialSheets = runtime.sheets();
	return {
		version: NATIVE_CONFORMANCE_VERSION,
		payload,
		...(params ? { params } : {}),
		initial,
		...(initialAttributes.length > 0 ? { initialAttributes } : {}),
		...(initialProperties.length > 0 ? { initialProperties } : {}),
		...(initialArms.length > 0 ? { initialArms } : {}),
		...(initialRows.length > 0 ? { initialRows } : {}),
		...(initialSheets.length > 0 ? { initialSheets } : {}),
		steps: actions.map((action) => ({ action, journal: runtime.dispatch(action) })),
	};
}
