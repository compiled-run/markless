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

// More symbols than a module loads one by one, so its symbols load through its resolver.
export default function Wide() @{
	let hand = state(['7s', 'Qh', '3c']);
	let title = state('Hand');
	const list = element<HTMLOListElement>();

	<section data-size={hand.length} title={title}>
		<p>{hand.length} cards</p>
		<h2 data-first={hand[0]}>{title}</h2>
		<span data-last={hand[hand.length - 1]}>{hand[hand.length - 1]}</span>
		<span data-left={deck.length - hand.length}>{deck.length - hand.length} left</span>
		<span>{hand.join(' ')}</span>
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
		<button data-rename onClick={() => (title = title + '!')}>Rename</button>
	</section>
}
