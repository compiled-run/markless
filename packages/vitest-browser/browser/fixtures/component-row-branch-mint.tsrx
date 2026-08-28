import { state } from '@markless/core';

// The toaster part shape: a guard over `children` with a fallback arm. The call
// site decides it - self-closed takes the else arm, with children takes the
// first - so the row carries a branch nothing ever flips.
function Body({ children, fallback }) @{
	<span class="body">@if (children) { <>{children}</> } @else { <>{fallback}</> }</span>
}

// The row's key travels on the click event: a handler a row is rebuilt from may
// capture graph data, literals and callbacks, never the repeat item itself.
function Toast({ card, note, onPick }) @{
	let open = state(false);
	<article data-toast={card.key} onClick={(event) => onPick(event.currentTarget.getAttribute('data-toast'))}><Body fallback={card.title} /><Body fallback="none"><em class="kids">{card.title}</em></Body><span class="detail">@if (open) { <><b class="on">{note}</b></> } @else { <><i class="off">{note}</i></> }</span><button data-toggle={card.key} onClick={() => open = !open}>t</button></article>
}

// Array writes copy with a spread before filtering: calling a state array's own
// method on the state receiver is a separate open defect.
export function App() @{
	let chosen = state('none');
	let note = state('first');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
	]);

	<main>
		<output data-chosen>{chosen}</output>
		<button data-add onClick={() => cards = [...cards, { key: 'east', title: 'East' }]}>Add</button>
		<button data-add-west onClick={() => cards = [...cards, { key: 'west', title: 'West' }]}>Add west</button>
		<button data-drop onClick={() => cards = [...cards].filter((card) => card.key !== 'south')}>Drop</button>
		<button data-restore onClick={() => cards = [
			{ key: 'north', title: 'North' },
			{ key: 'south', title: 'South' },
		]}>Restore</button>
		<button data-note onClick={() => note = 'second'}>Note</button>
		<div class="toasts">
			<h2 data-static>Toasts</h2>
			@for (const card of cards; key card.key) {
				<Toast card={card} note={note} onPick={(key) => chosen = key} />
			}
		</div>
	</main>
}
