import { state } from '@markless/core';
import Side from '../src/side.tsrx';

export default function GammaPage() @{
	let taps = state(0);

	<div data-page="gamma" style="margin-left: 200px; min-height: 2000px">
		<section class="gamma-frame">
			<Side current="/gamma" />
		</section>
		<h1>Gamma</h1>
		<output data-taps>{taps}</output>
		<button type="button" data-tap onClick={() => taps++}>Tap</button>
	</div>
}
