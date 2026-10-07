import { state } from '@markless/core';

const SEED = [{ id: 'p', title: 'P' }, { id: 'q', title: 'Q' }];

export default function Resurrect() @{
	let rows = state(SEED);
	let view = state('boxes');
	<div>
		<button data-clear onClick={() => (rows = [])}>Clear</button>
		<button data-reset onClick={() => (rows = SEED)}>Reset</button>
		<button data-reverse onClick={() => (rows = [...rows].reverse())}>Reverse</button>
		<button data-swap onClick={() => (view = view === 'boxes' ? 'plain' : 'boxes')}>Swap</button>
		<ul>
			@if (view === 'boxes') {
				@for (const row of rows; key row.id) {
					<li data-row><label><input type="checkbox" />{row.title}</label></li>
				} @empty {
					<li data-empty>None</li>
				}
			} @else {
				@for (const row of rows; key row.id) {
					<li data-row>{row.title}</li>
				}
			}
		</ul>
	</div>
}
