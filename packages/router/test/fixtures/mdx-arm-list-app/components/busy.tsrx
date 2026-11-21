import { computed, state } from '@markless/core';

// A binding reads an async value through a sync computed: a refresh marks it busy.
export default function Busy() @{
	let query = state(1);
	const results = computed(async () => {
		const n = query;
		await new Promise((done) => setTimeout(done, 400));
		return Array.from({ length: n }, (_, at) => at);
	});
	const total = computed(() => results.length);

	<section>
		@try {
			<p class="total">{total}</p>
		} @pending {
			<p>loading</p>
		}
		<button data-more onClick={() => query++}>more</button>
	</section>
}
