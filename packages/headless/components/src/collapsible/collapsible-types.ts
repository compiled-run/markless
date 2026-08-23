import type { PropsOf, Seeded } from '@markless/core';

export type CollapsibleRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the panel is showing. Omit it and the panel starts closed. */
	readonly open?: boolean;
	/** Nothing opens or closes while this is set. */
	readonly disabled?: boolean;
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
 * ids other parts point at all survive a close.
 */
export type CollapsibleContentProps = PropsOf<'div'>;

/**
 * The shared instance every collapsible part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `toggle()` to
 * call.
 */
export type CollapsibleInstanceState = Seeded<CollapsibleRootProps, 'open' | 'disabled'> & {
	onChange?: CollapsibleRootProps['onChange'];
};
