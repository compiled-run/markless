import { state } from '@markless/core';
import { platform, recorder } from '@markless/device';

function Recorder() @{
	const rec = recorder();
	<section>
		<p>Access {recorder.access}</p>
		<button onClick={() => (rec.active = !rec.active)}>{rec.active ? 'Stop' : 'Record'}</button>
		<p>Seconds {rec.seconds}</p>
		<p>{rec.seconds >= 8 ? 'Long enough' : 'Too short'}</p>
		@if (rec.clip !== null) {
			<audio src={rec.clip} controls />
		}
	</section>
}

export default function App() @{
	let open = state(true);
	<main>
		<h1>Recorder</h1>
		@if (!platform.web) {
			<div>
				<button onClick={() => (open = !open)}>{open ? 'Close recorder' : 'Open recorder'}</button>
				@if (open) {
					<Recorder />
				}
			</div>
		} @else {
			<p>No microphone here</p>
		}
	</main>
}
