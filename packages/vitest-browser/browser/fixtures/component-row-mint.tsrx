import { state } from '@markless/core';

// The row's key travels on the click event: a handler a row is rebuilt from may
// capture graph data, literals and callbacks, never the repeat item itself.
function Card({ card, onPick }) @{
	<article data-card={card.key} onClick={(event) => onPick(event.currentTarget.getAttribute('data-card'))}><em class="tag">{card.title}</em></article>
}

// Same rule as Card: the child's own handler reads its title back off the DOM
// rather than capturing the prop, which a rebuilt row has no way to serialize.
function Tag({ title, onTap }) @{
	<em class="tag" onClick={(event) => onTap(event.currentTarget.textContent)}>{title}</em>
}

// Array writes copy with a spread before filtering: calling a state array's own
// method on the state receiver is a separate open defect.
export function App() @{
	let chosen = state('none');
	let tapped = state('none');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
	]);

	<main>
		<output data-chosen>{chosen}</output>
		<output data-tapped>{tapped}</output>
		<button data-add onClick={() => cards = [...cards, { key: 'east', title: 'East' }]}>Add</button>
		<button data-drop onClick={() => cards = [...cards].filter((card) => card.key !== 'south')}>Drop</button>
		<button data-restore onClick={() => cards = [
			{ key: 'north', title: 'North' },
			{ key: 'south', title: 'South' },
		]}>Restore</button>
		<div class="cards">
			<h2 data-static>Cards</h2>
			@for (const card of cards; key card.key) {
				<Card card={card} onPick={(key) => chosen = key} />
			}
		</div>
		<div class="wrapped">
			<h2 data-static>Wrapped</h2>
			@for (const card of cards; key card.key) {
				<article data-wrapped={card.key} onClick={() => chosen = card.key}><span class="idx">{card.key}</span><Tag title={card.title} onTap={(title) => tapped = title} /></article>
			}
		</div>
	</main>
}
