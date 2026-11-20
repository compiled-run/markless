import type {
	NativeColor,
	NativeDrawing,
	NativeDrawingText,
	NativeDrawingTextRun,
	NativeShape,
} from '@markless/serializer';

// An inline <svg> as data a native host draws: SVG 2's attribute grammars (path data, points, transforms, viewBox, paint)
// read once when the app is built, so no phone parses SVG.

/** One element of the svg's subtree, in document order. `path` is its child-index path relative to the svg. */
export type DrawingElement = {
	readonly id: string;
	readonly tag: string;
	readonly path: ReadonlyArray<number>;
	readonly attributes: Readonly<Record<string, string>>;
	/** Attributes whose value follows state. */
	readonly bound: ReadonlyArray<string>;
};

export type DrawingRefusal = { readonly message: string; readonly element: string };

export type DrawingResult = {
	readonly drawing: NativeDrawing;
	/** The svg's `<title>`: its accessible name. */
	readonly title?: string;
	readonly refusals: ReadonlyArray<DrawingRefusal>;
};

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

type Paint = NativeColor | 'currentColor' | null;
/** The inherited presentation properties (SVG 2 §13 and §6.6), with `opacity` folded into each paint's alpha. */
type Inherited = {
	readonly fill: Paint;
	readonly stroke: Paint;
	readonly width: number;
	readonly fillOpacity: number;
	readonly strokeOpacity: number;
	readonly opacity: number;
	readonly fillRule: NativeShape['fillRule'];
	readonly cap: NativeShape['cap'];
	readonly join: NativeShape['join'];
	readonly miterLimit: number;
	/** What `currentColor` is, when an ancestor's `color` attribute says; else the svg's text colour. */
	readonly color: NativeColor | null;
	readonly fontSize: number;
	readonly fontWeight: number;
	readonly fontFamily: NativeDrawingTextRun['family'];
	readonly anchor: NativeDrawingText['anchor'];
	readonly baseline: NativeDrawingText['baseline'];
	/** In user units, or in ems of the font size. */
	readonly letterSpacing: { readonly value: number; readonly em: boolean };
	readonly preserve: boolean;
};
const INITIAL: Inherited = {
	fill: { r: 0, g: 0, b: 0, alpha: 255 },
	stroke: null,
	width: 1,
	fillOpacity: 1,
	strokeOpacity: 1,
	opacity: 1,
	fillRule: 'nonzero',
	cap: 'butt',
	join: 'miter',
	miterLimit: 4,
	color: null,
	// The page's default text: 16px, its own font.
	fontSize: 16,
	fontWeight: 400,
	fontFamily: undefined,
	anchor: 'start',
	baseline: 'alphabetic',
	letterSpacing: { value: 0, em: false },
	preserve: false,
};

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
/** Elements that draw nothing themselves and whose content is never drawn in place. */
const NEVER_DRAWN = new Set(['defs', 'symbol', 'title', 'desc', 'metadata']);
/** Attributes that change nothing a native drawing shows. */
const NO_DRAWING_EFFECT = new Set([
	'class',
	'id',
	'style',
	'xmlns',
	'xmlns:xlink',
	'version',
	'role',
	'focusable',
	'tabindex',
	'hidden',
	'name',
	'vector-effect',
	'clip-rule',
	'shape-rendering',
	'color-interpolation-filters',
	'preserveAspectRatio',
]);
const GEOMETRY: Readonly<Record<string, ReadonlyArray<string>>> = {
	svg: ['viewBox', 'width', 'height', 'x', 'y'],
	g: [],
	path: ['d'],
	rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
	circle: ['cx', 'cy', 'r'],
	ellipse: ['cx', 'cy', 'rx', 'ry'],
	line: ['x1', 'y1', 'x2', 'y2'],
	polyline: ['points'],
	polygon: ['points'],
	use: ['href', 'xlink:href', 'x', 'y', 'width', 'height'],
	symbol: ['viewBox', 'width', 'height', 'x', 'y'],
	// `width`, `height` and `orientation` mean nothing on text; the browser ignores them, as charting libraries leave them.
	text: ['x', 'y', 'dx', 'dy', 'width', 'height', 'orientation', 'xml:space'],
	tspan: ['x', 'y', 'dx', 'dy', 'xml:space'],
};
const PRESENTATION = new Set([
	'fill',
	'stroke',
	'stroke-width',
	'fill-opacity',
	'stroke-opacity',
	'opacity',
	'fill-rule',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
	'transform',
	'stroke-dasharray',
	'color',
	'font-size',
	'font-weight',
	'font-family',
	'text-anchor',
	'dominant-baseline',
	'letter-spacing',
]);

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace']);
const BASELINES: Readonly<Record<string, NativeDrawingText['baseline']>> = {
	auto: 'alphabetic',
	alphabetic: 'alphabetic',
	middle: 'middle',
	central: 'central',
	hanging: 'hanging',
	'text-before-edge': 'text-top',
	'text-top': 'text-top',
	'text-after-edge': 'text-bottom',
	'text-bottom': 'text-bottom',
	ideographic: 'ideographic',
};

export function compileDrawing(
	svg: Readonly<Record<string, string>>,
	elements: ReadonlyArray<DrawingElement>,
	texts: ReadonlyArray<{ readonly path: ReadonlyArray<number>; readonly text: string }>,
	svgId: string,
): DrawingResult {
	const refusals: DrawingRefusal[] = [];
	const refuse = (element: string, message: string) => refusals.push({ message, element });
	const isPrefix = (prefix: ReadonlyArray<number>, path: ReadonlyArray<number>) =>
		prefix.length < path.length && prefix.every((value, index) => path[index] === value);
	const childrenOf = (parent: ReadonlyArray<number>) =>
		elements.filter(
			(element) =>
				element.path.length === parent.length + 1 && isPrefix(parent, element.path),
		);
	const byId = new Map<string, DrawingElement>();
	for (const element of elements)
		if (element.attributes.id !== undefined) byId.set(element.attributes.id, element);

	let title: string | undefined;
	const titleElement = childrenOf([]).find((element) => element.tag === 'title');
	if (titleElement)
		title = texts
			.filter((text) => isPrefix(titleElement.path, text.path))
			.map((text) => text.text)
			.join('')
			.trim();

	const number = (element: DrawingElement, name: string, fallback = 0): number => {
		const raw = element.attributes[name];
		if (raw === undefined) return fallback;
		const value = parseLength(raw);
		if (value === null) {
			refuse(
				element.id,
				`\`${name}="${raw}"\` on <${element.tag}>, which is not a length in user units`,
			);
			return fallback;
		}
		return value;
	};

	const inherit = (element: DrawingElement, from: Inherited): Inherited => {
		const next = { ...from } as { -readonly [K in keyof Inherited]: Inherited[K] };
		const attribute = (name: string) => element.attributes[name];
		const paint = (name: 'fill' | 'stroke') => {
			const raw = attribute(name);
			if (raw === undefined) return;
			const parsed = parsePaint(raw);
			if (parsed === undefined)
				refuse(
					element.id,
					`\`${name}="${raw}"\` on <${element.tag}>, a paint a native drawing does not have (gradients and patterns are not drawn yet)`,
				);
			else next[name] = parsed;
		};
		const color = attribute('color');
		if (color !== undefined) {
			const parsed = color.trim() === 'currentColor' ? from.color : parseColor(color);
			if (parsed === null && color.trim() !== 'currentColor')
				refuse(element.id, `\`color="${color}"\` on <${element.tag}>`);
			else next.color = parsed;
		}
		paint('fill');
		paint('stroke');
		const fraction = (name: string, key: 'fillOpacity' | 'strokeOpacity') => {
			const raw = attribute(name);
			if (raw === undefined) return;
			const value = parseOpacity(raw);
			if (value === null) refuse(element.id, `\`${name}="${raw}"\` on <${element.tag}>`);
			else next[key] = value;
		};
		fraction('fill-opacity', 'fillOpacity');
		fraction('stroke-opacity', 'strokeOpacity');
		const opacity = attribute('opacity');
		if (opacity !== undefined) {
			const value = parseOpacity(opacity);
			if (value === null) refuse(element.id, `\`opacity="${opacity}"\` on <${element.tag}>`);
			else next.opacity = from.opacity * value;
		}
		const width = attribute('stroke-width');
		if (width !== undefined) {
			const value = parseLength(width);
			if (value === null || value < 0)
				refuse(element.id, `\`stroke-width="${width}"\` on <${element.tag}>`);
			else next.width = value;
		}
		const keyword = <K extends 'fillRule' | 'cap' | 'join' | 'anchor'>(
			name: string,
			key: K,
			allowed: ReadonlyArray<Inherited[K]>,
		) => {
			const raw = attribute(name)?.trim();
			if (raw === undefined || raw === 'inherit') return;
			if ((allowed as ReadonlyArray<string>).includes(raw)) next[key] = raw as Inherited[K];
			else refuse(element.id, `\`${name}="${raw}"\` on <${element.tag}>`);
		};
		keyword('fill-rule', 'fillRule', ['nonzero', 'evenodd']);
		keyword('stroke-linecap', 'cap', ['butt', 'round', 'square']);
		keyword('stroke-linejoin', 'join', ['miter', 'round', 'bevel']);
		const limit = attribute('stroke-miterlimit');
		if (limit !== undefined) {
			const value = parseLength(limit);
			if (value === null || value < 1)
				refuse(element.id, `\`stroke-miterlimit="${limit}"\` on <${element.tag}>`);
			else next.miterLimit = value;
		}
		const fontSize = attribute('font-size')?.trim();
		if (fontSize !== undefined) {
			const css = parseCssLength(fontSize);
			if (css === null || css.value < 0 || fontSize.endsWith('%'))
				refuse(element.id, `\`font-size="${fontSize}"\` on <${element.tag}>`);
			else next.fontSize = css.unit === 'em' ? css.value * from.fontSize : css.value;
		}
		const fontWeight = attribute('font-weight')?.trim();
		if (fontWeight !== undefined) {
			const weight =
				fontWeight === 'normal'
					? 400
					: fontWeight === 'bold'
						? 700
						: fontWeight === 'bolder'
							? Math.min(900, Math.max(400, from.fontWeight + 300))
							: fontWeight === 'lighter'
								? Math.max(100, Math.min(400, from.fontWeight - 300))
								: Number(fontWeight);
			if (!Number.isInteger(weight) || weight < 1 || weight > 1000)
				refuse(element.id, `\`font-weight="${fontWeight}"\` on <${element.tag}>`);
			else next.fontWeight = weight;
		}
		const family = attribute('font-family');
		if (family !== undefined)
			// The first generic family the list names; a named face falls back to the page's font, as on a phone without it.
			next.fontFamily = family
				.split(',')
				.map((name) => name.trim().replace(/^["']|["']$/g, '').toLowerCase())
				.find((name) => GENERIC_FAMILIES.has(name)) as NativeDrawingTextRun['family'];
		keyword('text-anchor', 'anchor', ['start', 'middle', 'end']);
		const baseline = attribute('dominant-baseline')?.trim();
		if (baseline !== undefined && baseline !== 'inherit') {
			const mapped = BASELINES[baseline];
			if (mapped) next.baseline = mapped;
			else refuse(element.id, `\`dominant-baseline="${baseline}"\` on <${element.tag}>`);
		}
		const spacing = attribute('letter-spacing')?.trim();
		if (spacing !== undefined) {
			const css = spacing === 'normal' ? { value: 0, unit: 'px' as const } : parseCssLength(spacing);
			if (css === null) refuse(element.id, `\`letter-spacing="${spacing}"\` on <${element.tag}>`);
			else next.letterSpacing = { value: css.value, em: css.unit === 'em' };
		}
		const space = attribute('xml:space')?.trim();
		if (space !== undefined) next.preserve = space === 'preserve';
		const dashes = attribute('stroke-dasharray')?.trim();
		if (dashes !== undefined && dashes !== 'none')
			refuse(
				element.id,
				`\`stroke-dasharray\` on <${element.tag}>: dashed strokes are not drawn natively yet`,
			);
		return next;
	};

	const checkAttributes = (element: DrawingElement) => {
		for (const name of element.bound)
			if (
				name !== 'class' &&
				name !== 'style' &&
				!name.startsWith('aria-') &&
				!name.startsWith('data-')
			)
				refuse(
					element.id,
					`\`${name}\` on <${element.tag}> follows state; a native drawing is compiled when the app is built`,
				);
		for (const name of Object.keys(element.attributes)) {
			if (
				NO_DRAWING_EFFECT.has(name) ||
				name.startsWith('aria-') ||
				name.startsWith('data-') ||
				PRESENTATION.has(name) ||
				(GEOMETRY[element.tag] ?? []).includes(name)
			)
				continue;
			refuse(
				element.id,
				`\`${name}\` on <${element.tag}>, which a native drawing does not draw yet`,
			);
		}
	};

	const shapes: NativeShape[] = [];
	const emit = (element: DrawingElement, outline: number[], style: Inherited, matrix: Matrix) => {
		const alpha = (given: Paint, opacity: number): Paint => {
			const paint = given === 'currentColor' && style.color ? style.color : given;
			if (paint === null || paint === 'currentColor' || opacity === 1) return paint;
			return { ...paint, alpha: Math.round(paint.alpha * opacity) };
		};
		const open = (paint: Paint) => paint === 'currentColor' && !style.color;
		if (
			(open(style.fill) && style.fillOpacity * style.opacity !== 1) ||
			(open(style.stroke) && style.strokeOpacity * style.opacity !== 1)
		)
			refuse(
				element.id,
				`a see-through \`currentColor\` paint on <${element.tag}>: its colour comes from the page's styles`,
			);
		if (outline.length === 0) return;
		shapes.push({
			path: outline,
			fill: alpha(style.fill, style.fillOpacity * style.opacity),
			fillRule: style.fillRule,
			stroke:
				style.width === 0 ? null : alpha(style.stroke, style.strokeOpacity * style.opacity),
			width: style.width,
			cap: style.cap,
			join: style.join,
			miterLimit: style.miterLimit,
			...(matrix.every((value, index) => value === IDENTITY[index])
				? {}
				: { transform: matrix }),
		});
	};

	const outlineOf = (element: DrawingElement): number[] => {
		switch (element.tag) {
			case 'path': {
				const parsed = parsePathData(element.attributes.d ?? '');
				if (parsed.error) refuse(element.id, `the path data of <path>: ${parsed.error}`);
				return parsed.outline;
			}
			case 'rect': {
				const x = number(element, 'x');
				const y = number(element, 'y');
				const width = number(element, 'width');
				const height = number(element, 'height');
				if (width <= 0 || height <= 0) return [];
				const rxRaw = element.attributes.rx;
				const ryRaw = element.attributes.ry;
				let rx = rxRaw === undefined ? undefined : number(element, 'rx');
				let ry = ryRaw === undefined ? undefined : number(element, 'ry');
				rx ??= ry ?? 0;
				ry ??= rx;
				rx = Math.min(Math.max(rx, 0), width / 2);
				ry = Math.min(Math.max(ry, 0), height / 2);
				return roundedRect(x, y, width, height, rx, ry);
			}
			case 'circle': {
				const r = number(element, 'r');
				return r > 0 ? ellipse(number(element, 'cx'), number(element, 'cy'), r, r) : [];
			}
			case 'ellipse': {
				const rx = number(element, 'rx');
				const ry = number(element, 'ry');
				return rx > 0 && ry > 0
					? ellipse(number(element, 'cx'), number(element, 'cy'), rx, ry)
					: [];
			}
			case 'line':
				return [
					0,
					number(element, 'x1'),
					number(element, 'y1'),
					1,
					number(element, 'x2'),
					number(element, 'y2'),
				];
			case 'polyline':
			case 'polygon': {
				const points = parseNumberList(element.attributes.points ?? '');
				if (points === null) {
					refuse(element.id, `the points of <${element.tag}>`);
					return [];
				}
				const outline: number[] = [];
				for (let index = 0; index + 1 < points.length; index += 2)
					outline.push(index === 0 ? 0 : 1, points[index]!, points[index + 1]!);
				if (element.tag === 'polygon' && outline.length > 0) outline.push(4);
				return outline;
			}
			default:
				return [];
		}
	};

	const spoken: string[] = [];
	const emitText = (element: DrawingElement, style: Inherited, matrix: Matrix) => {
		const paintOf = (at: Inherited): NativeDrawingTextRun['fill'] => {
			const given = at.fill === 'currentColor' && at.color ? at.color : at.fill;
			const opacity = at.fillOpacity * at.opacity;
			if (given === 'currentColor' && opacity !== 1)
				refuse(element.id, "a see-through `currentColor` fill on <text>: its colour comes from the page's styles");
			if (given === null || given === 'currentColor' || opacity === 1) return given;
			return { ...given, alpha: Math.round(given.alpha * opacity) };
		};
		const runs: { -readonly [K in keyof NativeDrawingTextRun]: NativeDrawingTextRun[K] }[] = [];
		let pending: { x?: number; y?: number; dx?: number; dy?: number } = {};
		const position = (node: DrawingElement) => {
			for (const name of ['x', 'y', 'dx', 'dy'] as const) {
				const raw = node.attributes[name];
				if (raw === undefined) continue;
				const value = parseLength(raw);
				if (value === null)
					refuse(node.id, `\`${name}="${raw}"\` on <${node.tag}>: one length per text is drawn, not a list`);
				else pending[name] = name === 'dx' || name === 'dy' ? (pending[name] ?? 0) + value : value;
			}
		};
		const collect = (node: DrawingElement, at: Inherited) => {
			if (at.stroke !== null && at.width > 0)
				refuse(node.id, `a stroke on <${node.tag}>: text is filled, not outlined, natively yet`);
			position(node);
			const items: ({ readonly index: number } & (
				| { readonly element: DrawingElement }
				| { readonly text: string }
			))[] = [
				...childrenOf(node.path).map((child) => ({ index: child.path.at(-1)!, element: child })),
				...texts
					.filter((text) => text.path.length === node.path.length + 1 && isPrefix(node.path, text.path))
					.map((text) => ({ index: text.path.at(-1)!, text: text.text })),
			].sort((a, b) => a.index - b.index);
			for (const item of items) {
				if ('text' in item) {
					runs.push({
						text: item.text,
						...pending,
						size: at.fontSize,
						weight: at.fontWeight,
						...(at.fontFamily ? { family: at.fontFamily } : {}),
						letterSpacing: at.letterSpacing.em ? at.letterSpacing.value * at.fontSize : at.letterSpacing.value,
						fill: paintOf(at),
					});
					pending = {};
					continue;
				}
				if (item.element.tag !== 'tspan') {
					if (!NEVER_DRAWN.has(item.element.tag))
						refuse(item.element.id, `the SVG <${item.element.tag}> element inside <text>, which a native drawing does not draw yet`);
					continue;
				}
				checkAttributes(item.element);
				if (item.element.attributes.transform !== undefined)
					refuse(item.element.id, '`transform` on <tspan>, which SVG does not apply');
				collect(item.element, inherit(item.element, at));
			}
		};
		collect(element, style);
		// White space as the browser collapses it in SVG text (kept with `xml:space="preserve"`): line breaks and tabs are
		// spaces, a run of spaces is one, and the text's first and last spaces go.
		let previousSpace = true;
		for (const run of runs) {
			let out = '';
			for (const char of run.text) {
				const space = char === ' ' || char === '\n' || char === '\t' || char === '\r';
				if (space && !style.preserve && previousSpace) continue;
				out += space ? ' ' : char;
				previousSpace = space;
			}
			run.text = out;
		}
		if (!style.preserve) {
			const last = runs.findLast((run) => run.text !== '');
			if (last?.text.endsWith(' ')) last.text = last.text.slice(0, -1);
		}
		const shown = runs.filter((run) => run.text !== '' || run.x !== undefined || run.y !== undefined);
		if (shown.every((run) => run.text === '')) return;
		spoken.push(shown.map((run) => run.text).join('').trim());
		shapes.push({
			path: [],
			fill: paintOf(style),
			fillRule: 'nonzero',
			stroke: null,
			width: 0,
			cap: 'butt',
			join: 'miter',
			miterLimit: 4,
			...(matrix.every((value, index) => value === IDENTITY[index]) ? {} : { transform: matrix }),
			text: { anchor: style.anchor, baseline: style.baseline, runs: shown },
		});
	};

	const transformOf = (element: DrawingElement): Matrix => {
		const raw = element.attributes.transform;
		if (raw === undefined) return IDENTITY;
		const parsed = parseTransform(raw);
		if (parsed === null) {
			refuse(element.id, `\`transform="${raw}"\` on <${element.tag}>`);
			return IDENTITY;
		}
		return parsed;
	};

	const visit = (
		element: DrawingElement,
		from: Inherited,
		matrix: Matrix,
		using: ReadonlySet<string>,
	): void => {
		if (NEVER_DRAWN.has(element.tag)) return;
		if (!(element.tag in GEOMETRY)) {
			refuse(
				element.id,
				`the SVG <${element.tag}> element, which a native drawing does not draw yet`,
			);
			return;
		}
		checkAttributes(element);
		const style = inherit(element, from);
		const own = multiply(matrix, transformOf(element));
		if (SHAPES.has(element.tag)) {
			emit(element, outlineOf(element), style, own);
			return;
		}
		if (element.tag === 'text') {
			emitText(element, style, own);
			return;
		}
		if (element.tag === 'tspan') return;
		if (element.tag === 'use') {
			const href = (element.attributes.href ?? element.attributes['xlink:href'] ?? '').trim();
			const target = href.startsWith('#') ? byId.get(href.slice(1)) : undefined;
			if (!target) {
				refuse(element.id, `<use href="${href}">, which names nothing inside this <svg>`);
				return;
			}
			if (using.has(target.id)) {
				refuse(element.id, `<use href="${href}">, which uses itself`);
				return;
			}
			const placed = multiply(own, [1, 0, 0, 1, number(element, 'x'), number(element, 'y')]);
			const inner = new Set([...using, target.id]);
			if (target.tag === 'symbol') {
				const box =
					target.attributes.viewBox === undefined
						? null
						: parseViewBox(target.attributes.viewBox);
				const width = element.attributes.width ?? target.attributes.width;
				const height = element.attributes.height ?? target.attributes.height;
				let symbolMatrix = placed;
				if (box) {
					const w = width === undefined ? 100 : (parseLength(width) ?? 100);
					const h = height === undefined ? 100 : (parseLength(height) ?? 100);
					symbolMatrix = multiply(placed, fitViewBox(box, w, h));
				}
				const symbolStyle = inherit(target, style);
				for (const child of childrenOf(target.path))
					visit(child, symbolStyle, symbolMatrix, inner);
				return;
			}
			visit({ ...target, tag: target.tag }, style, placed, inner);
			return;
		}
		for (const child of childrenOf(element.path)) visit(child, style, own, using);
	};

	const root: DrawingElement = { id: svgId, tag: 'svg', path: [], attributes: svg, bound: [] };
	const rootStyle = inherit(root, INITIAL);
	for (const child of childrenOf([])) visit(child, rootStyle, IDENTITY, new Set());

	const viewBox = svg.viewBox === undefined ? null : parseViewBox(svg.viewBox);
	if (svg.viewBox !== undefined && viewBox === null)
		refuse(svgId, `\`viewBox="${svg.viewBox}"\` on <svg>`);
	const size = (name: 'width' | 'height') => {
		const raw = svg[name]?.trim();
		if (raw === undefined || raw.endsWith('%') || raw === 'auto') return undefined;
		const value = parseCssLength(raw);
		if (value === null) refuse(svgId, `\`${name}="${raw}"\` on <svg>`);
		return value ?? undefined;
	};
	const width = size('width');
	const height = size('height');
	const em = width?.unit === 'em' || height?.unit === 'em';
	if (em && width?.unit !== height?.unit)
		refuse(svgId, 'a width and a height on <svg> where only one is in `em`');
	const rawAspect = svg.preserveAspectRatio?.trim();
	const aspect = rawAspect === undefined ? undefined : parseAspect(rawAspect);
	if (aspect === null) refuse(svgId, `\`preserveAspectRatio="${rawAspect}"\` on <svg>`);
	return {
		drawing: {
			viewBox,
			...(width !== undefined ? { width: width.value } : {}),
			...(height !== undefined ? { height: height.value } : {}),
			...(em ? { em: true as const } : {}),
			...(aspect && aspect !== 'default' ? { aspect } : {}),
			shapes,
			...(spoken.length > 0 ? { label: spoken.join(' ') } : {}),
		},
		...(title ? { title } : {}),
		refusals,
	};
}

/** SVG 2 §8.5's `preserveAspectRatio`; `default` for `xMidYMid meet`, null when it is not one. */
function parseAspect(raw: string): NativeDrawing['aspect'] | 'default' | null {
	const [align, mode, ...rest] = raw.split(/\s+/);
	if (rest.length > 0 || (mode !== undefined && mode !== 'meet' && mode !== 'slice')) return null;
	if (align === 'none') return 'none';
	const axes: Readonly<Record<string, 'min' | 'mid' | 'max'>> = { Min: 'min', Mid: 'mid', Max: 'max' };
	const x = axes[align?.slice(1, 4) ?? ''];
	const y = axes[align?.slice(5, 8) ?? ''];
	if (align?.length !== 8 || align[0] !== 'x' || align[4] !== 'Y' || !x || !y) return null;
	if (x === 'mid' && y === 'mid' && mode !== 'slice') return 'default';
	return { x, y, ...(mode === 'slice' ? { slice: true as const } : {}) };
}

// Geometry.

function multiply(m: Matrix, n: Matrix): Matrix {
	return [
		m[0] * n[0] + m[2] * n[1],
		m[1] * n[0] + m[3] * n[1],
		m[0] * n[2] + m[2] * n[3],
		m[1] * n[2] + m[3] * n[3],
		m[0] * n[4] + m[2] * n[5] + m[4],
		m[1] * n[4] + m[3] * n[5] + m[5],
	];
}

/** SVG 2 §8.2 for `xMidYMid meet`: the viewBox scaled uniformly to fit the viewport and centred in it. */
function fitViewBox(
	box: readonly [number, number, number, number],
	width: number,
	height: number,
): Matrix {
	const scale = Math.min(width / box[2], height / box[3]);
	const tx = -box[0] * scale + (width - box[2] * scale) / 2;
	const ty = -box[1] * scale + (height - box[3] * scale) / 2;
	return [scale, 0, 0, scale, tx, ty];
}

/** The cubic control distance of a quarter ellipse, as a fraction of its radius. */
const KAPPA = (4 / 3) * (Math.SQRT2 - 1);

function ellipse(cx: number, cy: number, rx: number, ry: number): number[] {
	const kx = rx * KAPPA;
	const ky = ry * KAPPA;
	return [
		0,
		cx + rx,
		cy,
		3,
		cx + rx,
		cy + ky,
		cx + kx,
		cy + ry,
		cx,
		cy + ry,
		3,
		cx - kx,
		cy + ry,
		cx - rx,
		cy + ky,
		cx - rx,
		cy,
		3,
		cx - rx,
		cy - ky,
		cx - kx,
		cy - ry,
		cx,
		cy - ry,
		3,
		cx + kx,
		cy - ry,
		cx + rx,
		cy - ky,
		cx + rx,
		cy,
		4,
	];
}

/** SVG 2 §10.2's rect outline: clockwise from (x + rx, y), each corner a quarter ellipse. */
function roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number): number[] {
	if (rx === 0 || ry === 0) return [0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4];
	const kx = rx * KAPPA;
	const ky = ry * KAPPA;
	const r = x + w;
	const b = y + h;
	return [
		0,
		x + rx,
		y,
		1,
		r - rx,
		y,
		3,
		r - rx + kx,
		y,
		r,
		y + ry - ky,
		r,
		y + ry,
		1,
		r,
		b - ry,
		3,
		r,
		b - ry + ky,
		r - rx + kx,
		b,
		r - rx,
		b,
		1,
		x + rx,
		b,
		3,
		x + rx - kx,
		b,
		x,
		b - ry + ky,
		x,
		b - ry,
		1,
		x,
		y + ry,
		3,
		x,
		y + ry - ky,
		x + rx - kx,
		y,
		x + rx,
		y,
		4,
	];
}

// SVG 2 grammars: numbers, lists, path data, transforms, paint.

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

/** A plain number, or one with `px`: user units. */
export function parseLength(raw: string): number | null {
	const text = raw.trim();
	const match = NUMBER.exec(text);
	if (!match) return null;
	const rest = text.slice(match[0].length);
	if (rest !== '' && rest !== 'px') return null;
	return Number(match[0]);
}

/** CSS pixels per absolute unit (CSS Values 4 §6.2); `rem` is the root's 16px, as no style sets it in a native payload. */
const CSS_UNITS: Readonly<Record<string, number>> = {
	'': 1,
	px: 1,
	pt: 4 / 3,
	pc: 16,
	in: 96,
	cm: 96 / 2.54,
	mm: 96 / 25.4,
	q: 96 / 101.6,
	rem: 16,
};

/** A CSS length: in CSS pixels, or in `em` of the element's font size. */
function parseCssLength(raw: string): { value: number; unit: 'px' | 'em' } | null {
	const match = NUMBER.exec(raw);
	if (!match) return null;
	const unit = raw.slice(match[0].length).toLowerCase();
	if (unit === 'em') return { value: Number(match[0]), unit: 'em' };
	const scale = CSS_UNITS[unit];
	return scale === undefined ? null : { value: Number(match[0]) * scale, unit: 'px' };
}

function parseOpacity(raw: string): number | null {
	const text = raw.trim();
	if (text.endsWith('%')) {
		const value = parseLength(text.slice(0, -1));
		return value === null ? null : Math.min(Math.max(value / 100, 0), 1);
	}
	const value = parseLength(text);
	return value === null ? null : Math.min(Math.max(value, 0), 1);
}

/** Numbers separated by whitespace and at most one comma; null when anything else is there. */
export function parseNumberList(raw: string): number[] | null {
	const values: number[] = [];
	let rest = raw.trim();
	while (rest.length > 0) {
		const match = NUMBER.exec(rest);
		if (!match) return null;
		values.push(Number(match[0]));
		rest = rest.slice(match[0].length).replace(/^\s*,?\s*/, '');
	}
	return values;
}

function parseViewBox(raw: string): [number, number, number, number] | null {
	const values = parseNumberList(raw);
	if (!values || values.length !== 4 || values[2]! <= 0 || values[3]! <= 0) return null;
	return [values[0]!, values[1]!, values[2]!, values[3]!];
}

/** SVG 2 §8.5 transform lists: matrix, translate, scale, rotate, skewX and skewY, composed left to right. */
export function parseTransform(raw: string): Matrix | null {
	let matrix: Matrix = IDENTITY;
	let rest = raw.trim();
	while (rest.length > 0) {
		const match = /^([a-zA-Z]+)\s*\(([^)]*)\)\s*,?\s*/.exec(rest);
		if (!match) return null;
		const args = parseNumberList(match[2]!);
		if (!args) return null;
		const [a = 0, b, c] = args;
		let next: Matrix;
		switch (match[1]) {
			case 'matrix':
				if (args.length !== 6) return null;
				next = args as unknown as Matrix;
				break;
			case 'translate':
				if (args.length < 1 || args.length > 2) return null;
				next = [1, 0, 0, 1, a, b ?? 0];
				break;
			case 'scale':
				if (args.length < 1 || args.length > 2) return null;
				next = [a, 0, 0, b ?? a, 0, 0];
				break;
			case 'rotate': {
				if (args.length !== 1 && args.length !== 3) return null;
				const radians = (a * Math.PI) / 180;
				const cos = Math.cos(radians);
				const sin = Math.sin(radians);
				const turn: Matrix = [cos, sin, -sin, cos, 0, 0];
				next =
					args.length === 3
						? multiply(multiply([1, 0, 0, 1, b!, c!], turn), [1, 0, 0, 1, -b!, -c!])
						: turn;
				break;
			}
			case 'skewX':
				if (args.length !== 1) return null;
				next = [1, 0, Math.tan((a * Math.PI) / 180), 1, 0, 0];
				break;
			case 'skewY':
				if (args.length !== 1) return null;
				next = [1, Math.tan((a * Math.PI) / 180), 0, 1, 0, 0];
				break;
			default:
				return null;
		}
		matrix = multiply(matrix, next);
		rest = rest.slice(match[0].length);
	}
	return matrix;
}

/**
 * SVG 2 §9.3 path data as absolute move, line, cubic and close verbs. Quadratics become the cubics they equal; arcs become
 * cubics of at most a quarter turn each (SVG 2 §B.2.4 endpoint-to-centre conversion). On an error the path is drawn up to
 * it, as the web draws it.
 */
export function parsePathData(raw: string): { outline: number[]; error?: string } {
	const outline: number[] = [];
	let i = 0;
	const s = raw;
	const skip = () => {
		while (i < s.length && /[\s,]/.test(s[i]!)) i++;
	};
	const readNumber = (): number | null => {
		skip();
		const match = NUMBER.exec(s.slice(i));
		if (!match) return null;
		i += match[0].length;
		return Number(match[0]);
	};
	const readFlag = (): number | null => {
		skip();
		const c = s[i];
		if (c !== '0' && c !== '1') return null;
		i++;
		return c === '1' ? 1 : 0;
	};
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	let lastControl: { x: number; y: number; quad: boolean } | null = null;
	let command = '';
	let first = true;
	const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
		outline.push(3, x1, y1, x2, y2, ex, ey);
		x = ex;
		y = ey;
	};
	while (true) {
		skip();
		if (i >= s.length) break;
		const c = s[i]!;
		if (/[a-zA-Z]/.test(c)) {
			command = c;
			i++;
		} else if (command === '' || command === 'z' || command === 'Z') {
			return { outline, error: `unexpected \`${c}\`` };
		}
		if (first && command !== 'M' && command !== 'm')
			return { outline, error: 'it does not start with a moveto' };
		first = false;
		const relative = command === command.toLowerCase();
		const ox = relative ? x : 0;
		const oy = relative ? y : 0;
		const upper = command.toUpperCase();
		const need = (count: number): number[] | null => {
			const values: number[] = [];
			for (let n = 0; n < count; n++) {
				const value = readNumber();
				if (value === null) return null;
				values.push(value);
			}
			return values;
		};
		if (upper === 'Z') {
			outline.push(4);
			x = startX;
			y = startY;
			lastControl = null;
			continue;
		}
		if (upper === 'A') {
			const rx = readNumber();
			const ry = readNumber();
			const rotation = readNumber();
			const large = readFlag();
			const sweep = readFlag();
			const end = need(2);
			if (
				rx === null ||
				ry === null ||
				rotation === null ||
				large === null ||
				sweep === null ||
				!end
			)
				return { outline, error: `an incomplete \`${command}\`` };
			for (const segment of arcToCubics(
				x,
				y,
				rx,
				ry,
				rotation,
				large,
				sweep,
				end[0]! + ox,
				end[1]! + oy,
			))
				cubic(...segment);
			x = end[0]! + ox;
			y = end[1]! + oy;
			lastControl = null;
			continue;
		}
		const counts: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2 };
		const values = need(counts[upper] ?? 0);
		if (!(upper in counts)) return { outline, error: `the command \`${command}\`` };
		if (!values) return { outline, error: `an incomplete \`${command}\`` };
		switch (upper) {
			case 'M':
				x = values[0]! + ox;
				y = values[1]! + oy;
				startX = x;
				startY = y;
				outline.push(0, x, y);
				command = relative ? 'l' : 'L';
				lastControl = null;
				break;
			case 'L':
			case 'H':
			case 'V':
				if (upper === 'L') {
					x = values[0]! + ox;
					y = values[1]! + oy;
				} else if (upper === 'H') x = values[0]! + ox;
				else y = values[0]! + oy;
				outline.push(1, x, y);
				lastControl = null;
				break;
			case 'C': {
				const [x1, y1, x2, y2, ex, ey] = values as [
					number,
					number,
					number,
					number,
					number,
					number,
				];
				lastControl = { x: x2 + ox, y: y2 + oy, quad: false };
				cubic(x1 + ox, y1 + oy, x2 + ox, y2 + oy, ex + ox, ey + oy);
				break;
			}
			case 'S': {
				const [x2, y2, ex, ey] = values as [number, number, number, number];
				const x1 = lastControl && !lastControl.quad ? 2 * x - lastControl.x : x;
				const y1 = lastControl && !lastControl.quad ? 2 * y - lastControl.y : y;
				lastControl = { x: x2 + ox, y: y2 + oy, quad: false };
				cubic(x1, y1, x2 + ox, y2 + oy, ex + ox, ey + oy);
				break;
			}
			case 'Q':
			case 'T': {
				let qx: number;
				let qy: number;
				let ex: number;
				let ey: number;
				if (upper === 'Q') {
					qx = values[0]! + ox;
					qy = values[1]! + oy;
					ex = values[2]! + ox;
					ey = values[3]! + oy;
				} else {
					qx = lastControl?.quad ? 2 * x - lastControl.x : x;
					qy = lastControl?.quad ? 2 * y - lastControl.y : y;
					ex = values[0]! + ox;
					ey = values[1]! + oy;
				}
				lastControl = { x: qx, y: qy, quad: true };
				cubic(
					x + (2 / 3) * (qx - x),
					y + (2 / 3) * (qy - y),
					ex + (2 / 3) * (qx - ex),
					ey + (2 / 3) * (qy - ey),
					ex,
					ey,
				);
				break;
			}
		}
	}
	return { outline };
}

type Cubic = [number, number, number, number, number, number];

/** SVG 2 §B.2.4 and §B.2.5: an endpoint arc as cubics, each spanning at most 90 degrees. */
function arcToCubics(
	x1: number,
	y1: number,
	rxIn: number,
	ryIn: number,
	degrees: number,
	large: number,
	sweep: number,
	x2: number,
	y2: number,
): Cubic[] {
	if (x1 === x2 && y1 === y2) return [];
	let rx = Math.abs(rxIn);
	let ry = Math.abs(ryIn);
	if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
	const phi = ((degrees % 360) * Math.PI) / 180;
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);
	const dx = (x1 - x2) / 2;
	const dy = (y1 - y2) / 2;
	const px = cos * dx + sin * dy;
	const py = -sin * dx + cos * dy;
	const lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	const numerator = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px;
	const denominator = rx * rx * py * py + ry * ry * px * px;
	let factor = Math.sqrt(Math.max(0, numerator / denominator));
	if (large === sweep) factor = -factor;
	const cxp = (factor * rx * py) / ry;
	const cyp = (-factor * ry * px) / rx;
	const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
	const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
	const angle = (ux: number, uy: number, vx: number, vy: number) => {
		const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
		return a;
	};
	const theta = angle(1, 0, (px - cxp) / rx, (py - cyp) / ry);
	let delta = angle((px - cxp) / rx, (py - cyp) / ry, (-px - cxp) / rx, (-py - cyp) / ry);
	if (!sweep && delta > 0) delta -= 2 * Math.PI;
	if (sweep && delta < 0) delta += 2 * Math.PI;
	const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
	const step = delta / count;
	const k = (4 / 3) * Math.tan(step / 4);
	const point = (t: number) => {
		const ex = Math.cos(t);
		const ey = Math.sin(t);
		return {
			x: cx + rx * cos * ex - ry * sin * ey,
			y: cy + rx * sin * ex + ry * cos * ey,
			dx: -rx * cos * ey - ry * sin * ex,
			dy: -rx * sin * ey + ry * cos * ex,
		};
	};
	const cubics: Cubic[] = [];
	for (let n = 0; n < count; n++) {
		const a = point(theta + n * step);
		const b = point(theta + (n + 1) * step);
		const last = n === count - 1;
		cubics.push([
			a.x + k * a.dx,
			a.y + k * a.dy,
			b.x - k * b.dx,
			b.y - k * b.dy,
			last ? x2 : b.x,
			last ? y2 : b.y,
		]);
	}
	return cubics;
}

/** A paint: `none`, `currentColor` or a colour; undefined for one a native drawing does not have (`url(#gradient)`). */
export function parsePaint(raw: string): Paint | undefined {
	const text = raw.trim();
	if (text === 'none') return null;
	if (text === 'currentColor' || text === 'currentcolor') return 'currentColor';
	return parseColor(text) ?? undefined;
}

/** CSS Color 4 hex, `rgb()`/`rgba()` and named colours. */
export function parseColor(raw: string): NativeColor | null {
	const text = raw.trim().toLowerCase();
	if (text === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
	if (text.startsWith('#')) {
		const hex = text.slice(1);
		if (!/^[0-9a-f]+$/.test(hex)) return null;
		const digits =
			hex.length === 3 || hex.length === 4
				? [...hex].map((d) => d + d)
				: hex.length === 6 || hex.length === 8
					? (hex.match(/../g) ?? [])
					: null;
		if (!digits) return null;
		const [r = 0, g = 0, b = 0, alpha = 255] = digits.map((pair) => parseInt(pair, 16));
		return { r, g, b, alpha };
	}
	const fn = /^rgba?\(([^)]*)\)$/.exec(text);
	if (fn) {
		const parts = fn[1]!.split(/\s*[,/]\s*|\s+/).filter((part) => part !== '');
		if (parts.length !== 3 && parts.length !== 4) return null;
		const channel = (part: string) => {
			const value = part.endsWith('%')
				? (Number(part.slice(0, -1)) * 255) / 100
				: Number(part);
			return Number.isFinite(value) ? Math.round(Math.min(Math.max(value, 0), 255)) : null;
		};
		const [r, g, b] = parts.slice(0, 3).map(channel);
		const alphaPart = parts[3];
		const alpha =
			alphaPart === undefined
				? 1
				: alphaPart.endsWith('%')
					? Number(alphaPart.slice(0, -1)) / 100
					: Number(alphaPart);
		if (r == null || g == null || b == null || !Number.isFinite(alpha)) return null;
		return { r, g, b, alpha: Math.round(Math.min(Math.max(alpha, 0), 1) * 255) };
	}
	const named = NAMED_COLORS[text];
	if (named === undefined) return null;
	return { r: (named >> 16) & 255, g: (named >> 8) & 255, b: named & 255, alpha: 255 };
}

/** CSS Color 4 §6.1 named colours. */
const NAMED_COLORS: Readonly<Record<string, number>> = {
	aliceblue: 0xf0f8ff,
	antiquewhite: 0xfaebd7,
	aqua: 0x00ffff,
	aquamarine: 0x7fffd4,
	azure: 0xf0ffff,
	beige: 0xf5f5dc,
	bisque: 0xffe4c4,
	black: 0x000000,
	blanchedalmond: 0xffebcd,
	blue: 0x0000ff,
	blueviolet: 0x8a2be2,
	brown: 0xa52a2a,
	burlywood: 0xdeb887,
	cadetblue: 0x5f9ea0,
	chartreuse: 0x7fff00,
	chocolate: 0xd2691e,
	coral: 0xff7f50,
	cornflowerblue: 0x6495ed,
	cornsilk: 0xfff8dc,
	crimson: 0xdc143c,
	cyan: 0x00ffff,
	darkblue: 0x00008b,
	darkcyan: 0x008b8b,
	darkgoldenrod: 0xb8860b,
	darkgray: 0xa9a9a9,
	darkgreen: 0x006400,
	darkgrey: 0xa9a9a9,
	darkkhaki: 0xbdb76b,
	darkmagenta: 0x8b008b,
	darkolivegreen: 0x556b2f,
	darkorange: 0xff8c00,
	darkorchid: 0x9932cc,
	darkred: 0x8b0000,
	darksalmon: 0xe9967a,
	darkseagreen: 0x8fbc8f,
	darkslateblue: 0x483d8b,
	darkslategray: 0x2f4f4f,
	darkslategrey: 0x2f4f4f,
	darkturquoise: 0x00ced1,
	darkviolet: 0x9400d3,
	deeppink: 0xff1493,
	deepskyblue: 0x00bfff,
	dimgray: 0x696969,
	dimgrey: 0x696969,
	dodgerblue: 0x1e90ff,
	firebrick: 0xb22222,
	floralwhite: 0xfffaf0,
	forestgreen: 0x228b22,
	fuchsia: 0xff00ff,
	gainsboro: 0xdcdcdc,
	ghostwhite: 0xf8f8ff,
	gold: 0xffd700,
	goldenrod: 0xdaa520,
	gray: 0x808080,
	green: 0x008000,
	greenyellow: 0xadff2f,
	grey: 0x808080,
	honeydew: 0xf0fff0,
	hotpink: 0xff69b4,
	indianred: 0xcd5c5c,
	indigo: 0x4b0082,
	ivory: 0xfffff0,
	khaki: 0xf0e68c,
	lavender: 0xe6e6fa,
	lavenderblush: 0xfff0f5,
	lawngreen: 0x7cfc00,
	lemonchiffon: 0xfffacd,
	lightblue: 0xadd8e6,
	lightcoral: 0xf08080,
	lightcyan: 0xe0ffff,
	lightgoldenrodyellow: 0xfafad2,
	lightgray: 0xd3d3d3,
	lightgreen: 0x90ee90,
	lightgrey: 0xd3d3d3,
	lightpink: 0xffb6c1,
	lightsalmon: 0xffa07a,
	lightseagreen: 0x20b2aa,
	lightskyblue: 0x87cefa,
	lightslategray: 0x778899,
	lightslategrey: 0x778899,
	lightsteelblue: 0xb0c4de,
	lightyellow: 0xffffe0,
	lime: 0x00ff00,
	limegreen: 0x32cd32,
	linen: 0xfaf0e6,
	magenta: 0xff00ff,
	maroon: 0x800000,
	mediumaquamarine: 0x66cdaa,
	mediumblue: 0x0000cd,
	mediumorchid: 0xba55d3,
	mediumpurple: 0x9370db,
	mediumseagreen: 0x3cb371,
	mediumslateblue: 0x7b68ee,
	mediumspringgreen: 0x00fa9a,
	mediumturquoise: 0x48d1cc,
	mediumvioletred: 0xc71585,
	midnightblue: 0x191970,
	mintcream: 0xf5fffa,
	mistyrose: 0xffe4e1,
	moccasin: 0xffe4b5,
	navajowhite: 0xffdead,
	navy: 0x000080,
	oldlace: 0xfdf5e6,
	olive: 0x808000,
	olivedrab: 0x6b8e23,
	orange: 0xffa500,
	orangered: 0xff4500,
	orchid: 0xda70d6,
	palegoldenrod: 0xeee8aa,
	palegreen: 0x98fb98,
	paleturquoise: 0xafeeee,
	palevioletred: 0xdb7093,
	papayawhip: 0xffefd5,
	peachpuff: 0xffdab9,
	peru: 0xcd853f,
	pink: 0xffc0cb,
	plum: 0xdda0dd,
	powderblue: 0xb0e0e6,
	purple: 0x800080,
	rebeccapurple: 0x663399,
	red: 0xff0000,
	rosybrown: 0xbc8f8f,
	royalblue: 0x4169e1,
	saddlebrown: 0x8b4513,
	salmon: 0xfa8072,
	sandybrown: 0xf4a460,
	seagreen: 0x2e8b57,
	seashell: 0xfff5ee,
	sienna: 0xa0522d,
	silver: 0xc0c0c0,
	skyblue: 0x87ceeb,
	slateblue: 0x6a5acd,
	slategray: 0x708090,
	slategrey: 0x708090,
	snow: 0xfffafa,
	springgreen: 0x00ff7f,
	steelblue: 0x4682b4,
	tan: 0xd2b48c,
	teal: 0x008080,
	thistle: 0xd8bfd8,
	tomato: 0xff6347,
	turquoise: 0x40e0d0,
	violet: 0xee82ee,
	wheat: 0xf5deb3,
	white: 0xffffff,
	whitesmoke: 0xf5f5f5,
	yellow: 0xffff00,
	yellowgreen: 0x9acd32,
};
