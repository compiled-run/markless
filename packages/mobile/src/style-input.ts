import type { NativeViewPayload } from '@markless/serializer';
import type { NativeBuild } from './compile.ts';
import { createNativeRuntime } from './runtime.ts';

export const NATIVE_STYLE_INPUT_VERSION = 'markless.native-style-input/0';

/** What Markless hands Dragon for one component: its element tree, each text node's first string and its scoped CSS. */
export type NativeStyleInput = {
	readonly version: typeof NATIVE_STYLE_INPUT_VERSION;
	readonly component: string;
	readonly nodes: ReadonlyArray<
		| {
				readonly kind: 'element';
				readonly id: string;
				readonly element: string;
				readonly parent: string | null;
				readonly attributes: Readonly<Record<string, string>>;
		  }
		| { readonly kind: 'text'; readonly id: string; readonly parent: string; readonly text: string }
	>;
	readonly css: string;
};

export function nativeStyleInput(
	payload: NativeViewPayload,
	styles: NativeBuild['styles'],
): NativeStyleInput {
	const initial = new Map(createNativeRuntime(payload).texts());
	return {
		version: NATIVE_STYLE_INPUT_VERSION,
		component: payload.component,
		nodes: payload.nodes.map((node) =>
			node.kind === 'element'
				? {
						kind: 'element',
						id: node.id,
						element: node.element,
						parent: node.parent,
						attributes: node.attributes ?? {},
					}
				: { kind: 'text', id: node.id, parent: node.parent, text: initial.get(node.id) ?? '' },
		),
		css: styles.map((style) => style.cssText).join('\n'),
	};
}
