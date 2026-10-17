import { computed, state } from '@markless/core';

export default function TextBesidePage() @{
	let page = state(1);
	const label = computed(() => `Go to page ${page}`);
	<main>
		<button type="button" data-page onClick={() => (page = page + 1)}>
			<span class="sr-only">{label}</span>
			{page}
		</button>
	</main>;
}
