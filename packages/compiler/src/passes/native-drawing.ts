import { parse as parseCss } from 'yuku-css';
import type {
	NativeColor,
	NativeDrawing,
	NativeDrawingText,
	NativeDrawingTextRun,
	NativeGradient,
	NativeGradientStop,
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
/** `url(#id)`, with the paint after it that is used when the id names nothing. */
type PaintServer = { readonly url: string; readonly raw: string; readonly fallback?: Paint };
/** The inherited presentation properties (SVG 2 §13 and §6.6), with `opacity` folded into each paint's alpha. */
type Inherited = {
	readonly fill: Paint | PaintServer;
	readonly stroke: Paint | PaintServer;
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
	/** The clip outlines of it and its groups, in the drawing's units, each with the rule that fills it. */
	readonly clips: ReadonlyArray<Clip>;
	/** The `filter` blur over it: its deviation and region in the drawing's units, the clips that apply after it, and how many shapes it holds. */
	readonly blur?: {
		readonly element: string;
		readonly deviation: number;
		readonly region: ReadonlyArray<number>;
		readonly clips: number;
		readonly drawn: { count: number };
	};
	/** The <marker> each of a path's vertices gets: its first, its middle ones, its last. */
	readonly markers: {
		readonly start?: DrawingElement;
		readonly mid?: DrawingElement;
		readonly end?: DrawingElement;
	};
};
type Clip = { readonly outline: ReadonlyArray<number>; readonly rule: 'nonzero' | 'evenodd' };
const clipFields = (clips: ReadonlyArray<Clip>) =>
	clips.length === 0
		? {}
		: {
				clip: clips.map((clip) => clip.outline),
				...(clips.some((clip) => clip.rule === 'evenodd') ? { clipRule: clips.map((clip) => clip.rule) } : {}),
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
	clips: [],
	markers: {},
};

export const SHAPES: ReadonlySet<string> = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
/** Elements that draw nothing themselves and whose content is never drawn in place. */
const NEVER_DRAWN = new Set(['defs', 'symbol', 'title', 'desc', 'metadata', 'clipPath', 'mask', 'marker', 'filter', 'linearGradient', 'radialGradient', 'stop']);
/** Each gradient's own geometry, which an `href` passes on only to a gradient of its kind. */
const GRADIENT_GEOMETRY: Readonly<Record<string, ReadonlyArray<string>>> = {
	linearGradient: ['x1', 'y1', 'x2', 'y2'],
	radialGradient: ['cx', 'cy', 'r', 'fx', 'fy', 'fr'],
};
/** Attributes on a gradient or a stop that the browser ignores in SVG gradients, or that change nothing drawn. */
const GRADIENT_INERT = new Set(['id', 'class', 'xmlns', 'xmlns:xlink']);
const GRADIENT_SHARED = new Set(['gradientUnits', 'gradientTransform', 'spreadMethod', 'href', 'xlink:href', 'color']);
const STOP_ATTRIBUTES = new Set(['offset', 'stop-color', 'stop-opacity', 'color']);
/** Segments a blend of two stops that differ in colour and alpha is cut into, so premultiplied and unpremultiplied blends agree to within a level. */
const ALPHA_BLEND_STEPS = 16;
/** What a <filter> may carry: its region, its units and the colour space it works in. */
const FILTER_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'x', 'y', 'width', 'height', 'filterUnits', 'primitiveUnits', 'color-interpolation-filters']);
/** What a <mask> may carry: its region, its units and its type. */
const MASK_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'x', 'y', 'width', 'height', 'maskUnits', 'maskContentUnits', 'mask-type']);
/** Shapes that get markers at their vertices. */
const MARKABLE = new Set(['path', 'line', 'polyline', 'polygon']);
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
	// Position and size mean nothing on a group or a circle's box; the browser ignores them.
	g: ['x', 'y', 'dx', 'dy', 'width', 'height', 'alignment-baseline'],
	path: ['d'],
	rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
	circle: ['cx', 'cy', 'r', 'width', 'height'],
	ellipse: ['cx', 'cy', 'rx', 'ry'],
	line: ['x1', 'y1', 'x2', 'y2'],
	polyline: ['points'],
	polygon: ['points'],
	use: ['href', 'xlink:href', 'x', 'y', 'width', 'height'],
	symbol: ['viewBox', 'width', 'height', 'x', 'y'],
	// `width`, `height` and `orientation` mean nothing on text; the browser ignores them, as charting libraries leave them.
	text: ['x', 'y', 'dx', 'dy', 'width', 'height', 'orientation', 'xml:space', 'alignment-baseline'],
	tspan: ['x', 'y', 'dx', 'dy', 'xml:space', 'alignment-baseline'],
	marker: ['viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'preserveAspectRatio'],
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
	'clip-path',
	'mask',
	'filter',
	'marker-start',
	'marker-mid',
	'marker-end',
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

/** CSS properties an SVG file's `style` attribute may set that a native drawing reads as the presentation attribute of that name. */
const STYLE_AS_ATTRIBUTES: ReadonlySet<string> = new Set(['mask-type']);

/**
 * An SVG file's `style` attribute as the presentation attributes it sets, when each of its declarations is one a native
 * drawing reads that way with a single keyword (`style="mask-type:alpha"`); null when it holds anything else.
 */
export function svgStyleAttributes(style: string): Record<string, string> | null {
	let list;
	try {
		list = parseCss(style, { context: 'declarationList' }).ast;
	} catch {
		return null;
	}
	if (list.type !== 'DeclarationList') return null;
	const attributes: Record<string, string> = {};
	for (const declaration of list.children) {
		if (declaration.type !== 'Declaration' || declaration.important || !STYLE_AS_ATTRIBUTES.has(declaration.property))
			return null;
		const value = declaration.value.type === 'Value' ? declaration.value.children : [];
		const only = value.length === 1 ? value[0] : undefined;
		if (only?.type !== 'Identifier') return null;
		attributes[declaration.property] = only.name;
	}
	return attributes;
}

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
			const parsed = parsePaintServer(raw) ?? parsePaint(raw);
			if (parsed === undefined)
				refuse(
					element.id,
					`\`${name}="${raw}"\` on <${element.tag}>, a paint a native drawing does not have`,
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
		// alignment-baseline places a text element's own glyphs, as dominant-baseline does for what it holds.
		const alignment = element.tag === 'text' || element.tag === 'tspan' ? attribute('alignment-baseline')?.trim() : undefined;
		if (alignment !== undefined && alignment !== 'baseline' && alignment !== 'auto') {
			const mapped = BASELINES[alignment];
			if (mapped) next.baseline = mapped;
			else refuse(element.id, `\`alignment-baseline="${alignment}"\` on <${element.tag}>`);
		}
		const markers = { ...from.markers } as { -readonly [K in keyof Inherited['markers']]: Inherited['markers'][K] };
		for (const at of ['start', 'mid', 'end'] as const) {
			const raw = attribute(`marker-${at}`)?.trim();
			if (raw === undefined) continue;
			if (raw === 'none') {
				delete markers[at];
				continue;
			}
			const id = raw.startsWith('url(#') && raw.endsWith(')') ? raw.slice(5, -1).trim() : undefined;
			const target = id === undefined ? undefined : byId.get(id);
			if (target?.tag === 'marker') markers[at] = target;
			else refuse(element.id, `\`marker-${at}="${raw}"\` on <${element.tag}>, which names no <marker> inside this <svg>`);
		}
		next.markers = markers;
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
	const emit = (element: DrawingElement, outline: number[], style: Inherited, matrix: Matrix, nested: boolean) => {
		const solid = (given: Paint, opacity: number): Paint => {
			const paint = given === 'currentColor' && style.color ? style.color : given;
			if (paint === null || paint === 'currentColor' || opacity === 1) return paint;
			return { ...paint, alpha: Math.round(paint.alpha * opacity) };
		};
		const alpha = (given: Paint | PaintServer, opacity: number, name: 'fill' | 'stroke'): NativeShape['fill'] =>
			given !== null && typeof given === 'object' && 'url' in given
				? gradientOf(element, name, given, outline, opacity, nested, (fallback) => solid(fallback, opacity))
				: solid(given, opacity);
		const open = (paint: Paint | PaintServer) => paint === 'currentColor' && !style.color;
		if (
			(open(style.fill) && style.fillOpacity * style.opacity !== 1) ||
			(open(style.stroke) && style.strokeOpacity * style.opacity !== 1)
		)
			refuse(
				element.id,
				`a see-through \`currentColor\` paint on <${element.tag}>: its colour comes from the page's styles`,
			);
		if (outline.length === 0) return;
		if (style.blur) {
			if (style.clips.length > style.blur.clips)
				refuse(element.id, `a clip or mask inside a filtered element, which applies before its blur`);
			if (++style.blur.drawn.count > 1)
				refuse(style.blur.element, `a \`filter\` over more than one shape: a native drawing blurs one shape at a time`);
			for (const [name, paint] of [['fill', style.fill], ['stroke', style.stroke]] as const)
				if (paint !== null && typeof paint === 'object' && 'url' in paint)
					refuse(element.id, `a gradient \`${name}\` under a \`filter\`: a native drawing blurs a shape of one colour`);
		}
		shapes.push({
			...clipFields(style.clips),
			...(style.blur ? { blur: { deviation: style.blur.deviation, region: style.blur.region } } : {}),
			path: outline,
			fill: alpha(style.fill, style.fillOpacity * style.opacity, 'fill'),
			fillRule: style.fillRule,
			stroke:
				style.width === 0 ? null : alpha(style.stroke, style.strokeOpacity * style.opacity, 'stroke'),
			width: style.width,
			cap: style.cap,
			join: style.join,
			miterLimit: style.miterLimit,
			...(matrix.every((value, index) => value === IDENTITY[index])
				? {}
				: { transform: matrix }),
		});
	};

	const viewBoxOfSvg = svg.viewBox === undefined ? null : parseViewBox(svg.viewBox);
	/** The width and height percentages in user space are of: the viewBox's, else the svg's own size in px. */
	const viewport: readonly [number, number] | null = viewBoxOfSvg
		? [viewBoxOfSvg[2], viewBoxOfSvg[3]]
		: (() => {
				const [w, h] = [svg.width, svg.height].map((raw) => (raw === undefined ? null : parseLength(raw)));
				return w != null && h != null ? ([w, h] as const) : null;
			})();
	const checkedGradients = new Set<string>();
	const checkGradient = (gradient: DrawingElement) => {
		if (checkedGradients.has(gradient.id)) return;
		checkedGradients.add(gradient.id);
		const check = (element: DrawingElement, allowed: (name: string) => boolean) => {
			for (const name of element.bound)
				refuse(element.id, `\`${name}\` on <${element.tag}> follows state; a native drawing is compiled when the app is built`);
			for (const name of Object.keys(element.attributes))
				if (!GRADIENT_INERT.has(name) && !name.startsWith('data-') && !allowed(name))
					refuse(element.id, `\`${name}\` on <${element.tag}>, which a native drawing does not draw yet`);
		};
		check(gradient, (name) => GRADIENT_SHARED.has(name) || GRADIENT_GEOMETRY[gradient.tag]!.includes(name) || name === 'color-interpolation');
		const interpolation = gradient.attributes['color-interpolation']?.trim();
		if (interpolation !== undefined && interpolation !== 'auto' && interpolation !== 'sRGB')
			refuse(gradient.id, `\`color-interpolation="${interpolation}"\` on <${gradient.tag}>: a gradient blends in sRGB only natively yet`);
		for (const child of childrenOf(gradient.path)) {
			if (child.tag === 'stop') check(child, (name) => STOP_ATTRIBUTES.has(name));
			else if (child.tag !== 'title' && child.tag !== 'desc' && child.tag !== 'metadata')
				refuse(child.id, `<${child.tag}> inside <${gradient.tag}>, whose <stop>s alone are drawn natively`);
		}
	};

	/** SVG 2 §14.2: the gradient `url(#id)` paints a shape with; one colour or none where the spec says so. */
	const gradientOf = (
		element: DrawingElement,
		name: 'fill' | 'stroke',
		server: PaintServer,
		outline: ReadonlyArray<number>,
		opacity: number,
		nested: boolean,
		solid: (paint: Paint) => Paint,
	): NativeShape['fill'] => {
		const target = byId.get(server.url);
		if (!target || !(target.tag in GRADIENT_GEOMETRY)) {
			if (server.fallback !== undefined && !target) return solid(server.fallback);
			refuse(
				element.id,
				target
					? `\`${name}="${server.raw}"\` on <${element.tag}> names a <${target.tag}>, which a native drawing does not paint with yet`
					: `\`${name}="${server.raw}"\` on <${element.tag}>, which names no <linearGradient> or <radialGradient> inside this <svg>`,
			);
			return null;
		}
		// SVG 2 §14.2.3: what a gradient leaves out it takes from the one its href names.
		const chain = [target];
		for (let at = target; ; ) {
			const href = (at.attributes.href ?? at.attributes['xlink:href'])?.trim();
			const next = href?.startsWith('#') ? byId.get(href.slice(1)) : undefined;
			if (!next || !(next.tag in GRADIENT_GEOMETRY)) break;
			if (chain.includes(next)) {
				refuse(at.id, `\`href="${href}"\` on <${at.tag}>, which leads back to itself`);
				return null;
			}
			chain.push(next);
			at = next;
		}
		for (const gradient of chain) checkGradient(gradient);
		const attribute = (attr: string, ownKind: boolean) =>
			chain.find((gradient) => (!ownKind || gradient.tag === target.tag) && gradient.attributes[attr] !== undefined)
				?.attributes[attr];
		const units = attribute('gradientUnits', false)?.trim() ?? 'objectBoundingBox';
		if (units !== 'objectBoundingBox' && units !== 'userSpaceOnUse') {
			refuse(target.id, `\`gradientUnits="${units}"\` on <${target.tag}>`);
			return null;
		}
		const spread = attribute('spreadMethod', false)?.trim() ?? 'pad';
		if (spread !== 'pad') {
			refuse(target.id, `\`spreadMethod="${spread}"\` on <${target.tag}>: a gradient is drawn padded only natively yet`);
			return null;
		}
		const rawTransform = attribute('gradientTransform', false);
		const gradientTransform = rawTransform === undefined ? IDENTITY : parseTransform(rawTransform);
		if (gradientTransform === null || gradientTransform[0] * gradientTransform[3] - gradientTransform[1] * gradientTransform[2] === 0) {
			refuse(target.id, `\`gradientTransform="${rawTransform}"\` on <${target.tag}>`);
			return null;
		}

		type Stop = { offset: number; r: number; g: number; b: number; a: number };
		const stops: Stop[] = [];
		const owner = chain.find((gradient) => childrenOf(gradient.path).some((child) => child.tag === 'stop'));
		for (const stop of owner ? childrenOf(owner.path).filter((child) => child.tag === 'stop') : []) {
			const rawOffset = stop.attributes.offset?.trim();
			let offset = 0;
			if (rawOffset !== undefined) {
				const value = parseNumberList(rawOffset.endsWith('%') ? rawOffset.slice(0, -1) : rawOffset);
				if (value?.length !== 1) refuse(stop.id, `\`offset="${rawOffset}"\` on <stop>, which is not a number or a percentage`);
				else offset = rawOffset.endsWith('%') ? value[0]! / 100 : value[0]!;
			}
			offset = Math.max(Math.min(Math.max(offset, 0), 1), stops.at(-1)?.offset ?? 0);
			const rawColor = stop.attributes['stop-color']?.trim() ?? 'black';
			const current = rawColor === 'currentColor' || rawColor === 'currentcolor';
			const colorText = current ? (stop.attributes.color ?? owner!.attributes.color) : rawColor;
			const color = colorText === undefined ? null : parseColor(colorText);
			if (!color) {
				refuse(
					stop.id,
					current
						? "`stop-color=\"currentColor\"` on <stop> without a `color` on it or its gradient: its colour comes from the page's styles"
						: `\`stop-color="${rawColor}"\` on <stop>`,
				);
				continue;
			}
			const rawOpacity = stop.attributes['stop-opacity'];
			const stopOpacity = rawOpacity === undefined ? 1 : parseOpacity(rawOpacity);
			if (stopOpacity === null) refuse(stop.id, `\`stop-opacity="${rawOpacity}"\` on <stop>`);
			stops.push({ offset, r: color.r, g: color.g, b: color.b, a: (color.alpha / 255) * (stopOpacity ?? 1) });
		}
		const colorOf = (stop: Stop): NativeColor => ({
			r: Math.round(stop.r),
			g: Math.round(stop.g),
			b: Math.round(stop.b),
			alpha: Math.round(stop.a * opacity * 255),
		});
		if (stops.length === 0) return null;
		const last = colorOf(stops.at(-1)!);
		if (stops.length === 1) return last;

		const box = units === 'objectBoundingBox' ? boundsOf(outline) : null;
		if (units === 'objectBoundingBox' && (!box || box[2] === 0 || box[3] === 0)) return null;
		const length = (attr: string, fallback: string, axis: 0 | 1 | 2): number | null => {
			const written = attribute(attr, true)?.trim();
			const raw = written ?? fallback;
			const percent = raw.endsWith('%');
			const value = parseNumberList(percent ? raw.slice(0, -1) : raw);
			if (value?.length !== 1 || (!percent && parseLength(raw) === null)) {
				refuse(target.id, `\`${attr}="${raw}"\` on <${target.tag}>, which is not a number or a percentage`);
				return null;
			}
			if (!percent) return value[0]!;
			const fraction = value[0]! / 100;
			if (units === 'objectBoundingBox' || fraction === 0) return fraction;
			if (!viewport || nested) {
				refuse(
					target.id,
					`${written === undefined ? `\`${attr}\`, ${raw} when it is not written,` : `\`${attr}="${raw}"\``} on <${target.tag}> in user space: a percentage is drawn natively only for a shape the outer <svg> draws, which has a viewBox or a size`,
				);
				return null;
			}
			const [w, h] = viewport;
			return fraction * (axis === 0 ? w : axis === 1 ? h : Math.sqrt((w * w + h * h) / 2));
		};
		let geometry: { linear: [number, number, number, number] } | { radial: [number, number, number, number, number, number] };
		if (target.tag === 'linearGradient') {
			const [x1, y1, x2, y2] = [length('x1', '0%', 0), length('y1', '0%', 1), length('x2', '100%', 0), length('y2', '0%', 1)];
			if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
			if (x1 === x2 && y1 === y2) return last;
			geometry = { linear: [x1, y1, x2, y2] };
		} else {
			const [cx, cy, r] = [length('cx', '50%', 0), length('cy', '50%', 1), length('r', '50%', 2)];
			if (cx === null || cy === null || r === null) return null;
			const fx = attribute('fx', true) === undefined ? cx : length('fx', '50%', 0);
			const fy = attribute('fy', true) === undefined ? cy : length('fy', '50%', 1);
			const fr = length('fr', '0%', 2);
			if (fx === null || fy === null || fr === null) return null;
			if (r < 0 || fr < 0) {
				refuse(target.id, `a negative \`${r < 0 ? 'r' : 'fr'}\` on <radialGradient>`);
				return null;
			}
			if (r === 0) return last;
			if (Math.hypot(fx - cx, fy - cy) + fr > r * (1 + 1e-9)) {
				refuse(
					target.id,
					'`fx`, `fy` and `fr` on <radialGradient> put its focal circle outside its circle, which the browser draws as a cone: not drawn natively yet',
				);
				return null;
			}
			geometry = { radial: [fx, fy, fr, cx, cy, r] };
		}

		const padded = [...stops];
		if (padded[0]!.offset > 0) padded.unshift({ ...padded[0]!, offset: 0 });
		if (padded.at(-1)!.offset < 1) padded.push({ ...padded.at(-1)!, offset: 1 });
		const out: NativeGradientStop[] = [];
		padded.forEach((stop, index) => {
			const before = padded[index - 1];
			if (
				before &&
				before.offset < stop.offset &&
				before.a !== stop.a &&
				(before.r !== stop.r || before.g !== stop.g || before.b !== stop.b)
			)
				for (let step = 1; step < ALPHA_BLEND_STEPS; step++) {
					const t = step / ALPHA_BLEND_STEPS;
					const mix = (key: 'offset' | 'r' | 'g' | 'b' | 'a') => before[key] + (stop[key] - before[key]) * t;
					out.push({ offset: mix('offset'), color: colorOf({ offset: 0, r: mix('r'), g: mix('g'), b: mix('b'), a: mix('a') }) });
				}
			out.push({ offset: stop.offset, color: colorOf(stop) });
		});
		const transform = multiply(box ? [box[2], 0, 0, box[3], box[0], box[1]] : IDENTITY, gradientTransform);
		const paint: NativeGradient = {
			...geometry,
			stops: out,
			...(transform.every((value, index) => value === IDENTITY[index]) ? {} : { transform }),
		};
		return paint;
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
		const refusedServers = new Set<PaintServer>();
		const paintOf = (at: Inherited): NativeDrawingTextRun['fill'] => {
			if (at.fill !== null && typeof at.fill === 'object' && 'url' in at.fill) {
				if (!refusedServers.has(at.fill))
					refuse(element.id, `\`fill="${at.fill.raw}"\` on <text>: text is filled with one colour natively yet`);
				refusedServers.add(at.fill);
				return null;
			}
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
		if (style.blur) refuse(style.blur.element, `a \`filter\` over text, which a native drawing does not blur yet`);
		spoken.push(shown.map((run) => run.text).join('').trim());
		shapes.push({
			...clipFields(style.clips),
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

	/** `clip-path="url(#id)"`: the <clipPath>'s shapes, in the user space of the element that names it, joined as one outline. */
	const clipped = (element: DrawingElement, style: Inherited, own: Matrix): Inherited => {
		const raw = element.attributes['clip-path']?.trim();
		if (raw === undefined || raw === 'none') return style;
		const id = raw.startsWith('url(#') && raw.endsWith(')') ? raw.slice(5, -1).trim() : undefined;
		const target = id === undefined ? undefined : byId.get(id);
		if (!target || target.tag !== 'clipPath') {
			refuse(element.id, `\`clip-path="${raw}"\` on <${element.tag}>, which names no <clipPath> inside this <svg>`);
			return style;
		}
		const units = target.attributes.clipPathUnits?.trim();
		if (units !== undefined && units !== 'userSpaceOnUse') {
			refuse(target.id, `\`clipPathUnits="${units}"\` on <clipPath>: a clip is drawn in user space only`);
			return style;
		}
		const base = multiply(own, transformOf(target));
		const outline: number[] = [];
		for (const child of childrenOf(target.path)) {
			if (!SHAPES.has(child.tag)) {
				if (!NEVER_DRAWN.has(child.tag))
					refuse(child.id, `<${child.tag}> inside <clipPath>, whose shapes alone clip natively yet`);
				continue;
			}
			if (child.attributes['clip-path'] !== undefined)
				refuse(child.id, `\`clip-path\` on a shape inside <clipPath>`);
			outline.push(...mapOutline(outlineOf(child), multiply(base, transformOf(child))));
		}
		return { ...style, clips: [...style.clips, { outline, rule: 'nonzero' }] };
	};

	/**
	 * `mask="url(#id)"` (CSS Masking 1 §7): a <mask> in user space whose content is shapes filled with one opaque colour (any
	 * colour for `mask-type="alpha"`, white for the default luminance) lets through exactly what those shapes cover inside its
	 * region, so it draws as a clip by them; any other mask is refused by name.
	 */
	const masked = (element: DrawingElement, style: Inherited, own: Matrix): Inherited => {
		const raw = element.attributes.mask?.trim();
		if (raw === undefined || raw === 'none') return style;
		const id = raw.startsWith('url(#') && raw.endsWith(')') ? raw.slice(5, -1).trim() : undefined;
		const target = id === undefined ? undefined : byId.get(id);
		if (!target || target.tag !== 'mask') {
			refuse(element.id, `\`mask="${raw}"\` on <${element.tag}>, which names no <mask> inside this <svg>`);
			return style;
		}
		for (const name of Object.keys(target.attributes))
			if (!MASK_ATTRIBUTES.has(name) && !PRESENTATION.has(name) && !NO_DRAWING_EFFECT.has(name) && !name.startsWith('data-'))
				refuse(target.id, `\`${name}\` on <mask>, which a native drawing does not draw yet`);
		const units = target.attributes.maskUnits?.trim() ?? 'objectBoundingBox';
		if (units !== 'userSpaceOnUse') {
			refuse(target.id, `\`maskUnits="${units}"\` on <mask>: a mask's region is drawn in user space only`);
			return style;
		}
		const contentUnits = target.attributes.maskContentUnits?.trim();
		if (contentUnits !== undefined && contentUnits !== 'userSpaceOnUse')
			refuse(target.id, `\`maskContentUnits="${contentUnits}"\` on <mask>: a mask's content is drawn in user space only`);
		const type = target.attributes['mask-type']?.trim() ?? 'luminance';
		if (type !== 'luminance' && type !== 'alpha') {
			refuse(target.id, `\`mask-type="${type}"\` on <mask>`);
			return style;
		}
		const sides = ['x', 'y', 'width', 'height'] as const;
		if (sides.some((side) => target.attributes[side] === undefined)) {
			refuse(target.id, '<mask> without `x`, `y`, `width` and `height`: its default region depends on the box of what it masks');
			return style;
		}
		const [x, y, width, height] = sides.map((side) => number(target, side));
		const base = multiply(own, transformOf(target));
		const region = mapOutline([0, x, y, 1, x + width, y, 1, x + width, y + height, 1, x, y + height, 4], base);
		const outline: number[] = [];
		const cuts: Clip[] = [];
		const maskStyle = inherit(target, INITIAL);
		for (const child of childrenOf(target.path)) {
			if (!SHAPES.has(child.tag)) {
				if (!NEVER_DRAWN.has(child.tag))
					refuse(child.id, `<${child.tag}> inside <mask>, whose filled shapes alone mask natively yet`);
				continue;
			}
			for (const name of ['clip-path', 'mask', 'filter'])
				if (child.attributes[name] !== undefined) refuse(child.id, `\`${name}\` on a shape inside <mask>`);
			const shape = inherit(child, maskStyle);
			const fill = shape.fill === 'currentColor' ? shape.color : shape.fill;
			if (fill === null) continue;
			const colour = 'url' in fill ? null : fill;
			const opaque = colour !== null && colour.alpha === 255 && shape.fillOpacity === 1 && shape.opacity === 1;
			const white = colour !== null && colour.r === 255 && colour.g === 255 && colour.b === 255;
			const black = colour !== null && colour.r === 0 && colour.g === 0 && colour.b === 0;
			const mapped = () => mapOutline(outlineOf(child), multiply(base, transformOf(child)));
			// Black painted over white in a luminance mask hides what it covers: the region with that shape cut out, filled even-odd.
			if (type === 'luminance' && opaque && black && shape.stroke === null) {
				if (shape.fillRule !== 'evenodd' && !['rect', 'circle', 'ellipse'].includes(child.tag) && !simpleOutline(outlineOf(child)))
					refuse(child.id, `a black <${child.tag}> filled nonzero that crosses itself or has several parts, inside a luminance <mask>: only an even-odd fill or one simple outline cuts a mask natively yet`);
				else cuts.push({ outline: [...region, ...mapped()], rule: 'evenodd' });
				continue;
			}
			if (cuts.length > 0 && white) {
				refuse(child.id, `a white <${child.tag}> after a black shape inside a luminance <mask>, which would show through the cut again`);
				continue;
			}
			if (!opaque || (type === 'luminance' && !white) || shape.stroke !== null || shape.fillRule !== 'nonzero') {
				refuse(
					child.id,
					`a <${child.tag}> inside a ${type} <mask> that is not one opaque ${type === 'luminance' ? 'white ' : ''}fill with no stroke: a mask of partial coverage is not drawn natively yet`,
				);
				continue;
			}
			outline.push(...mapped());
		}
		return {
			...style,
			clips: [...style.clips, { outline: region, rule: 'nonzero' }, { outline, rule: 'nonzero' }, ...cuts],
		};
	};

	/**
	 * SVG 2 §11.6: each <marker> drawn at the vertices it marks, rotated by its `orient`, scaled by the stroke width
	 * (`markerUnits="strokeWidth"`) and its viewBox, its `refX`/`refY` on the vertex, clipped to its box; its content takes
	 * its styles from where the marker is written, not from the shape.
	 */
	const placeMarkers = (outline: ReadonlyArray<number>, style: Inherited, own: Matrix, using: ReadonlySet<string>) => {
		const vertices = verticesOf(outline);
		if (vertices.length === 0) return;
		const place = (marker: DrawingElement, vertex: Vertex, first: boolean) => {
			if (using.has(marker.id)) return;
			checkAttributes(marker);
			const units = marker.attributes.markerUnits?.trim() ?? 'strokeWidth';
			if (units !== 'strokeWidth' && units !== 'userSpaceOnUse') {
				refuse(marker.id, `\`markerUnits="${units}"\` on <marker>`);
				return;
			}
			const orient = marker.attributes.orient?.trim() ?? '0';
			let angle: number;
			if (orient === 'auto' || orient === 'auto-start-reverse') {
				angle = vertex.angle + (orient === 'auto-start-reverse' && first ? Math.PI : 0);
			} else {
				const degrees = parseAngle(orient);
				if (degrees === null) {
					refuse(marker.id, `\`orient="${orient}"\` on <marker>`);
					return;
				}
				angle = (degrees * Math.PI) / 180;
			}
			const width = number(marker, 'markerWidth', 3);
			const height = number(marker, 'markerHeight', 3);
			const box = marker.attributes.viewBox === undefined ? null : parseViewBox(marker.attributes.viewBox);
			const aspect = marker.attributes.preserveAspectRatio?.trim();
			if (aspect !== undefined && parseAspect(aspect) !== 'default')
				refuse(marker.id, `\`preserveAspectRatio="${aspect}"\` on <marker>: a marker's viewBox is centred and fitted`);
			const fit = box ? fitViewBox(box, width, height) : IDENTITY;
			const refX = number(marker, 'refX');
			const refY = number(marker, 'refY');
			const scale = units === 'strokeWidth' ? style.width : 1;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			// The marker's box (its viewport) on the vertex: the ref point, through the viewBox, lands on the vertex.
			const viewport = multiply(
				multiply(own, [cos * scale, sin * scale, -sin * scale, cos * scale, vertex.x, vertex.y]),
				[1, 0, 0, 1, -(fit[0] * refX + fit[4]), -(fit[3] * refY + fit[5])],
			);
			const content = multiply(viewport, fit);
			const markerStyle: Inherited = {
				...inherit(marker, rootStyle),
				clips: [...style.clips, { outline: mapOutline([0, 0, 0, 1, width, 0, 1, width, height, 1, 0, height, 4], viewport), rule: 'nonzero' }],
			};
			const inner = new Set([...using, marker.id]);
			for (const child of childrenOf(marker.path)) visit(child, markerStyle, content, inner);
		};
		const { start, mid, end } = style.markers;
		vertices.forEach((vertex, index) => {
			const marker = index === 0 ? start : index === vertices.length - 1 ? end : mid;
			if (marker) place(marker, vertex, index === 0);
		});
	};

	/**
	 * `filter="url(#id)"` (Filter Effects 1): a filter that only blurs its source graphic, as design tools export a layer blur
	 * (an optional transparent `feFlood` with a normal `feBlend` of `SourceGraphic` over it, then one `feGaussianBlur`), in
	 * sRGB with a user-space region, over an element that draws one shape: that shape is drawn blurred inside the region. A
	 * clip or mask on the element or around it applies after; any other filter is refused by name.
	 */
	const filtered = (element: DrawingElement, style: Inherited, own: Matrix): Inherited => {
		const raw = element.attributes.filter?.trim();
		if (raw === undefined || raw === 'none') return style;
		const target = raw.startsWith('url(#') && raw.endsWith(')') ? byId.get(raw.slice(5, -1)) : undefined;
		if (!target || target.tag !== 'filter') {
			refuse(element.id, `\`filter="${raw}"\` on <${element.tag}>, which names no <filter> inside this <svg>`);
			return style;
		}
		if (style.blur) {
			refuse(element.id, `a \`filter\` inside another filtered element, which a native drawing does not draw yet`);
			return style;
		}
		const fail = (what: string): Inherited => {
			refuse(target.id, `${what}: a native drawing draws a filter that only blurs its source graphic`);
			return style;
		};
		for (const name of Object.keys(target.attributes))
			if (!FILTER_ATTRIBUTES.has(name)) return fail(`\`${name}\` on <filter>`);
		if (target.attributes.filterUnits?.trim() !== 'userSpaceOnUse') return fail('a <filter> region not in user space');
		if ((target.attributes.primitiveUnits?.trim() ?? 'userSpaceOnUse') !== 'userSpaceOnUse')
			return fail('a <filter> whose primitives are not in user space');
		if (target.attributes['color-interpolation-filters']?.trim() !== 'sRGB')
			return fail('a <filter> that blurs in linearRGB (no `color-interpolation-filters="sRGB"`)');
		for (const side of ['x', 'y', 'width', 'height'])
			if (target.attributes[side] === undefined) return fail(`a <filter> without \`${side}\``);
		const steps = childrenOf(target.path);
		let source = 'SourceGraphic';
		let at = 0;
		const flood = steps[at];
		if (flood?.tag === 'feFlood') {
			if (Object.keys(flood.attributes).some((name) => name !== 'flood-opacity' && name !== 'result' && name !== 'flood-color'))
				return fail('an <feFlood> with more than a colour, an opacity and a result');
			if (Number(flood.attributes['flood-opacity'] ?? '1') !== 0) return fail('an <feFlood> that is not transparent');
			const blend = steps[at + 1];
			if (
				blend?.tag !== 'feBlend' ||
				(blend.attributes.mode?.trim() ?? 'normal') !== 'normal' ||
				blend.attributes.in?.trim() !== 'SourceGraphic' ||
				blend.attributes.in2?.trim() !== flood.attributes.result?.trim() ||
				Object.keys(blend.attributes).some((name) => !['mode', 'in', 'in2', 'result'].includes(name))
			)
				return fail('an <feFlood> not followed by a normal <feBlend> of SourceGraphic over it');
			source = blend.attributes.result?.trim() ?? '';
			at += 2;
		}
		const blur = steps[at];
		if (blur?.tag !== 'feGaussianBlur' || at + 1 !== steps.length) return fail('a <filter> that does not end in one <feGaussianBlur>');
		if (Object.keys(blur.attributes).some((name) => !['stdDeviation', 'in', 'result', 'edgeMode'].includes(name)))
			return fail('an <feGaussianBlur> with more than a deviation, an input and a result');
		if ((blur.attributes.edgeMode?.trim() ?? 'none') !== 'none') return fail('an <feGaussianBlur> with an edge mode');
		const input = blur.attributes.in?.trim();
		if (input !== undefined && input !== source && !(at === 0 && input === 'SourceGraphic'))
			return fail('an <feGaussianBlur> of something other than the source graphic');
		const deviations = (blur.attributes.stdDeviation ?? '').trim().split(/[\s,]+/).map(Number);
		if (deviations.some((d) => !Number.isFinite(d) || d < 0) || (deviations.length === 2 && deviations[0] !== deviations[1]) || deviations.length > 2)
			return fail('an <feGaussianBlur> whose deviation is not one non-negative number');
		const [a, b, c, d] = own;
		const sx = Math.hypot(a, b);
		const sy = Math.hypot(c, d);
		if (Math.abs(sx - sy) > 1e-9 * Math.max(sx, sy) || Math.abs(a * c + b * d) > 1e-9 * sx * sy) {
			refuse(element.id, `a \`filter\` under a transform that stretches one axis more than the other`);
			return style;
		}
		const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((side) => number(target, side));
		return {
			...style,
			blur: {
				element: element.id,
				deviation: deviations[0]! * sx,
				region: mapOutline([0, x, y, 1, x + width, y, 1, x + width, y + height, 1, x, y + height, 4], own),
				clips: style.clips.length,
				drawn: { count: 0 },
			},
		};
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
		const own = multiply(matrix, transformOf(element));
		const style = filtered(element, masked(element, clipped(element, inherit(element, from), own), own), own);
		if (SHAPES.has(element.tag)) {
			const outline = outlineOf(element);
			emit(
				element,
				outline,
				style,
				own,
				using.size > 0 || elements.some((at) => at.tag === 'svg' && isPrefix(at.path, element.path)),
			);
			if (MARKABLE.has(element.tag)) placeMarkers(outline, style, own, using);
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

	const viewBox = viewBoxOfSvg;
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

type Vertex = { readonly x: number; readonly y: number; readonly angle: number };

/** A path's vertices in order, each with the direction a marker with `orient="auto"` takes there (SVG 2 §11.6.2). */
function verticesOf(outline: ReadonlyArray<number>): Vertex[] {
	type Point = { x: number; y: number; into?: [number, number] | undefined; out?: [number, number] | undefined };
	const points: Point[] = [];
	let start: Point | undefined;
	let i = 0;
	const direction = (from: { x: number; y: number }, ...to: [number, number][]): [number, number] | undefined => {
		for (const [x, y] of to) if (x !== from.x || y !== from.y) return [x - from.x, y - from.y];
		return undefined;
	};
	while (i < outline.length) {
		const verb = outline[i++]!;
		const previous = points.at(-1);
		if (verb === 0) {
			start = { x: outline[i]!, y: outline[i + 1]! };
			points.push(start);
			i += 2;
		} else if (verb === 1 && previous) {
			const next: Point = { x: outline[i]!, y: outline[i + 1]! };
			previous.out ??= direction(previous, [next.x, next.y]);
			next.into = direction(previous, [next.x, next.y]);
			points.push(next);
			i += 2;
		} else if (verb === 3 && previous) {
			const c1: [number, number] = [outline[i]!, outline[i + 1]!];
			const c2: [number, number] = [outline[i + 2]!, outline[i + 3]!];
			const next: Point = { x: outline[i + 4]!, y: outline[i + 5]! };
			previous.out ??= direction(previous, c1, c2, [next.x, next.y]);
			const back = direction(next, c2, c1, [previous.x, previous.y]);
			next.into = back ? [-back[0], -back[1]] : undefined;
			points.push(next);
			i += 6;
		} else if (verb === 4 && previous && start) {
			const closing: Point = { x: start.x, y: start.y, into: direction(previous, [start.x, start.y]) };
			previous.out ??= closing.into;
			points.push(closing);
		} else break;
	}
	const angleOf = (v: [number, number]) => Math.atan2(v[1], v[0]);
	return points.map((point) => {
		const { into, out } = point;
		let angle = 0;
		if (into && out) {
			const a = angleOf(into);
			const b = angleOf(out);
			let delta = b - a;
			while (delta > Math.PI) delta -= 2 * Math.PI;
			while (delta < -Math.PI) delta += 2 * Math.PI;
			angle = a + delta / 2;
		} else if (into) angle = angleOf(into);
		else if (out) angle = angleOf(out);
		return { x: point.x, y: point.y, angle };
	});
}

/** An `orient` angle: degrees, or with `deg`, `rad`, `grad` or `turn`. */
function parseAngle(raw: string): number | null {
	const match = NUMBER.exec(raw);
	if (!match) return null;
	const value = Number(match[0]);
	const unit = raw.slice(match[0].length);
	const scale: Readonly<Record<string, number>> = { '': 1, deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };
	return scale[unit] === undefined ? null : value * scale[unit]!;
}

/**
 * Whether a verb-coded outline is one closed subpath that never crosses itself (its cubics flattened), so that its nonzero
 * fill is its even-odd fill.
 */
function simpleOutline(outline: ReadonlyArray<number>): boolean {
	const points: Array<[number, number]> = [];
	let i = 0;
	while (i < outline.length) {
		const verb = outline[i++]!;
		if (verb === 0) {
			if (points.length > 0) return false;
			points.push([outline[i]!, outline[i + 1]!]);
			i += 2;
		} else if (verb === 1) {
			points.push([outline[i]!, outline[i + 1]!]);
			i += 2;
		} else if (verb === 3) {
			const [x0, y0] = points[points.length - 1]!;
			const [x1, y1, x2, y2, x3, y3] = outline.slice(i, i + 6) as [number, number, number, number, number, number];
			for (let step = 1; step <= 16; step++) {
				const t = step / 16;
				const u = 1 - t;
				points.push([
					u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
					u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
				]);
			}
			i += 6;
		} else if (verb === 4) {
			if (i !== outline.length) return false;
		} else return false;
	}
	const [first] = points;
	const last = points[points.length - 1];
	if (first && last && (first[0] !== last[0] || first[1] !== last[1])) points.push(first);
	const n = points.length - 1;
	if (n < 3) return false;
	const cross = (a: [number, number], b: [number, number], c: [number, number]) =>
		(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	const meet = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
		const [d1, d2, d3, d4] = [cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)];
		if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
		const on = (p: [number, number], q: [number, number], r: [number, number], side: number) =>
			side === 0 && Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
		return on(c, d, a, d1) || on(c, d, b, d2) || on(a, b, c, d3) || on(a, b, d, d4);
	};
	for (let a = 0; a < n; a++)
		for (let b = a + 2; b < n; b++) {
			if (a === 0 && b === n - 1) continue;
			if (meet(points[a]!, points[a + 1]!, points[b]!, points[b + 1]!)) return false;
		}
	return true;
}

/** A verb-coded outline with every point mapped by `m`; an affine map keeps lines and cubics what they are. */
function mapOutline(outline: ReadonlyArray<number>, m: Matrix): number[] {
	const out: number[] = [];
	let i = 0;
	const point = () => {
		const x = outline[i]!;
		const y = outline[i + 1]!;
		out.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
		i += 2;
	};
	while (i < outline.length) {
		const verb = outline[i++]!;
		out.push(verb);
		if (verb === 0 || verb === 1) point();
		else if (verb === 3) {
			point();
			point();
			point();
		}
	}
	return out;
}

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

/** `url(#id)`, optionally quoted, with a fallback paint after it; undefined when it is not one. */
function parsePaintServer(raw: string): PaintServer | undefined {
	const text = raw.trim();
	const close = text.indexOf(')');
	if (!text.startsWith('url(') || close < 0) return undefined;
	let target = text.slice(4, close).trim();
	if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'")))
		target = target.slice(1, -1).trim();
	if (!target.startsWith('#') || target.length === 1) return undefined;
	const rest = text.slice(close + 1).trim();
	if (rest === '') return { url: target.slice(1), raw: text };
	const fallback = parsePaint(rest);
	return fallback === undefined ? undefined : { url: target.slice(1), raw: text, fallback };
}

/** A verb-coded outline's tight bounding box (x, y, width, height), its curves' extremes included; null when it has no points. */
function boundsOf(outline: ReadonlyArray<number>): [number, number, number, number] | null {
	let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
	const add = (x: number, y: number) => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	};
	// Where a cubic's coordinate turns: the roots in (0, 1) of its derivative.
	const turns = (p0: number, p1: number, p2: number, p3: number): number[] => {
		const a = -p0 + 3 * p1 - 3 * p2 + p3;
		const b = 2 * (p0 - 2 * p1 + p2);
		const c = p1 - p0;
		if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
		const discriminant = b * b - 4 * a * c;
		if (discriminant < 0) return [];
		const root = Math.sqrt(discriminant);
		return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
	};
	const at = (p0: number, p1: number, p2: number, p3: number, t: number) =>
		(1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
	let i = 0;
	let x = 0;
	let y = 0;
	while (i < outline.length) {
		const verb = outline[i++]!;
		if (verb === 0 || verb === 1) {
			[x, y] = [outline[i]!, outline[i + 1]!];
			add(x, y);
			i += 2;
		} else if (verb === 3) {
			const [x1, y1, x2, y2, x3, y3] = outline.slice(i, i + 6) as [number, number, number, number, number, number];
			for (const t of [...turns(x, x1, x2, x3), ...turns(y, y1, y2, y3)])
				if (t > 0 && t < 1) add(at(x, x1, x2, x3, t), at(y, y1, y2, y3, t));
			[x, y] = [x3, y3];
			add(x, y);
			i += 6;
		} else if (verb !== 4) break;
	}
	return minX === Infinity ? null : [minX, minY, maxX - minX, maxY - minY];
}

/** A paint: `none`, `currentColor` or a colour; undefined for any other, such as `url(#gradient)`. */
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

/**
 * A `<path>` an svg draws while the app runs (it comes from a component or the svg's children): its paint, inherited from
 * the svg, read when the app is built. A `d` that follows state leaves `path` empty; the host draws what the engine
 * makes of it. Other attributes that follow state are refused, as on a compiled drawing.
 */
export function compileLiveShape(
	svg: Readonly<Record<string, string>>,
	element: DrawingElement,
	svgId: string,
): { readonly shape?: NativeShape; readonly refusals: ReadonlyArray<DrawingRefusal> } {
	const live = element.bound.includes('d');
	const result = compileDrawing(
		svg,
		[
			{
				...element,
				path: [0],
				attributes: live ? { ...element.attributes, d: 'M0 0' } : element.attributes,
				bound: element.bound.filter((name) => name !== 'd'),
			},
		],
		[],
		svgId,
	);
	const shape = result.drawing.shapes[0];
	return {
		...(shape ? { shape: live ? { ...shape, path: [] } : shape } : {}),
		refusals: result.refusals.filter((refusal) => refusal.element === element.id),
	};
}
