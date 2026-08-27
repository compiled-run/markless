import { state } from '@markless/core';

// A part that guards its own `children` - the toaster's own shape. Placed
// self-closed here, so every instance takes the fallback arm.
function Title({ children, fallback }) @{
	<span class="title">@if (children) { <>{children}</> } @else { <>{fallback}</> }</span>
}

// The row's key travels as a prop and comes back through the callback: a handler
// a row is rebuilt from may capture graph data, literals and callbacks, never the
// repeat item itself.
function Close({ tag, onDismiss }) @{
	<button class="close" data-close={tag} onClick={(event) => onDismiss(event.currentTarget.getAttribute('data-close'))}>x</button>
}

// The row component PROJECTS: what the page writes between its tags renders
// inside it, beside the item's own markup.
function Item({ card, note, children }) @{
	let open = state(false);
	<article data-toast={card.key}>{children}<span class="detail">@if (open) { <><b class="on">{note}</b></> } @else { <><i class="off">{note}</i></> }</span><button data-toggle={card.key} onClick={() => open = !open}>t</button></article>
}

export function App() @{
	let note = state('first');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
	]);

	<main>
		<button data-add onClick={() => cards = [...cards, { key: 'east', title: 'East' }]}>Add</button>
		<button data-add-west onClick={() => cards = [...cards, { key: 'west', title: 'West' }]}>Add west</button>
		<button data-drop onClick={() => cards = [...cards].filter((left) => left.key !== 'south')}>Drop</button>
		<button data-restore onClick={() => cards = [
			{ key: 'north', title: 'North' },
			{ key: 'south', title: 'South' },
		]}>Restore</button>
		<button data-note onClick={() => note = 'second'}>Note</button>
		<div class="toasts">
			<h2 data-static>Toasts</h2>
			@for (const card of cards; key card.key) {
				<Item card={card} note={note}><Title fallback={card.title} /><Close tag={card.key} onDismiss={(tag) => cards = [...cards].filter((left) => left.key !== tag)} /></Item>
			}
		</div>
	</main>
}
