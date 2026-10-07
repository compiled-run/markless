import { computed, element, shared, state } from '@markless/core';
import type { Children } from '@markless/core';

export const spellState = shared(
	() => {
		const spell = state({ word: '' });
		const tiles = element<HTMLLIElement[]>();
		return { ...spell, tiles };
	},
	{ scope: 'widget' },
);

export function SpellRoot({ word = '', children }: { readonly word?: string; readonly children?: Children }) @{
	const spell = spellState();
	spell.word = word;

	<section data-spell>{children}</section>
}

export function SpellTile() @{
	const spell = spellState();
	const own = element<HTMLLIElement>();
	const place = computed(() => spell.tiles.indexOf(own as HTMLLIElement));
	const letter = computed(() => spell.word.slice(place, place + 1));

	<li el={[spell.tiles, own]} data-tile>{letter}</li>
}

export function SpellField({ onFocus }: { readonly onFocus?: (event: FocusEvent) => void }) @{
	const spell = spellState();

	<input
		data-spell-field
		aria-label="Word"
		value={spell.word}
		onFocus={(event) => onFocus?.(event)}
		onInput={(event) => {
			spell.word = event.currentTarget.value;
		}}
	/>
}

export function SpellExtend() @{
	const spell = spellState();

	<button data-extend onClick={() => (spell.word = spell.word + 'z')}>Extend</button>
}
