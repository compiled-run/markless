import { element, shared, state } from '@markless/core';

// The whole nest, rooted by `NestRoot`.
export const nestState = shared(
	() => {
		const nest = state({ marks: 0 });

		return { ...nest };
	},
	{ scope: 'widget' },
);

// One LEVEL of the nest. `NestItem` is the only part that seeds it, so an item
// written inside another item's content roots its own instance.
export const nestLevelState = shared(
	() => {
		const level = state({ hits: 0, name: '' });
		const contentEl = element<HTMLDivElement>();

		return { ...level, contentEl };
	},
	{ scope: 'widget' },
);

export function NestRoot({ children }) @{
	const nest = nestState();

	<div data-nest-root data-marks={nest.marks}>{children}</div>
}

export function NestItem({ name = '', children }) @{
	const level = nestLevelState();
	level.name = name;

	<div data-nest-item data-name={level.name} data-hits={level.hits}>{children}</div>
}

// Binds the level's handle and reads it back from its OWN handlers.
export function NestContent({ children }) @{
	const nest = nestState();
	const level = nestLevelState();

	<div
		data-nest-content
		data-for={level.name}
		el={level.contentEl}
		tabindex={0}
		onClick={(event) => {
			const mine = level.contentEl;
			level.hits = level.hits + 1;
			nest.marks = nest.marks + 1;
			mine?.setAttribute('data-clicked', String(level.hits));
			event.stopPropagation();
		}}
		onKeydown={(event) => {
			const mine = level.contentEl;
			if (mine === undefined) return;
			mine.setAttribute('data-keyed', event.key);
			event.stopPropagation();
		}}
	>{children}</div>
}
