import type { NativeArmPlace, NativeViewPayload } from '@markless/serializer';
import { isNativeStyleStateAttribute, nativeExprCells } from '@markless/serializer/native-view';
import { marklessAttributeValue } from '@markless/web/dom-attribute';
import type { NativeBuild, NativeStylesheet } from './compile.ts';
import { createNativeRuntime, evaluateNativeExpr, formatNativeValue } from './runtime.ts';

export const NATIVE_STYLE_INPUT_VERSION = 'markless.native-style-input/0';

/** A styled cell's value: true or false, or one of the strings the compiler found it can hold. */
export type NativeStyleValue = boolean | string;

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
					readonly when: Readonly<Record<string, NativeStyleValue>>;
					readonly value: string | null;
				}>;
				/**
				 * Each other bound attribute that reads a state, in every combination of `states`, as the web writes it; null
				 * means the attribute is absent. A bound attribute that reads no state is in `attributes` at its first value.
				 */
				readonly attributesByState?: Readonly<
					Record<
						string,
						ReadonlyArray<{
							readonly when: Readonly<Record<string, NativeStyleValue>>;
							readonly value: string | null;
						}>
					>
				>;
				readonly arm?: NativeArmPlace;
		  }
		| {
				readonly kind: 'text';
				readonly id: string;
				readonly parent: string;
				readonly text: string;
				/** The text in every combination of `states`, when it reads a state; Dragon lays out each string where it is shown. */
				readonly textByState?: ReadonlyArray<{
					readonly when: Readonly<Record<string, NativeStyleValue>>;
					readonly value: string;
				}>;
				readonly arm?: NativeArmPlace;
		  }
	>;
	/** The stylesheets the page imports (unscoped, in import order), then every shown component's scoped CSS. */
	readonly css: string;
	/** The cells class and `ui-*` attribute bindings read, each with every value it can hold; Dragon compiles one style assignment per combination. */
	readonly states: ReadonlyArray<{
		readonly cell: string;
		readonly domain: ReadonlyArray<NativeStyleValue>;
		readonly initial: NativeStyleValue;
	}>;
};

export function nativeStyleInput(
	payload: NativeViewPayload,
	styles: NativeBuild['styles'],
	stylesheets: ReadonlyArray<NativeStylesheet> = [],
): NativeStyleInput {
	const initial = new Map(createNativeRuntime(payload).texts());
	const states = payload.cells.flatMap((cell): NativeStyleInput['states'][number][] => {
		if (!cell.styled) return [];
		if (typeof cell.initial === 'boolean')
			return [{ cell: cell.id, domain: [false, true], initial: cell.initial }];
		if (typeof cell.initial === 'string' && cell.domain)
			return [{ cell: cell.id, domain: cell.domain, initial: cell.initial }];
		throw new Error(
			`${cell.name} decides a class or a ui-* attribute, but not every value it can hold is known at build time; Dragon needs a finite domain`,
		);
	});
	const combinations: Record<string, NativeStyleValue>[] = states.reduce<
		Record<string, NativeStyleValue>[]
	>(
		(all, state) =>
			all.flatMap((partial) =>
				state.domain.map((value) => ({ ...partial, [state.cell]: value })),
			),
		[{}],
	);
	const initialCells = new Map(payload.cells.map((cell) => [cell.id, cell.initial]));
	// A node in an arm not shown at mount still gets laid out: its literals and its cells' first values (an expression reads as '').
	const unshownText = (
		parts: Extract<NativeViewPayload['nodes'][number], { kind: 'text' }>['parts'],
	) =>
		parts
			.map((part) =>
				'text' in part
					? part.text
					: 'cell' in part
						? formatNativeValue(initialCells.get(part.cell) ?? '')
						: '',
			)
			.join('');
	return {
		version: NATIVE_STYLE_INPUT_VERSION,
		component: payload.component,
		nodes: payload.nodes.flatMap((node): NativeStyleInput['nodes'][number][] => {
			const place = node.arm ? { arm: node.arm } : {};
			if (node.kind === 'branch' || node.kind === 'repeat') return [];
			if (node.kind === 'sheet')
				throw new Error(
					`${payload.component}: styles reach Dragon as one page; a system sheet's content is a second root it does not lay out yet`,
				);
			if (node.kind === 'text') {
				const stateCells = new Set(states.map((state) => state.cell));
				const reads = node.parts.flatMap((part) =>
					'text' in part
						? []
						: 'cell' in part
							? [part.cell]
							: [...nativeExprCells(part.expr)],
				);
				const follows =
					!node.arm && reads.length > 0 && reads.every((cell) => stateCells.has(cell));
				const textByState = follows
					? combinations.map((when) => ({
							when,
							value: node.parts
								.map((part) =>
									'text' in part
										? part.text
										: formatNativeValue(
												'cell' in part
													? when[part.cell]!
													: evaluateNativeExpr(
															part.expr,
															(cell) => when[cell] ?? null,
														),
											),
								)
								.join(''),
						}))
					: [];
				return [
					{
						kind: 'text',
						id: node.id,
						parent: node.parent,
						text: initial.get(node.id) ?? unshownText(node.parts),
						...(textByState.some((entry) => entry.value !== textByState[0]!.value)
							? { textByState }
							: {}),
						...place,
					},
				];
			}
			const classBinding = (node.bindings ?? []).find(
				(binding) => 'attribute' in binding && binding.attribute === 'class',
			);
			const evaluate = (
				expr: Parameters<typeof evaluateNativeExpr>[0],
				when: Record<string, NativeStyleValue>,
			) =>
				evaluateNativeExpr(expr, (cell) =>
					cell in when
						? when[cell]!
						: (payload.cells.find((c) => c.id === cell)?.initial ?? null),
				);
			const classByState = classBinding
				? combinations.map((when) => {
						const value = evaluate(classBinding.value, when);
						return {
							when,
							value: value === null || value === false ? null : String(value),
						};
					})
				: undefined;
			const attributes: Record<string, string> = { ...node.attributes };
			const attributesByState: Record<
				string,
				{ when: Record<string, NativeStyleValue>; value: string | null }[]
			> = {};
			for (const binding of node.bindings ?? []) {
				if (!('attribute' in binding) || !isNativeStyleStateAttribute(binding.attribute))
					continue;
				const byState = combinations.map((when) => ({
					when,
					value:
						marklessAttributeValue(binding.attribute, evaluate(binding.value, when)) ??
						null,
				}));
				if (byState.every((entry) => entry.value === byState[0]!.value)) {
					if (byState[0]!.value !== null)
						attributes[binding.attribute] = byState[0]!.value;
				} else attributesByState[binding.attribute] = byState;
			}
			return [
				{
					kind: 'element',
					id: node.id,
					element: node.element,
					parent: node.parent,
					attributes,
					...(classByState ? { classByState } : {}),
					...(Object.keys(attributesByState).length > 0 ? { attributesByState } : {}),
					...place,
				},
			];
		}),
		css: [...stylesheets, ...styles].map((style) => style.cssText).join('\n'),
		states,
	};
}
