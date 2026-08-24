import type { PropsOf, Seeded } from '@markless/core';

/**
 * One trigger and one panel that shows or hides. It holds whether the panel is
 * open, and both other parts read that from here. An accordion is the many-panel
 * version of the same idea.
 */
export type CollapsibleRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the panel is showing. Omit it and the panel starts closed. */
	readonly open?: boolean;
	/** Nothing opens or closes while this is set. */
	readonly disabled?: boolean;
	/**
	 * A closed panel is hidden outright rather than with `until-found`, so the
	 * browser's find-in-page cannot reach the text inside it.
	 */
	readonly disableUntilFound?: boolean;
	/**
	 * Called with the new value when a person opens or closes the panel. Omit it
	 * and the panel still opens and closes; the call site simply does nothing.
	 */
	readonly onChange?: (open: boolean) => void;
};

/** A consumer's `onClick` runs after the panel has opened or closed. */
export type CollapsibleTriggerProps = PropsOf<'button'>;

/**
 * The panel. It stays in the page when the collapsible is closed - `hidden`
 * decides whether it shows, never an arm - so focus, scroll position and the
 * ids other parts point at all survive a close. A closed panel carries
 * `hidden="until-found"` unless the root turns that off, which is what lets the
 * browser's find-in-page reach the text inside it and open the panel on a hit.
 */
export type CollapsibleContentProps = PropsOf<'div'>;

/**
 * The shared instance every collapsible part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `toggle()` to
 * call.
 */
export type CollapsibleInstanceState = Seeded<
	CollapsibleRootProps,
	'open' | 'disabled' | 'disableUntilFound'
> & {
	onChange?: CollapsibleRootProps['onChange'];
};
