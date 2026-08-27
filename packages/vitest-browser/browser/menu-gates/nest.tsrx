import { shared, state } from '@markless/core';

type NestState = {
	label: string;
	bumps: number;
	items: ReadonlyArray<{ id: string }>;
};

// One family, composed inside itself: the submenu-inside-a-menu shape. Every
// part below asks the family for state and must be answered by its own nearest
// root.
export const nest = shared(
	() => {
		const n: NestState = state({ label: '', bumps: 0, items: [] });

		return { ...n };
	},
	{ scope: 'widget' },
);

export function NestRoot({ label, children, ...rest }) @{
	const n = nest();
	n.label = label;

	<div {...rest} data-nest-root data-nest-owner={n.label}>{children}</div>
}

export function NestReadout({ ...rest }) @{
	const n = nest();

	<span {...rest} data-nest-readout data-nest-owner={n.label}>{n.bumps}</span>
}

export function NestBump({ ...rest }) @{
	const n = nest();

	<button
		{...rest}
		type="button"
		data-nest-bump
		onClick={() => {
			n.bumps = n.bumps + 1;
		}}
	>bump</button>
}

// The id is built from the instance's own label, so which root answered the
// handler is readable off the minted row without the row reading anything.
export function NestAdd({ ...rest }) @{
	const n = nest();

	<button
		{...rest}
		type="button"
		data-nest-add
		onClick={() => {
			n.items = [...n.items, { id: n.label + '-' + (n.items.length + 1) }];
		}}
	>add</button>
}

export function NestItems({ testid }) @{
	const n = nest();

	<div data-testid={testid} data-nest-items data-nest-count={n.items.length}>
		@for (const item of n.items; key item.id) {
			<span data-nest-item>{item.id}</span>
		}
	</div>
}

// The same repeat over the same cell, differing only in that the ROW reads the
// widget's shared state. Kept beside the one above so the two can be measured
// on one page, from one write.
export function NestOwnedItems({ testid }) @{
	const n = nest();

	<div data-testid={testid} data-nest-owned-items>
		@for (const item of n.items; key item.id) {
			<span data-nest-owned-item data-nest-owner={n.label}>{item.id}</span>
		}
	</div>
}
