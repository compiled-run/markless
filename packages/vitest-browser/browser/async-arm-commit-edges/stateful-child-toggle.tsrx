import { computed, state } from '@markless/core';
import { fetchAccount } from './fetch-data.ts';

function Drawer({ title }: { title: string }) @{
	let opened = state(0);
	<aside data-drawer>
		<b data-drawer-title>{title}</b>
		<button data-count onClick={() => opened++}>{opened}</button>
	</aside>
}

export default function StatefulChildToggle() @{
	let round = state(0);
	let open = state(false);
	const account = computed(async () => await fetchAccount(round, 99));

	<main>
		<button data-again onClick={() => round++}>again</button>
		<button data-open onClick={() => (open = !open)}>open</button>
		@try {
			<article>
				<h2>{account.name}</h2>
				<textarea data-field></textarea>
				@if (open) {
					<Drawer title={account.name} />
				}
			</article>
		} @pending {
			<p>loading</p>
		}
	</main>
}
