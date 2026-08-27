import { element, shared, state } from '@markless/core';

// The same level family as `nest.tsrx`, except that the ROOT part seeds it too -
// the shape a menu needs, where the root owns the top surface and every item
// owns the surface it may hold.
export const pairLevelState = shared(
	() => {
		const level = state({ hits: 0, name: '' });
		const contentEl = element<HTMLDivElement>();

		return { ...level, contentEl };
	},
	{ scope: 'widget' },
);

export function PairRoot({ children }) @{
	const level = pairLevelState();
	level.name = 'root';

	<div data-pair-root data-name={level.name} data-hits={level.hits}>{children}</div>
}

export function PairItem({ name = '', children }) @{
	const level = pairLevelState();
	level.name = name;

	<div data-pair-item data-name={level.name} data-hits={level.hits}>{children}</div>
}

export function PairContent({ children }) @{
	const level = pairLevelState();

	<div
		data-pair-content
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
