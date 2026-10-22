import { computed, state } from '@markless/core';

export function Sizes() @{
	let size = state(1);
	let picked = state('');
	const names = new Map([[1, 'small'], [2, 'medium'], [3, 'large']]);
	const label = computed(() => names.get(size) ?? 'none');
	function pick() {
		picked = names.get(size) ?? 'none';
	}
	<main>
		<button type="button" data-grow onClick={() => (size = size + 1)}>grow</button>
		<button type="button" data-pick onClick={() => pick()}>pick</button>
		<output data-label>{label}</output>
		<output data-picked>{picked}</output>
	</main>
}
