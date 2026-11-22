import {
	DEVICE_MODULE,
	type NativeDeviceCall,
	type NativeDeviceObject,
	type NativeDeviceValue,
} from './native-device.ts';
import type { ProtocolRepeatKeyParts } from './protocol.ts';

// The target-neutral view a native host builds retained views from: no HTML, no DOM positions, no script.
export const NATIVE_VIEW_VERSION = 'markless.native-view/0';

/** A bound attribute named with this prefix (`ui-open`, `ui-disabled`) is a style hook: CSS selects it, so Dragon compiles its states. */
export const NATIVE_STYLE_ATTRIBUTE_PREFIX = 'ui-';

/** Whether a bound attribute decides styles on native: the class, or a `ui-*` attribute. */
export const nativeStyleAttribute = (name: string): boolean =>
	name === 'class' || name.startsWith(NATIVE_STYLE_ATTRIBUTE_PREFIX);

export type NativeScalar = number | string | boolean;

/** A cell's value: JSON. */
export type NativeValue =
	| NativeScalar
	| null
	| ReadonlyArray<NativeValue>
	| { readonly [key: string]: NativeValue };

/** Array and string methods with JavaScript's meaning that return a new value; `reverse` only on a fresh array. */
export type NativeMethod =
	| 'filter'
	| 'map'
	| 'findIndex'
	| 'some'
	| 'every'
	| 'includes'
	| 'indexOf'
	| 'join'
	| 'concat'
	| 'slice'
	| 'reverse'
	| 'toReversed'
	| 'toUpperCase'
	| 'toLowerCase'
	| 'trim';

/** Calls a host implements with exact JavaScript meaning; nothing else can be called. */
export type NativeBuiltin =
	| 'String'
	| 'Number'
	| 'Boolean'
	| 'Math.abs'
	| 'Math.floor'
	| 'Math.max'
	| 'Math.min'
	| 'Math.round'
	/** The clock when the expression is evaluated, in milliseconds since 1970 (UTC): `Date.now()`, `new Date().getTime()`. */
	| 'Date.now'
	/** `new Date(ms).toISOString()`: UTC, `YYYY-MM-DDTHH:mm:ss.sssZ` (six-digit signed years outside 0 to 9999). */
	| 'Date.toISOString';

/**
 * A value computed from cells, evaluated by every host with JavaScript's meaning (numbers are IEEE doubles; `String()`,
 * `+`, comparisons, truthiness and `??` follow ECMAScript). The reference runtime and the conformance vectors pin it.
 */
export type NativeExpr =
	| { readonly cell: string }
	| { readonly literal: NativeScalar | null }
	/** `Infinity`, `-Infinity` or `NaN` (the globals, `Number.POSITIVE_INFINITY` and the like), which a JSON literal cannot hold. */
	| { readonly nonFinite: 'Infinity' | '-Infinity' | 'NaN' }
	/**
	 * `typeof` gives JavaScript's answer for a JSON value: 'string', 'number', 'boolean', or 'object' for an array, an
	 * object and null. A native value spells `undefined` as null, so the compiler emits it only compared with 'string',
	 * 'number' or 'boolean', where that cannot differ from the web.
	 */
	| { readonly unary: '!' | '-' | '+' | 'typeof'; readonly value: NativeExpr }
	| {
			readonly binary: '+' | '-' | '*' | '/' | '%' | '===' | '!==' | '<' | '<=' | '>' | '>=';
			readonly left: NativeExpr;
			readonly right: NativeExpr;
	  }
	| {
			readonly logical: '&&' | '||' | '??';
			readonly left: NativeExpr;
			readonly right: NativeExpr;
	  }
	| { readonly if: NativeExpr; readonly whenTrue: NativeExpr; readonly whenFalse: NativeExpr }
	| { readonly template: ReadonlyArray<string | NativeExpr> }
	/**
	 * `length` of a string or array, an array's element at an index (`"0"`, `"1"`: null past its end, as `undefined` on
	 * the web), or an own property of an object; anything else is a runtime error.
	 */
	| {
			readonly member: NativeExpr;
			readonly property: string;
			/** In an optional chain (`a?.b`): a null object gives null, as JavaScript gives undefined. */
			readonly optional?: true;
	  }
	/** An array's element at an index computed while the app runs: null when it is not an integer inside the array. */
	| { readonly at: NativeExpr; readonly of: NativeExpr }
	| { readonly array: ReadonlyArray<{ readonly spread: boolean; readonly value: NativeExpr }> }
	| { readonly object: ReadonlyArray<readonly [string, NativeExpr]> }
	/** An object from its parts in order (`{ ...row, name }`): each part's own fields, a later key winning; a null part adds nothing. */
	| { readonly merge: ReadonlyArray<NativeExpr> }
	| {
			readonly method: NativeMethod;
			readonly target: NativeExpr;
			readonly arguments: ReadonlyArray<NativeExpr>;
	  }
	/** Only as a method argument: the parameters read as `{ local }` inside `body`. */
	| { readonly lambda: ReadonlyArray<string>; readonly body: NativeExpr }
	| { readonly local: string }
	/** The current row's item of a list (`repeat` node id). */
	| { readonly item: string }
	/** The current row's position in its list (`repeat` node id), from 0: a `@for`'s `index`. */
	| { readonly index: string }
	/** The page's route params, an object of strings (the page component's `params` prop). */
	| { readonly route: 'params' }
	| { readonly call: NativeBuiltin; readonly arguments: ReadonlyArray<NativeExpr> }
	/** In an `input` handler: the field's text after the edit (`event.currentTarget.value`). */
	/**
	 * What the event that runs the handler carries: an `input` handler's field text after the edit
	 * (`event.currentTarget.value`); a `dismiss` handler's `event.detail.reason` and `event.detail.pressTarget` (an element,
	 * or null for Escape); a pointer handler's fields, as a phone's browser reports a touch (`NativePointerField`); a text
	 * field's `keydown` or `keyup` handler's `event.key`, as the phone's browser gives it for its on-screen keyboard; a `paste`
	 * handler's pasted plain text (`event.clipboardData.getData('text')`); a click handler's `event.detail`, how many presses
	 * in a row on the element (a double tap's second press is 2).
	 */
	| {
			readonly event:
				| 'value'
				| 'reason'
				| 'pressTarget'
				| 'key'
				| 'text'
				| 'detail'
				| NativePointerField;
	  }
	/** Whether the element `node` has captured the pointer `pointer` (`node.hasPointerCapture(pointer)`). */
	| { readonly captures: NativeExpr; readonly pointer: NativeExpr }
	/**
	 * `new FormData(form)`: the form's entry list as the web builds it, `[name, value]` pairs in tree order. A field is left
	 * out when it is disabled or has no name, a checkbox when it is not checked; a checkbox's value is its `value` attribute
	 * or "on", a text field's its text now, a hidden input's its `value` attribute, a `<select>`'s its selected option's
	 * value (left out when no option is selected).
	 */
	| { readonly formData: string }
	/** A checkbox's or radio button's checkedness now: what its `checked` binding last set, or a person's tick since. */
	| { readonly checked: string }
	/** A text field's text now (`field.value`): what a person typed since, else its `value` binding, else its `value` attribute. */
	| { readonly field: string }
	/** The element that has focus (`document.activeElement`), or the document body when none has. */
	| { readonly focused: true }
	/** Whether the element `node` is `within` or inside it (`within.contains(node)`); false when either is not an element. */
	| { readonly contains: NativeExpr; readonly node: NativeExpr }
	/** The element that had focus when the overlay element `overlay` was last shown, or null if it never was. */
	| { readonly focusOrigin: NativeExpr }
	/** Whether the value is an element (`value instanceof HTMLElement`). */
	| { readonly isElement: NativeExpr }
	/** Whether a node is shown now: every @if arm around it holds (an element a handle holds only while its arm shows). */
	| { readonly shown: string }
	/** `document.getElementById(value)`: the first shown element whose `id` attribute is the value now, else null. */
	| { readonly byId: NativeExpr }
	/**
	 * The element `drawn` (a node id in an `@if` arm) if it was on screen when this run began, else null: a handle bound
	 * inside an arm, which the web binds only once the arm is drawn, so a write in the same handler that opens the arm
	 * does not bind it yet.
	 */
	| { readonly drawn: string }
	/** A computed whose body runs in the script engine: function `script` of the payload's script, called with `bindings`. */
	| { readonly script: string; readonly bindings: NativeScriptBindings };

/**
 * Elements are values: an element is its node id, and the document body (what `document.activeElement` answers when no
 * element has focus, and `element.ownerDocument.body`) is this id, which no node has.
 */
export const NATIVE_DOCUMENT_BODY = '#body';

/** A handle whose element is not on the page, as JavaScript on the phone receives it: it reads as `undefined`, as on the web. */
export const NATIVE_UNBOUND_HANDLE = '#unbound';

/**
 * What the names of a script function mean, resolved where it runs: a cell it may write (inside a list row the host reads
 * and writes that row's value, `<cell>@<key>`), a state object as one cell per field, or a value it only reads.
 */
export type NativeScriptBinding =
	| { readonly cell: string }
	| { readonly fields: Readonly<Record<string, string>> }
	| { readonly value: NativeExpr }
	/** A device object the component made (`cam`): the script calls its methods through the host. */
	| { readonly device: NativeDeviceObject; readonly object: string }
	/**
	 * An element (its node id) or an array of them, which the function reads through proxies: `getAttribute`,
	 * `hasAttribute`, `contains`, `getBoundingClientRect`, `getComputedStyle(element).direction`, and the commands
	 * `focus` and `scrollIntoView`. The host answers each read from the entry's `elements`: the attributes each element
	 * has now, the elements it is inside, and the box and direction its view had when the entry began.
	 */
	| { readonly elements: NativeExpr }
	/** A family's shared object, member by member. */
	| { readonly object: Readonly<Record<string, NativeScriptBinding>> }
	/** A shared object's method: the script function `method` returns, run over its own `bindings` when called. */
	| { readonly method: string; readonly bindings: Readonly<Record<string, NativeScriptBinding>> }
	/** A `shared()` accessor (`selectState`): a function that returns that object. */
	| { readonly shared: Readonly<Record<string, NativeScriptBinding>> }
	/** A function a parent passed as a prop: the script function `callback`, its own names bound as `<name>.<its name>`. */
	| { readonly callback: string };

export type NativeScriptBindings = Readonly<Record<string, NativeScriptBinding>>;

/**
 * Host services a payload's script uses, so a host provides only those: timers (`setTimeout` and the rest, through
 * `timer` entries), `fetch` (through `fetch` entries), `console`, `crypto.randomUUID` (from a `seed` the host passes),
 * `navigate` from @markless/router (through a `navigate` entry; the host passes the page's route `params`), and
 * `@markless/device` calls (through `call` entries, answered with `resume` or `reject` actions).
 */
export type NativeScriptService =
	| 'timers'
	| 'fetch'
	| 'console'
	| 'crypto'
	| 'navigate'
	| 'device'
	| 'media'
	| 'screen';

/** The media features a script's `matchMedia` reads, each with the values a phone answers from its settings, first the web's default. */
export const NATIVE_SCRIPT_MEDIA_FEATURES = {
	'prefers-reduced-motion': ['no-preference', 'reduce'],
	'prefers-color-scheme': ['light', 'dark'],
} as const;

/** The device's answer to each media feature now, which every script entry of a page that reads `matchMedia` carries. */
export type NativeScriptMedia = {
	readonly [Feature in keyof typeof NATIVE_SCRIPT_MEDIA_FEATURES]: (typeof NATIVE_SCRIPT_MEDIA_FEATURES)[Feature][number];
};

/** The screen a script's `devicePixelRatio` reads as each entry begins: device pixels per CSS px, as the phone's browser reports it. */
export type NativeScriptScreen = { readonly devicePixelRatio: number };

/** The web's answers with no setting changed, which a host without a value for a feature reports. */
export const NATIVE_SCRIPT_MEDIA_DEFAULTS: NativeScriptMedia = {
	'prefers-reduced-motion': NATIVE_SCRIPT_MEDIA_FEATURES['prefers-reduced-motion'][0],
	'prefers-color-scheme': NATIVE_SCRIPT_MEDIA_FEATURES['prefers-color-scheme'][0],
};

/** The JavaScript a payload's `script` ops and script computeds run, in the platform's engine, started on first use. */
export type NativeScript = {
	/** Content hash of `source`: the engine keeps each payload's script under it (`globalThis.__markless[id]`). */
	readonly id: string;
	readonly source: string;
	readonly services: ReadonlyArray<NativeScriptService>;
};

/** Every cell an expression reads. */
export function nativeExprCells(expr: NativeExpr, into = new Set<string>()): Set<string> {
	if ('cell' in expr) into.add(expr.cell);
	// A script binding's `fields` names the cells of a state object the script reads.
	if ('fields' in expr && expr.fields && typeof expr.fields === 'object')
		for (const cell of Object.values(expr.fields as Record<string, unknown>))
			if (typeof cell === 'string') into.add(cell);
	for (const child of Object.values(expr)) {
		if (Array.isArray(child)) {
			for (const item of child)
				if (item && typeof item === 'object')
					nativeExprCells((Array.isArray(item) ? item[1] : item) as NativeExpr, into);
		} else if (child && typeof child === 'object') nativeExprCells(child as NativeExpr, into);
	}
	return into;
}

export type NativeTextPart =
	| { readonly text: string }
	| { readonly cell: string }
	| { readonly expr: NativeExpr };

/** Where a node sits when it belongs to one arm of an `@if`: shown only while that arm is chosen. */
export type NativeArmPlace = { readonly branch: string; readonly index: number };
/** A branch's style state when it shows no arm (an `@if` with no `@else` whose test fails); otherwise its arm's index. */
export const NATIVE_NO_ARM = 'none';

/** Where a node sits: in an `@if` arm, or in a list row (`row` names the `repeat` node). */
export type NativePlace = { readonly arm?: NativeArmPlace; readonly row?: string };

/**
 * How an element looks and flows under the browser's default stylesheet, as data, so hosts need no table of tags. Hosts
 * apply it only when no style export decides the element's look (Dragon's export already holds the default stylesheet).
 */
export type NativeDefaultStyle = {
	/**
	 * `inline`: the element's text flows on in its parent's text, as one paragraph (`<strong>`, `<code>`, `<time>`).
	 * `break`: a line break inside that text (`<br>`). Absent: a box that stacks.
	 */
	readonly flow?: 'inline' | 'break';
	readonly bold?: true;
	readonly italic?: true;
	readonly monospace?: true;
	/** Font size as a multiple of the parent's (`<h1>` 2, `<small>` 0.833, `<code>` 0.8125). */
	readonly size?: number;
	readonly line?: 'underline' | 'line-through';
	readonly shift?: 'sub' | 'super';
	/** `<mark>`: black text on yellow. */
	readonly highlight?: true;
	/** `<q>`: the text inside curly quotes. */
	readonly quotes?: true;
	/** `<pre>`: whitespace and line breaks kept, no wrapping; a longer line scrolls sideways. */
	readonly preformatted?: true;
	/** Space before the content on the start side, in CSS pixels (`<blockquote>`, `<dd>`, `<ul>`). */
	readonly indent?: number;
	/** `<hr>`: a thin horizontal line across the box. */
	readonly rule?: true;
	/** On `<ul>` and `<ol>`: the marker each item shows before its content. */
	readonly marker?: 'disc' | 'decimal';
	/** On `<summary>`: a triangle before its content, not read aloud: ▸ while its `aria-expanded` is false, ▾ while true. */
	readonly disclosure?: true;
	/** Table structure: `<td>` and `<th>` cells line up in columns across the rows of their `<table>`. */
	readonly table?: 'table' | 'row' | 'cell';
};

const MONOSPACE: NativeDefaultStyle = { monospace: true, size: 0.8125 };
const SMALLER = 1 / 1.2;

/**
 * The HTML elements every native host builds, with their look under Chrome's default stylesheet where it is more than a box
 * of plain text. Elements the web never shows are in `NATIVE_UNSHOWN_ELEMENTS`; anything else is refused by the compiler.
 */
export const NATIVE_ELEMENTS: Readonly<Record<string, NativeDefaultStyle>> = {
	main: {},
	div: {},
	section: {},
	article: {},
	header: {},
	footer: {},
	nav: {},
	aside: {},
	hgroup: {},
	search: {},
	/** A group of a form's controls, its `<legend>` the group's caption (Chrome's border is the page's to style). */
	fieldset: {},
	legend: {},
	p: {},
	h1: { bold: true, size: 2 },
	h2: { bold: true, size: 1.5 },
	h3: { bold: true, size: 1.17 },
	h4: { bold: true },
	h5: { bold: true, size: 0.83 },
	h6: { bold: true, size: 0.67 },
	address: { italic: true },
	blockquote: { indent: 40 },
	figure: { indent: 40 },
	figcaption: {},
	hr: { rule: true },
	pre: { ...MONOSPACE, preformatted: true },
	ul: { indent: 40, marker: 'disc' },
	ol: { indent: 40, marker: 'decimal' },
	menu: { indent: 40, marker: 'disc' },
	li: {},
	dl: {},
	dt: {},
	dd: { indent: 40 },
	table: { table: 'table' },
	caption: {},
	thead: {},
	tbody: {},
	tfoot: {},
	tr: { table: 'row' },
	td: { table: 'cell' },
	th: { table: 'cell', bold: true },
	span: { flow: 'inline' },
	b: { flow: 'inline', bold: true },
	strong: { flow: 'inline', bold: true },
	i: { flow: 'inline', italic: true },
	em: { flow: 'inline', italic: true },
	cite: { flow: 'inline', italic: true },
	var: { flow: 'inline', italic: true },
	dfn: { flow: 'inline', italic: true },
	code: { flow: 'inline', ...MONOSPACE },
	kbd: { flow: 'inline', ...MONOSPACE },
	samp: { flow: 'inline', ...MONOSPACE },
	tt: { flow: 'inline', ...MONOSPACE },
	small: { flow: 'inline', size: SMALLER },
	sub: { flow: 'inline', size: SMALLER, shift: 'sub' },
	sup: { flow: 'inline', size: SMALLER, shift: 'super' },
	u: { flow: 'inline', line: 'underline' },
	ins: { flow: 'inline', line: 'underline' },
	s: { flow: 'inline', line: 'line-through' },
	del: { flow: 'inline', line: 'line-through' },
	strike: { flow: 'inline', line: 'line-through' },
	mark: { flow: 'inline', highlight: true },
	q: { flow: 'inline', quotes: true },
	abbr: { flow: 'inline' },
	time: { flow: 'inline' },
	data: { flow: 'inline' },
	output: { flow: 'inline' },
	bdi: { flow: 'inline' },
	bdo: { flow: 'inline' },
	wbr: { flow: 'inline' },
	br: { flow: 'break' },
	button: {},
	input: {},
	textarea: {},
	a: {},
	img: {},
	/** The platform's web view showing the page its `src` names, a fixed http(s) URL. */
	iframe: {},
	audio: {},
	label: {},
	dialog: {},
	details: {},
	summary: { disclosure: true },
	form: {},
	select: {},
	option: {},
	svg: {},
};

/** Names HTML reserves though they hold a hyphen (SVG and MathML elements), so none is a custom element. */
const RESERVED_HYPHENATED = new Set([
	'annotation-xml',
	'color-profile',
	'font-face',
	'font-face-src',
	'font-face-uri',
	'font-face-format',
	'font-face-name',
	'missing-glyph',
]);

/**
 * An element's default look on a phone: a listed element's, or for a custom element the app never defines (a lowercase
 * name with a hyphen, as `<app-root>`) the browser's for an unknown element, an inline container.
 */
export function nativeElementStyle(element: string): NativeDefaultStyle | undefined {
	if (Object.hasOwn(NATIVE_ELEMENTS, element)) return NATIVE_ELEMENTS[element];
	const custom =
		element.includes('-') &&
		/^[a-z][a-z0-9._-]*$/.test(element) &&
		!RESERVED_HYPHENATED.has(element);
	return custom ? { flow: 'inline' } : undefined;
}

/**
 * Elements the web never shows in the page, so a native page shows nothing for them either: document metadata and hints
 * (`<meta>`, `<link>` but a stylesheet, `<base>`), inert markup (`<template>`), and content for browsers that run no scripts
 * (`<noscript>`), since a native app runs its handlers.
 */
export const NATIVE_UNSHOWN_ELEMENTS: ReadonlySet<string> = new Set([
	'meta',
	'link',
	'template',
	'noscript',
]);

/**
 * `<script type>` values that hold data rather than code (structured data for search engines, markup a script reads):
 * the browser runs nothing for them, so a native page shows nothing for them either. A script of any other type runs code.
 */
export const NATIVE_DATA_SCRIPT_TYPES: ReadonlySet<string> = new Set([
	'application/ld+json',
	'application/json',
	'importmap',
	'speculationrules',
	'text/html',
	'text/template',
]);

/** A colour as eight-bit red, green, blue and alpha. */
export type NativeColor = {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly alpha: number;
};

/** A gradient's colour at `offset` (0 to 1, never less than the stop before it). */
export type NativeGradientStop = { readonly offset: number; readonly color: NativeColor };

/**
 * An SVG `<linearGradient>` or `<radialGradient>` paint (SVG 2 §14.2), padded: the first stop's colour before it, the last
 * one's after it. The first stop is at 0 and the last at 1. Colours blend unpremultiplied in sRGB, as the browser blends
 * them; where two stops differ in both colour and alpha the compiler adds stops between them, so a host that blends
 * premultiplied draws the same colours.
 */
export type NativeGradient = (
	| { readonly linear: readonly [x1: number, y1: number, x2: number, y2: number] }
	/** From the focal circle (fx, fy, fr) to the circle (cx, cy, r), which holds it. */
	| { readonly radial: readonly [fx: number, fy: number, fr: number, cx: number, cy: number, r: number] }
) & {
	readonly stops: ReadonlyArray<NativeGradientStop>;
	/** The affine map from the gradient's units to the shape's: its bounding box, then `gradientTransform`. */
	readonly transform?: readonly [number, number, number, number, number, number];
};

/** One shape of a drawing; numbers are in the drawing's user units. */
export type NativeShape = {
	/**
	 * The outline as verb-coded numbers (Dragon's svg-shapes coding): 0 move x y, 1 line x y, 3 cubic x1 y1 x2 y2 x y,
	 * 4 close. Arcs, quadratics and every other SVG shape arrive as these.
	 */
	readonly path: ReadonlyArray<number>;
	/** `currentColor` is the svg's text colour: its style export's, else the page's default black. */
	readonly fill: NativeColor | 'currentColor' | NativeGradient | null;
	readonly fillRule: 'nonzero' | 'evenodd';
	readonly stroke: NativeColor | 'currentColor' | NativeGradient | null;
	readonly width: number;
	readonly cap: 'butt' | 'round' | 'square';
	readonly join: 'miter' | 'round' | 'bevel';
	readonly miterLimit: number;
	/** The affine map from the shape's units to the drawing's (`[a, b, c, d, e, f]`), from `transform` on it and its groups. */
	readonly transform?: readonly [number, number, number, number, number, number];
	/** A `<text>` element: its `path` is empty, and the host lays out and fills these runs instead. */
	readonly text?: NativeDrawingText;
	/**
	 * The `clip-path`s on it and its groups, each an outline (verb-coded, nonzero) already in the drawing's units: it is
	 * drawn only where every one of them covers, as the browser clips it.
	 */
	readonly clip?: ReadonlyArray<ReadonlyArray<number>>;
	/** The rule that fills each `clip` outline, present only when one is `evenodd` (a luminance mask with black shapes cut out). */
	readonly clipRule?: ReadonlyArray<'nonzero' | 'evenodd'>;
	/**
	 * An SVG `filter` that blurs the shape alone (`feGaussianBlur` of its source graphic, in sRGB): the blur's standard
	 * deviation in the drawing's units, and the filter region the blurred shape is drawn inside (verb-coded, in the drawing's
	 * units). Its `clip`s apply to the blurred result, as they do on the web.
	 */
	readonly blur?: { readonly deviation: number; readonly region: ReadonlyArray<number> };
};

/**
 * An SVG `<text>`, drawn as the browser draws it: its runs (its own text and each `<tspan>`'s, in document order, with
 * white space already collapsed or kept by `xml:space`) are laid out one after another from the pen. A run's `x` or `y`
 * moves the pen there and starts a new chunk; `dx` and `dy` shift it. Each chunk is placed by `anchor` (start, middle or
 * end at the pen's place) and every glyph sits on `baseline` relative to the pen's `y`.
 */
export type NativeDrawingText = {
	readonly anchor: 'start' | 'middle' | 'end';
	/** `auto` and `alphabetic` put the alphabetic baseline at `y`; the others move the em box as the browser does. */
	readonly baseline:
		| 'alphabetic'
		| 'middle'
		| 'central'
		| 'hanging'
		| 'text-top'
		| 'text-bottom'
		| 'ideographic';
	readonly runs: ReadonlyArray<NativeDrawingTextRun>;
};

export type NativeDrawingTextRun = {
	readonly text: string;
	readonly x?: number;
	readonly y?: number;
	readonly dx?: number;
	readonly dy?: number;
	/** The font size in user units. */
	readonly size: number;
	/** 100 to 900; 400 is normal, 700 bold. */
	readonly weight: number;
	/** The generic family the run's `font-family` names or falls back to; the page's text font when absent. */
	readonly family?: 'serif' | 'sans-serif' | 'monospace';
	/** Extra advance after each glyph, in user units. */
	readonly letterSpacing: number;
	readonly fill: NativeColor | 'currentColor' | null;
};

/** An inline `<svg>`, compiled when the app is built: the host draws `shapes` in the element's box. */
export type NativeDrawing = {
	/** min-x, min-y, width and height; placed in the box by `aspect`, as the web does. */
	readonly viewBox: readonly [number, number, number, number] | null;
	/**
	 * The svg's `preserveAspectRatio`, absent for the default `xMidYMid meet` (one scale that fits, centred): `none`
	 * stretches the viewBox to the box; otherwise one scale that fits (`meet`) or fills (`slice`, clipped to the box), the
	 * viewBox aligned at the min, middle or max of each axis.
	 */
	readonly aspect?:
		| 'none'
		| {
				readonly x: 'min' | 'mid' | 'max';
				readonly y: 'min' | 'mid' | 'max';
				readonly slice?: true;
		  };
	/** The `width` and `height` attributes in CSS pixels; without a size the box is the web's: full width, the viewBox's ratio. */
	readonly width?: number;
	readonly height?: number;
	/** `width` and `height` are in ems of the svg's font size (`width="1em"`), not CSS pixels. */
	readonly em?: true;
	readonly shapes: ReadonlyArray<NativeShape>;
	/** The text its `<text>` elements show, which a screen reader reads when the svg has no name, as the browser exposes it. */
	readonly label?: string;
};

export type NativeNode = NativePlace &
	(
		| {
				readonly kind: 'element';
				readonly id: string;
				/** The authored tag; each platform maps it to the view it builds. */
				readonly element: string;
				readonly parent: string | null;
				/** The browser's default look of this element, when it differs from a plain box of plain text. */
				readonly defaultStyle?: NativeDefaultStyle;
				/**
				 * On an `<svg>`: what it draws when the app is built. Shapes from a component or its `{children}` are nodes inside
				 * it with a `shape`, drawn after these in tree order. A `viewBox` binding gives the viewBox while the app runs, as the
				 * engine's four numbers, space-separated (null: none).
				 */
				readonly drawing?: NativeDrawing;
				/**
				 * On a shape inside an `<svg>` (a `<path>`): its paint, read when the app is built, and its outline when that is
				 * fixed. A `d` binding gives the outline while the app runs, as the engine's verb-coded numbers, space-separated.
				 * The svg draws it; it has no view of its own.
				 */
				readonly shape?: NativeShape;
				/**
				 * A live region (`aria-live`, `role="status"`, `"alert"` or `"log"`, `<output>`): a change to the text inside is
				 * announced, after the screen reader's current speech when polite; `atomic` reads the whole region, else the changed text.
				 */
				readonly live?: {
					readonly politeness: 'polite' | 'assertive';
					readonly atomic: boolean;
				};
				/**
				 * A live region whose `role`, `aria-live` or `aria-atomic` follows state: its politeness (`'polite'`,
				 * `'assertive'` or null for none) and atomicity now, which the host evaluates each time it speaks.
				 */
				readonly liveFollows?: {
					readonly politeness: NativeExpr;
					readonly atomic: NativeExpr;
				};
				/** Attributes fixed at build time (`class` carries the component's scope class); absent when none. */
				readonly attributes?: Readonly<Record<string, string>>;
				/** The device object a `camera` element shows (`<base.camera el={cam} />`). */
				readonly object?: string;
				/** Attributes that follow state, written as the web writes them (absent, bare or a string), and an input's `value`. */
				readonly bindings?: ReadonlyArray<
					| { readonly attribute: string; readonly value: NativeExpr }
					| { readonly property: NativeProperty; readonly value: NativeExpr }
				>;
				/**
				 * A `style` that follows state: its text with each number the app computes as a hole naming one of the payload's
				 * `slots`. Dragon resolves what each slot moves at build time; the host lays out again when a slot's value changes.
				 */
				readonly style?: ReadonlyArray<string | { readonly slot: string }>;
				/** The `style` is `style` only while this style case (the payload's `styleCases`) has `value`, and empty text otherwise. */
				readonly styleWhen?: { readonly case: string; readonly value: boolean };
		  }
		| {
				readonly kind: 'text';
				/** `<host>:text<n>`, the n-th text run of its element; `text<n>` at the top of the page. */
				readonly id: string;
				readonly parent: string | null;
				readonly parts: ReadonlyArray<NativeTextPart>;
		  }
		| {
				/**
				 * A plain `@if` has `test`: arm 0 while it is truthy, arm 1 (an `@else`) otherwise. An `@else if` chain or a
				 * `@switch` has `tests` instead, one per arm: the first truthy one's arm, else the `null` (`@else` or
				 * `@default`) arm, else none.
				 */
				readonly kind: 'branch';
				readonly id: string;
				readonly parent: string | null;
				readonly test?: NativeExpr;
				readonly tests?: ReadonlyArray<NativeExpr | null>;
				readonly arms: number;
		  }
		| {
				/** A keyed `@for`: one row per item of `list`, keyed by `String()` of the item at `key`, in order. */
				readonly kind: 'repeat';
				readonly id: string;
				readonly parent: string | null;
				readonly list: NativeExpr;
				readonly key: ReadonlyArray<string>;
				/** `key i` on the index: a row's key is its position (`"0"`, `"1"`), and `key` is empty. */
				readonly byIndex?: true;
				/** A key joined from the item's fields, as the web joins it; `key` is then empty and is not the key. */
				readonly keyParts?: ProtocolRepeatKeyParts;
		  }
		| {
				/**
				 * The platform's own sheet (`<native.sheet>`): its content is the nodes whose parent is this id, built at mount
				 * and kept; the host presents them in its system sheet while `open` is truthy (iOS `UISheetPresentationController`,
				 * Android Material `BottomSheetDialog`; absent on the web).
				 */
				readonly kind: 'sheet';
				readonly id: string;
				readonly parent: string | null;
				readonly open: NativeExpr;
				/** Resting heights as fractions of the screen's height, ascending; the last is 1. */
				readonly snapPoints: ReadonlyArray<number>;
				/** Swipe, back and a tap on the dimmed page close it, as a `dismiss` action. */
				readonly dismissible: boolean;
				/** The page behind is dimmed and cannot be reached while it shows. */
				readonly modal: boolean;
		  }
	);

/**
 * A field's state a binding sets as a DOM property: a text field's text, a checkbox's checkedness and its mixed look, an
 * option's selectedness.
 */
export type NativeProperty = 'value' | 'checked' | 'indeterminate' | 'selected';

/**
 * Semantic events: each platform maps one to its own control event (web click, UIKit touchUpInside, Android click).
 * `dismiss` is a sheet's platform dismissal, or the overlay behaviour's report on an element marked `overlay` while it is
 * shown: Escape (the host's back gesture) or a press outside it. `pointerdown` and `pointerup` are a touch going down and
 * up; they reach the element the touch is on and each element it is inside, innermost first, as on the web.
 * `enter` is the keyboard's return key in a single-line text field. `submit` is a form's, raised only by a `submit` op.
 * `idle` and `visible` mean what the web runtime gives them, once for each shown instance of their element (shown again
 * after it left, it is a new one): `idle` at the first moment the host is idle after the screen's first frame (or after
 * the element appears), `visible` the first time any of the element is on the screen. `close` is a `<dialog>`'s, raised
 * after the handler (or the host's back gesture) that closed it, as the browser queues it. `contextmenu` is a long press as
 * Chrome on Android raises it: on the element pressed, then each element it is inside, innermost first, with the press's
 * place (`NativeContextMenuField`); the tap that press would end in does not follow. Safari on iOS raises none for a long
 * press, so the iOS host never sends it.
 */
/**
 * `focus` and `blur` are a text field's: it took the keyboard, or gave it up. `keydown` and `paste` are a text field's too:
 * a key of the on-screen keyboard, and a paste from its edit menu. `keyup` follows each `keydown` with the same key, after
 * what the key did (or did not do, when the keydown was prevented).
 */
export type NativeEventName =
	| 'activate'
	| 'input'
	| 'focus'
	| 'blur'
	| 'keydown'
	| 'keyup'
	| 'paste'
	| 'dismiss'
	| 'cancel'
	| 'close'
	| 'enter'
	| 'submit'
	| 'idle'
	| 'visible'
	/** A range input let go after its value moved: the web's `change` on it. */
	| 'commit'
	| 'contextmenu'
	| NativePointerEventName
	| NativeMouseEventName;

/**
 * The pointer events a touch raises, in a phone browser's order (Safari on iOS, Chrome on Android): `pointerover`, then
 * `pointerenter` on each element from the outermost to the one touched, `pointerdown`; `pointermove` while it moves;
 * `pointerup`, or `pointercancel` when the platform takes the touch for a scroll; then `pointerout` and `pointerleave` on
 * each element from the innermost out. The touched element captures the pointer until it lifts, so `pointermove` and
 * `pointerup` reach it wherever the finger goes, unless a handler captures it elsewhere or releases it. Hover lasts only
 * while the finger is down.
 */
export type NativePointerEventName =
	| 'pointerdown'
	| 'pointermove'
	| 'pointerup'
	| 'pointercancel'
	| 'pointerover'
	| 'pointerout'
	| 'pointerenter'
	| 'pointerleave';

/**
 * The compatibility mouse events a phone's browser fires after a tap (Chrome on Android's order), raised by the runtime
 * once the tap's `pointerup`, `pointerout` and `pointerleave` have run and before its click: `mouseover` and
 * `mouseenter` on the tapped element (after `mouseout` and `mouseleave` on the element tapped before, which kept the
 * mouse until now), then `mousemove`, `mousedown` and `mouseup`. A touch the platform takes for a scroll fires none. A
 * handler reads the pointer fields a MouseEvent has: not `pointerId`, `pointerType` or `isPrimary`.
 */
export type NativeMouseEventName =
	| 'mouseover'
	| 'mouseout'
	| 'mouseenter'
	| 'mouseleave'
	| 'mousemove'
	| 'mousedown'
	| 'mouseup';

/**
 * What a pointer handler reads off its event. `target`, `currentTarget` and `relatedTarget` are elements (`relatedTarget`
 * is null, as a touch has no element it came from); `clientX` and `clientY` are the touch's place in points (iOS) or dp
 * (Android) from the screen's top left, which a browser's CSS pixels match; `pointerType` is "touch"; `timeStamp` is in
 * milliseconds since the screen appeared.
 */
export type NativePointerField =
	| 'target'
	| 'currentTarget'
	| 'relatedTarget'
	| 'button'
	| 'buttons'
	| 'clientX'
	| 'clientY'
	| 'pointerId'
	| 'pointerType'
	| 'isPrimary'
	| 'timeStamp';

/** What a `contextmenu` handler reads off its event: the elements pressed and handling it, and the press's place and time as a pointer's. */
export type NativeContextMenuField =
	| 'target'
	| 'currentTarget'
	| 'clientX'
	| 'clientY'
	| 'timeStamp';

/** Why the overlay behaviour reported a dismissal; the vocabulary of `OverlayGestureReason` in `@markless/web`. */
export type NativeDismissReason = 'escape' | 'outside-press';

/** A state write a host runs as data: the cell takes the expression's value, evaluated before the write. */
export type NativeOp =
	| { readonly op: 'assign'; readonly cell: string; readonly value: NativeExpr }
	/**
	 * A device call (`haptics.tap`), its arguments evaluated in order; the host runs it when the `call` journal entry
	 * arrives. With `result`, the host settles that task cell with what the call gives.
	 */
	| {
			readonly op: 'call';
			readonly call: NativeDeviceCall;
			/** The device object the call is made on (`object:cam`). */
			readonly object?: string;
			readonly arguments: ReadonlyArray<NativeExpr>;
			readonly result?: string;
			/**
			 * What the handler does once the call answers: `ops` run with the answer read as `{ local: as }`. The host
			 * answers the journal entry's `resume` with a `resume` action, or a `reject` action when the call fails;
			 * `catch` is the cell of the nearest `@catch` around the handler's element, which then takes the error.
			 */
			readonly after?: {
				readonly id: string;
				readonly as: string;
				readonly ops: ReadonlyArray<NativeOp>;
				readonly catch?: string;
			};
	  }
	/** Runs `whenTrue` when `test` is truthy, else `whenFalse`; the test is evaluated once, before either. */
	| {
			readonly op: 'if';
			readonly test: NativeExpr;
			readonly whenTrue: ReadonlyArray<NativeOp>;
			readonly whenFalse: ReadonlyArray<NativeOp>;
	  }
	/**
	 * `dialog.showModal()` or `dialog.close()` on a `<dialog>`'s handle: the host shows the dialog in its top layer, above the
	 * page, with the page behind inert, or takes it out again.
	 */
	| { readonly op: 'dialog'; readonly node: string; readonly method: 'showModal' | 'close' }
	/**
	 * `node.setPointerCapture(pointer)`, or with `release` `node.releasePointerCapture(pointer)`: the runtime sends that touch's
	 * later pointer events to `node` wherever the finger goes, or again to the element under it. A pointer that is not down,
	 * or (to release) not captured by `node`, changes nothing.
	 */
	| {
			readonly op: 'capture';
			readonly node: string | NativeExpr;
			readonly pointer: NativeExpr;
			readonly release?: true;
	  }
	/**
	 * `element.focus()` or `element.scrollIntoView()`, after the handler's writes have reached the views. Focus moves as on
	 * the web (a text field takes the keyboard; anything else the screen reader's cursor) and scrolls the element into view
	 * unless `preventScroll` (`focus({ preventScroll: true })`). `node` is an element fixed at build time, or an expression
	 * evaluated when the op runs (modal's "back to the trigger or the opener"); one that gives null or the body does nothing.
	 */
	| {
			readonly op: 'command';
			readonly node: string | NativeExpr;
			readonly command: NativeCommand;
			readonly preventScroll?: true;
	  }
	/** `event.preventDefault()` in a text field's `keydown` or `paste` handler: the host leaves out what the key or paste does. */
	| { readonly op: 'preventDefault' }
	/** `event.stopPropagation()` in a click handler: the press runs no handler of the elements around this one. */
	| { readonly op: 'stopPropagation' }
	/**
	 * `field.value = text` on a text field: its text becomes `value` (as a string), as if typed but with no input event; the
	 * journal's `property` entry carries it to the field. `node` is a fixed id or an expression giving one (null: nothing).
	 */
	| { readonly op: 'fieldText'; readonly node: string | NativeExpr; readonly value: NativeExpr }
	/**
	 * Submits `form` as the web does when `submitter` is pressed, or the return key submits it with no submit button (null):
	 * nothing when the submitter is disabled; then, unless the form has `novalidate` or the submitter `formnovalidate`,
	 * the first field that is required and empty (or unchecked) stops it with an `invalid` entry; then a submission that
	 * carries the same entries from the same submitter as one still running is dropped; then the form's `submit` handler
	 * runs. While a run it starts waits on an `after`, the form has `aria-busy="true"` and the submitter
	 * `aria-disabled="true"` (unless an author wrote `aria-disabled` on a submit button of the form).
	 */
	| { readonly op: 'submit'; readonly form: string; readonly submitter: string | null }
	/**
	 * What follows an `await` of a timer the build can see: after `ms`, `ops` run with each `capture` name read as a
	 * `{ local }` holding the value it had when this op ran. The host schedules it from a `timer` journal entry.
	 */
	| {
			readonly op: 'after';
			readonly ms: NativeExpr;
			readonly capture: ReadonlyArray<readonly [string, NativeExpr]>;
			readonly ops: ReadonlyArray<NativeOp>;
	  }
	/**
	 * A press on a checkbox or radio button, before its handlers run: a checkbox flips its checkedness, a radio button is
	 * checked and every other radio button of its group (same `name`, same form or none) unchecked.
	 */
	| { readonly op: 'tick'; readonly node: string }
	/**
	 * Opens the page at `route` (a router pattern such as `/[fruit]`) with these params; ops after it do not run. A param
	 * is a string fixed at build time or an expression evaluated when the op runs (a row's item inside a list row).
	 * `replace` takes the place of the current screen instead of pushing a new one.
	 */
	| {
			readonly op: 'navigate';
			readonly route: string;
			readonly params: Readonly<Record<string, string | NativeExpr>>;
			readonly replace?: true;
	  }
	/**
	 * Runs function `fn` of the payload's script in the engine with `event` and `bindings`, then writes the cells it
	 * changed (the host applies them as `assign` does). A throw, or a rejection of what it returns, writes
	 * `{ name, message }` to `catch` (the nearest `@catch` around the handler) when there is one.
	 */
	| {
			readonly op: 'script';
			readonly fn: string;
			/** The web event's `type` the handler sees (`click`, `input`, `submit`, `change`). */
			readonly type: string;
			readonly bindings: NativeScriptBindings;
			readonly catch?: string;
	  }
	/**
	 * `reset` of `@catch (error, reset)`: clears the boundary's handler error (`catch`) and runs again each of its async
	 * values (`cells`, read where the handler runs) that holds an error, with the same key; until one answers the boundary
	 * keeps showing what it shows.
	 */
	| { readonly op: 'reset'; readonly cells: ReadonlyArray<string>; readonly catch?: string };

/** Element commands a host runs. */
/** `select` selects a text field's whole text, as `field.select()` does. */
export type NativeCommand = 'focus' | 'scrollIntoView' | 'select';

/** The non-finite numbers JSON cannot hold: each with its path (object keys and array indices) inside a value. */
export type NativeNonFinite = ReadonlyArray<
	readonly [path: ReadonlyArray<string | number>, name: 'Infinity' | '-Infinity' | 'NaN']
>;

/**
 * A value as JSON carries it: each Infinity, -Infinity or NaN written as null, and where each was. A value with none comes
 * back as it is with an empty list.
 */
export function nativeNonFiniteSplit(value: unknown): {
	readonly json: unknown;
	readonly nonFinite: NativeNonFinite;
} {
	const found: Array<
		readonly [ReadonlyArray<string | number>, 'Infinity' | '-Infinity' | 'NaN']
	> = [];
	const walk = (v: unknown, path: ReadonlyArray<string | number>): unknown => {
		if (typeof v === 'number' && !Number.isFinite(v)) {
			found.push([path, Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity']);
			return null;
		}
		if (Array.isArray(v)) return v.map((item, index) => walk(item, [...path, index]));
		if (v !== null && typeof v === 'object')
			return Object.fromEntries(
				Object.entries(v).map(([key, item]) => [key, walk(item, [...path, key])]),
			);
		return v;
	};
	const json = walk(value, []);
	return { json: found.length === 0 ? value : json, nonFinite: found };
}

/** A value JSON carried, with each non-finite number nativeNonFiniteSplit took out put back at its path. */
export function nativeNonFiniteJoin(
	json: unknown,
	nonFinite: NativeNonFinite | undefined,
): unknown {
	if (!nonFinite || nonFinite.length === 0) return json;
	const copy = structuredClone(json) as unknown;
	const number = { Infinity: Infinity, '-Infinity': -Infinity, NaN: Number.NaN } as const;
	let root = copy;
	for (const [path, name] of nonFinite) {
		if (path.length === 0) {
			root = number[name];
			continue;
		}
		let at = root as Record<string | number, unknown>;
		for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
		at[path[path.length - 1]!] = number[name];
	}
	return root;
}

export type NativeViewPayload = {
	readonly version: typeof NATIVE_VIEW_VERSION;
	readonly component: string;
	/** The page's route as the router spells it, with its param names; absent for a component that is not a page. */
	readonly route?: { readonly pattern: string; readonly params: ReadonlyArray<string> };
	/** `storage` names a device-kept value (iOS UserDefaults, Android SharedPreferences): read at mount, written on every change. */
	readonly cells: ReadonlyArray<{
		readonly id: string;
		readonly name: string;
		readonly initial: NativeValue;
		/** Where `initial` holds Infinity, -Infinity or NaN, which JSON writes as null (nativeNonFiniteSplit). */
		readonly nonFinite?: NativeNonFinite;
		readonly storage?: { readonly key: string };
		/**
		 * A cell of an app-wide `shared()`: the app holds one value for every page. A screen starts from the app's value,
		 * writes its changes back, and takes the app's value again when it shows after Back (`resume`).
		 */
		readonly app?: true;
		/** A class or `ui-*` attribute binding reads this cell, so Dragon's export has a state for it; its changes are journalled as `state`. */
		readonly styled?: true;
		/** A styled string cell's every value, its first value first, so Dragon lays out one assignment per value. */
		readonly domain?: ReadonlyArray<string>;
		/** A live device value (`network.online`): the host fills it at mount and sends a `device` action when it changes. */
		readonly device?: NativeDeviceValue;
		/** For a device object's field (`cam.ready`): the object (`object:cam`). */
		readonly object?: string;
		/**
		 * An async value from a device call: the host starts the call at mount and settles the cell. Its value is
		 * `{ state: 'pending' }`, `{ state: 'value', value }` or `{ state: 'error', error: { name, message } }`.
		 */
		readonly task?: {
			readonly call: NativeDeviceCall;
			readonly arguments: ReadonlyArray<NativeExpr>;
		};
		/**
		 * An async value the payload's script computes (`computed(async ...)` that is not one device call). The host's
		 * runtime starts it when the screen starts and again whenever a cell its bindings read changes, and the script
		 * settles the cell: `{ state: 'pending' }` until the first answer, then `{ state: 'value', value, error }` (`error` is
		 * a failed refresh's error over the value it kept, else null) or `{ state: 'error', error: { name, message } }`.
		 */
		readonly async?: {
			readonly script: string;
			readonly bindings: NativeScriptBindings;
			/** The `@try` branches that read it: it runs while one of them is shown, and is aborted when none is. */
			readonly boundaries: ReadonlyArray<string>;
		};
		/**
		 * State of a component a list row renders (`repeat` node id): one value per row, `initial` when the row is built and
		 * gone with it. A read or write inside the row reaches that row's value.
		 */
		readonly row?: string;
		/**
		 * On a row's state: its first value as an expression of the row's item, taken once when the row is built (a family part
		 * in a row seeds its state from a prop the row passes); `initial` is then never read.
		 */
		readonly first?: NativeExpr;
		/**
		 * On a row's state: the values the row passes to the part that owns it, read from the row's item. As on the web, when
		 * one changes the part is built again: the row's state starts over from its first values.
		 */
		readonly rebuiltBy?: ReadonlyArray<NativeExpr>;
		/**
		 * The clock when the screen opened, in milliseconds since 1970 (UTC): the host writes it at mount, before the first
		 * build, as a page's render reads the clock when it is served; `initial` is never shown.
		 */
		readonly clock?: true;
		/**
		 * A first value the build cannot know (`state(Number(id))`): the host evaluates it when the screen opens, before the
		 * first build and in cell order, as the web runs a component's body once when it first renders; `initial` is never shown.
		 */
		readonly seed?: NativeExpr;
		/**
		 * State of a component an `@if` arm shows (its innermost arm): back to `initial` while the arm is hidden, so it starts
		 * over each time the arm shows it, as the web renders the arm anew; a `seed` is evaluated again then, not at mount.
		 */
		readonly arm?: NativeArmPlace;
		/**
		 * Its first value is `undefined` on the web, which `initial` spells as null: a script reads it as `undefined` until
		 * something writes it.
		 */
		readonly unset?: true;
		/**
		 * Written while rendering from a value that follows state (a root's `checkbox.checked = checked`): the host writes it
		 * at mount and again whenever that value changes, as the web runs the write again.
		 */
		readonly follows?: NativeExpr;
	}>;
	/** Document order: a parent comes before its children, siblings in authored order. */
	readonly nodes: ReadonlyArray<NativeNode>;
	/**
	 * `host` is a node id; on a node inside a list row the host fires it as that row's instance (`<node>@<key>`), and its
	 * handler reads that row's item and state.
	 */
	readonly events: ReadonlyArray<{
		readonly host: string;
		readonly event: NativeEventName;
		readonly handler: string;
	}>;
	readonly handlers: ReadonlyArray<{
		readonly id: string;
		readonly ops: ReadonlyArray<NativeOp>;
	}>;
	/**
	 * Device objects the page's components make. Each lives while `owner`, the first node of the component instance that
	 * made it, is shown (a `release` entry ends it); a camera's picture runs while its element is shown.
	 */
	readonly objects?: ReadonlyArray<{
		readonly id: string;
		readonly device: NativeDeviceObject;
		readonly owner: string;
	}>;
	/** The page's `<title>`, as text parts: what the system navigation bar shows for this screen. */
	readonly title?: ReadonlyArray<NativeTextPart>;
	/**
	 * The numbers styles read while the app runs (an element's `style` holes): each a number expression of state, journalled
	 * as `slot` when it changes. `integer` when it only ever gives whole numbers; another value is a runtime error.
	 */
	readonly slots?: ReadonlyArray<{
		readonly id: string;
		readonly value: NativeExpr;
		readonly integer?: true;
		/** Evaluated only while this style case has `value`; otherwise the slot keeps its last value (0 before the first). */
		readonly when?: { readonly case: string; readonly value: boolean };
		/** Inside a @for row: one value per row, `<slot>@<row key>`, evaluated with that row's item. */
		readonly row?: string;
	}>;
	/**
	 * Conditions a style follows (an element's `styleWhen`): each is whether its test is truthy now, journalled as `state`
	 * when it changes, so the host moves to Dragon's assignment for it as it does for a styled cell.
	 */
	readonly styleCases?: ReadonlyArray<{ readonly id: string; readonly value: NativeExpr }>;
	/** Forms a `submit` op can submit; absent when there are none. */
	readonly forms?: ReadonlyArray<NativeForm>;
	/**
	 * What the web says when a required field has no value, by the language its browser shows its own text in (Chromium's
	 * wording); the host picks the device's language. Present with `forms`.
	 */
	readonly valueMissing?: Readonly<Record<string, NativeValueMissing>>;
	/** What the web says when a text field a person edited is longer than its `maxlength`, by language; present when a form's text field has one. */
	readonly tooLong?: Readonly<Record<string, NativeTooLong>>;
	/** What the web says when a number field is out of its range, off its step or holds no number, by language; present when a form has one. */
	readonly numberMessages?: Readonly<Record<string, NativeNumberMessages>>;
	/** What the web says when an email field holds no email address, by language; present when a form has an email field. */
	readonly typeMismatch?: Readonly<Record<string, NativeEmailMismatch>>;
	/** Present only when a handler or computed runs as JavaScript; a payload without it never starts an engine. */
	readonly script?: NativeScript;
	/** A click handler reads where its tap landed: the host reports touches even with no pointer handler, as a browser fires them. */
	readonly tapPoints?: true;
	/** A script adds listeners to the document: the host reports every touch and its moves, which bubble to them. */
	readonly documentEvents?: true;
};

export const NATIVE_APP_VERSION = 'markless.native-app/0';

/** The route an app payload carries its `pages/404.tsrx` under: where a link to a path no route matches opens, as on the web. */
export const NATIVE_NOT_FOUND_ROUTE = '/404';

/** An app of several routes: each route's page, in the router's match order (static before `[param]` segments). */
export type NativeAppPayload = {
	readonly version: typeof NATIVE_APP_VERSION;
	readonly routes: ReadonlyArray<{
		readonly pattern: string;
		readonly params: ReadonlyArray<string>;
		readonly page: NativeViewPayload;
	}>;
};

export type NativeValueMissing = {
	readonly text: string;
	readonly checkbox: string;
	readonly radio: string;
};

/** Chromium's message for a text field longer than its `maxlength`: `{max}` and `{length}` in `text` are written in `digits` (ASCII when absent). */
export type NativeTooLong = { readonly text: string; readonly digits?: string };

/**
 * Chromium's messages for a number field, by language: below `min`, above `max`, off its step (the two nearest valid
 * values, or the one when the other is past `max`), and text that is no number; with the language's digits and decimal mark.
 */
export type NativeNumberMessages = {
	readonly underflow: string;
	readonly overflow: string;
	readonly step: string;
	readonly stepOne: string;
	readonly badInput: string;
	readonly digits?: string;
	readonly decimal?: string;
};

/** HTML's valid floating-point number: what a number field's value may be. */
const VALID_FLOAT = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/** A number field's value from its text, by HTML's sanitization: text that is no valid number is the empty string. */
export const nativeNumberValue = (text: string): string => (VALID_FLOAT.test(text) ? text : '');

/** What a number field's attributes give, by HTML's rules for parsing floating-point numbers; undefined when invalid. */
const floatOf = (attribute: string | null | undefined): number | undefined =>
	attribute != null && VALID_FLOAT.test(attribute) ? Number(attribute) : undefined;

const decimalsOf = (value: number): number => {
	const written = String(value);
	const exponent = /e-(\d+)$/.exec(written);
	if (exponent) return Number(exponent[1]) + (written.split('e')[0]!.split('.')[1]?.length ?? 0);
	return written.split('.')[1]?.length ?? 0;
};

/**
 * Why a number field holding `text` fails before a submit, in Chromium's order after a missing value: text that is no
 * number, below `min`, above `max`, then off its step (from `min`, else the `value` attribute, else 0; 1 unless `step`
 * says otherwise or `any`), with the two nearest valid values, or the one when the next is past `max`.
 */
export function nativeNumberProblem(
	text: string,
	attributes: {
		readonly min: string | null;
		readonly max: string | null;
		readonly step: string | null;
		readonly value: string | null;
	},
):
	| { readonly message: 'badInput' }
	| { readonly message: 'underflow'; readonly values: { readonly min: number } }
	| { readonly message: 'overflow'; readonly values: { readonly max: number } }
	| { readonly message: 'step'; readonly values: { readonly low: number; readonly high: number } }
	| { readonly message: 'stepOne'; readonly values: { readonly value: number } }
	| undefined {
	if (text === '') return undefined;
	if (!VALID_FLOAT.test(text)) return { message: 'badInput' };
	const value = Number(text);
	const min = floatOf(attributes.min);
	const max = floatOf(attributes.max);
	if (min !== undefined && value < min) return { message: 'underflow', values: { min } };
	if (max !== undefined && value > max) return { message: 'overflow', values: { max } };
	if (attributes.step?.toLowerCase() === 'any') return undefined;
	const given = floatOf(attributes.step);
	const step = given !== undefined && given > 0 ? given : 1;
	const base = min ?? floatOf(attributes.value) ?? 0;
	// Whole numbers at the finest decimal any of them has, so 0.1 steps do not drift.
	const scale = 10 ** Math.max(decimalsOf(base), decimalsOf(step), decimalsOf(value));
	const [at, from, by] = [value, base, step].map((one) => Math.round(one * scale)) as [
		number,
		number,
		number,
	];
	if ((at - from) % by === 0) return undefined;
	const lowAt = from + Math.floor((at - from) / by) * by;
	const low = lowAt / scale;
	const high = (lowAt + by) / scale;
	return max !== undefined && high > max
		? { message: 'stepOne', values: { value: low } }
		: { message: 'step', values: { low, high } };
}

/** `message` with its `{name}`s filled in as Chromium writes numbers: no grouping, in the language's digits and decimal mark. */
export function nativeNumberMessage(
	message: string,
	language: Pick<NativeNumberMessages, 'digits' | 'decimal'>,
	values: Readonly<Record<string, number>>,
): string {
	const digits = language.digits ?? '0123456789';
	const write = (value: number) =>
		String(value).replace(/[0-9.]/g, (char) =>
			char === '.' ? (language.decimal ?? '.') : digits[Number(char)]!,
		);
	return Object.entries(values).reduce(
		(text, [name, value]) => text.replace(`{${name}}`, write(value)),
		message,
	);
}

/** `message` with `{max}` and `{length}` filled in as Chromium writes them: no grouping, in the language's digits. */
export function nativeTooLongMessage(message: NativeTooLong, max: number, length: number): string {
	const digits = message.digits ?? '0123456789';
	const write = (value: number) =>
		String(value).replace(/[0-9]/g, (digit) => digits[Number(digit)]!);
	return message.text.replace('{max}', write(max)).replace('{length}', write(length));
}

/**
 * A `maxlength` attribute's limit, by HTML's rules for parsing non-negative integers: leading ASCII whitespace, an
 * optional sign, then digits up to the first non-digit. Undefined (no limit) when there are no digits or it is negative.
 */
export function nativeMaxLength(attribute: string | null | undefined): number | undefined {
	const match = attribute == null ? null : /^[\t\n\f\r ]*([+-]?)([0-9]+)/.exec(attribute);
	if (!match) return undefined;
	const value = Number(match[2]);
	if (match[1] === '-' && value !== 0) return undefined;
	return value;
}

/**
 * Chromium's `validationMessage` for an email field whose value is not an email address, one per reason: `{value}` is the
 * whole value, `{symbol}` the first character not allowed, `{domain}` the part after the `@`.
 */
export type NativeEmailMismatch = {
	readonly noAt: string;
	readonly emptyLocal: string;
	readonly emptyDomain: string;
	readonly invalidLocal: string;
	readonly invalidDomain: string;
	readonly invalidDots: string;
	readonly other: string;
};

/** An email field's value as the web keeps it: line breaks dropped, then ASCII whitespace trimmed from both ends. */
export function nativeEmailValue(typed: string): string {
	return typed.replace(/[\r\n]/g, '').replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
}

const EMAIL_LOCAL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]$/;
const EMAIL_LABEL = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/**
 * Why an email field's value (as {@link nativeEmailValue} keeps it) is not an email address, in Chromium's words, or
 * undefined when it is one or is empty. Validity is HTML's valid e-mail address; the reason is the first of Chromium's
 * checks the value fails.
 */
export function nativeEmailMismatch(
	messages: NativeEmailMismatch,
	value: string,
): string | undefined {
	if (value === '') return undefined;
	const at = value.indexOf('@');
	const local = at < 0 ? value : value.slice(0, at);
	const domain = at < 0 ? '' : value.slice(at + 1);
	if (
		at > 0 &&
		[...local].every((character) => EMAIL_LOCAL.test(character)) &&
		domain.split('.').every((label) => EMAIL_LABEL.test(label))
	)
		return undefined;
	const fill = (message: string, symbol = '') =>
		message.replace(/\{(value|symbol|domain)\}/g, (_, name: string) =>
			name === 'value' ? value : name === 'domain' ? domain : symbol,
		);
	if (at < 0) return fill(messages.noAt);
	if (at === 0) return fill(messages.emptyLocal);
	if (domain === '') return fill(messages.emptyDomain);
	const inLocal = [...local].find((character) => !EMAIL_LOCAL.test(character));
	if (inLocal !== undefined) return fill(messages.invalidLocal, inLocal);
	const inDomain = [...domain].find((character) => !/^[a-zA-Z0-9.-]$/.test(character));
	if (inDomain !== undefined) return fill(messages.invalidDomain, inDomain);
	if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..'))
		return fill(messages.invalidDots);
	return fill(messages.other);
}

/** A number as HTML parses a range input's attributes: a valid floating-point number, else undefined. */
const rangeNumber = (text: string | null | undefined): number | undefined =>
	text != null && /^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/.test(text) ? Number(text) : undefined;

/** The decimal places a number is written with, so stepped values print as the browser writes them. */
const decimals = (value: number): number => {
	const [, fraction = '', exponent = '0'] =
		/^-?\d*(?:\.(\d+))?(?:e([-+]?\d+))?$/.exec(String(value)) ?? [];
	return Math.max(0, fraction.length - Number(exponent));
};

/**
 * A range input's value as the web keeps it, from its `value`, `min`, `max` and `step` attributes: `min` 0 and `max`
 * 100 by default (a `max` below `min` is `min`); a value that is not a number is the midpoint; it is clamped into the
 * range and moved to the nearest step from `min` (the greater of two as near), staying at or below `max`.
 */
export function nativeRangeValue(
	value: string | null | undefined,
	min: string | null | undefined,
	max: string | null | undefined,
	step: string | null | undefined,
): string {
	const low = rangeNumber(min) ?? 0;
	const high = Math.max(low, rangeNumber(max) ?? 100);
	const any = step?.trim().toLowerCase() === 'any';
	const stepNumber = rangeNumber(step);
	const size = any ? undefined : stepNumber !== undefined && stepNumber > 0 ? stepNumber : 1;
	let number = rangeNumber(value) ?? low + (high - low) / 2;
	number = Math.min(high, Math.max(low, number));
	if (size !== undefined) {
		// In whole units of the finest written place, as the browser's decimal arithmetic reads them.
		const places = Math.max(decimals(low), decimals(size), decimals(number));
		const unit = 10 ** places;
		const whole = (n: number) => Math.round(n * unit);
		const stepUnits = whole(size);
		let steps = Math.floor((whole(number) - whole(low)) / stepUnits + 0.5);
		while (steps > 0 && whole(low) + steps * stepUnits > whole(high)) steps--;
		number = (whole(low) + steps * stepUnits) / unit;
	}
	return String(number);
}

/** A form's submittable fields and submit buttons, each in tree order. */
export type NativeForm = {
	readonly node: string;
	readonly fields: ReadonlyArray<{ readonly node: string; readonly kind: NativeFieldKind }>;
	readonly submitters: ReadonlyArray<string>;
	/** The form's `novalidate`: no field is checked before it submits. */
	readonly noValidate?: true;
	/** An author wrote `aria-disabled` on one of its submit buttons, so a running submission marks none of them. */
	readonly authoredAriaDisabled?: true;
	/**
	 * A GET form with no submit handler whose action is on another site: submitting calls `browser.open` with this URL,
	 * its query replaced by the form's entries (`application/x-www-form-urlencoded`), as the web leaves for that page.
	 */
	readonly opens?: string;
};

/** A text field (`<input>` of type text, search or tel), a checkbox, a radio button, a hidden input, or a `<select>`. */
export type NativeFieldKind = 'text' | 'number' | 'checkbox' | 'radio' | 'hidden' | 'select';

export {
	NATIVE_NUMBER_MESSAGES_BY_LOCALE,
	NATIVE_EMAIL_MISMATCH_BY_LOCALE,
	NATIVE_TOO_LONG_BY_LOCALE,
	NATIVE_VALUE_MISSING_BY_LOCALE,
} from './native-validation-messages.ts';

/**
 * The language a browser on a device with these preferred languages shows its own text in, among `available`: the first
 * preference that matches exactly, then without its script (`zh-Hant-TW` as `zh-TW`), then by language alone; else `en`.
 */
export function nativeLocale(
	preferred: ReadonlyArray<string>,
	available: ReadonlyArray<string>,
): string {
	const byLower = new Map(available.map((locale) => [locale.toLowerCase(), locale]));
	for (const wanted of preferred) {
		const parts = wanted.replaceAll('_', '-').toLowerCase().split('-');
		const language = parts[0]!;
		const region = parts.slice(1).find((part) => part.length !== 4);
		for (const candidate of [
			parts.join('-'),
			region ? `${language}-${region}` : language,
			language,
		]) {
			const found = byLower.get(candidate);
			if (found) return found;
		}
	}
	return 'en';
}

/** One change a host applies to its retained views after a handler runs. */
export type NativeJournalEntry =
	| { readonly op: 'text'; readonly node: string; readonly value: string }
	/** A `command` op the handler ran, in order, after every other entry: the views show the new state first. */
	| {
			readonly op: 'command';
			readonly node: string;
			readonly command: NativeCommand;
			readonly preventScroll?: true;
	  }
	/** The `keydown` or `paste` handler called `preventDefault()`: the host does not delete, break the line, return or paste. */
	| { readonly op: 'preventDefault' }
	/** A `<dialog>` opened in the top layer or closed (by an op, or by the host's back gesture as a `cancel`). */
	| { readonly op: 'dialog'; readonly node: string; readonly open: boolean }
	/** A submit stopped: the host moves focus to `node` as `focus()` would and shows `message` until the next action. */
	| { readonly op: 'invalid'; readonly node: string; readonly message: string }
	/**
	 * Run the `after` op `timer` names in `ms` milliseconds, by dispatching a `timer` action for it. A timer the script set
	 * is named `script:<n>`, and fires once; an interval asks again when it fires.
	 */
	| { readonly op: 'timer'; readonly timer: string; readonly ms: number }
	/**
	 * An element marked `overlay` joined the overlay stack (its `hidden` binding showed it) or left it. A `modal` one (it or
	 * an element inside it carries `aria-modal="true"`) goes in the host's top layer with the page behind inert.
	 */
	| {
			readonly op: 'overlay';
			readonly node: string;
			readonly open: boolean;
			readonly modal: boolean;
	  }
	/** `value` null removes the attribute; "" is a bare (present) attribute. */
	| {
			readonly op: 'attribute';
			readonly node: string;
			readonly name: string;
			readonly value: string | null;
	  }
	/** An input's text, as `String(value)`; never sent for the field whose edit caused it while it already shows that text. */
	| {
			readonly op: 'property';
			readonly node: string;
			readonly name: 'value';
			readonly value: string;
	  }
	/** A checkbox's or radio button's checkedness changed: by a tick, by its `checked` binding, or by another radio's tick. */
	| {
			readonly op: 'property';
			readonly node: string;
			readonly name: 'checked';
			readonly value: boolean;
	  }
	/**
	 * An option's selectedness changed: by a person's choice, by its `selected` binding, or because its `<select>` chose
	 * another. An option a list row adds arrives unselected; an entry follows when it is selected.
	 */
	| {
			readonly op: 'property';
			readonly node: string;
			readonly name: 'selected';
			readonly value: boolean;
	  }
	/** A styled cell's new value: the host moves to Dragon's next style assignment (`next[a][s][v]`) and applies it. */
	| { readonly op: 'state'; readonly cell: string; readonly value: NativeValue }
	/** A style slot's new value: the host lays the page out again with it through Dragon's plan (`runMarklessLayout`'s `slots`). */
	| { readonly op: 'slot'; readonly slot: string; readonly value: number }
	/**
	 * A list's new row order: the host removes rows whose key left, builds new rows from current values and moves the
	 * rest into this order. Entries for nodes inside rows name the instance as `<node>@<key>`.
	 */
	| { readonly op: 'rows'; readonly node: string; readonly keys: ReadonlyArray<string> }
	/** Shows arm `index` of a branch (null: none), building its nodes from current values and removing the old arm's. */
	| { readonly op: 'arm'; readonly node: string; readonly index: number | null }
	/** A system sheet's `open` turned truthy (present it) or falsy (dismiss it, unless the platform already has). */
	| { readonly op: 'sheet'; readonly node: string; readonly open: boolean }
	/** Run a device call now; with `result`, settle that task cell with what it gives (an action `settle`). */
	| {
			readonly op: 'call';
			/** A device call, or a writable device setting the handler wrote (`camera.facing`). */
			readonly call: NativeDeviceCall | NativeDeviceValue;
			readonly object?: string;
			readonly arguments: ReadonlyArray<NativeValue>;
			readonly result?: string;
			/** Answer with a `resume` action naming this continuation once the call settles, or `reject` when it fails. */
			readonly resume?: string;
	  }
	/** The component that made this device object is no longer shown: the host stops it and lets the device go. */
	| { readonly op: 'release'; readonly object: string }
	/**
	 * Leave this page for the page at `route` with `params`, built from scratch. In an app the host pushes it as a new
	 * screen, keeping this one as it is for Back, or with `replace` puts it in this screen's place.
	 */
	| {
			readonly op: 'navigate';
			readonly route: string;
			readonly params: Readonly<Record<string, string>>;
			readonly replace?: true;
	  }
	/** The page's `<title>` text changed: the host writes it to the screen's navigation bar. */
	| { readonly op: 'title'; readonly value: string }
	/** The script cleared a timer it set (`timer` names it, `script:<n>`): the host drops it. */
	| { readonly op: 'clearTimer'; readonly timer: string }
	/** The script called `fetch`: the host sends the request and answers with a `response` action naming `id`. */
	| { readonly op: 'fetch'; readonly id: number; readonly request: NativeFetchRequest }
	/** The signal of the request `id` aborted (its async value was superseded or left the screen): cancel it, send no response. */
	| { readonly op: 'abort'; readonly id: number };

/** A request as the script made it; `url` is absolute (a relative one rejects in the script, as with no page to resolve it). */
export type NativeFetchRequest = {
	readonly url: string;
	readonly method: string;
	readonly headers: ReadonlyArray<readonly [string, string]>;
	readonly body: string | null;
};

/** What a host answers a `fetch` entry with: the response (its body as text), or the network error's message. */
export type NativeFetchResponse =
	| {
			readonly status: number;
			readonly statusText: string;
			readonly headers: ReadonlyArray<readonly [string, string]>;
			readonly body: string;
	  }
	| { readonly error: string };

/** The package and export that name the platform's own pieces (`<native.sheet>`); one place, so the name is cheap to change. */
export const PLATFORM_PIECES_PACKAGE = DEVICE_MODULE;
export const PLATFORM_PIECES_NAMESPACE = 'native';

/**
 * Bound attributes that reach Dragon in every combination of the styled states, besides `class`: the ones a selector keys
 * state off (`[ui-open]`, `[aria-expanded]`), `hidden`, whose UA rule Dragon applies, `disabled`, which selects `:disabled`
 * and Chrome's disabled colours in Dragon, and a `style` that is one of fixed texts chosen by state. Others (`value`) stay out of the style input, since Dragon does not model their
 * rendering effect.
 */
export const isNativeStyleStateAttribute = (name: string): boolean =>
	name === 'hidden' ||
	name === 'disabled' ||
	name === 'role' ||
	name === 'style' ||
	/^(ui|aria|data)-/.test(name);

/** ECMAScript's own globals, which every engine a host runs has (JavaScriptCore, Hermes); `eval` is left out. */
export const NATIVE_SCRIPT_LANGUAGE_GLOBALS: ReadonlyArray<string> = [
	'Object',
	'Function',
	'Array',
	'Number',
	'Boolean',
	'String',
	'Symbol',
	'BigInt',
	'Date',
	'Promise',
	'RegExp',
	'JSON',
	'Math',
	'Intl',
	'Reflect',
	'Proxy',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'ArrayBuffer',
	'DataView',
	'Int8Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
	'Error',
	'AggregateError',
	'EvalError',
	'RangeError',
	'ReferenceError',
	'SyntaxError',
	'TypeError',
	'URIError',
	'parseInt',
	'parseFloat',
	'isNaN',
	'isFinite',
	'NaN',
	'Infinity',
	'undefined',
	'encodeURI',
	'encodeURIComponent',
	'decodeURI',
	'decodeURIComponent',
	'globalThis',
];

/**
 * The DOM interface an element of each tag is an instance of, as the HTML spec assigns them; any other tag's element is an
 * `HTMLElement`. In a phone's script an element proxy is an instance of its tag's interface, so `instanceof` answers as
 * in the browser.
 */
export const NATIVE_ELEMENT_INTERFACES: Readonly<Record<string, string>> = {
	a: 'HTMLAnchorElement',
	audio: 'HTMLAudioElement',
	blockquote: 'HTMLQuoteElement',
	body: 'HTMLBodyElement',
	br: 'HTMLBRElement',
	button: 'HTMLButtonElement',
	canvas: 'HTMLCanvasElement',
	details: 'HTMLDetailsElement',
	dialog: 'HTMLDialogElement',
	div: 'HTMLDivElement',
	dl: 'HTMLDListElement',
	fieldset: 'HTMLFieldSetElement',
	form: 'HTMLFormElement',
	h1: 'HTMLHeadingElement',
	h2: 'HTMLHeadingElement',
	h3: 'HTMLHeadingElement',
	h4: 'HTMLHeadingElement',
	h5: 'HTMLHeadingElement',
	h6: 'HTMLHeadingElement',
	hr: 'HTMLHRElement',
	iframe: 'HTMLIFrameElement',
	img: 'HTMLImageElement',
	input: 'HTMLInputElement',
	label: 'HTMLLabelElement',
	legend: 'HTMLLegendElement',
	li: 'HTMLLIElement',
	ol: 'HTMLOListElement',
	option: 'HTMLOptionElement',
	output: 'HTMLOutputElement',
	p: 'HTMLParagraphElement',
	pre: 'HTMLPreElement',
	progress: 'HTMLProgressElement',
	q: 'HTMLQuoteElement',
	select: 'HTMLSelectElement',
	span: 'HTMLSpanElement',
	svg: 'SVGSVGElement',
	table: 'HTMLTableElement',
	tbody: 'HTMLTableSectionElement',
	td: 'HTMLTableCellElement',
	textarea: 'HTMLTextAreaElement',
	tfoot: 'HTMLTableSectionElement',
	th: 'HTMLTableCellElement',
	thead: 'HTMLTableSectionElement',
	time: 'HTMLTimeElement',
	tr: 'HTMLTableRowElement',
	ul: 'HTMLUListElement',
	video: 'HTMLVideoElement',
};

/** The DOM interfaces a phone's script has, each with the one it extends; constructing one throws, as in the browser. */
export const NATIVE_SCRIPT_DOM_CLASSES: Readonly<Record<string, string | null>> = {
	Node: null,
	Element: 'Node',
	HTMLElement: 'Element',
	SVGElement: 'Element',
	...Object.fromEntries(
		[...new Set(Object.values(NATIVE_ELEMENT_INTERFACES))].map((name) => [
			name,
			name.startsWith('SVG') ? 'SVGElement' : 'HTMLElement',
		]),
	),
};

/** Globals a host provides to scripts, by the service that backs each. */
export const NATIVE_SCRIPT_HOST_GLOBALS: Readonly<Record<string, NativeScriptService | 'engine'>> =
	{
		setTimeout: 'timers',
		clearTimeout: 'timers',
		setInterval: 'timers',
		clearInterval: 'timers',
		queueMicrotask: 'engine',
		structuredClone: 'engine',
		performance: 'engine',
		DOMException: 'engine',
		File: 'engine',
		DataTransfer: 'engine',
		// Answers an element's `direction` only, from the host's facts.
		getComputedStyle: 'engine',
		console: 'console',
		fetch: 'fetch',
		crypto: 'crypto',
		matchMedia: 'media',
		devicePixelRatio: 'screen',
		Event: 'engine',
		CustomEvent: 'engine',
		MouseEvent: 'engine',
		PointerEvent: 'engine',
		KeyboardEvent: 'engine',
		...Object.fromEntries(
			Object.keys(NATIVE_SCRIPT_DOM_CLASSES).map((name) => [name, 'engine' as const]),
		),
	};

/**
 * What a script handler's event has on a phone, as member paths: a deeper read below `target.value` is a string's. Any
 * other member is refused at build time, since the web's event has it and a phone's does not. A text field's key and paste
 * events carry the field's text as `target.value`; only a paste carries `clipboardData`, with its plain text.
 */
export const NATIVE_SCRIPT_EVENT_MEMBERS: ReadonlyArray<ReadonlyArray<string>> = [
	['type'],
	['key'],
	['isTrusted'],
	['isComposing'],
	['clipboardData', 'getData'],
	['defaultPrevented'],
	['preventDefault'],
	['stopPropagation'],
	['target'],
	['target', 'value'],
	['target', 'checked'],
	['currentTarget'],
	['currentTarget', 'value'],
	['currentTarget', 'checked'],
];

/** What a script dismiss handler's event has beyond those: why the overlay was dismissed, and the element an outside press landed on. */
export const NATIVE_SCRIPT_DISMISS_EVENT_MEMBERS: ReadonlyArray<ReadonlyArray<string>> = [
	['detail', 'reason'],
	['detail', 'pressTarget'],
];
/** A submit handler's binding for its form's entries now, which its event's `target` and `currentTarget` carry for FormData. */
export const NATIVE_SCRIPT_SUBMITTED_FORM = 'submitted form';

/** Members of a page global a phone answers, read straight off it: the focused element, as a proxy. */
export const NATIVE_SCRIPT_PAGE_MEMBERS: Readonly<Record<string, ReadonlyArray<string>>> = {
	document: ['activeElement', 'addEventListener', 'removeEventListener'],
};

/** What a touch adds to a script pointer handler's event: its plain values. The elements it names reach only data handlers. */
export const NATIVE_SCRIPT_POINTER_FIELDS: ReadonlyArray<string> = [
	'button',
	'buttons',
	'clientX',
	'clientY',
	'pointerId',
	'pointerType',
	'isPrimary',
	'timeStamp',
];

/**
 * What a script pointer handler's event works out in the engine, as a phone browser's touch has it: `pressure` is 0.5
 * while the finger is down and 0 otherwise (a screen that reports no pressure), and `getCoalescedEvents()` gives the
 * move itself (nothing for any other type).
 */
export const NATIVE_SCRIPT_POINTER_ENGINE_FIELDS: ReadonlyArray<string> = [
	'pressure',
	'getCoalescedEvents',
];

/**
 * What a tap's click adds to a script click handler's event, as a phone browser fills it: where the touch ended, no
 * modifier key held (a phone has no hardware keyboard), and the press count. A click no touch made (a screen reader's, or
 * a script's `click()`) is at 0, 0 with a count of 0.
 */
export const NATIVE_SCRIPT_CLICK_FIELDS: ReadonlyArray<string> = [
	'detail',
	'clientX',
	'clientY',
	'shiftKey',
	'ctrlKey',
	'altKey',
	'metaKey',
];

/** What a keydown a script raised carries into a JavaScript keydown handler: its key. */
export const NATIVE_SCRIPT_KEY_FIELDS: ReadonlyArray<string> = ['key'];

/** A script pointer handler's event's elements, which reach JavaScript as proxies (`relatedTarget` null when none). */
export const NATIVE_SCRIPT_POINTER_ELEMENT_FIELDS: ReadonlyArray<string> = [
	'target',
	'currentTarget',
	'relatedTarget',
];

/** What a long press adds to a script `contextmenu` handler's event. */
export const NATIVE_SCRIPT_CONTEXTMENU_FIELDS: ReadonlyArray<string> = [
	'clientX',
	'clientY',
	'timeStamp',
];

/** Names for the global object itself: `window.setTimeout` reads a provided global, `window.document` does not. */
export const NATIVE_SCRIPT_GLOBAL_OBJECTS: ReadonlyArray<string> = ['window', 'self', 'globalThis'];

/**
 * Web globals with no meaning on a phone, or with a framework form a phone has, and what a build refusal says about
 * each. Any other global that is neither a language nor a host global is refused as one phones do not provide yet.
 */
export const NATIVE_SCRIPT_PAGE_GLOBALS: Readonly<Record<string, string>> = {
	document: 'the web page, which a phone does not have',
	window: 'the browser window, which a phone does not have',
	navigator: 'the browser, which a phone does not have',
	location:
		"the page's address, which a phone does not have; use the router's `navigate` and route params",
	history: "the browser's history, which a phone does not have; use the router's `navigate`",
	localStorage: "the browser's storage; use `storage()` from @markless/core, which a phone keeps",
	sessionStorage:
		"the browser's storage; use `storage()` from @markless/core, which a phone keeps",
	requestAnimationFrame: 'a browser frame, which a phone does not hand to handlers',
	cancelAnimationFrame: 'a browser frame, which a phone does not hand to handlers',
	Event: 'the DOM, which a phone does not have',
	CustomEvent: 'the DOM, which a phone does not have',
	MutationObserver: 'the DOM, which a phone does not have',
	ResizeObserver: 'the DOM, which a phone does not have',
	IntersectionObserver: 'the DOM, which a phone does not have',
	customElements: 'the DOM, which a phone does not have',
	FormData: 'an HTML form, which a phone does not have',
	innerWidth:
		'the browser window, which a phone does not have; styles adapt to the screen through Dragon',
	innerHeight:
		'the browser window, which a phone does not have; styles adapt to the screen through Dragon',
	outerWidth: 'the browser window, which a phone does not have',
	outerHeight: 'the browser window, which a phone does not have',
	visualViewport: 'the browser window, which a phone does not have',
	scrollX: "the page's scroll position, which a phone's views keep",
	scrollY: "the page's scroll position, which a phone's views keep",
	scrollTo:
		"the page's scroll position, which a phone's views keep; use an element's `scrollIntoView()`",
	scrollBy:
		"the page's scroll position, which a phone's views keep; use an element's `scrollIntoView()`",
	addEventListener:
		'listening on the browser window, which a phone does not have; use an event attribute',
	removeEventListener: 'listening on the browser window, which a phone does not have',
	dispatchEvent: 'events on the browser window, which a phone does not have',
	getSelection: 'a text selection in the web page, which a phone does not have',
	Image: 'the DOM, which a phone does not have; use an <img>',
	Text: 'the DOM, which a phone does not have',
	NodeFilter: 'the DOM, which a phone does not have',
	DOMParser: 'parsing HTML into a DOM, which a phone does not have',
	CSS: 'the CSS object model, which a phone does not have at run time',
	XMLHttpRequest: "the browser's old request API; use `fetch`, which a phone provides",
	alert: 'a browser dialog, which a phone does not have',
	confirm: 'a browser dialog, which a phone does not have',
	prompt: 'a browser dialog, which a phone does not have',
};
