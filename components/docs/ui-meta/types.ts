// The one hand-authored file per family, and the only place docs metadata may be
// written by hand: everything the manifest already carries is derived instead
// (components/docs/api-derive). A family file is short by construction - which
// props lead the playground, what the keys do, and which real-world examples the
// page carries - so the other families are the same shape with other values.
import type { ControlKind, PropRef } from '../api-derive/index.ts';
import type { KeyCap } from './keys.ts';

export type { PropRef };

/** One keyboard row: the keys pressed and what pressing them does. */
export type KeyboardShortcut = {
	/** One cap per key. `[keys.enter, keys.space]` draws two. */
	readonly caps: readonly KeyCap[];
	/** The word drawn between caps: `or` for alternatives, `+` for a chord. */
	readonly join?: 'or' | '+';
	readonly does: string;
};

/**
 * A control the inferred kind gets wrong, or one whose options the type cannot
 * carry. Anything the manifest's type text already answers must not be repeated
 * here.
 */
export type ControlOverride = {
	readonly part: string;
	readonly prop: string;
	readonly kind?: ControlKind;
	readonly options?: readonly string[];
	/** A shorter name for the control chip when the prop name reads badly on its own. */
	readonly label?: string;
};

/** One real-world example the page carries. The id is the demo file's stem. */
export type ExampleEntry = {
	/** `faq` names `components/demos/ui/<family>/faq.tsrx`. */
	readonly id: string;
	readonly title: string;
};

/** Everything about a family's page that its manifest entry cannot supply. */
export type FamilyMeta = {
	readonly family: string;
	/** Reading order for the anatomy and API sections. Omit it for root-first, then alphabetical. */
	readonly partOrder?: readonly string[];
	/** The props the quick controls row draws, in order. */
	readonly quick: readonly PropRef[];
	/** The props "Show all" reveals, in order, after the quick row. */
	readonly showAll: readonly PropRef[];
	readonly overrides?: readonly ControlOverride[];
	readonly keyboard: readonly KeyboardShortcut[];
	readonly examples: readonly ExampleEntry[];
};
