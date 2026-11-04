// The one hand-authored file per family, and the only place docs metadata may be
// written by hand: everything the manifest already carries is derived instead
// (components/docs/api-derive). A family file is short by construction - which
// props lead the playground, what the keys do, and which real-world examples the
// page carries - so the other families are the same shape with other values.
import type { ControlKind, PropRef } from '../api-derive/index.ts';
import type { KeyCap } from './keys.ts';

export type { PropRef };

/**
 * A control over a `const` the demo declares in its body, for a value that lives
 * in the consumer's own code rather than on the family root: `const count = 20;`
 * becomes a cell the control writes, and the code panel prints the new literal.
 * Its kind follows the literal: a boolean is a switch, a number needs `options`,
 * a string is a select with `options` or a text field without.
 */
export type LocalRef = {
	readonly local: string;
	/** The control's label. Defaults to the const's name. */
	readonly label?: string;
	/** The help dot's sentence, from the family's own docs. */
	readonly doc: string;
	readonly options?: readonly string[];
};

/** One control in the quick row or behind "Show all": a root prop or a demo const. */
export type ControlRef = PropRef | LocalRef;

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

/**
 * A named set of control values: the playground's "Scenario" select. Picking one
 * writes every prop it lists, so a preset is a real edit of the same controls
 * rather than a second source of truth. Values are written the way a control
 * writes them - `'true'`, `'ship'` - and a prop a preset omits keeps its opening
 * value.
 */
export type FamilyPreset = {
	readonly name: string;
	readonly label: string;
	readonly values: Readonly<Record<string, string>>;
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
	/** The controls the quick row draws, in order. Both lists empty draws no controls band. */
	readonly quick: readonly ControlRef[];
	/** The controls "Show all" reveals, in order, after the quick row. Empty draws no "Show all". */
	readonly showAll: readonly ControlRef[];
	readonly overrides?: readonly ControlOverride[];
	/** The named value sets the playground's Scenario select offers, first one first. */
	readonly presets: readonly FamilyPreset[];
	readonly keyboard: readonly KeyboardShortcut[];
	readonly examples: readonly ExampleEntry[];
};
