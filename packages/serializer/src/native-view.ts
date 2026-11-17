// The target-neutral view a native host builds retained views from: no HTML, no DOM positions, no script.
export const NATIVE_VIEW_VERSION = 'markless.native-view/0';

export type NativeScalar = number | string | boolean;

export type NativeTextPart = { readonly text: string } | { readonly cell: string };

export type NativeNode =
	| {
			readonly kind: 'element';
			readonly id: string;
			/** The authored tag; each platform maps it to the view it builds. */
			readonly element: string;
			readonly parent: string | null;
	  }
	| {
			readonly kind: 'text';
			/** `<host>:text<n>`, the n-th text run of its element. */
			readonly id: string;
			readonly parent: string;
			readonly parts: ReadonlyArray<NativeTextPart>;
	  };

/** Semantic events: each platform maps one to its own control event (web click, UIKit touchUpInside, Android click). */
export type NativeEventName = 'activate';

/** A state write a host runs as data, with no script engine. */
export type NativeOp = { readonly op: 'add'; readonly cell: string; readonly value: number };

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
export type NativeJournalEntry = { readonly op: 'text'; readonly node: string; readonly value: string };
