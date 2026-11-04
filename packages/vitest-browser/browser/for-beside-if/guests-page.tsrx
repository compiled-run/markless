import { state } from '@markless/core';

// An @for sharing its parent with an element before it and an @if after it.
export default function GuestsPage() @{
	let guests = state(['Ada', 'Grace']);
	let added = state(0);

	<main>
		<div id="list">
			<b>1</b>
			@for (const name of guests; key name) {
				<p class="row">{name}</p>
			}
			@if (guests.length === 0) {
				<p class="empty">No one yet</p>
			}
		</div>
		<button
			id="add"
			onClick={() => {
				added = added + 1;
				guests = [...guests, 'Guest ' + added];
			}}
		>
			Add
		</button>
		<button id="clear" onClick={() => (guests = [])}>Clear</button>
		<output id="count">{guests.length}</output>
	</main>
}
