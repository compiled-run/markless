import type {
	NativeBuiltin,
	NativeEventName,
	NativeExpr,
	NativeFieldKind,
	NativeFetchResponse,
	NativeJournalEntry,
	NativeMouseEventName,
	NativeScriptBindings,
	NativeNode,
	NativeOp,
	NativePointerEventName,
	NativeTextPart,
	NativeValue,
	NativeViewPayload,
} from '@markless/serializer';
import {
	NATIVE_DOCUMENT_BODY,
	NATIVE_SCRIPT_CLICK_FIELDS,
	NATIVE_SCRIPT_KEY_FIELDS,
	NATIVE_SCRIPT_POINTER_FIELDS,
	nativeLocale,
	nativeNumberMessage,
	nativeNumberProblem,
	nativeNumberValue,
	nativeMaxLength,
	nativeEmailMismatch,
	nativeRangeValue,
	nativeNonFiniteJoin,
	nativeNonFiniteSplit,
	type NativeNonFinite,
	nativeEmailValue,
	nativeTooLongMessage,
	NATIVE_SCRIPT_MEDIA_DEFAULTS,
	type NativeScriptMedia,
	type NativeScriptScreen,
} from '@markless/serializer/native-view';
import { marklessAttributeValue } from '@markless/web/dom-attribute';
import type { NativeScriptEngine } from './script-engine.ts';
import {
	DISMISS_EVENT,
	OVERLAY_ATTRIBUTE,
	OVERLAY_HINT_ATTRIBUTE,
	OVERLAY_MODAL_ATTRIBUTE,
	OVERLAY_MODAL_VALUE,
} from '@markless/web/overlay-protocol';

/** A host-side action: what a person does to a retained view. */
export type NativeAction =
	/** A press; `detail` is how many presses in a row on it (a double tap's second is 2), 1 when left out. */
	| { readonly event: 'activate'; readonly host: string; readonly detail?: number }
	/** A text field took the keyboard (`focus`) or gave it up (`blur`). */
	| { readonly event: 'focus' | 'blur'; readonly host: string }
	/** A person chose the option `host` (an instance id inside a list row) in its `<select>`'s list. */
	| { readonly event: 'choose'; readonly host: string }
	/** The field's whole text after an edit. */
	| { readonly event: 'input'; readonly host: string; readonly value: string }
	/** A range input let go after its value moved (the web's `change`), with the value it holds. */
	| { readonly event: 'commit'; readonly host: string; readonly value: string }
	/** A key of the on-screen keyboard in a text field, before it edits the text; `key` as the phone's browser names it. */
	| { readonly event: 'keydown'; readonly host: string; readonly key: string }
	/** The same key after what it did to the text (or did not, when its keydown was prevented). */
	| { readonly event: 'keyup'; readonly host: string; readonly key: string }
	/** A paste into a text field from its edit menu, before the text goes in. */
	| { readonly event: 'paste'; readonly host: string; readonly text: string }
	/** A live device value changed (connectivity, permission): the host writes the device cell. */
	| { readonly event: 'device'; readonly cell: string; readonly value: Value }
	/** A device call the host started has answered: a task cell takes `{ state: 'value', value }` or the error. */
	| { readonly event: 'settle'; readonly cell: string; readonly value: Value }
	/** A device call made from a handler answered: its continuation runs with the answer. */
	| { readonly event: 'resume'; readonly continuation: string; readonly value: Value }
	/** That call failed: the rest of the handler does not run, and the nearest `@catch` around it takes the error. */
	| {
			readonly event: 'reject';
			readonly continuation: string;
			readonly error: { readonly name: string; readonly message: string };
	  }
	| {
			readonly event: 'settle';
			readonly cell: string;
			readonly error: { readonly name: string; readonly message: string };
	  }
	/** The platform closed a system sheet (swipe, back, a tap on the dimmed page); it is already closed when this runs. */
	| { readonly event: 'dismiss'; readonly host: string }
	/**
	 * The host's back gesture (Escape) while an overlay is open: reported to `host`, the topmost one. An outside press is
	 * not sent: the runtime reports it from `pointerdown`, as the web's overlay behaviour does.
	 */
	| { readonly event: 'dismiss'; readonly host: string; readonly reason: 'escape' }
	/**
	 * A touch going down, moving, lifting, or taken by the platform for a scroll (`pointercancel`), with `host` the innermost
	 * element under it. `pointerId` names the touch (the host numbers touches from 1, as a phone browser does), `x` and `y`
	 * are its place in points or dp from the screen's top left, `time` the milliseconds since the screen appeared. The
	 * runtime raises the browser's pointer events from these (`NativePointerEventName`).
	 */
	| {
			readonly event: NativeTouch;
			readonly host: string;
			readonly pointerId?: number;
			readonly x?: number;
			readonly y?: number;
			readonly time?: number;
	  }
	/**
	 * A long press on `host`, the innermost element under it, at `x`, `y` (points or dp from the screen's top left) and
	 * `time` (ms since the screen appeared): Android's host sends it as Chrome raises `contextmenu`; iOS's never does.
	 */
	| {
			readonly event: 'contextmenu';
			readonly host: string;
			readonly x?: number;
			readonly y?: number;
			readonly time?: number;
	  }
	/** The host's back gesture (or Escape) on an open `<dialog>`: it closes, as the browser's cancel does. */
	| { readonly event: 'cancel'; readonly host: string }
	/** The keyboard's return key in a single-line text field. */
	| { readonly event: 'enter'; readonly host: string }
	/** A `timer` journal entry's time has come: its `after` op's ops run, or the script's timer (`script:<n>`) fires. */
	| { readonly event: 'timer'; readonly timer: string }
	/**
	 * The host went idle after the element appeared, or the element came on screen: its handler runs once for each shown
	 * instance (`due` lists the ones still to fire); a second one, or one for an instance not shown, changes nothing.
	 */
	| { readonly event: 'idle' | 'visible'; readonly host: string }
	/** The host's answer to a `fetch` entry. */
	| { readonly event: 'response'; readonly id: number; readonly response: NativeFetchResponse };

/** The prefix of a timer the script set, as its `timer` entries name it (`script:3`); other timers are `after` ops. */
/**
 * The URL a GET form leaves for: its action with the query replaced by the entries, each name and value encoded as
 * `application/x-www-form-urlencoded` (UTF-8, a space as `+`, all but `*-._` and ASCII letters and digits escaped).
 */
export function nativeFormUrl(
	action: string,
	entries: ReadonlyArray<readonly [string, string]>,
): string {
	const encode = (text: string) =>
		[...new TextEncoder().encode(text)]
			.map((byte) =>
				byte === 0x20
					? '+'
					: (byte >= 0x30 && byte <= 0x39) ||
						  (byte >= 0x41 && byte <= 0x5a) ||
						  (byte >= 0x61 && byte <= 0x7a) ||
						  byte === 0x2a ||
						  byte === 0x2d ||
						  byte === 0x2e ||
						  byte === 0x5f
						? String.fromCharCode(byte)
						: `%${byte.toString(16).toUpperCase().padStart(2, '0')}`,
			)
			.join('');
	const hash = action.indexOf('#');
	const base = hash < 0 ? action : action.slice(0, hash);
	const query = base.indexOf('?');
	return `${query < 0 ? base : base.slice(0, query)}?${entries.map(([name, value]) => `${encode(name)}=${encode(value)}`).join('&')}${hash < 0 ? '' : action.slice(hash)}`;
}

export const SCRIPT_TIMER = 'script:';
/** The continuation a device call from a script names: its answer goes back to the script. */
export const SCRIPT_CALL = 'script:';

/** Each screen's async values run under their own name in an engine the app's screens share. */
let screens = 0;

/** The cells as an engine entry carries them: their JSON, and where each non-finite number was (paths from the slot). */
const bridgedCells = (values: ReadonlyMap<string, Value>) => {
	const { json, nonFinite } = nativeNonFiniteSplit(Object.fromEntries(values));
	return { cells: json, ...(nonFinite.length > 0 ? { nonFinite } : {}) };
};

/** Runs a script function a `{ script }` expression names, with its bindings resolved where it is read. */
type Compute = (fn: string, bindings: NativeScriptBindings, scope: NativeScope) => Value;

type Value = NativeValue;

/** What a host reports of a touch. */
export type NativeTouch = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';
const TOUCHES: ReadonlySet<string> = new Set<NativeTouch>([
	'pointerdown',
	'pointermove',
	'pointerup',
	'pointercancel',
]);
/** How many dialog close events one change runs, so close handlers that reopen and close their dialog end. */
const CLOSE_DEPTH = 16;
const RAISED: ReadonlySet<string> = new Set([
	'close',
	'mouseover',
	'mouseout',
	'mouseenter',
	'mouseleave',
	'mousemove',
	'mousedown',
	'mouseup',
	'pointerover',
	'pointerout',
	'pointerenter',
	'pointerleave',
]);

/** An event a script dispatched on an element, as the script's `leave` reports it. */
type Raised = {
	readonly node: string;
	readonly type: string;
	readonly bubbles: boolean;
	readonly reason?: string;
	readonly relatedTarget?: string;
	readonly pointerId?: number;
	readonly pointerType?: string;
	readonly isPrimary?: boolean;
	readonly button?: number;
	readonly buttons?: number;
	readonly clientX?: number;
	readonly clientY?: number;
	readonly key?: string;
};
const RAISE_DEPTH = 32;

/** What the event running a handler carries, by the field a `{ event }` expression names. */
export type NativeEventFields = {
	readonly value?: string;
	/** A text field's `keydown` or `keyup`: the key as the phone's browser names it. */
	readonly key?: string;
	/** A `paste`: the pasted plain text. */
	readonly text?: string;
	/** A press: how many presses in a row on the element. */
	readonly detail?: number;
	readonly reason?: string;
	readonly pressTarget?: string | null;
	readonly target?: string;
	readonly currentTarget?: string;
	readonly relatedTarget?: string | null;
	readonly button?: number;
	readonly buttons?: number;
	readonly clientX?: number;
	readonly clientY?: number;
	readonly pointerId?: number;
	readonly pointerType?: string;
	readonly isPrimary?: boolean;
	readonly timeStamp?: number;
	/** False for an event a script raised; a host's event is trusted. */
	readonly isTrusted?: boolean;
	readonly shiftKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly altKey?: boolean;
	readonly metaKey?: boolean;
};

/** The element facts an expression reads: focus, each overlay's focus origin, and the element tree. */
export type NativeElements = {
	readonly focused: () => string | null;
	readonly focusOrigin: (overlay: string) => string | null;
	readonly isElement: (id: string) => boolean;
	/** Whether a node is shown now. */
	readonly shown: (id: string) => boolean;
	/** The first shown element whose `id` attribute is `id` now, as `document.getElementById` finds it. */
	readonly byId: (id: string) => string | null;
	readonly contains: (within: string, node: string) => boolean;
	/** Whether `node` has captured the touch `pointer`. */
	readonly captures: (node: string, pointer: number) => boolean;
	/** Whether the element `node` was on screen when this run began: every `@if` arm it sits in was drawn. */
	readonly drawn: (node: string) => boolean;
};

/** What names mean inside a list row or an arrow function: the row items by repeat id, the function's parameters. */
export type NativeScope = {
	readonly items: ReadonlyMap<string, Value>;
	/** The row keys by repeat id, where a row's own state is read. */
	readonly keys?: ReadonlyMap<string, string>;
	/** Each row's position in its list by repeat id, from 0: what a `@for`'s `index` reads. */
	readonly positions?: ReadonlyMap<string, number>;
	readonly locals: ReadonlyMap<string, Value>;
	/** The page's route params. */
	readonly params?: Readonly<Record<string, string>>;
	/** A form's entries now, for `{ formData }`. */
	readonly formData?: (form: string) => Value;
	/** A checkbox's or radio button's checkedness now, for `{ checked }`. */
	readonly checked?: (node: string) => boolean;
	/** A text field's text now, for `{ field }`. */
	readonly fieldText?: (node: string) => string;
	/** The device's clock, in milliseconds since 1970 (UTC). */
	readonly now?: () => number;
};

const EMPTY_SCOPE: NativeScope = { items: new Map(), locals: new Map() };

export type NativeRuntime = {
	/** Every shown text node's current string, in document order. */
	readonly texts: () => ReadonlyArray<readonly [node: string, text: string]>;
	/** Every shown element's bound attributes as written: null absent, "" bare. */
	readonly attributes: () => ReadonlyArray<
		readonly [node: string, name: string, value: string | null]
	>;
	/** Every shown input's bound `value`, as `String(value)`. */
	readonly properties: () => ReadonlyArray<readonly [node: string, name: 'value', value: string]>;
	/** Each field `properties` lists and the text it shows now: what was typed since its binding last wrote it. */
	readonly fields: () => ReadonlyArray<readonly [node: string, text: string]>;
	/** Every `<dialog>` and whether it is open in the top layer. */
	readonly dialogs: () => ReadonlyArray<readonly [node: string, open: boolean]>;
	/** The overlay stack, topmost last: each element marked `overlay` that is shown, and whether it is modal. */
	readonly overlays: () => ReadonlyArray<readonly [node: string, modal: boolean]>;
	/** The element that has focus, or null. */
	readonly focused: () => string | null;
	/** Every shown branch's chosen arm (null: none). */
	readonly arms: () => ReadonlyArray<readonly [node: string, index: number | null]>;
	/** Every shown list's row keys, in order. */
	readonly rows: () => ReadonlyArray<readonly [node: string, keys: ReadonlyArray<string>]>;
	/** Every system sheet shown (its arm, if any, showing) and whether its `open` is truthy. */
	readonly sheets: () => ReadonlyArray<readonly [node: string, open: boolean]>;
	/** Every shown checkbox's and radio button's checkedness. */
	readonly checks: () => ReadonlyArray<readonly [node: string, checked: boolean]>;
	/** Each shown option of each `<select>`, in tree order, and whether it is selected. */
	readonly selections: () => ReadonlyArray<readonly [node: string, selected: boolean]>;
	/**
	 * What a select's list shows: each shown option in tree order, with its label (its `label` attribute when not empty,
	 * else its text), whether a person cannot choose it, and whether it is the chosen one.
	 */
	readonly choices: (select: string) => ReadonlyArray<{
		readonly option: string;
		readonly label: string;
		readonly disabled: boolean;
		readonly selected: boolean;
	}>;
	/** Runs the handler bound to the action (or writes the device or task cell it names) and returns the journal. */
	readonly dispatch: (action: NativeAction) => ReadonlyArray<NativeJournalEntry>;
	/** The page's `<title>` text, null when it has none. */
	readonly title: () => string | null;
	/** The calls a host starts at mount, one per task cell, each settling its cell. */
	readonly tasks: () => ReadonlyArray<Extract<NativeJournalEntry, { op: 'call' }>>;
	/** The shown instances with an `idle` (or `visible`) handler that has not run for them, in document order. */
	readonly due: (event: 'idle' | 'visible') => ReadonlyArray<string>;
	/** Whether this screen asked its host for the script engine: 0 for a page whose handlers all ran as data, else 1. */
	readonly engineStarts: () => number;
	/** What the script wrote to `console`, in order, as `[level, text]`. */
	readonly logs: () => ReadonlyArray<readonly [level: string, text: string]>;
	/** Each style slot's number now, in the payload's order: what the host lays the page out with. */
	readonly slots: () => ReadonlyArray<readonly [slot: string, value: number]>;
	/** Whether each style case's test holds now, in the payload's order: which of Dragon's assignments the style is in. */
	readonly styleCases: () => ReadonlyArray<readonly [styleCase: string, value: boolean]>;
	/** Starts the async values the script computes, once the screen is built; the host applies its journal as an action's. */
	readonly start: () => ReadonlyArray<NativeJournalEntry>;
	/** The screen is gone: its async values' runs are aborted; the journal holds the requests to cancel. */
	readonly leave: () => ReadonlyArray<NativeJournalEntry>;
	/** The screen shows again after Back: it takes the app's values of its app-wide cells and the device's of its storage cells, which a page above it may have changed. */
	readonly resume: () => ReadonlyArray<NativeJournalEntry>;
};

/** An element's box in CSS pixels from the screen's top left, and its text direction, as its view has them now. */
export type NativeElementBox = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly direction: 'ltr' | 'rtl';
};

/** How the runtime gets a script engine and the bytes `crypto` draws from; a host owns both. */
export type NativeScriptHost = {
	/** The app's engine, started the first time any screen asks; later asks give the same one. */
	readonly start: () => NativeScriptEngine;
	/** 32 random bytes as hex for one engine entry; only asked for when the script uses `crypto`. */
	readonly seed?: () => string;
};

/** How a value reads in text, as the web writes it (`marklessCsrText`): null is empty, anything else `String(value)`. */
export const formatNativeValue = (value: Value): string => (value === null ? '' : String(value));

const BUILTINS: { readonly [name in NativeBuiltin]: (...args: Value[]) => Value } = {
	String: (value) => String(value),
	Number: (value) => Number(value),
	Boolean: (value) => Boolean(value),
	'Math.abs': (value) => Math.abs(value as number),
	'Math.floor': (value) => Math.floor(value as number),
	'Math.max': (...values) => Math.max(...(values as number[])),
	'Math.min': (...values) => Math.min(...(values as number[])),
	'Math.round': (value) => Math.round(value as number),
	// Answered from the scope's clock below; listed so every builtin has an entry.
	'Date.now': () => Date.now(),
	'Date.toISOString': (time) => new Date(time as number).toISOString(),
};

/** The meaning of an expression: JavaScript's own, run here so the hosts have one definition to match. */
export function evaluateNativeExpr(
	expr: NativeExpr,
	read: (cell: string, scope: NativeScope) => Value,
	/** The event's fields; a string is an `input` event's text. */
	eventValue?: string | NativeEventFields,
	scope: NativeScope = EMPTY_SCOPE,
	compute?: Compute,
	elements?: NativeElements,
): Value {
	const evaluate = (e: NativeExpr): Value =>
		evaluateNativeExpr(e, read, eventValue, scope, compute, elements);
	if ('script' in expr) {
		if (!compute)
			throw new Error(`the script computed ${expr.script} read with no script engine`);
		return compute(expr.script, expr.bindings, scope);
	}
	const dom = (): NativeElements => {
		if (!elements) throw new Error('an element read where there are no elements');
		return elements;
	};
	if ('focused' in expr) return dom().focused() ?? NATIVE_DOCUMENT_BODY;
	if ('focusOrigin' in expr) {
		const overlay = evaluate(expr.focusOrigin);
		return typeof overlay === 'string' ? dom().focusOrigin(overlay) : null;
	}
	if ('isElement' in expr) {
		const value = evaluate(expr.isElement);
		return typeof value === 'string' && dom().isElement(value);
	}
	if ('shown' in expr) return dom().shown(expr.shown);
	if ('byId' in expr) {
		const id = evaluate(expr.byId);
		return id === null ? null : dom().byId(String(id));
	}
	if ('drawn' in expr) return dom().drawn(expr.drawn) ? expr.drawn : null;
	if ('captures' in expr) {
		const node = evaluate(expr.captures);
		const pointer = evaluate(expr.pointer);
		return (
			typeof node === 'string' && typeof pointer === 'number' && dom().captures(node, pointer)
		);
	}
	if ('contains' in expr) {
		const within = evaluate(expr.contains);
		const node = evaluate(expr.node);
		return (
			typeof within === 'string' && typeof node === 'string' && dom().contains(within, node)
		);
	}
	if ('route' in expr) {
		if (!scope.params) throw new Error('route params read on a component that is not a page');
		return { ...scope.params };
	}
	if ('item' in expr) {
		if (!scope.items.has(expr.item))
			throw new Error(`the row item of ${expr.item} read outside its row`);
		return scope.items.get(expr.item)!;
	}
	if ('index' in expr) {
		const position = scope.positions?.get(expr.index);
		if (position === undefined)
			throw new Error(`the row index of ${expr.index} read outside its row`);
		return position;
	}
	if ('local' in expr) {
		if (!scope.locals.has(expr.local))
			throw new Error(`the parameter ${expr.local} read outside its function`);
		return scope.locals.get(expr.local)!;
	}
	if ('array' in expr)
		return expr.array.flatMap((item) => {
			const value = evaluate(item.value);
			if (!item.spread) return [value];
			if (!Array.isArray(value)) throw new Error('a spread of a value that is not an array');
			return value;
		});
	if ('object' in expr)
		return Object.fromEntries(expr.object.map(([key, value]) => [key, evaluate(value)]));
	if ('merge' in expr) {
		const merged: Record<string, NativeValue> = {};
		for (const part of expr.merge) {
			const value = evaluate(part);
			if (value === null) continue;
			if (typeof value !== 'object' || Array.isArray(value))
				throw new Error('a spread of a value that is not an object');
			Object.assign(merged, value);
		}
		return merged;
	}
	if ('lambda' in expr) throw new Error('a function value outside a method call');
	if ('method' in expr) {
		const target = evaluate(expr.target);
		const args = expr.arguments.map((argument) =>
			'lambda' in argument
				? (...values: Value[]) =>
						evaluateNativeExpr(
							argument.body,
							read,
							eventValue,
							{
								items: scope.items,
								...(scope.params ? { params: scope.params } : {}),
								...(scope.now ? { now: scope.now } : {}),
								locals: new Map([
									...scope.locals,
									...argument.lambda.map(
										(name, i) => [name, values[i] ?? null] as const,
									),
								]),
								...(scope.formData ? { formData: scope.formData } : {}),
								...(scope.checked ? { checked: scope.checked } : {}),
								...(scope.fieldText ? { fieldText: scope.fieldText } : {}),
							},
							compute,
							elements,
						)
				: evaluate(argument),
		);
		const method = (target as unknown as Record<string, unknown> | null)?.[expr.method];
		if ((typeof target !== 'string' && !Array.isArray(target)) || typeof method !== 'function')
			throw new Error(`.${expr.method}() of a ${target === null ? 'null' : typeof target}`);
		const result = (method as (...a: unknown[]) => unknown).apply(target, args) as
			| Value
			| undefined;
		if (result === undefined) throw new Error(`.${expr.method}() gave undefined`);
		return result;
	}
	if ('at' in expr) {
		const list = evaluate(expr.of);
		if (!Array.isArray(list)) throw new Error('an index into a value that is not an array');
		const at = evaluate(expr.at);
		return typeof at === 'number' && Number.isInteger(at) && at >= 0 && at < list.length
			? list[at]!
			: null;
	}
	if ('cell' in expr) return read(expr.cell, scope);
	if ('literal' in expr) return expr.literal;
	if ('nonFinite' in expr)
		return expr.nonFinite === 'NaN'
			? Number.NaN
			: expr.nonFinite === 'Infinity'
				? Infinity
				: -Infinity;
	if ('field' in expr) {
		if (!scope.fieldText) throw new Error(`the text of ${expr.field} read outside a runtime`);
		return scope.fieldText(expr.field);
	}
	if ('checked' in expr) {
		if (!scope.checked)
			throw new Error(`the checkedness of ${expr.checked} read outside a runtime`);
		return scope.checked(expr.checked);
	}
	if ('formData' in expr) {
		if (!scope.formData)
			throw new Error(`the entries of ${expr.formData} read outside a runtime`);
		return scope.formData(expr.formData);
	}
	if ('event' in expr) {
		const fields: NativeEventFields | undefined =
			typeof eventValue === 'string' ? { value: eventValue } : eventValue;
		const value = fields?.[expr.event];
		if (value === undefined)
			throw new Error(`the event's ${expr.event} read where the event has none`);
		return value;
	}
	if ('unary' in expr) {
		const value = evaluate(expr.value);
		if (expr.unary === 'typeof') return typeof value;
		return expr.unary === '!'
			? !value
			: expr.unary === '-'
				? -(value as number)
				: +(value as number);
	}
	if ('binary' in expr) {
		const left = evaluate(expr.left) as never;
		const right = evaluate(expr.right) as never;
		switch (expr.binary) {
			case '+':
				return left + right;
			case '-':
				return left - right;
			case '*':
				return left * right;
			case '/':
				return left / right;
			case '%':
				return left % right;
			case '===':
				return left === right;
			case '!==':
				return left !== right;
			case '<':
				return left < right;
			case '<=':
				return left <= right;
			case '>':
				return left > right;
			case '>=':
				return left >= right;
		}
	}
	if ('logical' in expr) {
		const left = evaluate(expr.left);
		if (expr.logical === '&&') return left ? evaluate(expr.right) : left;
		if (expr.logical === '||') return left ? left : evaluate(expr.right);
		return left ?? evaluate(expr.right);
	}
	if ('if' in expr) return evaluate(expr.if) ? evaluate(expr.whenTrue) : evaluate(expr.whenFalse);
	if ('template' in expr)
		return expr.template
			.map((part) => (typeof part === 'string' ? part : String(evaluate(part))))
			.join('');
	if ('member' in expr) {
		const value = evaluate(expr.member);
		if (expr.optional && value === null) return null;
		if ((typeof value === 'string' || Array.isArray(value)) && expr.property === 'length')
			return value.length;
		const index = Number(expr.property);
		if (
			Array.isArray(value) &&
			Number.isInteger(index) &&
			index >= 0 &&
			String(index) === expr.property
		)
			return value[index] ?? null;
		if (
			value !== null &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			Object.hasOwn(value, expr.property)
		)
			return (value as Record<string, Value>)[expr.property]!;
		throw new Error(`.${expr.property} of a value that has none`);
	}
	if (expr.call === 'Date.now') return (scope.now ?? Date.now)();
	return BUILTINS[expr.call](...expr.arguments.map(evaluate));
}

/**
 * Evaluates an expression with the payload's script where it reads one, outside a running page: for build-time readers of
 * a payload (Dragon's style input), with the cell values they choose. A script only computes here; it writes nothing.
 */
export function evaluateWithScript(
	payload: NativeViewPayload,
	host: NativeScriptHost,
): (expr: NativeExpr, values: ReadonlyMap<string, Value>) => Value {
	let engine: NativeScriptEngine | undefined;
	const script = payload.script;
	const evaluate = (expr: NativeExpr, values: ReadonlyMap<string, Value>): Value =>
		evaluateNativeExpr(
			expr,
			(cell) => values.get(cell) ?? null,
			undefined,
			EMPTY_SCOPE,
			(fn, bindings) => {
				if (!script)
					throw new Error(`the script computed ${fn} in a payload with no script`);
				if (!engine) {
					engine = host.start();
					engine.evaluate(script.source);
				}
				const frameOf = (named: NativeScriptBindings): Record<string, unknown> =>
					Object.fromEntries(
						Object.entries(named).map(([name, binding]) => [
							name,
							'device' in binding
								? { device: binding.device, object: binding.object }
								: 'object' in binding
									? { object: frameOf(binding.object) }
									: 'method' in binding
										? {
												method: binding.method,
												frame: frameOf(binding.bindings),
											}
										: 'shared' in binding
											? { shared: frameOf(binding.shared) }
											: 'cell' in binding
												? { slot: binding.cell }
												: 'fields' in binding
													? { fields: binding.fields }
													: 'elements' in binding
														? {
																elements: evaluate(
																	binding.elements,
																	values,
																),
															}
														: 'callback' in binding
															? binding
															: {
																	value: evaluate(
																		binding.value,
																		values,
																	),
																},
						]),
					);
				const frame = frameOf(bindings);
				// A cell `undefined` on the web at first is still so here: no caller gives it a value of its own.
				const unset = payload.cells
					.filter((cell) => cell.unset && (values.get(cell.id) ?? null) === null)
					.map((cell) => cell.id);
				const entry = {
					kind: 'compute',
					fn,
					frame,
					...bridgedCells(values),
					...(unset.length > 0 ? { unset } : {}),
					...(host.seed ? { seed: host.seed() } : {}),
				};
				const result = JSON.parse(
					engine.evaluate(
						`globalThis.__markless[${JSON.stringify(script.id)}].enter(${JSON.stringify(JSON.stringify(entry))})`,
					),
				) as { json: unknown; nonFinite: NativeNonFinite };
				return nativeNonFiniteJoin(result.json, result.nonFinite) as Value;
			},
		);
	return evaluate;
}

/** The reference meaning of a payload's state, ops and journal; the Swift and Kotlin hosts are checked against it. */
export function createNativeRuntime(
	payload: NativeViewPayload,
	/** The device's kept values by storage key; read at mount, written on every change, kept across launches. */
	store: Map<string, Value> = new Map(),
	/** The route params the page opened with. */
	params: Readonly<Record<string, string>> = {},
	/** The device's preferred languages, most preferred first: the web's messages are shown in the first one it has. */
	preferredLanguages: ReadonlyArray<string> = ['en'],
	/** The device's clock; a conformance run fixes it. */
	now: () => number = Date.now,
	/** Where a page with JavaScript handlers gets its engine; started on first use, never for a page without a script. */
	scriptHost?: NativeScriptHost,
	/** The app's values of its app-wide `shared()` cells, one for every page: read at mount and on `resume`, written on every change. */
	session: Map<string, Value> = new Map(),
	/** The screen's views: the box of an element (its node id, `<node>@<key>` in a row) a script reads, measured as an entry begins; null when it has no view. */
	measure?: (id: string) => NativeElementBox | null,
	/** The device's answers to the media features a script's `matchMedia` reads, read as each entry begins. */
	media: () => NativeScriptMedia = () => NATIVE_SCRIPT_MEDIA_DEFAULTS,
	/** The screen's device pixels per CSS px that a script's `devicePixelRatio` reads, read as each entry begins. */
	screenFacts: () => NativeScriptScreen = () => ({ devicePixelRatio: 1 }),
): NativeRuntime {
	const base: NativeScope = {
		...EMPTY_SCOPE,
		params,
		formData: (form) => entriesOf(form),
		checked: (node) => checkedOf(node),
		fieldText: (node) => textOf(node),
		now,
	};
	// Each write moves `version`, so a script computed is run again only once a cell may have changed.
	let version = 0;
	/** Cells still `undefined` on the web: a script reads them so until one is written. */
	const unset = new Set<string>();
	const values = new (class extends Map<string, Value> {
		override set(key: string, value: Value) {
			version++;
			unset.delete(key);
			return super.set(key, value);
		}
		override delete(key: string) {
			version++;
			return super.delete(key);
		}
	})(
		payload.cells.map((cell) => [
			cell.id,
			cell.clock
				? now()
				: cell.app && session.has(cell.id)
					? session.get(cell.id)!
					: cell.storage && store.has(cell.storage.key)
						? store.get(cell.storage.key)!
						: (nativeNonFiniteJoin(cell.initial, cell.nonFinite) as Value),
		]),
	);
	for (const cell of payload.cells)
		if (
			cell.unset &&
			!(cell.storage && store.has(cell.storage.key)) &&
			!(cell.app && session.has(cell.id))
		)
			unset.add(cell.id);
	const appCells = payload.cells.filter((cell) => cell.app).map((cell) => cell.id);
	const keepApp = () => {
		for (const cell of appCells) if (!unset.has(cell)) session.set(cell, values.get(cell)!);
	};
	const storageKeys = new Map(
		payload.cells.flatMap((cell) =>
			cell.storage ? [[cell.id, cell.storage.key] as const] : [],
		),
	);
	const handlers = new Map(payload.handlers.map((handler) => [handler.id, handler.ops]));
	/** Every `after` of every call op, by id: what runs when a host resumes it. */
	const continuations = new Map<
		string,
		NonNullable<Extract<NativeOp, { op: 'call' }>['after']>
	>();
	const collectThen = (ops: ReadonlyArray<NativeOp>): void => {
		for (const op of ops)
			if (op.op === 'call' && op.after) {
				continuations.set(op.after.id, op.after);
				collectThen(op.after.ops);
			}
	};
	for (const handler of payload.handlers) collectThen(handler.ops);
	/** Each `<dialog>`'s top-layer state; every dialog mounts closed. */
	const dialogs = new Map<string, boolean>(
		payload.nodes.flatMap((node): [string, boolean][] =>
			node.kind === 'element' && node.element === 'dialog' ? [[node.id, false]] : [],
		),
	);
	/** Dialogs that closed during the current change, in order; each fires its `close` once the change's handler ends. */
	const closing: string[] = [];
	const setDialog = (node: string, open: boolean) => {
		if (dialogs.get(node) === true && !open) closing.push(node);
		dialogs.set(node, open);
	};
	const branches = new Map(
		payload.nodes.flatMap((node) => (node.kind === 'branch' ? [[node.id, node] as const] : [])),
	);
	const repeats = new Map(
		payload.nodes.flatMap((node) => (node.kind === 'repeat' ? [[node.id, node] as const] : [])),
	);
	const rowOfCell = new Map(
		payload.cells.flatMap((cell) => (cell.row ? [[cell.id, cell.row] as const] : [])),
	);
	/** Where a cell's value is kept: its id, or `<id>@<key>` for a row's own state, read in that row. */
	const slotOf = (cell: string, scope: NativeScope): string => {
		const row = rowOfCell.get(cell);
		if (row === undefined) return cell;
		const key = scope.keys?.get(row);
		if (key === undefined) throw new Error(`the row state ${cell} read outside its row`);
		return `${cell}@${key}`;
	};
	/** A row's state reads its first value until the row writes it. */
	const read = (cell: string, scope: NativeScope = base): Value => {
		if (!values.has(cell)) throw new Error(`unknown cell ${cell}`);
		const slot = slotOf(cell, scope);
		return values.has(slot) ? values.get(slot)! : values.get(cell)!;
	};
	/** The script engine: none until a script op or script computed first needs it. */
	let engine: NativeScriptEngine | undefined;
	let engineStarts = 0;
	const logs: (readonly [string, string])[] = [];
	const script = payload.script;
	const call = (method: 'enter' | 'leave', argument?: unknown): string => {
		if (!script) throw new Error('a script op in a payload with no script');
		if (!engine) {
			if (!scriptHost) throw new Error('a script op with no script engine to run it');
			engine = scriptHost.start();
			engineStarts++;
			// A shared engine may hold this script already, from another screen of the same page.
			engine.evaluate(script.source);
		}
		const target = `globalThis.__markless[${JSON.stringify(script.id)}].${method}`;
		return engine.evaluate(
			argument === undefined
				? `${target}()`
				: `${target}(${JSON.stringify(JSON.stringify(argument))})`,
		);
	};
	/** The names a script function reads, as its engine entry spells them: slots of this scope's cells, and values. */
	const frameOf = (
		bindings: NativeScriptBindings,
		eventValue: string | undefined,
		scope: NativeScope,
	): Record<string, unknown> =>
		Object.fromEntries(
			Object.entries(bindings).map(([name, binding]) => [
				name,
				'device' in binding
					? { device: binding.device, object: binding.object }
					: 'object' in binding
						? { object: frameOf(binding.object, eventValue, scope) }
						: 'method' in binding
							? {
									method: binding.method,
									frame: frameOf(binding.bindings, eventValue, scope),
								}
							: 'shared' in binding
								? { shared: frameOf(binding.shared, eventValue, scope) }
								: 'cell' in binding
									? { slot: slotOf(binding.cell, scope) }
									: 'fields' in binding
										? {
												fields: Object.fromEntries(
													Object.entries(binding.fields).map(
														([field, cell]) => [
															field,
															slotOf(cell, scope),
														],
													),
												),
											}
										: 'elements' in binding
											? {
													elements: evaluate(
														binding.elements,
														eventValue,
														scope,
													),
												}
											: 'callback' in binding
												? binding
												: {
														value: evaluate(
															binding.value,
															eventValue,
															scope,
														),
													},
			]),
		);
	/**
	 * What the host tells a script about the elements its frame passes as proxies: each one's attributes now and the
	 * elements it is inside, nearest first.
	 */
	const elementFacts = (frame: Record<string, unknown>, also: readonly string[] = []) => {
		const facts: Record<
			string,
			{
				attributes: Record<string, string>;
				ancestors: string[];
				captures?: number[];
				box?: { x: number; y: number; width: number; height: number };
				direction?: 'ltr' | 'rtl';
			}
		> = {};
		const add = (id: unknown) => {
			if (typeof id !== 'string' || facts[id] || !elements.isElement(id)) return;
			const at = id.indexOf('@');
			const key = at < 0 ? '' : id.slice(at);
			const node = nodesById.get(nodeOf(id));
			const attributes: Record<string, string> = {};
			if (node?.kind === 'element') {
				const scope = instances(node).find((instance) => instance.id === id)?.scope ?? base;
				for (const name of Object.keys(node.attributes ?? {}))
					attributes[name] = node.attributes![name]!;
				for (const binding of node.bindings ?? []) {
					if (!('attribute' in binding)) continue;
					const value = marklessAttributeValue(
						binding.attribute,
						evaluate(binding.value, undefined, scope),
					);
					if (value === null) delete attributes[binding.attribute];
					else attributes[binding.attribute] = value;
				}
			}
			const ancestors: string[] = [];
			for (let up = node?.parent; up; up = nodesById.get(up)?.parent)
				ancestors.push(key && nodesById.get(up)?.row ? `${up}${key}` : up);
			const captures = [...touches].flatMap(([pointer, touch]) =>
				touch.capture === id ? [pointer] : [],
			);
			const measured = measure?.(id);
			facts[id] = {
				attributes,
				ancestors,
				...(captures.length > 0 ? { captures } : {}),
				...(measured
					? {
							box: {
								x: measured.x,
								y: measured.y,
								width: measured.width,
								height: measured.height,
							},
							direction: measured.direction,
						}
					: {}),
			};
		};
		const visit = (names: Record<string, unknown>) => {
			for (const entry of Object.values(names)) {
				const {
					elements: given,
					object,
					shared,
					frame,
				} = entry as {
					elements?: unknown;
					object?: Record<string, unknown>;
					shared?: Record<string, unknown>;
					frame?: Record<string, unknown>;
				};
				if (object) visit(object);
				if (frame) visit(frame);
				if (shared) visit(shared);
				if (given === undefined) continue;
				if (Array.isArray(given)) given.forEach(add);
				else add(given);
			}
		};
		visit(frame);
		also.forEach(add);
		return facts;
	};
	const entryCells = () => ({
		...bridgedCells(values),
		...(unset.size > 0 ? { unset: [...unset] } : {}),
		...(script?.services.includes('crypto') && scriptHost?.seed
			? { seed: scriptHost.seed() }
			: {}),
		...(script?.services.includes('navigate') ? { params } : {}),
		...(script?.services.includes('media') ? { media: media() } : {}),
		...(script?.services.includes('screen') ? { screen: screenFacts() } : {}),
	});
	/** One engine entry, then what it asked for: its writes land in cells; timers, clears and requests become entries. */
	/** Submissions held by a script promise not settled yet, by the engine's run number. */
	const scriptRuns = new Map<number, Submission>();
	const enter = (
		entry: Record<string, unknown>,
		submission?: Submission,
	): NativeJournalEntry[] => {
		// A handler may read the focused element; a computed, which renders, never does, so only entries carry it.
		const focus =
			focused !== null && focused !== NATIVE_DOCUMENT_BODY
				? { focused, focusElements: elementFacts({}, [focused]) }
				: {};
		call('enter', { ...entry, ...focus, ...entryCells() });
		const result = JSON.parse(call('leave')) as {
			readonly pending: ReadonlyArray<number>;
			readonly settled: ReadonlyArray<number>;
			readonly writes: ReadonlyArray<readonly [string, Value, NativeNonFinite?]>;
			readonly aborts: ReadonlyArray<number>;
			readonly timers: ReadonlyArray<readonly [number, number]>;
			readonly clears: ReadonlyArray<number>;
			readonly requests: ReadonlyArray<{
				readonly id: number;
				readonly request: Extract<NativeJournalEntry, { op: 'fetch' }>['request'];
			}>;
			readonly logs: ReadonlyArray<readonly [string, string]>;
			readonly calls?: ReadonlyArray<{
				readonly id?: number;
				readonly call: Extract<NativeJournalEntry, { op: 'call' }>['call'];
				readonly object?: string;
				readonly arguments: ReadonlyArray<Value>;
			}>;
			readonly navigate?: {
				readonly route: string;
				readonly params: Readonly<Record<string, string>>;
				readonly replace: boolean;
			};
			readonly commands?: ReadonlyArray<
				| readonly [string, 'focus' | 'scrollIntoView' | 'showModal' | 'close', boolean]
				| readonly [string, 'setPointerCapture' | 'releasePointerCapture', number]
			>;
			readonly raises?: ReadonlyArray<Raised>;
			/** A key or paste handler called `preventDefault()` before it first awaited. */
			readonly prevented?: true;
			/** A click handler called `stopPropagation()` before it first awaited. */
			readonly stopped?: true;
			/** The text an input handler set on its field (`event.target.value = …`). */
			readonly value?: string;
			/** The event types the page's document listens for now, when an entry changed them. */
			readonly listening?: ReadonlyArray<string>;
			/** The elements the entry that changed them held, which the document's listeners may read later. */
			readonly watch?: ReadonlyArray<string>;
		};
		if (result.stopped) propagationStopped = true;
		if (result.listening) {
			documentListening.clear();
			for (const type of result.listening) documentListening.add(type);
		}
		for (const id of result.watch ?? []) documentElements.add(id);
		if (result.value !== undefined && typing !== undefined) {
			edited.set(typing, result.value);
			written.add(typing);
		}
		for (const [slot, json, nonFinite] of result.writes) {
			const value = nativeNonFiniteJoin(json, nonFinite) as Value;
			const at = slot.indexOf('@');
			const cell = at < 0 ? slot : slot.slice(0, at);
			if (!values.has(cell)) throw new Error(`the script wrote unknown cell ${cell}`);
			values.set(slot, value);
			const key = storageKeys.get(cell);
			if (key !== undefined) store.set(key, value);
		}
		logs.push(...result.logs);
		// A submit handler's promise keeps its submission running until the entry it settles in, as the web keeps the form busy.
		for (const run of result.pending)
			if (submission) {
				submission.pending++;
				scriptRuns.set(run, submission);
			}
		for (const run of result.settled) {
			const kept = scriptRuns.get(run);
			if (!kept) continue;
			scriptRuns.delete(run);
			kept.pending--;
			settled(kept);
		}
		const raised: NativeJournalEntry[] = [];
		for (const event of result.raises ?? []) {
			const out = raise(event);
			if (out[0]?.op === 'navigate') return out;
			raised.push(...out);
		}
		return [
			...result.aborts.map((id): NativeJournalEntry => ({ op: 'abort', id })),
			...result.clears.map((id): NativeJournalEntry => ({
				op: 'clearTimer',
				timer: `${SCRIPT_TIMER}${id}`,
			})),
			...result.timers.map(([id, ms]): NativeJournalEntry => ({
				op: 'timer',
				timer: `${SCRIPT_TIMER}${id}`,
				ms,
			})),
			...result.requests.map(({ id, request }): NativeJournalEntry => ({
				op: 'fetch',
				id,
				request,
			})),
			...(result.calls ?? []).map(
				({ id, call, object, arguments: given }): NativeJournalEntry => ({
					op: 'call',
					call,
					...(object !== undefined ? { object } : {}),
					arguments: given,
					...(id !== undefined ? { resume: `${SCRIPT_CALL}${id}` } : {}),
				}),
			),
			...(result.commands ?? []).flatMap(
				([node, command, argument]): NativeJournalEntry[] => {
					if (command === 'setPointerCapture' || command === 'releasePointerCapture') {
						const touch = touches.get(argument as number);
						if (!touch) return [];
						if (command === 'setPointerCapture') touch.capture = node;
						else if (touch.capture === node) touch.capture = null;
						return [];
					}
					const preventScroll = argument === true;
					// A dialog's showModal() and close() change what the views show; the journal's dialog entry says so.
					if (command === 'showModal' || command === 'close') {
						if (!dialogs.has(node))
							throw new Error(`${command}() on ${node}, which is not a dialog`);
						setDialog(node, command === 'showModal');
						return [];
					}
					if (command === 'focus') focused = node;
					return [
						{
							op: 'command',
							node,
							command,
							...(preventScroll ? { preventScroll: true as const } : {}),
						},
					];
				},
			),
			...(result.prevented ? [{ op: 'preventDefault' } as NativeJournalEntry] : []),
			...(result.value !== undefined && typing !== undefined
				? [{ op: 'property', node: typing, name: 'value', value: result.value } as NativeJournalEntry]
				: []),
			...raised,
			...(result.navigate
				? [
						{
							op: 'navigate',
							route: result.navigate.route,
							params: result.navigate.params,
							...(result.navigate.replace ? { replace: true as const } : {}),
						} satisfies NativeJournalEntry,
					]
				: []),
		];
	};
	/** How deep events raised from JavaScript may nest (a handler that raises one that raises another...). */
	let raising = 0;
	/** A click handler called stopPropagation(): the press goes no further out. */
	let propagationStopped = false;
	/**
	 * An event a script dispatched on an element (or its `click()`), raised once the script returned: `click` as a press
	 * on the innermost element from it outwards that has one; any other type on the element, then its ancestors when it
	 * bubbles, each running its own handler for that type.
	 */
	const raise = (event: Raised): NativeJournalEntry[] => {
		if (raising >= RAISE_DEPTH)
			throw new Error(`events raised from JavaScript nest deeper than ${RAISE_DEPTH}`);
		raising++;
		try {
			const chain: string[] = [];
			for (
				let node: string | null | undefined = nodeOf(event.node);
				node;
				node = nodesById.get(node)?.parent
			)
				chain.push(node === nodeOf(event.node) ? event.node : node);
			const calls: NativeJournalEntry[] = [];
			if (event.type === 'click') {
				const pressed = chain.find((node) => handlerOf(nodeOf(node), 'activate'));
				return pressed ? press(pressed, clickFields(false)) : [];
			}
			for (const node of event.bubbles ? chain : chain.slice(0, 1)) {
				const own = handlerOf(nodeOf(node), event.type as NativePointerEventName);
				const scope = scopeOf(node);
				if (!own || !scope) continue;
				const fields: NativeEventFields =
					event.type === DISMISS_EVENT
						? { reason: event.reason ?? '', pressTarget: null, isTrusted: false }
						: event.type === 'keydown'
							? {
									isTrusted: false,
									key: event.key ?? '',
									target: event.node,
									currentTarget: node,
								}
							: {
									isTrusted: false,
									target: event.node,
									currentTarget: node,
									relatedTarget: event.relatedTarget ?? null,
									button: event.button ?? 0,
									buttons: event.buttons ?? 0,
									clientX: event.clientX ?? 0,
									clientY: event.clientY ?? 0,
									pointerId: event.pointerId ?? 0,
									pointerType: event.pointerType ?? '',
									isPrimary: event.isPrimary ?? false,
									timeStamp: 0,
								};
				const out = run(handlers.get(own.handler) ?? [], fields, scope);
				if (out[0]?.op === 'navigate') return out;
				calls.push(...out);
			}
			return calls;
		} finally {
			raising--;
		}
	};
	const screen = ++screens;
	const asyncCells = payload.cells.filter((cell) => cell.async);
	/** What the async values' runs depend on as last told to the engine; null before the first. */
	let asyncSent: string | null = null;
	/** Async values a `reset` asked to run again, by slot: sent with the next `tasks` entry. */
	const retry = new Set<string>();
	/** Tells the engine which async values are shown and what they read, when that moved; it starts and aborts runs. */
	const syncAsync = (): NativeJournalEntry[] => {
		if (asyncCells.length === 0) return [];
		const out: NativeJournalEntry[] = [];
		// A run that settles at once can show another; the engine is asked again until nothing moves.
		for (let round = 0; round < 16; round++) {
			const shownAsync = asyncCells.flatMap((cell) => {
				const at = new Map<string, NativeScope>();
				for (const id of cell.async!.boundaries) {
					const node = nodesById.get(id);
					for (const instance of node ? instances(node) : []) {
						const slot = slotOf(cell.id, instance.scope);
						if (!at.has(slot)) at.set(slot, instance.scope);
					}
				}
				return [...at].map(([slot, scope]) => ({ cell, slot, scope }));
			});
			const tasks = shownAsync.map(({ cell, slot, scope }) => ({
				slot,
				fn: cell.async!.script,
				frame: frameOf(cell.async!.bindings, undefined, scope),
			}));
			const sent = JSON.stringify([
				tasks,
				shownAsync.map(({ cell, scope }) => readFrame(cell.async!.bindings, scope)),
			]);
			if (sent === asyncSent && retry.size === 0) return out;
			asyncSent = sent;
			const again = [...retry];
			retry.clear();
			out.push(
				...enter({
					kind: 'tasks',
					screen,
					tasks,
					...(again.length > 0 ? { retry: again } : {}),
				}),
			);
		}
		throw new Error('async values that keep starting each other');
	};
	/** What a script function's names hold now. */
	const readFrame = (bindings: NativeScriptBindings, scope: NativeScope): unknown[] =>
		Object.values(bindings).map((binding) =>
			'device' in binding
				? binding.object
				: 'object' in binding
					? readFrame(binding.object, scope)
					: 'shared' in binding
						? readFrame(binding.shared, scope)
						: 'method' in binding
							? readFrame(binding.bindings, scope)
							: 'cell' in binding
								? read(binding.cell, scope)
								: 'fields' in binding
									? Object.values(binding.fields).map((cell) => read(cell, scope))
									: 'elements' in binding
										? evaluate(binding.elements, undefined, scope)
										: 'callback' in binding
											? null
											: evaluate(binding.value, undefined, scope),
		);
	// As on the web, a computed is not run again while nothing it reads has changed.
	const computed = new Map<string, Value>();
	let computedAt = -1;
	const compute: Compute = (fn, bindings, scope) => {
		if (computedAt !== version) {
			computed.clear();
			computedAt = version;
		}
		const frame = frameOf(bindings, undefined, scope);
		const elements = elementFacts(frame);
		const key = JSON.stringify([fn, frame, elements]);
		if (computed.has(key)) return computed.get(key)!;
		const result = JSON.parse(
			call('enter', { kind: 'compute', fn, frame, elements, ...entryCells() }),
		) as {
			json: unknown;
			nonFinite: NativeNonFinite;
		};
		const value = nativeNonFiniteJoin(result.json, result.nonFinite) as Value;
		computed.set(key, value);
		return value;
	};
	/** Focus, the overlay stack (topmost last) and each overlay's focus origin, kept as the web's overlay behaviour keeps them. */
	let focused: string | null = null;
	let stack: string[] = [];
	const origins = new Map<string, string>();
	/** Each touch that is down: the element it is captured to (null after a release), the one under it, and whether it was first. */
	const touches = new Map<
		number,
		{ capture: string | null; over: string; readonly primary: boolean }
	>();
	/** Where the last touch came up, which the click it makes reports; a click no touch made is at 0, 0. */
	let tapPoint: { readonly x: number; readonly y: number } | null = null;
	/** The element a phone browser's mouse is over: the last one tapped, until a tap elsewhere moves it. */
	let mouseOver: string | null = null;
	const clickFields = (trusted: boolean): NativeEventFields => {
		const at = trusted ? tapPoint : null;
		tapPoint = null;
		return {
			isTrusted: trusted,
			clientX: at?.x ?? 0,
			clientY: at?.y ?? 0,
			shiftKey: false,
			ctrlKey: false,
			altKey: false,
			metaKey: false,
			detail: 0,
		};
	};
	/** A row's copy (`<node>@<key>`) sits where its node does in the tree. */
	const nodeOf = (id: string) => (id.includes('@') ? id.slice(0, id.indexOf('@')) : id);
	const elements: NativeElements = {
		focused: () => focused,
		focusOrigin: (overlay) => origins.get(overlay) ?? null,
		isElement: (id) =>
			id === NATIVE_DOCUMENT_BODY || nodesById.get(nodeOf(id))?.kind === 'element',
		shown: (id) => {
			const node = nodesById.get(id);
			return node !== undefined && shown(node);
		},
		byId: (wanted) => {
			for (const node of payload.nodes) {
				if (node.kind !== 'element') continue;
				const binding = node.bindings?.find(
					(one) => 'attribute' in one && one.attribute === 'id',
				);
				for (const { id, scope } of instances(node)) {
					const value = binding
						? marklessAttributeValue('id', evaluate(binding.value, undefined, scope))
						: (node.attributes?.['id'] ?? null);
					if (value === wanted) return id;
				}
			}
			return null;
		},
		contains: (within, node) => {
			if (within === NATIVE_DOCUMENT_BODY) return true;
			for (
				let at: string | null | undefined = nodeOf(node);
				at;
				at = nodesById.get(at)?.parent
			)
				if (at === nodeOf(within)) return true;
			return false;
		},
		captures: (node, pointer) => touches.get(pointer)?.capture === node,
		drawn: (node) => {
			const chosen = drawnArms ?? new Map(arms());
			for (let at = nodesById.get(node)?.arm; at; at = nodesById.get(at.branch)?.arm)
				if (chosen.get(at.branch) !== at.index) return false;
			return true;
		},
	};
	/** The arms on screen when the running action began; null between actions, when what shows is what the cells say. */
	let drawnArms: Map<string, number | null> | null = null;
	const evaluate = (
		expr: NativeExpr,
		eventValue?: string | NativeEventFields,
		scope?: NativeScope,
	): Value => evaluateNativeExpr(expr, read, eventValue, scope ?? base, compute, elements);
	const armOf = (
		branch: Extract<NativeNode, { kind: 'branch' }>,
		scope: NativeScope = base,
	): number | null => {
		if (branch.test)
			return evaluate(branch.test, undefined, scope) ? 0 : branch.arms > 1 ? 1 : null;
		const tests = branch.tests ?? [];
		const chosen = tests.findIndex((test) => test !== null && evaluate(test, undefined, scope));
		if (chosen >= 0) return chosen;
		const fallback = tests.indexOf(null);
		return fallback >= 0 ? fallback : null;
	};
	/** Whether a node shows where `scope` is: in a list row, the arms around it are that row's. */
	const shownIn = (node: NativeNode, scope: NativeScope): boolean => armShown(node.arm, scope);
	/** Whether an arm place shows: its branch shows and has that arm chosen; no place always shows. */
	const armShown = (arm: NativeNode['arm'], scope: NativeScope = base): boolean => {
		if (!arm) return true;
		const branch = branches.get(arm.branch);
		return !!branch && shownIn(branch, scope) && armOf(branch, scope) === arm.index;
	};
	/** Seeded cells whose arm is hidden: their seed runs again when the arm shows, as its component renders then. */
	const reseed = new Set<string>();
	// A first value the build could not know is taken when the screen opens, in cell order, as the body runs once on the web.
	for (const cell of payload.cells) {
		if (!cell.seed) continue;
		if (armShown(cell.arm)) values.set(cell.id, evaluate(cell.seed));
		else reseed.add(cell.id);
	}
	/** Whether any instance of a node shows. */
	const shown = (node: NativeNode): boolean => instances(node).length > 0;
	const nodesById = new Map(payload.nodes.map((node) => [node.id, node]));
	/** Device objects whose owning component is shown. */
	const liveObjects = (): string[] =>
		(payload.objects ?? []).flatMap((object) => {
			const owner = nodesById.get(object.owner);
			if (!owner) throw new Error(`${object.id} is owned by unknown node ${object.owner}`);
			return shown(owner) ? [object.id] : [];
		});
	/** A row's key as hosts and journal entries spell it: `String()` of the item's key path, or its key parts joined. */
	const rowsOf = (repeat: Extract<NativeNode, { kind: 'repeat' }>, scope: NativeScope = base) => {
		const list = evaluate(repeat.list, undefined, scope);
		if (!Array.isArray(list))
			throw new Error(`${repeat.id} lists a value that is not an array`);
		const valueAt = (item: Value, path: ReadonlyArray<string>) => {
			let key: Value = item;
			for (const step of path) {
				if (
					key === null ||
					typeof key !== 'object' ||
					Array.isArray(key) ||
					!Object.hasOwn(key, step)
				)
					throw new Error(`${repeat.id}: a row has no key at ${path.join('.')}`);
				key = (key as Record<string, Value>)[step]!;
			}
			return key;
		};
		return list.map((item, index) => ({
			key: repeat.byIndex
				? String(index)
				: repeat.keyParts
					? repeat.keyParts
							.map((part) =>
								typeof part === 'string' ? part : String(valueAt(item, part)),
							)
							.join('')
					: String(valueAt(item, repeat.key)),
			item,
		}));
	};
	/**
	 * Every instance of a node now shown: one outside lists, one per row inside one (`<id>@<key>`); a row of a list inside
	 * another list's row is keyed by both rows (`<id>@<outer key>@<inner key>`).
	 */
	const instances = (
		node: NativeNode,
	): { readonly id: string; readonly scope: NativeScope }[] => {
		if (!node.row) return shownIn(node, base) ? [{ id: node.id, scope: base }] : [];
		const repeat = repeats.get(node.row);
		if (!repeat) return [];
		return instances(repeat)
			.flatMap(({ scope }) => {
				const outer = repeat.row ? scope.keys?.get(repeat.row) : undefined;
				return rowsOf(repeat, scope).map(({ key, item }, position) => {
					const suffix = outer === undefined ? key : `${outer}@${key}`;
					return {
						id: `${node.id}@${suffix}`,
						scope: {
							...scope,
							items: new Map([...scope.items, [repeat.id, item]]),
							keys: new Map([...(scope.keys ?? []), [repeat.id, suffix]]),
							positions: new Map([...(scope.positions ?? []), [repeat.id, position]]),
						},
					};
				});
			})
			.filter((instance) => shownIn(node, instance.scope));
	};
	/** For each row's state that has `rebuiltBy`, by slot (`<cell>@<key>`): those values now, as JSON. */
	const rowSignatures = () => {
		const signatures = new Map<string, string>();
		for (const cell of payload.cells) {
			if (!cell.row || !cell.rebuiltBy) continue;
			const repeat = repeats.get(cell.row);
			if (!repeat || !shown(repeat)) continue;
			for (const { key, item } of rowsOf(repeat)) {
				const scope = {
					...base,
					items: new Map([[repeat.id, item]]),
					keys: new Map([[repeat.id, key]]),
				};
				signatures.set(
					`${cell.id}@${key}`,
					JSON.stringify(cell.rebuiltBy.map((expr) => evaluate(expr, undefined, scope))),
				);
			}
		}
		return signatures;
	};
	/** As on the web, a part a row passes a changed value to is built again: that row's state starts over. */
	const resetChangedRows = (before: Map<string, string>) => {
		for (const [slot, now] of rowSignatures()) {
			const was = before.get(slot);
			if (was !== undefined && was !== now) values.delete(slot);
		}
	};
	/** A row's state with a `first` takes it once, from the row's item, when the row is built. */
	const seedRows = () => {
		for (const cell of payload.cells) {
			if (!cell.row || !cell.first) continue;
			const repeat = repeats.get(cell.row);
			if (!repeat || !shown(repeat)) continue;
			for (const { key, item } of rowsOf(repeat)) {
				const slot = `${cell.id}@${key}`;
				if (values.has(slot)) continue;
				values.set(
					slot,
					evaluate(cell.first, undefined, {
						...base,
						items: new Map([[repeat.id, item]]),
						keys: new Map([[repeat.id, key]]),
					}),
				);
			}
		}
	};
	/** Each following cell's last value of what it follows: the write runs again only when that value changes, as on the web. */
	const followed = new Map<string, string>();
	const follow = () => {
		for (let round = 0; round <= payload.cells.length; round++) {
			let moved = false;
			for (const cell of payload.cells) {
				if (!cell.follows) continue;
				const now = evaluate(cell.follows);
				const text = JSON.stringify(now);
				if (followed.get(cell.id) === text) continue;
				followed.set(cell.id, text);
				if (JSON.stringify(values.get(cell.id) ?? null) === text) continue;
				values.set(cell.id, now);
				moved = true;
			}
			if (!moved) return;
		}
		throw new Error('following cells kept changing each other');
	};
	const render = (parts: ReadonlyArray<NativeTextPart>, scope: NativeScope): string =>
		parts
			.map((part) =>
				'text' in part
					? part.text
					: formatNativeValue(
							'cell' in part
								? read(part.cell, scope)
								: evaluate(part.expr, undefined, scope),
						),
			)
			.join('');

	const texts = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'text'
				? instances(node).map(({ id, scope }) => [id, render(node.parts, scope)] as const)
				: [],
		);
	const bound = <K extends 'attribute' | 'property', T>(
		kind: K,
		write: (name: string, value: Value) => T,
	): (readonly [string, string, T])[] =>
		payload.nodes.flatMap((node) =>
			node.kind === 'element'
				? instances(node).flatMap(({ id, scope }) =>
						(node.bindings ?? []).flatMap((binding) => {
							if (!(kind in binding)) return [];
							const name =
								'attribute' in binding ? binding.attribute : binding.property;
							return [
								[
									id,
									name,
									write(name, evaluate(binding.value, undefined, scope)),
								] as const,
							];
						}),
					)
				: [],
		);
	const attributes = () =>
		bound('attribute', (name, value) => marklessAttributeValue(name, value));
	// A slot is a number Dragon's layout takes; anything else is refused here, as no layout of it was proven.
	const caseValues = () =>
		(payload.styleCases ?? []).map(
			(styleCase) => [styleCase.id, Boolean(evaluate(styleCase.value))] as const,
		);
	// A slot whose style case does not show its text keeps its last value: its expression may not hold then (`point.x`).
	const keptSlots = new Map<string, number>();
	const slotValues = () => {
		const cases = new Map(caseValues());
		return (payload.slots ?? []).map((slot) => {
			if (slot.when && cases.get(slot.when.case) !== slot.when.value)
				return [slot.id, keptSlots.get(slot.id) ?? 0] as const;
			const value = evaluate(slot.value);
			if (typeof value !== 'number' || !Number.isFinite(value))
				throw new Error(
					`style slot ${slot.id} is ${JSON.stringify(value)}, not a finite number`,
				);
			if (slot.integer && !Number.isInteger(value))
				throw new Error(`style slot ${slot.id} is ${value}, not a whole number`);
			keptSlots.set(slot.id, value);
			return [slot.id, value] as const;
		});
	};
	/** Text fields with no `value` binding whose text a handler wrote (`field.value = text`): their text is journalled too. */
	const written = new Set<string>();
	const properties = () => {
		const fromBindings = bound('property', (_name, value) => String(value ?? '')).filter(
			([, name]) => name === 'value',
		) as (readonly [string, 'value', string])[];
		const boundNodes = new Set(fromBindings.map(([node]) => node));
		return [
			...fromBindings,
			...[...written]
				.filter((node) => !boundNodes.has(node))
				.map((node) => [node, 'value', edited.get(node) ?? ''] as const),
		];
	};

	// Forms: what each text field holds, which submissions are still running, and the marks they set.
	const forms = new Map((payload.forms ?? []).map((form) => [form.node, form]));
	/** A field's text a person typed since its `value` binding last changed it. */
	const edited = new Map<string, string>();
	/** The text field whose input event is running, which a handler's `event.target.value` write lands on. */
	let typing: string | undefined;
	/** The event types the page's document has listeners for, and the elements those listeners may read. */
	const documentListening = new Set<string>();
	const documentElements = new Set<string>();
	type Submission = {
		readonly sent: string;
		readonly submitter: string | null;
		readonly marks: boolean;
		pending: number;
	};
	const running = new Map<string, Submission[]>();
	const timers = new Map<
		string,
		{
			readonly ops: ReadonlyArray<NativeOp>;
			readonly locals: ReadonlyMap<string, Value>;
			readonly submission?: Submission;
		}
	>();
	let timerCount = 0;
	const elementOf = (id: string) => {
		const node = nodesById.get(id);
		if (node?.kind !== 'element') throw new Error(`${id} is not an element`);
		return node;
	};
	/** An attribute as the web has it now: a binding's value as written, else the attribute the element was built with. */
	const attributeNow = (id: string, name: string): string | null => {
		const node = elementOf(nodeOf(id));
		const binding = node.bindings?.find((one) => 'attribute' in one && one.attribute === name);
		return binding
			? marklessAttributeValue(
					name,
					evaluate(binding.value, undefined, id === node.id ? undefined : scopeOf(id)),
				)
			: (node.attributes?.[name] ?? null);
	};
	const propertyBinding = (id: string, name: string) =>
		elementOf(id).bindings?.find((one) => 'property' in one && one.property === name);
	/** Whether a `<textarea>` shows its default value now: nobody edited it and no `value` property sets it. */
	const followsDefault = (id: string): boolean => {
		const node = elementOf(id.split('@')[0]!);
		return (
			node.element === 'textarea' &&
			!edited.has(id) &&
			propertyBinding(node.id, 'value') === undefined
		);
	};
	const textOf = (id: string): string => {
		const binding = propertyBinding(id, 'value');
		const text = edited.has(id)
			? edited.get(id)!
			: binding
				? String(evaluate(binding.value) ?? '')
				: (attributeNow(id, 'value') ?? '');
		// A range keeps a number in its range and on its step, whatever it is given.
		return attributeNow(id, 'type') === 'range'
			? nativeRangeValue(
					text,
					attributeNow(id, 'min'),
					attributeNow(id, 'max'),
					attributeNow(id, 'step'),
				)
			: text;
	};
	const ticked = payload.nodes.flatMap((node) =>
		node.kind === 'element' &&
		node.element === 'input' &&
		!node.row &&
		(node.attributes?.['type'] === 'checkbox' || node.attributes?.['type'] === 'radio')
			? [node]
			: [],
	);
	// A box an arm hides is not built yet, so its binding (which may read what the arm's test guards) is not read.
	const checkedBinding = (id: string) => {
		const node = nodesById.get(id);
		if (node && !shown(node)) return undefined;
		const binding = propertyBinding(id, 'checked');
		return binding ? Boolean(evaluate(binding.value)) : undefined;
	};
	/** Each checkbox's and radio button's checkedness: its `checked` binding sets it, as does a person's tick. */
	const checkedness = new Map(
		ticked.map(
			(node) =>
				[
					node.id,
					checkedBinding(node.id) ?? node.attributes?.['checked'] !== undefined,
				] as const,
		),
	);
	const checkedOf = (id: string): boolean => {
		if (!checkedness.has(id)) throw new Error(`${id} is not a checkbox or radio button`);
		return checkedness.get(id)!;
	};
	const formOf = (id: string) =>
		(payload.forms ?? []).find((form) => form.fields.some((field) => field.node === id))
			?.node ?? null;
	/** The radio buttons of `id`'s group: the same `name`, in the same form or in none. */
	const groupOf = (id: string) => {
		const name = attributeNow(id, 'name');
		const form = formOf(id);
		return ticked.filter(
			(node) =>
				node.id === id ||
				(node.attributes?.['type'] === 'radio' &&
					!!name &&
					attributeNow(node.id, 'name') === name &&
					formOf(node.id) === form),
		);
	};
	// Selects: each shown option's selectedness, kept as the web keeps it (HTML's selectedness setting algorithm).
	const selects = payload.nodes.filter(
		(node): node is Extract<NativeNode, { kind: 'element' }> =>
			node.kind === 'element' && node.element === 'select',
	);
	const attributeIn = (
		node: Extract<NativeNode, { kind: 'element' }>,
		name: string,
		scope: NativeScope,
	): string | null => {
		const binding = node.bindings?.find((one) => 'attribute' in one && one.attribute === name);
		return binding
			? marklessAttributeValue(name, evaluate(binding.value, undefined, scope))
			: (node.attributes?.[name] ?? null);
	};
	type OptionInstance = {
		readonly id: string;
		readonly node: Extract<NativeNode, { kind: 'element' }>;
		readonly scope: NativeScope;
	};
	/** A select's shown options in tree order: a list's rows where the list stands, each row's options in order. */
	const optionsOf = (select: string): OptionInstance[] => {
		const children = payload.nodes.filter(
			(node): node is Extract<NativeNode, { kind: 'element' }> =>
				node.kind === 'element' && node.element === 'option' && node.parent === select,
		);
		const listed = new Set<string>();
		return children.flatMap((node): OptionInstance[] => {
			if (!node.row) return instances(node).map((instance) => ({ ...instance, node }));
			if (listed.has(node.row)) return [];
			listed.add(node.row);
			const repeat = repeats.get(node.row);
			if (!repeat || !shown(repeat)) return [];
			const siblings = children.filter((child) => child.row === node.row);
			const shownNow = new Map(
				siblings.flatMap((child) =>
					instances(child).map(
						(instance) => [instance.id, { ...instance, node: child }] as const,
					),
				),
			);
			return rowsOf(repeat).flatMap(({ key }) =>
				siblings.flatMap((child) => shownNow.get(`${child.id}@${key}`) ?? []),
			);
		});
	};
	/** An option's text: its text with ASCII whitespace stripped and collapsed, as `option.text` gives it. */
	const optionText = (option: OptionInstance) =>
		payload.nodes
			.flatMap((node) =>
				node.kind === 'text' && node.parent === option.node.id
					? [render(node.parts, option.scope)]
					: [],
			)
			.join('')
			.replace(/[\t\n\f\r ]+/g, ' ')
			.trim();
	const optionValue = (option: OptionInstance) =>
		attributeIn(option.node, 'value', option.scope) ?? optionText(option);
	const selectedBinding = (option: OptionInstance) => {
		const binding = option.node.bindings?.find(
			(one) => 'property' in one && one.property === 'selected',
		);
		return binding ? Boolean(evaluate(binding.value, undefined, option.scope)) : undefined;
	};
	const selectedness = new Map<string, boolean>();
	/** What each option's `selected` binding last wrote: a binding sets the selectedness only when its value changes. */
	const selectedBound = new Map<string, boolean | undefined>();
	/** Brings each select's options up to date: rows that came or left, `selected` bindings that changed, then the rule. */
	const settleSelects = (chosen?: string) => {
		for (const select of selects) {
			const options = optionsOf(select.id);
			const ids = new Set(options.map((option) => option.id));
			for (const id of selectedBound.keys())
				if (nodesById.get(nodeOf(id))?.parent === select.id && !ids.has(id)) {
					selectedness.delete(id);
					selectedBound.delete(id);
				}
			const choose = (id: string) => {
				for (const option of options) selectedness.set(option.id, option.id === id);
			};
			for (const option of options) {
				if (!selectedBound.has(option.id)) {
					const first = selectedBinding(option);
					selectedBound.set(option.id, first);
					selectedness.set(
						option.id,
						first ?? attributeIn(option.node, 'selected', option.scope) !== null,
					);
					if (selectedness.get(option.id)) choose(option.id);
					continue;
				}
				const bound = selectedBinding(option);
				if (bound !== undefined && bound !== selectedBound.get(option.id)) {
					selectedBound.set(option.id, bound);
					selectedness.set(option.id, bound);
					if (bound) choose(option.id);
				}
			}
			if (chosen !== undefined && ids.has(chosen)) choose(chosen);
			if (!options.some((option) => selectedness.get(option.id))) {
				const first = options.find(
					(option) => attributeIn(option.node, 'disabled', option.scope) === null,
				);
				if (first) selectedness.set(first.id, true);
			}
		}
	};
	settleSelects();
	/** The option a person chose in the action being dispatched. */
	let chosenNow: string | undefined;
	/** The option a select has chosen, or undefined when it has none. */
	const chosenOf = (select: string) =>
		optionsOf(select).find((option) => selectedness.get(option.id));
	const selections = () =>
		selects.flatMap((select) =>
			optionsOf(select.id).map(
				(option) => [option.id, selectedness.get(option.id)!] as const,
			),
		);

	const messages = payload.valueMissing ?? {};
	const missing = messages[nativeLocale(preferredLanguages, Object.keys(messages))];
	const tooLongMessages = payload.tooLong ?? {};
	const tooLong = tooLongMessages[nativeLocale(preferredLanguages, Object.keys(tooLongMessages))];
	const numberMessageSets = payload.numberMessages ?? {};
	const numberMessages =
		numberMessageSets[nativeLocale(preferredLanguages, Object.keys(numberMessageSets))];
	const mismatchMessages = payload.typeMismatch ?? {};
	const mismatch =
		mismatchMessages[nativeLocale(preferredLanguages, Object.keys(mismatchMessages))];
	/** A text field's value as the web keeps it: an email field drops line breaks and trims its ends. */
	const valueOf = (node: string) =>
		attributeNow(node, 'type') === 'email' ? nativeEmailValue(textOf(node)) : textOf(node);
	function entriesOf(id: string): Value {
		const form = forms.get(id);
		if (!form) throw new Error(`${id} is not a form`);
		return form.fields.flatMap(({ node, kind }): Value[] => {
			const name = attributeNow(node, 'name');
			if (!shown(elementOf(node)) || attributeNow(node, 'disabled') !== null || !name)
				return [];
			if (kind === 'checkbox' || kind === 'radio')
				return checkedOf(node) ? [[name, attributeNow(node, 'value') ?? 'on']] : [];
			if (kind === 'select') {
				const chosen = chosenOf(node);
				return chosen ? [[name, optionValue(chosen)]] : [];
			}
			if (kind === 'number') return [[name, nativeNumberValue(textOf(node))]];
			return [
				[name, kind === 'hidden' ? (attributeNow(node, 'value') ?? '') : valueOf(node)],
			];
		});
	}
	/** Why a field stops a submit, as the web says it, or undefined when it does not. */
	const invalidity = (node: string, kind: NativeFieldKind): string | undefined => {
		if (kind === 'hidden' || !shown(elementOf(node))) return undefined;
		if (attributeNow(node, 'disabled') !== null) return undefined;
		// A readonly text field is barred from constraint validation.
		if (kind === 'text' && attributeNow(node, 'readonly') !== null) return undefined;
		// A radio button is missing its value when any button of its group is required and none is checked.
		const required =
			kind === 'radio'
				? groupOf(node).some((member) => attributeNow(member.id, 'required') !== null)
				: attributeNow(node, 'required') !== null;
		const absent = () =>
			kind === 'radio'
				? groupOf(node).every((member) => !checkedOf(member.id))
				: kind === 'text' || kind === 'number'
					? valueOf(node) === ''
					: !checkedOf(node);
		if (required && absent()) {
			if (!missing)
				throw new Error(`the payload has no message for a ${kind} missing its value`);
			return missing[kind === 'number' ? 'text' : (kind as 'text' | 'checkbox' | 'radio')];
		}
		if (kind === 'number') {
			const problem = nativeNumberProblem(textOf(node), {
				min: attributeNow(node, 'min'),
				max: attributeNow(node, 'max'),
				step: attributeNow(node, 'step'),
				value: attributeNow(node, 'value'),
			});
			if (!problem) return undefined;
			if (!numberMessages) throw new Error('the payload has no messages for a number field');
			return nativeNumberMessage(
				numberMessages[problem.message],
				numberMessages,
				'values' in problem ? problem.values : {},
			);
		}
		if (kind === 'text' && attributeNow(node, 'type') === 'email') {
			if (!mismatch) throw new Error('the payload has no message for an email field');
			const message = nativeEmailMismatch(mismatch, valueOf(node));
			if (message !== undefined) return message;
		}
		// Only text a person typed is too long: a value the app set is kept whole and passes.
		const max = kind === 'text' ? nativeMaxLength(attributeNow(node, 'maxlength')) : undefined;
		const typed = edited.get(node);
		if (max === undefined || typed === undefined || typed.length <= max) return undefined;
		if (!tooLong)
			throw new Error('the payload has no message for a field longer than its maxlength');
		return nativeTooLongMessage(tooLong, max, typed.length);
	};
	/** The first field that stops a submit, with what the web says about it, or undefined when none does. */
	const firstInvalid = (id: string, submitter: string | null) => {
		const form = forms.get(id)!;
		if (
			form.noValidate ||
			(submitter !== null && attributeNow(submitter, 'formnovalidate') !== null)
		)
			return undefined;
		for (const { node, kind } of form.fields) {
			const message = invalidity(node, kind);
			if (message !== undefined) return { node, message };
		}
		return undefined;
	};
	/** `aria-busy` on a form while a submission of it runs, `aria-disabled` on the button that sent a marking one. */
	const marks = () => {
		const now = new Map<string, string | null>();
		for (const form of payload.forms ?? []) {
			const runs = running.get(form.node) ?? [];
			now.set(`${form.node}\0aria-busy`, runs.length > 0 ? 'true' : null);
			if (form.authoredAriaDisabled) continue;
			for (const submitter of form.submitters)
				now.set(
					`${submitter}\0aria-disabled`,
					runs.some((run) => run.marks && run.submitter === submitter) ? 'true' : null,
				);
		}
		return now;
	};
	const arms = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'branch'
				? instances(node).map(({ id, scope }) => [id, armOf(node, scope)] as const)
				: [],
		);
	const rows = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'repeat' && shown(node)
				? instances(node).map(
						({ id, scope }) => [id, rowsOf(node, scope).map((row) => row.key)] as const,
					)
				: [],
		);
	const sheets = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'sheet' && shown(node)
				? [[node.id, Boolean(evaluate(node.open))] as const]
				: [],
		);
	const keyed = <T>(list: ReadonlyArray<readonly [string, string, T]>) =>
		new Map(list.map(([node, name, value]) => [`${node}\0${name}`, value]));

	const title = () => (payload.title ? render(payload.title, base) : null);
	// The overlay behaviour enlists an element marked `overlay` whose `hidden` binding shows it; one with no such binding never.
	const overlayNodes = payload.nodes.filter(
		(node): node is Extract<NativeNode, { kind: 'element' }> =>
			node.kind === 'element' &&
			!node.row &&
			node.attributes?.[OVERLAY_ATTRIBUTE] !== undefined &&
			(node.bindings ?? []).some(
				(binding) => 'attribute' in binding && binding.attribute === 'hidden',
			),
	);
	const shownOverlays = (): string[] => {
		// Reading every attribute would start a script engine a page with no overlay may not need yet.
		if (overlayNodes.length === 0) return [];
		return overlayNodes.flatMap((node) =>
			instances(node).length > 0 && attributeNow(node.id, 'hidden') === null ? [node.id] : [],
		);
	};
	const isHint = (overlay: string): boolean => {
		const node = nodesById.get(overlay);
		return node?.kind === 'element' && node.attributes?.[OVERLAY_HINT_ATTRIBUTE] !== undefined;
	};
	const isModal = (overlay: string): boolean => {
		return payload.nodes.some(
			(node) =>
				node.kind === 'element' &&
				elements.contains(overlay, node.id) &&
				// A row's copies are keyed by row, so a row element is read as it was built.
				(node.row
					? node.attributes?.[OVERLAY_MODAL_ATTRIBUTE]
					: attributeNow(node.id, OVERLAY_MODAL_ATTRIBUTE)) === OVERLAY_MODAL_VALUE,
		);
	};
	// Rows take their first values, and following cells theirs, before anything reads them, the overlays served shown included.
	seedRows();
	follow();
	// A box's `checked` binding reads cells only now settled (a group's value following its prop): it sets the box again.
	for (const node of ticked) {
		const bound = checkedBinding(node.id);
		if (bound !== undefined) checkedness.set(node.id, bound);
	}
	// Served shown: the document's focus is the body.
	for (const overlay of shownOverlays()) {
		stack.push(overlay);
		origins.set(overlay, NATIVE_DOCUMENT_BODY);
	}
	const handlerOf = (host: string, name: NativeAction['event'] | NativeEventName) =>
		payload.events.find((candidate) => candidate.host === host && candidate.event === name);
	/** The scope a shown instance's handlers run in (its row's), or undefined when it is not shown. */
	const scopeOf = (id: string): NativeScope | undefined =>
		payload.nodes
			.flatMap((node) => (node.id === nodeOf(id) ? instances(node) : []))
			.find((instance) => instance.id === id)?.scope;
	/** The elements from `id` out to the root, innermost first; a row's copy keeps its own id. */
	/** The elements from `id` out to the root, innermost first; those in its row keep its row's key. */
	const chainOf = (id: string): string[] => {
		const key = id.includes('@') ? id.slice(id.indexOf('@')) : '';
		const out: string[] = [];
		for (
			let node: string | null | undefined = nodeOf(id);
			node;
			node = nodesById.get(node)?.parent
		)
			out.push(node === nodeOf(id) ? id : key && nodesById.get(node)?.row ? `${node}${key}` : node);
		return out;
	};
	/**
	 * A press on `pressed`, as a browser's click: its own handler, then the handler of each element around it, innermost
	 * first, until one stops propagation. An element around it whose handler reads where the press landed runs its copy for
	 * the pressed element (`<handler>@<node>`), which a pressed element with no handler of its own holds as its own.
	 */
	const press = (pressed: string, fields: NativeEventFields): NativeJournalEntry[] => {
		propagationStopped = false;
		const own = nodeOf(pressed);
		const ownHandler = handlerOf(own, 'activate')?.handler;
		const journal: NativeJournalEntry[] = [];
		for (const id of chainOf(pressed)) {
			const node = nodeOf(id);
			const bound = handlerOf(node, 'activate');
			const scope = bound && scopeOf(id);
			if (!bound || !scope) continue;
			// A copy (`<handler>@<node>`) stands for the handler around it, and runs only as the pressed element's own.
			if (node !== own && bound.handler.includes('@')) continue;
			const copy = node === own ? undefined : `${bound.handler}@${own}`;
			if (copy && ownHandler === copy) continue;
			journal.push(...run(handlers.get(copy && handlers.has(copy) ? copy : bound.handler) ?? [], fields, scope));
			if (propagationStopped || journal.some((entry) => entry.op === 'navigate')) break;
		}
		propagationStopped = false;
		return journal;
	};
	/** `idle` and `visible` handlers that ran, by `<event>\0<instance>`; an instance that leaves the screen is forgotten. */
	const fired = new Set<string>();
	const due = (event: 'idle' | 'visible'): string[] =>
		payload.events.flatMap((bound) => {
			if (bound.event !== event) return [];
			const node = nodesById.get(bound.host);
			return node
				? instances(node).flatMap(({ id }) => (fired.has(`${event}\0${id}`) ? [] : [id]))
				: [];
		});
	const shownInstance = (id: string) => {
		const node = nodesById.get(id.split('@')[0]!);
		return !!node && instances(node).some((shownNow) => shownNow.id === id);
	};
	// A field an arm hid is a new element when it shows again: it starts from its markup, as the web builds it.
	const forgetHidden = () => {
		for (const key of fired)
			if (!shownInstance(key.slice(key.indexOf('\0') + 1))) fired.delete(key);
		for (const id of edited.keys()) if (!shownInstance(id)) edited.delete(id);
		for (const node of ticked)
			if (!shown(node))
				checkedness.set(
					node.id,
					checkedBinding(node.id) ?? node.attributes?.['checked'] !== undefined,
				);
		// A component an arm hid renders anew when it shows again, so its state starts over (a seed runs again then).
		for (const cell of payload.cells) {
			if (!cell.arm) continue;
			if (!armShown(cell.arm)) {
				values.set(cell.id, cell.initial);
				if (cell.seed) reseed.add(cell.id);
			} else if (cell.seed && reseed.delete(cell.id))
				values.set(cell.id, evaluate(cell.seed));
		}
	};
	return {
		texts,
		attributes: () => [
			...attributes(),
			...[...marks()].map(([key, value]) => {
				const [node, name] = key.split('\0') as [string, string];
				return [node, name, value] as const;
			}),
		],
		properties,
		fields: () => properties().map(([node]) => [node, textOf(node)] as const),
		arms,
		dialogs: () => [...dialogs],
		overlays: () => stack.map((overlay) => [overlay, isModal(overlay)] as const),
		focused: () => focused,
		rows,
		title,
		sheets,
		checks: () =>
			ticked.flatMap((node) => (shown(node) ? [[node.id, checkedOf(node.id)] as const] : [])),
		selections,
		choices: (select) =>
			optionsOf(select).map((option) => ({
				option: option.id,
				label: attributeIn(option.node, 'label', option.scope) || optionText(option),
				disabled: attributeIn(option.node, 'disabled', option.scope) !== null,
				selected: selectedness.get(option.id) ?? false,
			})),
		engineStarts: () => engineStarts,
		logs: () => logs,
		slots: slotValues,
		styleCases: caseValues,
		start: () => (asyncCells.length === 0 ? [] : change(undefined, undefined, () => [])),
		resume: () => {
			const moved = payload.cells.flatMap((cell): Array<readonly [string, Value]> => {
				const [keeper, key] = cell.app
					? [session, cell.id]
					: cell.storage
						? [store, cell.storage.key]
						: [undefined, ''];
				if (!keeper?.has(key)) return [];
				const kept = keeper.get(key)!;
				return Object.is(kept, values.get(cell.id)) ? [] : [[cell.id, kept]];
			});
			return moved.length === 0
				? []
				: change(undefined, undefined, () => {
						for (const [cell, value] of moved) values.set(cell, value);
						return [];
					});
		},
		leave: () =>
			asyncSent === null
				? []
				: enter({ kind: 'tasks', screen, tasks: [], leave: true }).filter(
						(entry) => entry.op === 'abort',
					),
		dispatch(action) {
			if (action.event === 'choose') {
				const option = nodesById.get(nodeOf(action.host));
				const select = option?.parent ? nodesById.get(option.parent) : undefined;
				if (
					option?.kind !== 'element' ||
					option.element !== 'option' ||
					select?.kind !== 'element'
				)
					throw new Error(`${action.host} is not an option of a select`);
				const instance = optionsOf(select.id).find((one) => one.id === action.host);
				if (!instance) throw new Error(`${action.host} is not shown`);
				return change(undefined, undefined, () => {
					if (
						attributeNow(select.id, 'disabled') !== null ||
						attributeIn(option, 'disabled', instance.scope) !== null
					)
						return [];
					const before = chosenOf(select.id)?.id;
					chosenNow = action.host;
					// A different choice fires the select's `change` (an `input` event here), its value the new option's.
					const changed = payload.events.find(
						(event) => event.host === select.id && event.event === 'input',
					);
					if (before === action.host || !changed) return [];
					for (const one of optionsOf(select.id))
						selectedness.set(one.id, one.id === action.host);
					return run(
						handlers.get(changed.handler) ?? [],
						optionValue(instance),
						instance.scope,
					);
				});
			}
			if (action.event === 'timer' && action.timer.startsWith(SCRIPT_TIMER))
				return change(undefined, undefined, () =>
					enter({
						kind: 'timer',
						timer: Number(action.timer.slice(SCRIPT_TIMER.length)),
					}),
				);
			if (action.event === 'response')
				return change(undefined, undefined, () =>
					enter({ kind: 'response', request: action.id, response: action.response }),
				);
			if (
				(action.event === 'resume' || action.event === 'reject') &&
				action.continuation.startsWith(SCRIPT_CALL)
			)
				return change(undefined, undefined, () =>
					enter({
						kind: 'answer',
						call: Number(action.continuation.slice(SCRIPT_CALL.length)),
						...(action.event === 'resume'
							? { value: action.value }
							: { error: action.error }),
					}),
				);
			if (action.event === 'resume') {
				const continuation = continuations.get(action.continuation);
				if (!continuation) throw new Error(`no continuation ${action.continuation}`);
				const scope: NativeScope = {
					...base,
					locals: new Map([...base.locals, [continuation.as, action.value]]),
				};
				return change(undefined, undefined, () => run(continuation.ops, undefined, scope));
			}
			if (action.event === 'reject') {
				const continuation = continuations.get(action.continuation);
				if (!continuation) throw new Error(`no continuation ${action.continuation}`);
				const cell = continuation.catch;
				// With no @catch around the handler, a failed call ends it and changes nothing.
				if (cell === undefined) return [];
				return change(undefined, undefined, () => {
					values.set(cell, { name: action.error.name, message: action.error.message });
					return [];
				});
			}
			if (action.event === 'device' || action.event === 'settle') {
				const cell = payload.cells.find((candidate) => candidate.id === action.cell);
				if (action.event === 'device' ? !cell?.device : !cell?.task)
					throw new Error(
						`${action.cell} is not a ${action.event === 'device' ? 'device' : 'task'} cell`,
					);
				const value: Value =
					action.event === 'device'
						? action.value
						: 'error' in action
							? { state: 'error', error: { ...action.error } }
							: { state: 'value', value: action.value };
				return change(undefined, undefined, () => {
					values.set(action.cell, value);
					return [];
				});
			}
			if (action.event === 'cancel') {
				const host = action.host;
				if (dialogs.get(host) !== true) throw new Error(`${host} is not an open dialog`);
				const cancel = payload.events.find(
					(candidate) => candidate.host === host && candidate.event === 'cancel',
				);
				return change(host, undefined, () => {
					setDialog(host, false);
					return cancel ? run(handlers.get(cancel.handler) ?? [], undefined, base) : [];
				});
			}
			if (action.event === 'timer') {
				const timer = timers.get(action.timer);
				if (!timer) throw new Error(`no timer ${action.timer} is set`);
				timers.delete(action.timer);
				return change(undefined, undefined, () => {
					const out = run(
						timer.ops,
						undefined,
						{ ...base, locals: timer.locals },
						timer.submission,
					);
					if (timer.submission) {
						timer.submission.pending--;
						settled(timer.submission);
					}
					return out;
				});
			}
			if (action.event === 'dismiss' && 'reason' in action) {
				if (stack.at(-1) !== action.host)
					throw new Error(`${action.host} is not the topmost overlay`);
				const dismiss = handlerOf(action.host, 'dismiss');
				const fields: NativeEventFields = { reason: action.reason, pressTarget: null };
				return change(undefined, undefined, () =>
					dismiss ? run(handlers.get(dismiss.handler) ?? [], fields, base) : [],
				);
			}
			if (RAISED.has(action.event))
				throw new Error(`${action.event} is raised by the runtime, not sent by a host`);
			if (action.event === 'contextmenu') {
				const scope = scopeOf(action.host);
				if (!scope) throw new Error(`${action.host} is not shown`);
				return change(undefined, undefined, () => {
					const calls: NativeJournalEntry[] = [];
					for (const node of chainOf(action.host)) {
						const own = handlerOf(nodeOf(node), 'contextmenu');
						if (!own) continue;
						const fields: NativeEventFields = {
							target: action.host,
							currentTarget: node,
							clientX: action.x ?? 0,
							clientY: action.y ?? 0,
							timeStamp: action.time ?? 0,
						};
						const out = run(handlers.get(own.handler) ?? [], fields, scope);
						if (out[0]?.op === 'navigate') return out;
						calls.push(...out);
					}
					return calls;
				});
			}
			if (TOUCHES.has(action.event) && 'host' in action) {
				const touch = action as Extract<NativeAction, { readonly event: NativeTouch }>;
				const scope = scopeOf(touch.host);
				if (!scope) throw new Error(`${touch.host} is not shown`);
				const pointerId = touch.pointerId ?? 1;
				const down = touches.get(pointerId);
				if (touch.event === 'pointerdown' ? down : !down)
					throw new Error(`touch ${pointerId} is ${down ? 'already' : 'not'} down`);
				return change(undefined, undefined, () => {
					const calls: NativeJournalEntry[] = [];
					const state = down ?? {
						capture: touch.host,
						over: touch.host,
						primary: [...touches.values()].every((other) => !other.primary),
					};
					if (!down) touches.set(pointerId, state);
					const at = { x: touch.x ?? 0, y: touch.y ?? 0 };
					if (touch.event !== 'pointermove')
						tapPoint = touch.event === 'pointerup' ? at : null;
					const chain = chainOf;
					const fieldsOf = (
						type: NativePointerEventName,
						target: string,
						currentTarget: string,
						relatedTarget: string | null,
					): NativeEventFields => {
						const lifted =
							type === 'pointerup' ||
							type === 'pointercancel' ||
							type === 'pointerout' ||
							type === 'pointerleave';
						const cancelled = touch.event === 'pointercancel';
						return {
							target,
							currentTarget,
							relatedTarget,
							// Safari's values, which the Pointer Events spec gives; Chrome on Android reports 0 for over, enter, out and leave.
							button: type === 'pointerdown' || type === 'pointerup' ? 0 : -1,
							buttons: lifted ? 0 : 1,
							clientX: cancelled ? 0 : at.x,
							clientY: cancelled ? 0 : at.y,
							pointerId,
							pointerType: 'touch',
							isPrimary: state.primary,
							timeStamp: touch.time ?? 0,
						};
					};
					const runs: {
						readonly handler: string;
						readonly fields: NativeEventFields;
						readonly scope?: NativeScope;
						/** The event bubbled on to the document's listeners, after the element's own handlers. */
						readonly document?: NativePointerEventName;
					}[] = [];
					const raise = (
						type: NativePointerEventName,
						target: string,
						related: string | null = null,
					) => {
						for (const node of chain(target)) {
							const own = handlerOf(nodeOf(node), type);
							if (own)
								runs.push({
									handler: own.handler,
									fields: fieldsOf(type, target, node, related),
								});
						}
						if (documentListening.has(type))
							runs.push({ handler: '', fields: fieldsOf(type, target, target, related), document: type });
					};
					/** `pointerenter` on each element `target` is in that `from` is not, outermost first; `pointerleave` the other way. */
					const crossing = (
						type: 'pointerenter' | 'pointerleave',
						target: string,
						from: string | null,
						related: string | null,
					) => {
						const outside = new Set(from === null ? [] : chain(from));
						const nodes = chain(target).filter((node) => !outside.has(node));
						for (const node of type === 'pointerenter' ? nodes.reverse() : nodes) {
							const own = handlerOf(nodeOf(node), type);
							if (own)
								runs.push({
									handler: own.handler,
									fields: fieldsOf(type, node, node, related),
								});
						}
					};
					const flush = (): NativeJournalEntry[] | undefined => {
						for (const step of runs.splice(0)) {
							if (step.document) {
								const { target: from, relatedTarget, currentTarget: _, ...fields } = step.fields;
								calls.push(
									...enter({
										kind: 'document',
										event: {
											type: step.document,
											...fields,
											nodes: { target: from ?? null, currentTarget: null, relatedTarget: relatedTarget ?? null },
										},
										elements: elementFacts({}, [
											...documentElements,
											...(typeof from === 'string' ? [from] : []),
										]),
									}),
								);
								continue;
							}
							const out = run(
								handlers.get(step.handler) ?? [],
								step.fields,
								step.scope ?? scope,
							);
							if (out[0]?.op === 'navigate') return out;
							calls.push(...out);
						}
						return undefined;
					};
					if (touch.event === 'pointerdown') {
						raise('pointerover', touch.host);
						crossing('pointerenter', touch.host, null, null);
						// The behaviour's document listener hears the press: the topmost hint and the topmost other overlay it landed outside are told.
						for (const top of [
							stack.findLast(isHint),
							stack.findLast((overlay) => !isHint(overlay)),
						]) {
							const dismiss =
								top !== undefined && !elements.contains(top, touch.host)
									? handlerOf(top, 'dismiss')
									: undefined;
							if (dismiss)
								runs.push({
									handler: dismiss.handler,
									fields: { reason: 'outside-press', pressTarget: touch.host },
								});
						}
						raise('pointerdown', touch.host);
						return flush() ?? calls;
					}
					// Before the next event the pointer counts as over its capturing element (or, released, the one under it):
					// a change raises the boundary events from the old one to the new, as the browsers do.
					const target = state.capture ?? touch.host;
					if (target !== state.over) {
						const from = state.over;
						raise('pointerout', from, target);
						crossing('pointerleave', from, target, target);
						raise('pointerover', target, from);
						crossing('pointerenter', target, from, from);
						state.over = target;
					}
					if (touch.event === 'pointermove') {
						raise('pointermove', target);
						return flush() ?? calls;
					}
					raise(touch.event, target);
					const early = flush();
					if (early) {
						touches.delete(pointerId);
						return early;
					}
					touches.delete(pointerId);
					raise('pointerout', target);
					crossing('pointerleave', target, null, null);
					const lifted = flush();
					if (lifted || touch.event !== 'pointerup') return lifted ?? calls;
					// A tap's compatibility mouse events, as a phone browser fires them before its click.
					const mouseRun = (
						type: NativeMouseEventName,
						target: string,
						node: string,
						related: string | null,
					) => {
						const own = handlerOf(nodeOf(node), type);
						if (own)
							runs.push({
								handler: own.handler,
								fields: {
									target,
									currentTarget: node,
									relatedTarget: related,
									button: 0,
									buttons: type === 'mousedown' ? 1 : 0,
									clientX: at.x,
									clientY: at.y,
									timeStamp: touch.time ?? 0,
								},
								scope: scopeOf(target) ?? scope,
							});
					};
					const mouse = (
						type: NativeMouseEventName,
						target: string,
						related: string | null = null,
					) => {
						for (const node of chain(target)) mouseRun(type, target, node, related);
					};
					const mouseCrossing = (
						type: 'mouseenter' | 'mouseleave',
						target: string,
						from: string | null,
						related: string | null,
					) => {
						const outside = new Set(from === null ? [] : chain(from));
						const nodes = chain(target).filter((node) => !outside.has(node));
						for (const node of type === 'mouseenter' ? nodes.reverse() : nodes)
							mouseRun(type, node, node, related);
					};
					const tapped = touch.host;
					// An element that left the screen took the mouse with it.
					const from = mouseOver !== null && scopeOf(mouseOver) ? mouseOver : null;
					if (from !== tapped) {
						if (from !== null) {
							mouse('mouseout', from, tapped);
							mouseCrossing('mouseleave', from, tapped, tapped);
						}
						mouse('mouseover', tapped, from);
						mouseCrossing('mouseenter', tapped, from, from);
						mouseOver = tapped;
					}
					mouse('mousemove', tapped);
					mouse('mousedown', tapped);
					mouse('mouseup', tapped);
					return flush() ?? calls;
				});
			}
			if (action.event === 'idle' || action.event === 'visible') {
				const key = `${action.event}\0${action.host}`;
				if (fired.has(key) || !due(action.event).includes(action.host)) return [];
				fired.add(key);
			}
			// A row's copy (`<node>@<key>`) runs its node's handler in that row; node ids never hold `@`.
			const at = action.host.indexOf('@');
			const host = at < 0 ? action.host : action.host.slice(0, at);
			const event = payload.events.find(
				(candidate) => candidate.host === host && candidate.event === action.event,
			);
			if (!event) throw new Error(`no ${action.event} handler on ${action.host}`);
			const instance = payload.nodes
				.flatMap((node) => (node.id === host ? instances(node) : []))
				.find((shown) => shown.id === action.host);
			if (!instance) throw new Error(`${action.host} is not shown`);
			const scope = instance.scope;
			const edit =
				action.event === 'input' || action.event === 'commit' ? action.value : undefined;
			const eventValue: string | NativeEventFields | undefined =
				action.event === 'keydown' || action.event === 'keyup'
					? { key: action.key, value: textOf(action.host) }
					: action.event === 'paste'
						? { text: action.text, value: textOf(action.host) }
						: action.event === 'activate'
							? { detail: action.detail ?? 1 }
							: edit;
			// A press focuses the control it presses, as the browser does.
			if (action.event === 'activate') focused = action.host;
			// A number field's handlers read its value, which is empty while its text is no number.
			const numeric =
				action.event === 'input' && elementOf(host).attributes?.['type'] === 'number';
			const fields =
				action.event === 'activate'
					? { ...clickFields(true), detail: action.detail ?? 1 }
					: numeric && typeof eventValue === 'string'
						? nativeNumberValue(eventValue)
						: eventValue;
			return change(action.host, edit, () =>
				action.event === 'activate'
					? press(action.host, fields as NativeEventFields)
					: run(handlers.get(event.handler) ?? [], fields, scope),
			);
		},
		due,
		tasks: () =>
			payload.cells.flatMap((cell) =>
				cell.task
					? [
							{
								op: 'call' as const,
								call: cell.task.call,
								arguments: cell.task.arguments.map((argument) =>
									evaluate(argument),
								),
								result: cell.id,
							},
						]
					: [],
			),
	};

	/** Runs ops in order: writes cells, collects the calls (a continuation's id rides on its call), stops at a navigation. */
	function run(
		ops: ReadonlyArray<NativeOp>,
		eventValue: string | NativeEventFields | undefined,
		scope: NativeScope,
		submission?: Submission,
	): NativeJournalEntry[] {
		const calls: NativeJournalEntry[] = [];
		for (const op of ops) {
			if (op.op === 'reset') {
				if (op.catch !== undefined) values.set(op.catch, null);
				for (const cell of op.cells) {
					const shownNow = read(cell, scope) as {
						state?: string;
						error?: unknown;
					} | null;
					if (
						shownNow?.state === 'error' ||
						(shownNow?.state === 'value' && shownNow.error != null)
					)
						retry.add(slotOf(cell, scope));
				}
				continue;
			}
			if (op.op === 'submit') {
				const taken = submit(op, scope, calls);
				if (taken[0]?.op === 'navigate') return taken;
				calls.push(...taken);
				continue;
			}
			if (op.op === 'tick') {
				const group =
					elementOf(op.node).attributes?.['type'] === 'radio' ? groupOf(op.node) : [];
				if (group.length === 0) checkedness.set(op.node, !checkedOf(op.node));
				else for (const member of group) checkedness.set(member.id, member.id === op.node);
				continue;
			}
			if (op.op === 'after') {
				const ms = evaluate(op.ms, eventValue, scope);
				const locals = new Map(scope.locals);
				for (const [name, value] of op.capture)
					locals.set(name, evaluate(value, eventValue, scope));
				const id = `timer:${timerCount++}`;
				timers.set(id, { ops: op.ops, locals, ...(submission ? { submission } : {}) });
				if (submission) submission.pending++;
				calls.push({
					op: 'timer',
					timer: id,
					ms: typeof ms === 'number' && ms > 0 ? ms : 0,
				});
				continue;
			}
			if (op.op === 'navigate') {
				const params = Object.fromEntries(
					Object.entries(op.params).map(([name, value]) => [
						name,
						typeof value === 'string'
							? value
							: String(evaluate(value, eventValue, scope)),
					]),
				);
				return [
					{
						op: 'navigate',
						route: op.route,
						params,
						...(op.replace ? { replace: true as const } : {}),
					},
				];
			}
			if (op.op === 'capture') {
				const node =
					typeof op.node === 'string' ? op.node : evaluate(op.node, eventValue, scope);
				const pointer = evaluate(op.pointer, eventValue, scope);
				const touch = typeof pointer === 'number' ? touches.get(pointer) : undefined;
				if (typeof node !== 'string' || !touch) continue;
				if (!op.release) touch.capture = node;
				else if (touch.capture === node) touch.capture = null;
				continue;
			}
			if (op.op === 'command') {
				let node = op.node;
				if (typeof node !== 'string') {
					const value = evaluate(node, eventValue, scope);
					if (value === null || value === NATIVE_DOCUMENT_BODY) continue;
					if (typeof value !== 'string' || !elements.isElement(value))
						throw new Error(`${op.command}() on a value that is not an element`);
					node = value;
				}
				if (op.command === 'focus') focused = node;
				calls.push({
					op: 'command',
					node,
					command: op.command,
					...(op.preventScroll ? { preventScroll: true as const } : {}),
				});
				continue;
			}
			if (op.op === 'preventDefault') {
				calls.push({ op: 'preventDefault' });
				continue;
			}
			if (op.op === 'stopPropagation') {
				propagationStopped = true;
				continue;
			}
			if (op.op === 'fieldText') {
				let node = op.node;
				if (typeof node !== 'string') {
					const value = evaluate(node, eventValue, scope);
					if (value === null) continue;
					if (typeof value !== 'string' || !elements.isElement(value))
						throw new Error('a field text written to a value that is not an element');
					node = value;
				}
				const text = String(evaluate(op.value, eventValue, scope) ?? '');
				edited.set(node, text);
				written.add(node);
				// An unbound field has no binding to diff, so the write is its own entry.
				calls.push({ op: 'property', node, name: 'value', value: text });
				continue;
			}
			if (op.op === 'dialog') {
				if (!dialogs.has(op.node)) throw new Error(`${op.node} is not a dialog`);
				setDialog(op.node, op.method === 'showModal');
				continue;
			}
			if (op.op === 'if') {
				const taken = run(
					evaluate(op.test, eventValue, scope) ? op.whenTrue : op.whenFalse,
					eventValue,
					scope,
					submission,
				);
				if (taken[0]?.op === 'navigate') return taken;
				calls.push(...taken);
				continue;
			}
			if (op.op === 'script') {
				const text = typeof eventValue === 'string' ? eventValue : eventValue?.value;
				const frame = frameOf(op.bindings, text, scope);
				const reason = typeof eventValue === 'object' ? eventValue.reason : undefined;
				const pressTarget =
					typeof eventValue === 'object' ? (eventValue.pressTarget ?? null) : null;
				const touch =
					typeof eventValue === 'object'
						? [
								...new Set([
									...NATIVE_SCRIPT_POINTER_FIELDS,
									...NATIVE_SCRIPT_CLICK_FIELDS,
									...NATIVE_SCRIPT_KEY_FIELDS,
									'isTrusted',
								]),
							].flatMap((field) => {
								const value = eventValue[field as keyof NativeEventFields];
								return value === undefined ? [] : [[field, value] as const];
							})
						: [];
				const nodes =
					typeof eventValue === 'object' && eventValue.currentTarget !== undefined
						? {
								target: eventValue.target ?? null,
								currentTarget: eventValue.currentTarget,
								relatedTarget: eventValue.relatedTarget ?? null,
							}
						: undefined;
				calls.push(
					...enter(
						{
							kind: 'dispatch',
							fn: op.fn,
							frame,
							elements: elementFacts(frame, [
								...Object.values(nodes ?? {}).filter(
									(node): node is string => node !== null,
								),
								...(pressTarget === null ? [] : [pressTarget]),
							]),
							event: {
								type: op.type,
								...(text === undefined ? {} : { value: text }),
								...(typeof eventValue === 'object' && eventValue.key !== undefined
									? { key: eventValue.key }
									: {}),
								...(typeof eventValue === 'object' && eventValue.text !== undefined
									? { text: eventValue.text }
									: {}),
								...Object.fromEntries(touch),
								...(nodes ? { nodes } : {}),
								...(reason === undefined
									? {}
									: { detail: { reason, pressTarget } }),
							},
							...(op.catch ? { catch: slotOf(op.catch, scope) } : {}),
						},
						submission,
					),
				);
				continue;
			}
			if (op.op === 'call') {
				calls.push({
					op: 'call',
					call: op.call,
					...(op.object !== undefined ? { object: op.object } : {}),
					arguments: op.arguments.map((argument) =>
						evaluate(argument, eventValue, scope),
					),
					...(op.result !== undefined ? { result: op.result } : {}),
					...(op.after ? { resume: op.after.id } : {}),
				});
				continue;
			}
			const value = evaluate(op.value, eventValue, scope);
			values.set(slotOf(op.cell, scope), value);
			const key = storageKeys.get(op.cell);
			if (key !== undefined) store.set(key, value);
		}
		return calls;
	}

	/** A submission whose handler and timers have all run is no longer running. */
	function settled(submission: Submission | undefined) {
		if (!submission || submission.pending > 0) return;
		for (const [form, runs] of running) {
			const left = runs.filter((run) => run !== submission);
			if (left.length > 0) running.set(form, left);
			else running.delete(form);
		}
	}

	/**
	 * A `submit` op as the web runs it: nothing for a disabled submitter, an `invalid` entry for the first field missing its
	 * value, nothing for the same entries from the same button as a submission still running, else the form's handler.
	 */
	function submit(
		op: Extract<NativeOp, { op: 'submit' }>,
		scope: NativeScope,
		calls: NativeJournalEntry[],
	): NativeJournalEntry[] {
		const form = forms.get(op.form);
		if (!form) throw new Error(`${op.form} is not a form`);
		if (op.submitter !== null && attributeNow(op.submitter, 'disabled') !== null) return [];
		const invalid = firstInvalid(op.form, op.submitter);
		if (invalid) {
			calls.push({ op: 'invalid', node: invalid.node, message: invalid.message });
			return [];
		}
		if (form.opens !== undefined) {
			calls.push({
				op: 'call',
				call: 'browser.open',
				arguments: [nativeFormUrl(form.opens, entriesOf(op.form) as [string, string][])],
			});
			return [];
		}
		const sent = JSON.stringify(entriesOf(op.form));
		const runs = running.get(op.form) ?? [];
		if (runs.some((run) => run.sent === sent && run.submitter === op.submitter)) return [];
		const handler = payload.events.find(
			(candidate) => candidate.host === op.form && candidate.event === 'submit',
		);
		if (!handler) throw new Error(`${op.form} has no submit handler`);
		const submission: Submission = {
			sent,
			submitter: op.submitter,
			marks: op.submitter !== null && !form.authoredAriaDisabled,
			pending: 0,
		};
		running.set(op.form, [...runs, submission]);
		const out = run(
			handlers.get(handler.handler) ?? [],
			undefined,
			{ ...base, locals: scope.locals },
			submission,
		);
		settled(submission);
		return out;
	}

	/**
	 * Runs `apply` (which writes cells and returns the calls it made, or a navigation that ends the page) and returns the
	 * journal: styled cells first, then every shown node whose output changed, in document order, then the calls.
	 */
	function change(
		host: string | undefined,
		eventValue: string | undefined,
		apply: () => NativeJournalEntry[],
	): ReadonlyArray<NativeJournalEntry> {
		{
			seedRows();
			const cellsBefore = new Map(values);
			const slotsBefore = new Map(slotValues());
			const casesBefore = new Map(caseValues());
			const beforeTexts = new Map(texts());
			const beforeAttributes = keyed(attributes());
			const beforeMarks = marks();
			const checkedBefore = new Map(checkedness);
			const selectedBefore = new Map(selectedness);
			const bindingsBefore = new Map(
				ticked.map((node) => [node.id, checkedBinding(node.id)] as const),
			);
			// A `value` binding writes the field only when its own value changes, as on the web: typing alone never resets it.
			const beforeProperties = keyed(properties());
			const typedKey = eventValue !== undefined && host !== undefined ? `${host}\0value` : undefined;
			if (eventValue !== undefined && host !== undefined) edited.set(host, eventValue);
			typing = typeof eventValue === 'string' ? host : undefined;
			const beforeArms = new Map(arms());
			drawnArms = beforeArms;
			const beforeRows = new Map(rows());
			const beforeTitle = title();
			const dialogsBefore = new Map(dialogs);
			const beforeSheets = new Map(sheets());
			const ownedBefore = new Set(liveObjects());
			const focusBefore = focused;
			const stackBefore = stack;
			const itemsBefore = rowSignatures();
			let calls: ReturnType<typeof apply>;
			try {
				calls = apply();
			} finally {
				drawnArms = null;
			}
			if (calls[0]?.op === 'navigate') return calls;
			// As the browser queues a dialog's close event, it runs after the handler that closed it.
			for (let fired = 0; closing.length > 0 && fired < CLOSE_DEPTH; fired++) {
				const node = closing.shift()!;
				const close = handlerOf(node, 'close');
				if (!close) continue;
				const out = run(
					handlers.get(close.handler) ?? [],
					undefined,
					scopeOf(node) ?? base,
				);
				if (out[0]?.op === 'navigate') return out;
				calls.push(...out);
			}
			closing.length = 0;
			// A row that left takes its state with it; a later row with the same key starts from the first values.
			const kept = new Set(
				rows().flatMap(([list, keys]) => keys.map((key) => `${list}\0${key}`)),
			);
			for (const slot of values.keys()) {
				const at = slot.indexOf('@');
				const list = at < 0 ? undefined : rowOfCell.get(slot.slice(0, at));
				if (list !== undefined && !kept.has(`${list}\0${slot.slice(at + 1)}`))
					values.delete(slot);
			}
			resetChangedRows(itemsBefore);
			seedRows();
			follow();
			calls.push(...syncAsync());
			// An overlay becoming shown supersedes every shown hint it is not inside, before it joins the stack.
			const shownFirst = shownOverlays();
			const working = stackBefore.filter((overlay) => shownFirst.includes(overlay));
			for (const newcomer of shownFirst.filter((overlay) => !stackBefore.includes(overlay))) {
				for (const hint of working.filter(isHint)) {
					if (elements.contains(hint, newcomer)) continue;
					const dismiss = handlerOf(hint, 'dismiss');
					if (!dismiss) continue;
					const out = run(
						handlers.get(dismiss.handler) ?? [],
						{ reason: 'superseded', pressTarget: null },
						base,
					);
					if (out[0]?.op === 'navigate') return out;
					calls.push(...out);
				}
				working.push(newcomer);
			}
			const shownNow = shownOverlays();
			const released = stackBefore.filter((overlay) => !shownNow.includes(overlay));
			const enlisted = shownNow.filter((overlay) => !stackBefore.includes(overlay));
			stack = [...stackBefore.filter((overlay) => shownNow.includes(overlay)), ...enlisted];
			for (const overlay of enlisted)
				origins.set(overlay, focusBefore ?? NATIVE_DOCUMENT_BODY);
			const overlays: NativeJournalEntry[] = [
				...released.map((node): NativeJournalEntry => ({
					op: 'overlay',
					node,
					open: false,
					modal: isModal(node),
				})),
				...enlisted.map((node): NativeJournalEntry => ({
					op: 'overlay',
					node,
					open: true,
					modal: isModal(node),
				})),
			];
			forgetHidden();
			const afterTexts = new Map(texts());
			const afterAttributes = keyed(attributes());
			const afterProperties = keyed(properties());
			const afterArms = new Map(arms());
			const afterRows = new Map(rows());
			const afterSheets = new Map(sheets());
			const styles = [
				...payload.cells.flatMap((cell): NativeJournalEntry[] =>
					cell.styled && cellsBefore.get(cell.id) !== values.get(cell.id)
						? [{ op: 'state', cell: cell.id, value: values.get(cell.id)! }]
						: [],
				),
				...caseValues().flatMap(([styleCase, value]): NativeJournalEntry[] =>
					casesBefore.get(styleCase) === value
						? []
						: [{ op: 'state', cell: styleCase, value }],
				),
				...slotValues().flatMap(([slot, value]): NativeJournalEntry[] =>
					Object.is(slotsBefore.get(slot), value) ? [] : [{ op: 'slot', slot, value }],
				),
			];
			// A node shown before and after journals its change; a new arm or row is built from current values instead.
			const nodes = payload.nodes.flatMap((node): NativeJournalEntry[] => {
				if (node.kind === 'repeat')
					// Each shown copy of the list: an inner list has one per row of its outer list (`<id>@<key>`).
					return [...afterRows].flatMap(([id, after]): NativeJournalEntry[] => {
						if (id !== node.id && !id.startsWith(`${node.id}@`)) return [];
						const before = beforeRows.get(id);
						return before && before.join('\0') !== after.join('\0')
							? [{ op: 'rows', node: id, keys: after }]
							: [];
					});
				if (node.kind === 'sheet') {
					const before = beforeSheets.get(node.id);
					const open = afterSheets.get(node.id);
					return before !== undefined && open !== undefined && before !== open
						? [{ op: 'sheet', node: node.id, open }]
						: [];
				}
				if (node.kind === 'branch')
					return instances(node).flatMap(({ id }): NativeJournalEntry[] =>
						beforeArms.has(id) &&
						afterArms.has(id) &&
						beforeArms.get(id) !== afterArms.get(id)
							? [{ op: 'arm', node: id, index: afterArms.get(id)! }]
							: [],
					);
				const ids = instances(node).map((instance) => instance.id);
				const opened = node.kind === 'element' ? dialogs.get(node.id) : undefined;
				const dialog: NativeJournalEntry[] =
					opened !== undefined && opened !== dialogsBefore.get(node.id)
						? [{ op: 'dialog', node: node.id, open: opened }]
						: [];
				if (node.kind === 'text') {
					return ids.flatMap((id): NativeJournalEntry[] => {
						const before = beforeTexts.get(id);
						const after = afterTexts.get(id);
						return before !== undefined && after !== undefined && before !== after
							? [{ op: 'text', node: id, value: after }]
							: [];
					});
				}
				return dialog.concat(
					ids.flatMap((id) =>
						(node.bindings ?? []).flatMap((binding): NativeJournalEntry[] => {
							const name =
								'attribute' in binding ? binding.attribute : binding.property;
							const key = `${id}\0${name}`;
							const [before, after] =
								'attribute' in binding
									? [beforeAttributes, afterAttributes]
									: [beforeProperties, afterProperties];
							if (
								!before.has(key) ||
								!after.has(key) ||
								before.get(key) === after.get(key) ||
								(!('attribute' in binding) && key === typedKey && after.get(key) === eventValue)
							)
								return [];
							return 'attribute' in binding
								? [
										{
											op: 'attribute',
											node: id,
											name,
											value: afterAttributes.get(key)!,
										},
										// A field nobody edited shows its `value` attribute, as the web's default value.
										...(name === 'value' && followsDefault(id)
											? [
													{
														op: 'property' as const,
														node: id,
														name: 'value' as const,
														value: afterAttributes.get(key) ?? '',
													},
												]
											: []),
									]
								: [
										{
											op: 'property',
											node: id,
											name: 'value',
											value: afterProperties.get(key)!,
										},
									];
						}),
					),
				);
			});
			// A `checked` binding whose value changed sets the checkedness, as the web's property write does.
			for (const node of ticked) {
				const bound = checkedBinding(node.id);
				if (bound !== undefined && bound !== bindingsBefore.get(node.id))
					checkedness.set(node.id, bound);
			}
			settleSelects(chosenNow);
			chosenNow = undefined;
			// An option a new row builds starts unselected on the host, so only a selected one is sent.
			const chosen = selections().flatMap(([node, value]): NativeJournalEntry[] =>
				(selectedBefore.get(node) ?? false) === value
					? []
					: [{ op: 'property', node, name: 'selected', value }],
			);
			const checks = ticked.flatMap((node): NativeJournalEntry[] =>
				shown(node) && checkedBefore.get(node.id) !== checkedness.get(node.id)
					? [
							{
								op: 'property',
								node: node.id,
								name: 'checked',
								value: checkedness.get(node.id)!,
							},
						]
					: [],
			);
			const afterMarks = marks();
			const marked = [...afterMarks].flatMap(([key, value]): NativeJournalEntry[] => {
				if (beforeMarks.get(key) === value) return [];
				const [node, name] = key.split('\0') as [string, string];
				return [{ op: 'attribute', node, name, value }];
			});
			const owned = new Set(liveObjects());
			const releases = (payload.objects ?? []).flatMap((object): NativeJournalEntry[] =>
				ownedBefore.has(object.id) && !owned.has(object.id)
					? [{ op: 'release', object: object.id }]
					: [],
			);
			const afterTitle = title();
			// A field whose binding wrote it shows that value now, not what was typed before.
			for (const entry of nodes) if (entry.op === 'property') edited.delete(entry.node);
			keepApp();
			return [
				...styles,
				...nodes,
				...checks,
				...chosen,
				...marked,
				...(afterTitle !== beforeTitle && afterTitle !== null
					? [{ op: 'title' as const, value: afterTitle }]
					: []),
				...releases,
				...overlays,
				...calls,
			];
		}
	}
}
