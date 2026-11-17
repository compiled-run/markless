// The target-neutral view a native host builds retained views from: no HTML, no DOM positions, no script.
export const NATIVE_VIEW_VERSION = 'markless.native-view/0';

export type NativeScalar = number | string | boolean;

/** A value computed from cells as data: JavaScript truthiness for `not` and `if`, `===` for `equals`. */
export type NativeExpr =
	| { readonly cell: string }
	| { readonly literal: NativeScalar }
	| { readonly not: NativeExpr }
	| { readonly if: NativeExpr; readonly whenTrue: NativeExpr; readonly whenFalse: NativeExpr }
	| { readonly equals: readonly [NativeExpr, NativeExpr] };

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
			/** Attributes that follow state; each value is written as the web writes it (absent, bare or a string). */
			readonly bindings?: ReadonlyArray<{ readonly attribute: string; readonly value: NativeExpr }>;
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
export type NativeEventName = 'activate';

/** A state write a host runs as data, with no script engine. */
export type NativeOp =
	| { readonly op: 'add'; readonly cell: string; readonly value: number }
	| { readonly op: 'set'; readonly cell: string; readonly value: NativeScalar }
	| { readonly op: 'toggle'; readonly cell: string };

export type NativeViewPayload = {
	readonly version: typeof NATIVE_VIEW_VERSION;
	readonly component: string;
	readonly cells: ReadonlyArray<{ readonly id: string; readonly name: string; readonly initial: NativeScalar }>;
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
	/** Shows arm `index` of a branch (null: none), building its nodes from current values and removing the old arm's. */
	| { readonly op: 'arm'; readonly node: string; readonly index: number | null };
