import { state } from '@markless/core';

function Body({ children, fallback }) @{
	<span class="body">@if (children) { <>{children}</> } @else { <>{fallback}</> }</span>
}

function Toast({ card, note, onPick }) @{
	let open = state(false);
	<article data-toast={card.key} onClick={(event) => onPick(event.currentTarget.getAttribute('data-toast'))}><Body fallback={card.title} /><Body fallback="none"><em class="kids">{card.title}</em></Body><span class="detail">@if (open) { <><b class="on">{note}</b></> } @else { <><i class="off">{note}</i></> }</span><button data-toggle={card.key} onClick={() => open = !open}>t</button></article>
}

// The same page the client-mint fixture serves, but with the third row already in
// the served collection: the SSR-equivalence proof compares the two.
export function App() @{
	let chosen = state('none');
	let note = state('first');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
		{ key: 'east', title: 'East' },
	]);

	<main>
		<output data-chosen>{chosen}</output>
		<button data-note onClick={() => note = 'second'}>Note</button>
		<div class="toasts">
			<h2 data-static>Toasts</h2>
			@for (const card of cards; key card.key) {
				<Toast card={card} note={note} onPick={(key) => chosen = key} />
			}
		</div>
	</main>
}
