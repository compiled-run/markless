import { element, state } from '@markless/core';

const deck = ['7s', 'Qh', '3c', 'Ad', '9s', 'Kh'];

// What the transition's "after" snapshot shows: the page as it stands once the update callback is done.
function glide(change: () => void, list: HTMLElement) {
	const transition = document.startViewTransition(() => {
		change();
		dispatchEvent(new CustomEvent('dealt', { detail: list.children.length }));
	});
	void transition.updateCallbackDone.then(() => {
		const shown = list.closest('section')!;
		dispatchEvent(
			new CustomEvent('snapshot', {
				detail: `${list.children.length} ${shown.querySelector('p')!.textContent} ${shown.querySelector('button')!.disabled}`,
			}),
		);
	});
}

export default function Hand() @{
	let hand = state(['7s', 'Qh', '3c']);
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
			onClick={() => glide(() => hand.push(deck.find((card) => !hand.includes(card))!), list!)}
			disabled={hand.length === deck.length}
		>Draw</button>
	</section>
}
