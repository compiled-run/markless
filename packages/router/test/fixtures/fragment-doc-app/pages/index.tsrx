import { state } from '@markless/core';
import Side from '../src/side.tsrx';

export default function HomePage() @{
	let taps = state(0);

	<div data-page="index" style="margin-left: 200px; min-height: 2000px">
		<Side current="/" />
		<h1>Home</h1>
		<output data-taps>{taps}</output>
		<button type="button" data-tap onClick={() => taps++}>Tap</button>
	</div>
}
