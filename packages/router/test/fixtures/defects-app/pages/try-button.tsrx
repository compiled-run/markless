import { computed, state } from '@markless/core';

export default function TryButtonPage() @{
	const data = computed(async () => ({ title: 'Inbox' }));
	let count = state(0);
	<main>
		@try {
			<button type="button" data-try-button onClick={() => (count = count + 1)}><span>{data.title}</span> {count}</button>;
		} @pending {
			<p>loading</p>;
		}
	</main>;
}
