import { computed, shared, state } from '@markless/core';

// The family shape defects 75 and 78 both stand on, with every family concern
// removed: an OUTER widget instance holding the choice, and an INNER widget
// instance per item holding that item's own value. A click writes the outer
// instance; a computed over both decides what the item renders.
export const kirGroup = shared(
	() => {
		const group = state({ value: '' });

		return {
			...group,
			choose(next: string) {
				group.value = next;
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per item, rooted by `KirItem`. */
export const kirItem = shared(
	() => {
		const item = state({ value: '' });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function KirRoot({ children, ...rest }) @{
	const group = kirGroup();

	<div {...rest} data-kir-root data-kir-value={group.value}>{children}</div>
}

export function KirItem({ value, children, onClick, ...rest }) @{
	const group = kirGroup();
	const item = kirItem();
	item.value = value;
	const isChosen = computed(() => group.value === item.value);

	<div
		{...rest}
		data-kir-item
		data-kir-item-value={item.value}
		aria-selected={isChosen ? 'true' : 'false'}
		ui-selected={isChosen}
		onClick={(event) => {
			group.choose(item.value);
			onClick?.(event);
		}}
	>{children}</div>
}
