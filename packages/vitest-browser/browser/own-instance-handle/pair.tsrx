import { element, shared, state } from '@markless/core';

// A root surface and per-item surfaces take TWO families: the compiler roots a
// widget family at one component per module, so a root and an item seeding one
// family share an instance and the second binding of `contentEl` is refused.

// The whole pair, rooted by `PairRoot`.
export const pairState = shared(
	() => {
		const pair = state({ hits: 0, name: '' });
		const contentEl = element<HTMLDivElement>();

		return { ...pair, contentEl };
	},
	{ scope: 'widget' },
);

// One level below the root, rooted by every `PairItem`, so an item written
// inside another item's content roots its own instance.
export const pairLevelState = shared(
	() => {
		const level = state({ hits: 0, name: '' });
		const contentEl = element<HTMLDivElement>();

		return { ...level, contentEl };
	},
	{ scope: 'widget' },
);

export function PairRoot({ children }) @{
	const pair = pairState();
	pair.name = 'root';

	<div data-pair-root data-name={pair.name} data-hits={pair.hits}>{children}</div>
}

// The root's own surface: binds and reads the ROOT family's handle.
export function PairContent({ children }) @{
	const pair = pairState();

	<div
		data-pair-content
		data-pair-level="root"
		data-for={pair.name}
		el={pair.contentEl}
		onClick={(event) => {
			const mine = pair.contentEl;
			pair.hits = pair.hits + 1;
			mine?.setAttribute('data-clicked', String(pair.hits));
			event.stopPropagation();
		}}
	>{children}</div>
}

export function PairItem({ name = '', children }) @{
	const level = pairLevelState();
	level.name = name;

	<div data-pair-item data-name={level.name} data-hits={level.hits}>{children}</div>
}

// An item's own surface: binds and reads the LEVEL family's handle, which is a
// different instance per item.
export function PairItemContent({ children }) @{
	const level = pairLevelState();

	<div
		data-pair-content
		data-pair-level="item"
		data-for={level.name}
		el={level.contentEl}
		onClick={(event) => {
			const mine = level.contentEl;
			level.hits = level.hits + 1;
			mine?.setAttribute('data-clicked', String(level.hits));
			event.stopPropagation();
		}}
	>{children}</div>
}
