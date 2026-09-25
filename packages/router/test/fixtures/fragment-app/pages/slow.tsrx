import { computed, state } from '@markless/core';
import Nav from '../src/nav.tsrx';

export default function Slow() @{
	let taps = state(0);
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 400));
		return { text: 'report ready' };
	});

	<main data-page="slow">
		<title>Slow page</title>
		<Nav />
		<button type="button" data-settled-tap onClick={() => taps++}>Taps {taps}</button>
		@try {
			<p data-settled>{report.text}</p>
		} @pending {
			<p data-pending>loading report</p>
		} @catch {
			<p data-failed>report failed</p>
		}
	</main>
}
