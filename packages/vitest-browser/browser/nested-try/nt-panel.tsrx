import { computed } from '@markless/core';

export function Panel({ owner }) @{
	const crew = computed(async () => {
		const at = owner;
		await new Promise((resolve) => setTimeout(resolve, 30));
		return { label: 'Crew of ' + at };
	});

	<section data-panel>
		@try {
			<p data-inner>{crew.label}</p>
		} @pending {
			<p data-inner-wait>Loading crew</p>
		} @catch {
			<p data-inner-failed>Crew failed</p>
		}
	</section>
}
