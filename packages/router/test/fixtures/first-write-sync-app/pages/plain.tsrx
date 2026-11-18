import { element, state } from '@markless/core';

export default function Plain() @{
	let hand = state(['ace']);
	const list = element<HTMLOListElement>();

	<main>
		<button
			data-deal
			onClick={() => {
				hand.push(`card ${hand.length + 1}`);
				dispatchEvent(new CustomEvent('dealt', { detail: list!.children.length }));
			}}
		>Deal</button>
		<ol el={list}>
			@for (const card of hand; key card) {
				<li>{card}</li>
			}
		</ol>
	</main>
}
