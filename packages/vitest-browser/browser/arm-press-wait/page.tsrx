import { computed, state } from '@markless/core';

export default function Page() @{
	let outside = state(0);
	let inside = state(0);
	const label = computed(async () => 'loaded');

	<main>
		<button type="button" data-outside onClick={() => outside++}>outside</button>
		<output data-outside-count>{outside}</output>
		@try {
			<section data-arm>
				<p>{label}</p>
				<button type="button" data-inside onClick={() => inside++}>inside</button>
				<output data-inside-count>{inside}</output>
			</section>
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
