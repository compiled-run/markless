import type { PropsOf, Seeded } from '@markless/core';

/** Which axis the arrow keys walk, and the axis `aria-orientation` reports. */
export type TabsOrientation = 'horizontal' | 'vertical';

export type TabsRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The value of the tab that is showing. Omit it and no tab shows: a tab is
	 * named by its `value`, and nothing counts positions for you.
	 */
	readonly value?: string;
	/** Which axis the arrow keys walk. Omit it and the tabs run left to right. */
	readonly orientation?: TabsOrientation;
	/** Arrow past the last tab and land on the first. Omit it and the ends stop. */
	readonly loop?: boolean;
	/** Arrowing to a tab shows it. Turn it off and arrowing only moves focus; Enter or Space shows it. */
	readonly selectOnFocus?: boolean;
	/**
	 * Called with the new value when a person changes tab. Omit it and the tabs
	 * still change; the call site simply does nothing.
	 */
	readonly onChange?: (value: string) => void;
};

/** The row of tabs. `role="tablist"`, and the element the arrow keys walk inside. */
export type TabsListProps = PropsOf<'div'>;

/**
 * One tab. `role="tab"` makes every child of this element presentational, so it
 * takes label content only — a close button or a link inside a tab is stripped
 * of its own semantics, and has to be a sibling of the tab instead.
 *
 * A consumer's `onClick`, `onFocus` and `onKeydown` all run after the family's.
 */
export type TabsTriggerProps = PropsOf<'button'> & {
	/** Names the tab. The content part with the same value is the panel it shows. Required. */
	readonly value: string;
};

/**
 * One panel. It stays in the page when its tab is not the showing one — `hidden`
 * decides whether it shows, never an arm — so focus, scroll position and form
 * state inside a panel all survive a tab change.
 */
export type TabsContentProps = PropsOf<'div'> & {
	/** Names the panel. The trigger part with the same value shows it. Required. */
	readonly value: string;
};

/**
 * One instance per rendered `tabs.trigger` and per rendered `tabs.content`,
 * holding that part's own `value`. The parts test the root's showing value
 * against this cell rather than against their prop, because a comparison with a
 * prop on one side stops refreshing once the page has resumed.
 */
export type TabsPartInstanceState = Seeded<TabsTriggerProps, 'value'>;

/**
 * The shared instance every tabs part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `show()`.
 */
export type TabsInstanceState = Seeded<
	TabsRootProps,
	'value' | 'orientation' | 'loop' | 'selectOnFocus'
> & {
	onChange?: TabsRootProps['onChange'];
};
