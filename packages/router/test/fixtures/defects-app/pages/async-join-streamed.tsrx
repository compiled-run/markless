import { computed, state } from '@markless/core';

export default function AsyncJoinStreamedPage() @{
	const data = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 300));
		return { title: 'Inbox' };
	});
	let count = state(0);
	<main>
		@try {
			<button type="button" data-join onClick={() => (count = count + 1)}>{count} in {data.title}</button>;
			<p data-join-title title={`${data.title} ${count}`}>title</p>;
		} @pending {
			<p data-join-loading>loading</p>;
		}
	</main>;
}
