import { element, shared, state } from '@markless/core';

type BoxInstanceState = { items: readonly string[]; atCall: string };
type RowInstanceState = { value: string };

// @markless/ui's taglist reduced to the parts a keyboard removal touches: a
// widget-scope instance holding the collection and the plural handle every row's
// close button binds, a root that writes the collection from its own prop, a row
// component that roots ITS OWN widget instance, and a close button whose handler
// removes its own row and focuses the neighbour's button off the plural handle.
export const removalBox = shared(
	() => {
		const box: BoxInstanceState = state({ items: [] as readonly string[], atCall: 'unread' });
		const closeEls = element<HTMLButtonElement[]>();

		return {
			...box,
			closeEls,
			// literal function type: a callback slot is only recognised from the annotation
			onChange: undefined as ((value: readonly string[]) => void) | undefined,

			remove(value: string) {
				const held = box.items;
				if (!held.includes(value)) return;
				const after = held.filter((one) => one !== value);
				box.items = after;
				box.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per row, as `taglist.item` roots one per tag. */
export const removalRow = shared(
	() => {
		const row: RowInstanceState = state({ value: '' });

		return { ...row };
	},
	{ scope: 'widget' },
);

export function RemovalRoot({ value = [], onChange, children }) @{
	const box = removalBox();
	box.onChange = onChange;
	box.items = value;

	<div data-testid="rows" ui-count={box.items.length} ui-at-call={box.atCall}>{children}</div>
}

export function RemovalItem({ value, children }) @{
	const row = removalRow();
	row.value = value;

	<div data-row ui-value={row.value}>{children}</div>
}

export function RemovalClose({ children }) @{
	const box = removalBox();
	const row = removalRow();

	<button
		type="button"
		data-close
		value={row.value}
		el={box.closeEls}
		onKeydown={(event) => {
			if (event.key !== 'Delete') return;
			event.preventDefault();
			const held = row.value;
			const items = box.items;
			const at = items.indexOf(held);
			const kept = items.filter((one) => one !== held);
			const landing = kept[Math.min(at, kept.length - 1)];
			// The write commits first; the handle is read after it, so it already
			// holds the node the repeat kept.
			box.remove(held);
			const next = (box.closeEls ?? []).find(
				(one) => one.getAttribute('value') === landing,
			);
			next?.focus();
			if (next === undefined) box.atCall = 'no-neighbour';
			else if (next.ownerDocument.activeElement === next) box.atCall = 'took';
			else box.atCall = 'refused';
		}}
	>{children}</button>
}
