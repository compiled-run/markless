import { computed, state } from '@markless/core';

export default function Fallback() @{
	let retried = state('never');
	let options = state([{ id: 'c1' }, { id: 'c2' }]);
	const feed = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		throw new Error('offline');
	});

	<article>
		@try {
			<p class="feed">{feed.length}</p>
		} @pending {
			<p class="loading">Loading</p>
		} @catch {
			<nav class="recover">
				@for (const option of options; key option.id) {
					<a href="#" data-row={option.id} onClick={(event) => { event.preventDefault(); retried = option.id; }}>{option.id}</a>
				}
			</nav>
		}
		<output data-retried>{retried}</output>
	</article>
}
