import { computed, state } from '@markless/core';

export default function HarborPage() @{
	let port = state('Dover');
	const weather = computed(async () => {
		const at = port;
		await Promise.resolve();
		return { sky: at === 'Dover' ? 'clear' : 'grey' };
	});
	const tide = computed(async () => ({ height: 3 }));
	const berths = computed(async () => [{ code: 'n1' }, { code: 's2' }]);
	const shout = computed(() => {
		const runs = ((globalThis as any).__harborShoutRuns ||= []);
		runs.push(weather.sky);
		return weather.sky.toUpperCase();
	});
	<section>
		<button type="button" data-next-port onClick={() => (port = 'Calais')}>
			sail
		</button>
		@try {
			<div>
				<b data-sky>{shout}</b>
				<ol>
					@for (const berth of berths; key berth.code) {
						<li data-berth>{berth.code}</li>
					}
				</ol>
				<span data-tide>{tide.height} m</span>
			</div>
		} @pending {
			<i data-waiting>Waiting</i>
		} @catch (error) {
			<i data-failure>{error.message}</i>
		}
	</section>
}
