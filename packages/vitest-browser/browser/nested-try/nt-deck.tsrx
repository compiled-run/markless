import { computed } from '@markless/core';

export function Deck({ round }) @{
	const deck = computed(async () => {
		const at = round;
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { title: 'Deck ' + at };
	});
	const cards = computed(async () => {
		const at = round;
		await new Promise((resolve) => setTimeout(resolve, 30));
		return { count: 'Cards ' + at };
	});

	<article data-deck>
		@try {
			<header>
				<h3>{deck.title}</h3>
				@try {
					<span data-cards>{cards.count}</span>
				} @pending {
					<span data-cards-wait>Dealing</span>
				}
			</header>
		} @pending {
			<p data-deck-wait>Shuffling</p>
		}
	</article>
}
