import type { NativeArmPlace, NativeViewPayload } from '@markless/serializer';
import type { NativeBuild } from './compile.ts';
import { createNativeRuntime, evaluateNativeExpr, formatNativeValue } from './runtime.ts';

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
				/** The element's class in every combination of `states`, when a binding sets it; null means no class attribute. */
				readonly classByState?: ReadonlyArray<{
					readonly when: Readonly<Record<string, boolean>>;
					readonly value: string | null;
				}>;
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
	/** The cells class bindings read; Dragon compiles one style assignment per combination (booleans only for now). */
	readonly states: ReadonlyArray<{ readonly cell: string; readonly domain: readonly [false, true]; readonly initial: boolean }>;
};

export function nativeStyleInput(
	payload: NativeViewPayload,
	styles: NativeBuild['styles'],
): NativeStyleInput {
	const initial = new Map(createNativeRuntime(payload).texts());
	const states = payload.cells.flatMap((cell) => {
		if (!cell.styled) return [];
		if (typeof cell.initial !== 'boolean')
			throw new Error(`${cell.name} decides a class but is not a boolean; Dragon needs a finite domain`);
		return [{ cell: cell.id, domain: [false, true] as const, initial: cell.initial }];
	});
	const combinations: Record<string, boolean>[] = states.reduce<Record<string, boolean>[]>(
		(all, state) => all.flatMap((partial) => state.domain.map((value) => ({ ...partial, [state.cell]: value }))),
		[{}],
	);
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
			const classBinding = (node.bindings ?? []).find((binding) => binding.attribute === 'class');
			const classByState = classBinding
				? combinations.map((when) => {
						const value = evaluateNativeExpr(classBinding.value, (cell) =>
							cell in when ? when[cell]! : (payload.cells.find((c) => c.id === cell)?.initial ?? null),
						);
						return { when, value: value === null || value === false ? null : String(value) };
					})
				: undefined;
			return [
				{
					kind: 'element',
					id: node.id,
					element: node.element,
					parent: node.parent,
					attributes: node.attributes ?? {},
					...(classByState ? { classByState } : {}),
					...place,
				},
			];
		}),
		css: styles.map((style) => style.cssText).join('\n'),
		states,
	};
}
