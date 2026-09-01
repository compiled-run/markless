// The prop contract between the playground widget and whoever supplies its
// configuration. W3 derives these values from
// `@markless/ui/api/manifest.json` plus the per-family `ui-meta/<family>.ts`
// overrides; nothing here is hand-copied from a family's source.
//
// One rule shapes every type below: a family page carries ONE playground
// island, and that island owns the state cells the controls write and the demo
// part tree reads. Control descriptors therefore describe a control, they do
// not carry the cell — a descriptor whose `onChange` wrote into another
// module's state would split the island in two and re-enter the pinned
// controlled-write-back defect.

/** How a prop's value is edited. Derived from the manifest's `type` text. */
export type ControlKind =
	/** `boolean` -> `toggle` */
	| 'toggle'
	/** an inlined literal union, or a ui-meta closed option set -> `select` */
	| 'select'
	/** `string` -> `textbox` */
	| 'textbox';

/** One option of a `select` control. */
export type ControlOption = {
	/** The value written into the playground cell. */
	readonly value: string;
	/** What the reader sees in the list. */
	readonly label: string;
};

/** One editable prop in the controls row. */
export type ControlDescriptor = {
	/** The prop, written as the consumer writes it (`multiple`, `disableUntilFound`). */
	readonly name: string;
	readonly kind: ControlKind;
	/** The prop's type text, shown in the control's info tip. */
	readonly type: string;
	/** The family's own default, so the playground opens where the docs say it does. */
	readonly initial: string;
	/** Required for `kind: 'select'`; ignored otherwise. */
	readonly options?: readonly ControlOption[];
	/** Shown for `kind: 'textbox'` when the cell is empty. */
	readonly placeholder?: string;
	/**
	 * True when the family reads this prop once at seed time, so a live write
	 * never reaches it. Such a control needs the keyed-remount fallback rather
	 * than a plain prop binding.
	 */
	readonly seedOnly?: boolean;
};

/**
 * A named set of control values. The QDS "Scenario" select: picking one writes
 * every listed cell at once, so a preset is a real edit of the same controls
 * rather than a second source of truth.
 */
export type PlaygroundPreset = {
	readonly name: string;
	readonly label: string;
	/** Prop name -> value, in the same string form the controls write. */
	readonly values: Readonly<Record<string, string>>;
};

/**
 * Everything a family playground needs that is not its demo part tree.
 * `controls` is ordered: the first `quickCount` entries render horizontally in
 * the top row, the rest live behind "Show all".
 */
export type PlaygroundConfig = {
	/** The family, lowercase, as it is imported from `@markless/ui`. */
	readonly family: string;
	readonly controls: readonly ControlDescriptor[];
	readonly presets: readonly PlaygroundPreset[];
	/** QDS shows three; the rest go behind "Show all". */
	readonly quickCount: number;
};

/**
 * The demo part tree cannot be a prop. A component value passed into the
 * island would be rendered by a different module, and the control cells would
 * have to cross that boundary to reach it — the split-island shape this widget
 * exists to avoid. Replication is therefore per family: copy
 * `accordion-playground.tsrx`, swap the demo part tree and the config, keep the
 * chrome and the CSS. Everything above is what W3 generates for that copy.
 */
export type PlaygroundSlots = {
	/**
	 * The code panel (W4 owns its contents) is projected as children into the
	 * region under the stage.
	 */
	readonly children?: unknown;
};
