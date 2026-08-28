import { element, shared, state } from '@markless/core';

// The menu shape: an outer family rooted by `Bar`, and an inner family rooted by
// EVERY `Item`, whose `Content` part is written inside the item that opens it.
export const barState = shared(
	() => {
		const bar = state({ label: '' });
		const barEl = element<HTMLDivElement>();

		return { ...bar, barEl };
	},
	{ scope: 'widget' },
);

export const itemState = shared(
	() => {
		const item = state({ label: '' });
		const itemEl = element<HTMLDivElement>();
		const contentEl = element<HTMLDivElement>();

		return { ...item, itemEl, contentEl };
	},
	{ scope: 'widget' },
);

export function Bar({ children }) @{
	const bar = barState();

	<div data-bar el={bar.barEl} role="menu">{children}</div>
}

export function Item({ label = '', children }) @{
	const item = itemState();
	item.label = label;

	<div
		data-item
		data-label={item.label}
		el={item.itemEl}
		role="menuitem"
		tabindex={-1}
		aria-controls={item.contentEl}
	>{children}</div>
}

export function Content({ children }) @{
	const item = itemState();

	<div data-content data-for={item.label} el={item.contentEl} role="menu">{children}</div>
}
