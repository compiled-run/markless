import { computed } from '@markless/core';

export default function TestOnlyElements() @{
	const value = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { odd: false };
	});
	<main>
		@try {
			@if (value.odd) {
				<p data-r>tag odd</p>
			} @else {
				<p data-r>tag even</p>
			}
		} @pending {
			<p>loading</p>
		}
	</main>
}
