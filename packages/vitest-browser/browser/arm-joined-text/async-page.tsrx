import { computed, state } from '@markless/core';

export default function AsyncJoinedArmPage() @{
	const items = computed(async () => [
		{ id: 'a', battery: 10 },
		{ id: 'b', battery: 80 },
		{ id: 'c', battery: 5 },
	]);
	const low = computed(() => items.filter((item) => item.battery < 20));
	let index = state(0);
	let hidden = state(false);
	const current = computed(() => (!hidden && low.length > 0 ? low[index % low.length] : null));

	<main>
		<button type="button" data-next onClick={() => index++}>
			next
		</button>
		<button type="button" data-hide onClick={() => (hidden = !hidden)}>
			hide
		</button>
		@try {
			<section>
				@if (current) {
					<p data-label>{index + 1} / {low.length}</p>
				}
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
