import { computed, state } from '@markless/core';
import { loadRows, loadStat } from './data.ts';

function Stat({ name }: { readonly name: string }) @{
	const stat = computed(async () => loadStat(name));

	<article class="stat">
		@try {
			<p>{stat.name}: {stat.value}</p>
		} @pending {
			<p>Loading {name}</p>
		}
	</article>
}

function Stats() @{
	const names = state(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa']);

	<section class="stats">
		@for (const name of names; key name) {
			<Stat name={name} />
		}
	</section>
}

function Table() @{
	let size = state(5000);
	const rows = computed(async () => loadRows(size));

	<section class="table">
		<button class="shrink" onClick={() => (size = size === 5000 ? 10 : 5000)}>Rows {size}</button>
		@try {
			<ul data-list>
				@for (const row of rows; key row.id) {
					<li class={row.done ? 'done' : 'open'}>{row.label}</li>
				}
			</ul>
		} @pending {
			<p>Loading rows</p>
		}
	</section>
}

export function Dashboard() @{
	<div class="dashboard">
		<Stats />
		<Table />
	</div>
}
