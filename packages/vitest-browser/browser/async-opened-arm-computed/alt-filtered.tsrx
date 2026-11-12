import { computed, state } from '@markless/core';

export default function Filtered(props: { names: Array<string> }) @{
	let skip = state('');
	const kept = computed(() => props.names.filter((name) => name !== skip).join(','));

	<div>
		<output data-kept>{kept}</output>
		<button data-skip onClick={() => (skip = 'n0')}>skip</button>
	</div>
}
