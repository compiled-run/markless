import { state } from '@markless/core';

const SEED = [{ id: 'p', title: 'P' }, { id: 'q', title: 'Q' }];

export default function ArmOwned() @{
	let rows = state(SEED);
	let view = state('list');
	<div>
		<button data-clear onClick={() => (rows = [])}>Clear</button>
		<button data-reset onClick={() => (rows = SEED)}>Reset</button>
		<button data-swap onClick={() => (view = view === 'list' ? 'none' : 'list')}>Swap</button>
		@if (view === 'list') {
			<ul>
				@for (const row of rows; key row.id) {
					<li data-row>{row.title}</li>
				}
			</ul>
		} @else {
			<p data-off>off</p>
		}
	</div>
}
