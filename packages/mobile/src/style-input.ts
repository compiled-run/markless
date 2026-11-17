import type { NativeArmPlace, NativeViewPayload } from '@markless/serializer';
import type { NativeBuild } from './compile.ts';
import { createNativeRuntime, formatNativeValue } from './runtime.ts';

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
				/** Every class string a binding can give the element, so Dragon styles each one. */
				readonly classes?: ReadonlyArray<string>;
				readonly arm?: NativeArmPlace;
		  }
		| {
				readonly kind: 'text';
				readonly id: string;
				readonly parent: string;
				readonly text: string;
				readonly arm?: NativeArmPlace;
		  }
	>;
	readonly css: string;
};

export function nativeStyleInput(
	payload: NativeViewPayload,
	styles: NativeBuild['styles'],
): NativeStyleInput {
	const initial = new Map(createNativeRuntime(payload).texts());
	const initialCells = new Map(payload.cells.map((cell) => [cell.id, cell.initial]));
	// A node in an arm not shown at mount still gets laid out: its literals and its cells' first values (an expression reads as '').
	const unshownText = (parts: Extract<NativeViewPayload['nodes'][number], { kind: 'text' }>['parts']) =>
		parts
			.map((part) =>
				'text' in part ? part.text : 'cell' in part ? formatNativeValue(initialCells.get(part.cell) ?? '') : '',
			)
			.join('');
	return {
		version: NATIVE_STYLE_INPUT_VERSION,
		component: payload.component,
		nodes: payload.nodes.flatMap((node): NativeStyleInput['nodes'][number][] => {
			const place = node.arm ? { arm: node.arm } : {};
			if (node.kind === 'branch') return [];
			if (node.kind === 'text')
				return [{ kind: 'text', id: node.id, parent: node.parent, text: initial.get(node.id) ?? unshownText(node.parts), ...place }];
			const classes = (node.bindings ?? []).flatMap((binding) =>
				binding.attribute === 'class' && 'if' in binding.value
					? [binding.value.whenTrue, binding.value.whenFalse].flatMap((arm) =>
							'literal' in arm && typeof arm.literal === 'string' ? [arm.literal] : [],
						)
					: [],
			);
			return [
				{
					kind: 'element',
					id: node.id,
					element: node.element,
					parent: node.parent,
					attributes: node.attributes ?? {},
					...(classes.length > 0 ? { classes } : {}),
					...place,
				},
			];
		}),
		css: styles.map((style) => style.cssText).join('\n'),
	};
}
