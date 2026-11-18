// The target-neutral view a native host builds retained views from: no HTML, no DOM positions, no script.
export const NATIVE_VIEW_VERSION = 'markless.native-view/0';

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
	| 'Math.round';

/**
 * A value computed from cells, evaluated by every host with JavaScript's meaning (numbers are IEEE doubles; `String()`,
 * `+`, comparisons, truthiness and `??` follow ECMAScript). The reference runtime and the conformance vectors pin it.
 */
export type NativeExpr =
	| { readonly cell: string }
	| { readonly literal: NativeScalar | null }
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
	| { readonly logical: '&&' | '||' | '??'; readonly left: NativeExpr; readonly right: NativeExpr }
	| { readonly if: NativeExpr; readonly whenTrue: NativeExpr; readonly whenFalse: NativeExpr }
	| { readonly template: ReadonlyArray<string | NativeExpr> }
	/**
	 * `length` of a string or array, an array's element at an index (`"0"`, `"1"`: null past its end, as `undefined` on
	 * the web), or an own property of an object; anything else is a runtime error.
	 */
	| { readonly member: NativeExpr; readonly property: string }
	/** An array's element at an index computed while the app runs: null when it is not an integer inside the array. */
	| { readonly at: NativeExpr; readonly of: NativeExpr }
	| { readonly array: ReadonlyArray<{ readonly spread: boolean; readonly value: NativeExpr }> }
	| { readonly object: ReadonlyArray<readonly [string, NativeExpr]> }
	| { readonly method: NativeMethod; readonly target: NativeExpr; readonly arguments: ReadonlyArray<NativeExpr> }
	/** Only as a method argument: the parameters read as `{ local }` inside `body`. */
	| { readonly lambda: ReadonlyArray<string>; readonly body: NativeExpr }
	| { readonly local: string }
	/** The current row's item of a list (`repeat` node id). */
	| { readonly item: string }
	/** The page's route params, an object of strings (the page component's `params` prop). */
	| { readonly route: 'params' }
	| { readonly call: NativeBuiltin; readonly arguments: ReadonlyArray<NativeExpr> }
	/** In an `input` handler: the field's text after the edit (`event.currentTarget.value`). */
	| { readonly event: 'value' };

export type NativeTextPart =
	| { readonly text: string }
	| { readonly cell: string }
	| { readonly expr: NativeExpr };

/** Where a node sits when it belongs to one arm of an `@if`: shown only while that arm is chosen. */
export type NativeArmPlace = { readonly branch: string; readonly index: number };

/** Where a node sits: in an `@if` arm, or in a list row (`row` names the `repeat` node). */
export type NativePlace = { readonly arm?: NativeArmPlace; readonly row?: string };

export type NativeNode = NativePlace &
	(
		| {
				readonly kind: 'element';
				readonly id: string;
				/** The authored tag; each platform maps it to the view it builds. */
				readonly element: string;
				readonly parent: string | null;
				/** Attributes fixed at build time (`class` carries the component's scope class); absent when none. */
				readonly attributes?: Readonly<Record<string, string>>;
				/** Attributes that follow state, written as the web writes them (absent, bare or a string), and an input's `value`. */
				readonly bindings?: ReadonlyArray<
					| { readonly attribute: string; readonly value: NativeExpr }
					| { readonly property: 'value'; readonly value: NativeExpr }
				>;
		  }
		| {
				readonly kind: 'text';
				/** `<host>:text<n>`, the n-th text run of its element. */
				readonly id: string;
				readonly parent: string;
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
		  }
	);

/** Semantic events: each platform maps one to its own control event (web click, UIKit touchUpInside, Android click). */
export type NativeEventName = 'activate' | 'input' | 'cancel';

/** A state write a host runs as data: the cell takes the expression's value, evaluated before the write. */
export type NativeOp =
	| { readonly op: 'assign'; readonly cell: string; readonly value: NativeExpr }
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
	 * `element.focus()` or `element.scrollIntoView()`, after the handler's writes have reached the views. Focus moves as on
	 * the web (a text field takes the keyboard; anything else the screen reader's cursor) and scrolls the element into view
	 * unless `preventScroll` (`focus({ preventScroll: true })`).
	 */
	| { readonly op: 'command'; readonly node: string; readonly command: NativeCommand; readonly preventScroll?: true }
	/** Opens the page at `route` (a router pattern such as `/[fruit]`) with these params; ops after it do not run. */
	| { readonly op: 'navigate'; readonly route: string; readonly params: Readonly<Record<string, string>> };

/** Element commands a host runs. */
export type NativeCommand = 'focus' | 'scrollIntoView';

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
		readonly storage?: { readonly key: string };
		/** A class binding reads this cell, so Dragon's export has a state for it; its changes are journalled as `state`. */
		readonly styled?: true;
	}>;
	/** Document order: a parent comes before its children, siblings in authored order. */
	readonly nodes: ReadonlyArray<NativeNode>;
	readonly events: ReadonlyArray<{
		readonly host: string;
		readonly event: NativeEventName;
		readonly handler: string;
	}>;
	readonly handlers: ReadonlyArray<{ readonly id: string; readonly ops: ReadonlyArray<NativeOp> }>;
};

/** One change a host applies to its retained views after a handler runs. */
export type NativeJournalEntry =
	| { readonly op: 'text'; readonly node: string; readonly value: string }
	/** A `command` op the handler ran, in order, after every other entry: the views show the new state first. */
	| { readonly op: 'command'; readonly node: string; readonly command: NativeCommand; readonly preventScroll?: true }
	/** A `<dialog>` opened in the top layer or closed (by an op, or by the host's back gesture as a `cancel`). */
	| { readonly op: 'dialog'; readonly node: string; readonly open: boolean }
	/** `value` null removes the attribute; "" is a bare (present) attribute. */
	| { readonly op: 'attribute'; readonly node: string; readonly name: string; readonly value: string | null }
	/** An input's text, as `String(value)`; never sent for the field whose edit caused it while it already shows that text. */
	| { readonly op: 'property'; readonly node: string; readonly name: 'value'; readonly value: string }
	/** A styled cell's new value: the host moves to Dragon's next style assignment (`next[a][s][v]`) and applies it. */
	| { readonly op: 'state'; readonly cell: string; readonly value: NativeValue }
	/**
	 * A list's new row order: the host removes rows whose key left, builds new rows from current values and moves the
	 * rest into this order. Entries for nodes inside rows name the instance as `<node>@<key>`.
	 */
	| { readonly op: 'rows'; readonly node: string; readonly keys: ReadonlyArray<string> }
	/** Shows arm `index` of a branch (null: none), building its nodes from current values and removing the old arm's. */
	| { readonly op: 'arm'; readonly node: string; readonly index: number | null }
	/** Leave this page: the host builds the page at `route` from scratch with `params` (its own state starts over). */
	| {
			readonly op: 'navigate';
			readonly route: string;
			readonly params: Readonly<Record<string, string>>;
	  };

/**
 * Bound attributes that reach Dragon in every combination of the styled states, besides `class`: the ones a selector keys
 * state off (`[ui-open]`, `[aria-expanded]`) and `hidden`, whose UA rule Dragon applies. Others (`disabled`, `value`) stay
 * out of the style input, since Dragon does not model their rendering effect.
 */
export const isNativeStyleStateAttribute = (name: string): boolean =>
	name === 'hidden' || name === 'role' || /^(ui|aria|data)-/.test(name);
