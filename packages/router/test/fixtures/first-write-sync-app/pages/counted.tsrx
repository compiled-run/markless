import { computed, element, state } from '@markless/core';

export default function Counted() @{
	let deck = state(['ace']);
	const size = computed(() => deck.length);
	const list = element<HTMLUListElement>();

	<main>
		<p data-size>{size}</p>
		<button
			data-deal
			onClick={() => {
				deck.push(`card ${deck.length + 1}`);
				dispatchEvent(new CustomEvent('dealt', { detail: list!.children.length }));
			}}
		>Deal</button>
		<ul el={list}>
			@for (const card of deck; key card) {
				<li>{card}</li>
			}
		</ul>
	</main>
}
