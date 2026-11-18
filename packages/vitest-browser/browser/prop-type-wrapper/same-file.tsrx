import { computed, state } from '@markless/core';
import { getUser } from './users.ts';

function Pane({ id }: { id: number }) @{
	const user = computed(async () => await getUser(id));
	<section>
		<p data-plain>{id}</p>
		@try {
			<h2 data-name>{user.name}</h2>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}

export default function App() @{
	let selected = state<number | null>(1);
	<main>
		<button data-pick onClick={() => (selected = 2)}>Two</button>
		@if (selected !== null) {
			<Pane id={selected!} />
		}
	</main>
}
