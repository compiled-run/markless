import { computed, state } from '@markless/core';

export function Forecast({ city }: { city: string }) @{
	let day = state(1);
	const sky = computed(async () => {
		await new Promise((done) => setTimeout(done, 10));
		return city + ' sunny ' + day;
	});

	<li data-city={city}>
		@try {
			<span>{sky}</span>
		} @pending {
			<span>checking</span>
		}
		<button data-next={city} onClick={() => day++}>next</button>
	</li>
}
