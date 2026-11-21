import { state } from '@markless/core';

export default function PointerPressure() @{
	let down = state('No press');
	let moved = state('No move');
	let up = state('Not lifted');
	<main>
		<div
			onPointerdown={(event) => {
				down = event.pressure > 0 && event.pressure <= 1 ? 'Pressed with pressure' : `Pressure ${event.pressure}`;
			}}
			onPointermove={(event) => {
				if (event.buttons > 0) moved = event.getCoalescedEvents().length > 0 ? 'Coalesced moves' : 'No coalesced';
			}}
			onPointerup={(event) => (up = `Lifted at ${event.pressure}`)}
			onPointercancel={(event) => (up = `Lifted at ${event.pressure}`)}
		>
			<p>Drag across this whole line to read the pressure</p>
		</div>
		<p>{down}</p>
		<p>{moved}</p>
		<p>{up}</p>
	</main>
}
