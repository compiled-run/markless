import { computed, state } from '@markless/core';

function OwnList({ count }: { count: number }) @{
	let dropped = state<Array<string>>([]);
	const kept = computed(() =>
		[
			{ id: 'a', text: 'x' },
			{ id: 'b', text: 'y' },
		].filter((row) => !dropped.includes(row.id)),
	);

	<div>
		<button data-drop onClick={() => (dropped = [...dropped, 'a'])}>drop</button>
		<p>{count}</p>
		<ul>
			@for (const row of kept; key row.id) {
				<li>{row.text}</li>
			}
		</ul>
	</div>
}

export default function OwnListPage() @{
	const count = computed(async () => 2);

	<main>
		@try {
			<OwnList count={count} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
