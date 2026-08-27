import { computed, state } from '@markless/core';

export default function StateMethodReceiver() @{
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
		{ key: 'east', title: 'East' },
	]);
	let note = state('untouched');
	const keyLine = computed(() => cards.map((card) => card.key).join(','));
	const titles = computed(() => cards.map((card) => card.title));

	<main>
		<output data-keys>{keyLine}</output>
		<output data-note>{note}</output>
		<button data-filter onClick={() => cards = cards.filter((card) => card.key !== 'south')}>
			filter
		</button>
		<button data-slice onClick={() => cards = cards.slice(0, 1)}>slice</button>
		<button data-concat onClick={() => cards = cards.concat([{ key: 'west', title: 'West' }])}>
			concat
		</button>
		<button data-computed onClick={() => note = titles.join('|')}>computed</button>
		<button data-spread onClick={() => cards = [...cards].filter((card) => card.key !== 'north')}>
			spread
		</button>
	</main>
}
