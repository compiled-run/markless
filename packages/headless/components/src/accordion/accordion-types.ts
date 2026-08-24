import type { PropsOf, Seeded } from '@markless/core';

/**
 * The accordion itself; every section goes inside it. It holds which section is
 * showing, and every other accordion part reads that from here rather than
 * keeping a copy.
 */
export type AccordionRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * Which section is showing. A plain string names one section; with `multiple`
	 * it is the list of sections that are showing. Omit it and everything starts
	 * closed.
	 */
	readonly value?: string | readonly string[];
	/** Several sections may show at once. Without it, opening one closes the rest. */
	readonly multiple?: boolean;
	/**
	 * Whether the section that is showing may be closed again, leaving nothing
	 * open. On by default, which is Qwik UI's own default.
	 */
	readonly collapsible?: boolean;
	/** Nothing opens or closes while this is set. */
	readonly disabled?: boolean;
	/**
	 * Closed panels are hidden outright rather than with `until-found`, so the
	 * browser's find-in-page cannot reach the text inside them.
	 */
	readonly disableUntilFound?: boolean;
	/**
	 * Called with the new value when a person opens or closes a section. Omit it
	 * and the accordion still works; the call site simply does nothing.
	 */
	readonly onChange?: (value: string | readonly string[]) => void;
};

/**
 * One section: its label, trigger and panel go inside. It carries the section's
 * own `value`, which is the name the root's `value` matches against.
 */
export type AccordionItemProps = PropsOf<'div'> & {
	/** This section's own name, and what the root's `value` names. */
	readonly value: string;
	/** This one section opens and closes for nobody. */
	readonly disabled?: boolean;
};

/**
 * The heading a section's trigger sits in. The APG asks for one, and it is what
 * names the panel: `accordion.itemcontent` points its `aria-labelledby` here.
 */
export type AccordionItemLabelProps = PropsOf<'h3'>;

/** A consumer's `onClick` runs after the section has opened or closed. */
export type AccordionItemTriggerProps = PropsOf<'button'>;

/**
 * The panel. It stays in the page when its section is closed - `hidden` decides
 * whether it shows, never an arm - so focus, scroll position and the ids other
 * parts point at all survive a close.
 */
export type AccordionItemContentProps = PropsOf<'div'>;

/**
 * The shared instance every accordion part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `toggle()` to
 * call.
 */
export type AccordionInstanceState = Seeded<
	AccordionRootProps,
	'value' | 'multiple' | 'collapsible' | 'disabled' | 'disableUntilFound'
> & {
	onChange?: AccordionRootProps['onChange'];
};

/** One section's own instance, rooted by `accordion.item`. */
export type AccordionItemInstanceState = Seeded<AccordionItemProps, 'value' | 'disabled'>;
