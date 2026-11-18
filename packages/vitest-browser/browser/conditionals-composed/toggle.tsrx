import { state } from '@markless/core';

export default function Toggle() @{
	let playing = state(false);

	<section data-player>
		<button
			data-toggle
			onClick={() => {
				let to = playing;
				to = !to;
				playing = to;
			}}
		>
			Play or pause
		</button>
		<p data-status>{playing ? 'Playing' : 'Paused'}</p>
	</section>
}
