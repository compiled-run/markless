import { element, state } from '@markless/core';

const deck = ['7s', 'Qh', '3c', 'Ad', '9s', 'Kh'];

export default function Direct() @{
	let hand = state(['7s']);
	const list = element<HTMLOListElement>();

	<section>
		<p>{hand.length} cards</p>
		<ol el={list}>
			@for (const card of hand; key card) {
				<li>{card}</li>
			}
		</ol>
		<button
			data-deal
			onClick={() => {
				hand.push(deck.find((card) => !hand.includes(card))!);
				dispatchEvent(new CustomEvent('dealt', { detail: list!.children.length }));
			}}
			disabled={hand.length === deck.length}
		>Draw</button>
	</section>
}
