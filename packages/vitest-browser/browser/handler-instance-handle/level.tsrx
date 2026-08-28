import { element, shared, state } from '@markless/core';

// One LEVEL of a nest. `LevelItem` is the component that roots the family, so an
// item written inside another item's content starts an instance of its own.
export const levelState = shared(
	() => {
		const level = state({ hits: 0, name: '' });
		const contentEl = element<HTMLDivElement>();

		return { ...level, contentEl };
	},
	{ scope: 'widget' },
);

export function LevelItem({ name = '', children }) @{
	const level = levelState();
	level.name = name;

	<div data-level-item data-name={level.name} data-hits={level.hits}>{children}</div>
}

// Binds the level's singular handle and reads it back from its OWN handlers.
export function LevelContent({ children }) @{
	const level = levelState();

	<div
		data-level-content
		data-for={level.name}
		el={level.contentEl}
		tabindex={0}
		onClick={(event) => {
			const mine = level.contentEl;
			level.hits = level.hits + 1;
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
