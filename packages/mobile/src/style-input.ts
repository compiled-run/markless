import type { NativeArmPlace, NativeViewPayload } from '@markless/serializer';
import { nativeStyleAttribute } from '@markless/serializer/native-view';
import { marklessAttributeValue } from '@markless/web/dom-attribute';
import type { NativeBuild, NativeStylesheet } from './compile.ts';
import { createNativeRuntime, evaluateNativeExpr, formatNativeValue } from './runtime.ts';
import { isMeasuredSnapPoint, SHEET_AREAS, sheetViewports } from './sheet-areas.ts';

export const NATIVE_STYLE_INPUT_VERSION = 'markless.native-style-input/0';

type NativeStyleByState = {
	readonly when: Readonly<Record<string, boolean>>;
	readonly value: string | null;
};

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
				readonly classByState?: ReadonlyArray<NativeStyleByState>;
				/** Each bound `ui-*` attribute's value in every combination of `states`, as the web writes it (null: absent). */
				readonly attributesByState?: Readonly<
					Record<string, ReadonlyArray<NativeStyleByState>>
				>;
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
	/** The stylesheets the page imports (unscoped, in import order), then every shown component's scoped CSS. */
	readonly css: string;
	/** The cells class and `ui-*` attribute bindings read; Dragon compiles one style assignment per combination (booleans only for now). */
	readonly states: ReadonlyArray<{
		readonly cell: string;
		readonly domain: readonly [false, true];
		readonly initial: boolean;
	}>;
	/** A system sheet's content at one resting height: the content area's size per target, in CSS px. */
	readonly viewports?: ReturnType<typeof sheetViewports>;
};

type PayloadNode = NativeViewPayload['nodes'][number];

/** The cells an expression reads. */
const cellsOf = (expr: unknown, into: Set<string>): Set<string> => {
	if (Array.isArray(expr)) for (const item of expr) cellsOf(item, into);
	else if (expr && typeof expr === 'object') {
		if ('cell' in expr && typeof expr.cell === 'string') into.add(expr.cell);
		for (const value of Object.values(expr)) cellsOf(value, into);
	}
	return into;
};

/**
 * A page's style inputs: the page without its system sheets, then each sheet's content once per resting height. Each
 * sheet's content is laid out as a document of its own, the size of the sheet's content area, with the page's CSS: the
 * frame around it is the platform's, and the page's elements are not its ancestors.
 */
export function nativeStyleInputs(
	payload: NativeViewPayload,
	styles: NativeBuild['styles'],
	stylesheets: ReadonlyArray<NativeStylesheet> = [],
): {
	readonly page: NativeStyleInput;
	readonly sheets: ReadonlyArray<{
		readonly node: string;
		readonly snapPoint: number;
		readonly input: NativeStyleInput;
	}>;
} {
	const byId = new Map(payload.nodes.map((node) => [node.id, node]));
	const sheetOf = (node: PayloadNode): string | null => {
		for (let at = node.parent; at !== null; at = byId.get(at)?.parent ?? null)
			if (byId.get(at)?.kind === 'sheet') return at;
		return null;
	};
	const rootOf = new Map(payload.nodes.map((node) => [node.id, sheetOf(node)]));
	const page = nativeStyleInput(
		payload,
		styles,
		stylesheets,
		payload.nodes.filter((node) => node.kind !== 'sheet' && rootOf.get(node.id) === null),
	);
	const sheets = payload.nodes.flatMap((sheet) => {
		if (sheet.kind !== 'sheet') return [];
		const content = payload.nodes.filter((node) => rootOf.get(node.id) === sheet.id);
		const unmeasured = sheet.snapPoints.filter((point) => !isMeasuredSnapPoint(point));
		if (unmeasured.length > 0)
			throw new Error(
				`${payload.component}: a styled system sheet rests at ${unmeasured.join(' and ')}, but its content is laid out only at the heights measured on both phones (${Object.keys(
					SHEET_AREAS.ios,
				)
					.map(Number)
					.sort((a, b) => a - b)
					.join(' and ')})`,
			);
		const read = cellsOf(
			content.flatMap((node) => (node.kind === 'element' ? (node.bindings ?? []) : [])),
			new Set(),
		);
		return sheet.snapPoints.map((snapPoint) => {
			const input = nativeStyleInput(payload, styles, stylesheets, content, sheet.id, read);
			return {
				node: sheet.id,
				snapPoint,
				input: {
					...input,
					component: `${payload.component}Sheet${payload.nodes.filter((node) => node.kind === 'sheet').indexOf(sheet)}`,
					viewports: sheetViewports(snapPoint as keyof typeof SHEET_AREAS.ios),
				},
			};
		});
	});
	return { page, sheets };
}

/**
 * One document for Dragon: `nodes` (the whole payload by default) with `root`'s children at the top, and the styled cells
 * among `cells` (all of them by default) as its states.
 */
export function nativeStyleInput(
	payload: NativeViewPayload,
	styles: NativeBuild['styles'],
	stylesheets: ReadonlyArray<NativeStylesheet> = [],
	nodes: ReadonlyArray<PayloadNode> = payload.nodes,
	root: string | null = null,
	cells?: ReadonlySet<string>,
): NativeStyleInput {
	const initial = new Map(createNativeRuntime(payload).texts());
	const states = payload.cells.flatMap((cell) => {
		if (!cell.styled || (cells && !cells.has(cell.id))) return [];
		if (typeof cell.initial !== 'boolean')
			throw new Error(
				`${cell.name} decides a class or a ui-* attribute but is not a boolean; Dragon needs a finite domain`,
			);
		return [{ cell: cell.id, domain: [false, true] as const, initial: cell.initial }];
	});
	const combinations: Record<string, boolean>[] = states.reduce<Record<string, boolean>[]>(
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
		nodes: nodes.flatMap((node): NativeStyleInput['nodes'][number][] => {
			const place = node.arm ? { arm: node.arm } : {};
			if (node.kind === 'branch' || node.kind === 'repeat') return [];
			if (node.kind === 'sheet')
				throw new Error(
					`${node.id}: a styled system sheet's content is laid out as its own document, which only the app style file carries (an app's pages/ folder)`,
				);
			if (node.kind === 'text')
				return [
					{
						kind: 'text',
						id: node.id,
						parent: node.parent,
						text: initial.get(node.id) ?? unshownText(node.parts),
						...place,
					},
				];
			const byState = (name: string) => {
				const binding = (node.bindings ?? []).find(
					(candidate) => 'attribute' in candidate && candidate.attribute === name,
				);
				return binding
					? combinations.map((when) => ({
							when,
							value: marklessAttributeValue(
								name,
								evaluateNativeExpr(binding.value, (cell) =>
									cell in when
										? when[cell]!
										: (payload.cells.find((c) => c.id === cell)?.initial ??
											null),
								),
							),
						}))
					: undefined;
			};
			const classByState = byState('class');
			const styleAttributes = (node.bindings ?? []).flatMap((binding) =>
				'attribute' in binding &&
				binding.attribute !== 'class' &&
				nativeStyleAttribute(binding.attribute)
					? [binding.attribute]
					: [],
			);
			const attributesByState = Object.fromEntries(
				styleAttributes.map((name) => [name, byState(name)!]),
			);
			return [
				{
					kind: 'element',
					id: node.id,
					element: node.element,
					parent: node.parent === root ? null : node.parent,
					attributes: node.attributes ?? {},
					...(classByState ? { classByState } : {}),
					...(styleAttributes.length > 0 ? { attributesByState } : {}),
					...place,
				},
			];
		}),
		css: [...stylesheets, ...styles].map((style) => style.cssText).join('\n'),
		states,
	};
}
