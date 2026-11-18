import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

export function TwoBlocks() @{
	let city = state('oslo');
	const sky = computed(async () => {
		const at = city;
		return answer(`sky:${at}`, `sky ${at}`);
	});
	const air = computed(async () => {
		const at = city;
		return answer(`air:${at}`, `air ${at}`);
	});

	<section>
		<button type="button" data-rome onClick={() => (city = 'rome')}>Rome</button>
		@try {
			<p data-sky>{sky}</p>
		} @pending {
			<p data-sky-pending>Checking the sky</p>
		}
		@try {
			<p data-air>{air}</p>
		} @pending {
			<p data-air-pending>Checking the air</p>
		}
	</section>
}
