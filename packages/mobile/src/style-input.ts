import type { NativeArmPlace, NativeViewPayload } from '@markless/serializer';
import { fontFaceSources } from '@markless/compiler/native';
import { isNativeStyleStateAttribute, nativeExprCells } from '@markless/serializer/native-view';
import { marklessAttributeValue } from '@markless/web/dom-attribute';
import type { NativeBuild, NativeStylesheet } from './compile.ts';
import { createNativeRuntime, evaluateNativeExpr, formatNativeValue } from './runtime.ts';
import { isMeasuredSnapPoint, SHEET_AREAS, sheetViewports } from './sheet-areas.ts';

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
				/** A markup ancestor of a sheet's content: there for its selectors and inheritance, with no box of its own. */
				readonly boxless?: true;
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
	/** A system sheet's content at one resting height: the content area's size per target, in CSS px. */
	readonly viewports?: ReturnType<typeof sheetViewports>;
	/**
	 * Each relative `@font-face` src url of the stylesheets, as `css` spells it, and the font file it names, resolved against its
	 * stylesheet's file. Written to disk with `file` relative to the input file (`nativeStyleInputAt`).
	 */
	readonly fonts?: ReadonlyArray<{ readonly url: string; readonly file: string }>;
};

const URL_ROOT = 'https://markless.invalid/';

/** The font files the stylesheets' `@font-face` rules name by a relative url, resolved as the web resolves a stylesheet's url(). */
export function stylesheetFonts(
	stylesheets: ReadonlyArray<NativeStylesheet>,
): NonNullable<NativeStyleInput['fonts']> {
	const fonts = new Map<string, { readonly url: string; readonly file: string; readonly sheet: string }>();
	for (const sheet of stylesheets) {
		const absolute = sheet.file.startsWith('/');
		const base = new URL(sheet.file.split('/').map(encodeURIComponent).join('/'), URL_ROOT);
		for (const url of fontFaceSources(sheet.cssText)) {
			if (URL.canParse(url) || url.startsWith('/')) continue;
			const path = decodeURIComponent(new URL(url, base).pathname);
			const file = absolute ? path : path.slice(1);
			const seen = fonts.get(url);
			if (seen && seen.file !== file)
				throw new Error(
					`${sheet.file} and ${seen.sheet} both name the font url ${url}, for ${file} and ${seen.file}; the joined CSS cannot tell them apart`,
				);
			fonts.set(url, { url, file, sheet: sheet.file });
		}
	}
	return [...fonts.values()].map(({ url, file }) => ({ url, file }));
}

/** The input as written at a path: each font file given relative to the input file by `relativeFile`. */
export function nativeStyleInputAt(
	input: NativeStyleInput,
	relativeFile: (file: string) => string,
): NativeStyleInput {
	return input.fonts
		? { ...input, fonts: input.fonts.map(({ url, file }) => ({ url, file: relativeFile(file) })) }
		: input;
}

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
		// The content is written as a child in the page's markup: its ancestors match selectors and pass inherited values.
		const ancestors: PayloadNode[] = [];
		for (let at = sheet.parent; at !== null; at = byId.get(at)?.parent ?? null)
			ancestors.unshift(byId.get(at)!);
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
			[...ancestors, ...content].flatMap((node) =>
				node.kind === 'element' ? (node.bindings ?? []) : [],
			),
			new Set(),
		);
		return sheet.snapPoints.map((snapPoint) => {
			const input = nativeStyleInput(
				payload,
				styles,
				stylesheets,
				[...ancestors, ...content],
				{
					id: sheet.id,
					parent: sheet.parent,
					boxless: new Set(ancestors.map((node) => node.id)),
				},
				read,
			);
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
	sheet?: {
		readonly id: string;
		readonly parent: string | null;
		readonly boxless: ReadonlySet<string>;
	},
	cells?: ReadonlySet<string>,
): NativeStyleInput {
	const fonts = stylesheetFonts(stylesheets);
	const initial = new Map(createNativeRuntime(payload).texts());
	const states = payload.cells.flatMap((cell): NativeStyleInput['states'][number][] => {
		if (!cell.styled || (cells && !cells.has(cell.id))) return [];
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
		nodes: nodes.flatMap((node): NativeStyleInput['nodes'][number][] => {
			const place = node.arm ? { arm: node.arm } : {};
			if (node.kind === 'branch' || node.kind === 'repeat') return [];
			if (node.kind === 'sheet')
				throw new Error(
					`${node.id}: a styled system sheet's content is laid out as its own document, which only the app style file carries (an app's pages/ folder)`,
				);
			if (node.kind === 'text') {
				const parent = node.parent;
				if (parent === null)
					throw new Error(
						`${payload.component}: text outside any element reaches Dragon with no box to lay it out in`,
					);
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
						parent: sheet && parent === sheet.id ? sheet.parent! : parent,
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
					parent: sheet && node.parent === sheet.id ? sheet.parent : node.parent,
					attributes,
					...(classByState ? { classByState } : {}),
					...(Object.keys(attributesByState).length > 0 ? { attributesByState } : {}),
					...(sheet?.boxless.has(node.id) ? { boxless: true as const } : {}),
					...place,
				},
			];
		}),
		css: [...stylesheets, ...styles].map((style) => style.cssText).join('\n'),
		states,
		...(fonts.length > 0 ? { fonts } : {}),
	};
}
