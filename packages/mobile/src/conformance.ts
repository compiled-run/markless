import type { NativeJournalEntry, NativeViewPayload } from '@markless/serializer';
import { createNativeRuntime, type NativeAction } from './runtime.ts';

export const NATIVE_CONFORMANCE_VERSION = 'markless.native-conformance/0';

/** What every host must reproduce for a payload: the texts it mounts with, then the journal of each action in turn. */
export type NativeConformance = {
	readonly version: typeof NATIVE_CONFORMANCE_VERSION;
	readonly payload: NativeViewPayload;
	readonly initial: ReadonlyArray<readonly [node: string, text: string]>;
	/** Present when the payload binds attributes: `[node, name, value]`, value null when absent. */
	readonly initialAttributes?: ReadonlyArray<readonly [node: string, name: string, value: string | null]>;
	/** Present when the payload has branches: `[branch, arm]`, arm null when none is shown. */
	readonly initialArms?: ReadonlyArray<readonly [node: string, index: number | null]>;
	readonly steps: ReadonlyArray<{
		readonly action: NativeAction;
		readonly journal: ReadonlyArray<NativeJournalEntry>;
	}>;
};

export function nativeConformance(
	payload: NativeViewPayload,
	actions: ReadonlyArray<NativeAction>,
): NativeConformance {
	const runtime = createNativeRuntime(payload);
	const initial = runtime.texts();
	const initialAttributes = runtime.attributes();
	const initialArms = runtime.arms();
	return {
		version: NATIVE_CONFORMANCE_VERSION,
		payload,
		initial,
		...(initialAttributes.length > 0 ? { initialAttributes } : {}),
		...(initialArms.length > 0 ? { initialArms } : {}),
		steps: actions.map((action) => ({ action, journal: runtime.dispatch(action) })),
	};
}
