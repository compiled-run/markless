import { state } from '@markless/core';

function Title({ children, fallback }) @{
	<span class="title">@if (children) { <>{children}</> } @else { <>{fallback}</> }</span>
}

function Close({ tag, onDismiss }) @{
	<button class="close" data-close={tag} onClick={(event) => onDismiss(event.currentTarget.getAttribute('data-close'))}>x</button>
}

function Item({ card, note, children }) @{
	let open = state(false);
	<article data-toast={card.key}>{children}<span class="detail">@if (open) { <><b class="on">{note}</b></> } @else { <><i class="off">{note}</i></> }</span><button data-toggle={card.key} onClick={() => open = !open}>t</button></article>
}

// The same page the client-mint fixture serves, with the third row already in the
// served collection: the SSR-equivalence proof compares the two.
export function App() @{
	let note = state('first');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
		{ key: 'east', title: 'East' },
	]);

	<main>
		<button data-note onClick={() => note = 'second'}>Note</button>
		<div class="toasts">
			<h2 data-static>Toasts</h2>
			@for (const card of cards; key card.key) {
				<Item card={card} note={note}><Title fallback={card.title} /><Close tag={card.key} onDismiss={(tag) => cards = [...cards].filter((left) => left.key !== tag)} /></Item>
			}
		</div>
	</main>
}
