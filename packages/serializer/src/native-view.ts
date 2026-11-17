// The target-neutral view a native host builds retained views from: no HTML, no DOM positions, no script.
export const NATIVE_VIEW_VERSION = 'markless.native-view/0';

export type NativeScalar = number | string | boolean;

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
	| { readonly logical: '&&' | '||' | '??'; readonly left: NativeExpr; readonly right: NativeExpr }
	| { readonly if: NativeExpr; readonly whenTrue: NativeExpr; readonly whenFalse: NativeExpr }
	| { readonly template: ReadonlyArray<string | NativeExpr> }
	| { readonly member: NativeExpr; readonly property: 'length' }
	| { readonly call: NativeBuiltin; readonly arguments: ReadonlyArray<NativeExpr> }
	/** In an `input` handler: the field's text after the edit (`event.currentTarget.value`). */
	| { readonly event: 'value' };

export type NativeTextPart =
	| { readonly text: string }
	| { readonly cell: string }
	| { readonly expr: NativeExpr };

/** Where a node sits when it belongs to one arm of an `@if`: shown only while that arm is chosen. */
export type NativeArmPlace = { readonly branch: string; readonly index: number };

export type NativeNode =
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
			readonly arm?: NativeArmPlace;
	  }
	| {
			readonly kind: 'text';
			/** `<host>:text<n>`, the n-th text run of its element. */
			readonly id: string;
			readonly parent: string;
			readonly parts: ReadonlyArray<NativeTextPart>;
			readonly arm?: NativeArmPlace;
	  }
	| {
			/** An `@if`: arm 0 while `test` is truthy, arm 1 (when there is an `@else`) otherwise. */
			readonly kind: 'branch';
			readonly id: string;
			readonly parent: string | null;
			readonly test: NativeExpr;
			readonly arms: number;
			readonly arm?: NativeArmPlace;
	  };

/** Semantic events: each platform maps one to its own control event (web click, UIKit touchUpInside, Android click). */
export type NativeEventName = 'activate' | 'input';

/** A state write a host runs as data: the cell takes the expression's value, evaluated before the write. */
export type NativeOp = { readonly op: 'assign'; readonly cell: string; readonly value: NativeExpr };

export type NativeViewPayload = {
	readonly version: typeof NATIVE_VIEW_VERSION;
	readonly component: string;
	/** `storage` names a device-kept value (iOS UserDefaults, Android SharedPreferences): read at mount, written on every change. */
	readonly cells: ReadonlyArray<{
		readonly id: string;
		readonly name: string;
		readonly initial: NativeScalar;
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
	/** `value` null removes the attribute; "" is a bare (present) attribute. */
	| { readonly op: 'attribute'; readonly node: string; readonly name: string; readonly value: string | null }
	/** An input's text, as `String(value)`; never sent for the field whose edit caused it while it already shows that text. */
	| { readonly op: 'property'; readonly node: string; readonly name: 'value'; readonly value: string }
	/** A styled cell's new value: the host moves to Dragon's next style assignment (`next[a][s][v]`) and applies it. */
	| { readonly op: 'state'; readonly cell: string; readonly value: NativeScalar | null }
	/** Shows arm `index` of a branch (null: none), building its nodes from current values and removing the old arm's. */
	| { readonly op: 'arm'; readonly node: string; readonly index: number | null };
