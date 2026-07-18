import { computed, state } from '@markless/core';

export function App() @{
	let phase = state('first');
	const eastSignal = computed(async () => {
		await Promise.resolve();
		return { label: phase + '-east' };
	});
	const westSignal = computed(async () => {
		await Promise.resolve();
		return { label: phase + '-west' };
	});
	const card = computed(() => ({ label: eastSignal.label + ' / ' + westSignal.label }));

	<section>
		<button type="button" data-next-phase onClick={() => phase = 'second'}>Next phase</button>
		@try {
			<p data-card>{card.label}</p>
		} @pending {
			<p data-pending>Aligning signals</p>
		} @catch {
			<p data-failure>Signals unavailable</p>
		}
	</section>
}
