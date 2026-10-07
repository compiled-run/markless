import { state } from '@markless/core';

function Counter({ label }) @{
	let count = state(0);
	<span class="counter"><b class="label">{label}</b><button class="count" onClick={() => count = count + 1}>{count}</button></span>
}

// The row's @if reads only the row item, so a row the server never sent can pick its own arm.
export function App() @{
	let entries = state([
		{ key: 'north', kind: 'counter', label: 'North' },
		{ key: 'gap-1', kind: 'gap' },
	]);

	<main>
		<button data-add onClick={() => entries = [...entries, { key: 'east', kind: 'counter', label: 'East' }, { key: 'gap-2', kind: 'gap' }]}>Add</button>
		<button data-drop onClick={() => entries = [...entries].filter((entry) => entry.key !== 'north')}>Drop</button>
		<ul class="rows">
			@for (const entry of entries; key entry.key) {
				<li data-row={entry.key}>@if (entry.kind === 'counter') { <Counter label={entry.label} /> } @else { <span class="gap">…</span> }</li>
			}
		</ul>
	</main>
}
