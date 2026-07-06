import { computed, state } from '@markless/core';

export function App() @{
	let chosen = state('none');
	let filter = state('open');
	let cards = state([
		{ key: 'north', caption: 'North panel' },
		{ key: 'south', caption: 'South panel' },
	]);
	const badge = computed(async ({ signal }) => {
		const value = filter;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { text: 'aborted' };
		return { text: value };
	});

	<section class="mixed-board">
		@for (const card of cards; key card.key) {
			<div class="mixed-row">
				<span>{card.caption}</span>
				<button type="button" data-mixed-row onClick={() => chosen = card.key}>Mark</button>
			</div>
		}
		<div
			data-mixed-behavior
			attach={(element) => { element.setAttribute('data-mixed-ready', 'yes'); }}
		>
			Behavior standby
		</div>
		<button type="button" data-filter onClick={() => filter = 'closed'}>Filter</button>
		@try {
			<small class="mixed-async">{badge.text}</small>
		} @pending {
			<small class="mixed-pending">Checking</small>
		} @catch {
			<small class="mixed-error">Broken</small>
		}
		<output data-mixed-choice>{chosen}</output>
	</section>
}
