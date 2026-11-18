import {
	DEVICE_MODULE,
	type NativeDeviceCall,
	type NativeDeviceObject,
	type NativeDeviceValue,
} from './native-device.ts';

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
	| 'Math.round';

/**
 * A value computed from cells, evaluated by every host with JavaScript's meaning (numbers are IEEE doubles; `String()`,
 * `+`, comparisons, truthiness and `??` follow ECMAScript). The reference runtime and the conformance vectors pin it.
 */
export type NativeExpr =
	| { readonly cell: string }
	| { readonly literal: NativeScalar | null }
	| { readonly unary: '!' | '-' | '+'; readonly value: NativeExpr }
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
	/** `length` of a string or array, or an own property of an object; anything else is a runtime error. */
	| { readonly member: NativeExpr; readonly property: string }
	| { readonly array: ReadonlyArray<{ readonly spread: boolean; readonly value: NativeExpr }> }
	| { readonly object: ReadonlyArray<readonly [string, NativeExpr]> }
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
				/** The device object a `camera` element shows (`<base.camera el={cam} />`). */
				readonly object?: string;
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

/** Semantic events: each platform maps one to its own control event (web click, UIKit touchUpInside, Android click). */
export type NativeEventName = 'activate' | 'input' | 'dismiss';

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
	  };

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
		/** A class or `ui-*` attribute binding reads this cell, so Dragon's export has a state for it; its changes are journalled as `state`. */
		readonly styled?: true;
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
	}>;
	/** Document order: a parent comes before its children, siblings in authored order. */
	readonly nodes: ReadonlyArray<NativeNode>;
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
};

export const NATIVE_APP_VERSION = 'markless.native-app/0';

/** An app of several routes: each route's page, in the router's match order (static before `[param]` segments). */
export type NativeAppPayload = {
	readonly version: typeof NATIVE_APP_VERSION;
	readonly routes: ReadonlyArray<{
		readonly pattern: string;
		readonly params: ReadonlyArray<string>;
		readonly page: NativeViewPayload;
	}>;
};

/** One change a host applies to its retained views after a handler runs. */
export type NativeJournalEntry =
	| { readonly op: 'text'; readonly node: string; readonly value: string }
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
	/** A styled cell's new value: the host moves to Dragon's next style assignment (`next[a][s][v]`) and applies it. */
	| { readonly op: 'state'; readonly cell: string; readonly value: NativeValue }
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
	| { readonly op: 'title'; readonly value: string };

/** The package and export that name the platform's own pieces (`<native.sheet>`); one place, so the name is cheap to change. */
export const PLATFORM_PIECES_PACKAGE = DEVICE_MODULE;
export const PLATFORM_PIECES_NAMESPACE = 'native';
