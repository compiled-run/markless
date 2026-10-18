import { computed, state } from '@markless/core';

export default function AsyncJoinPage() @{
	const data = computed(async () => ({ title: 'Inbox' }));
	let count = state(0);
	<main>
		@try {
			<button type="button" data-join onClick={() => (count = count + 1)}>{data.title} {count}</button>;
		} @pending {
			<p>loading</p>;
		}
	</main>;
}
