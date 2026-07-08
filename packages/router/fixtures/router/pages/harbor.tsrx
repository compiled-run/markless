import { computed, state } from '@markless/core';

// T107 streaming fixture (alternate-shaped: a harbor arrivals board). The
// forecast computed is deliberately slower than the first-flush deadline, so
// the page streams: @pending flushes first, the settled arm arrives as an
// inert template on the same response and must become interactive after
// wake (the in-arm button writes state read by the shell's tally).
export default function Harbor() @{
	let logged = state(0);
	const forecast = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 300));
		return { vessel: 'Petrel', berth: 7 };
	});

	<main>
		<h1>Harbor arrivals</h1>
		<output data-harbor-logged>Logged {logged}</output>
		<section>
			@try {
				<article data-harbor-arrival>
					<h2>{forecast.vessel} at berth {forecast.berth}</h2>
					<button data-harbor-log onClick={() => logged++}>Log arrival</button>
				</article>
			} @pending {
				<p data-harbor-waiting>Scanning the horizon</p>
			} @catch {
				<p data-harbor-fault>Harbor signal lost</p>
			}
		</section>
	</main>
}
