import { shared, state } from '@markless/core';

/**
 * One instance per row, rooted by `KrgItem`.
 *
 * This is the one thing the combobox's filtered list has that the landed repeat
 * witnesses do not: the row's ROOT is a widget, so the row's DOM belongs to a
 * child component's view rather than to the page that owns the `@for`.
 */
export const krgItem = shared(
	() => {
		const item = state({ value: '' });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function KrgItem({ value, children, ...rest }) @{
	const item = krgItem();
	item.value = value;

	<div {...rest} data-krg-widget-row data-krg-value={item.value}>{children}</div>
}
