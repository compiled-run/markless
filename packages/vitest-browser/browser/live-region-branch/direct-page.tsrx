import { state } from '@markless/core';

// One component, no constructs: this is the shape the direct-chunk renderer
// takes, where every text slot on the page is re-read on every gesture.
export default function LiveRegionDirectPage() @{
	let taps = state(0);
	let aside = state(0);

	<section data-lrb-direct>
		<p data-testid="direct-live" aria-live="polite">Taps: {taps}</p>
		<output data-testid="direct-aside">Aside: {aside}</output>
		<button
			type="button"
			data-testid="direct-idle"
			onClick={() => {
				aside = aside + 1;
			}}
		>
			Idle
		</button>
		<button
			type="button"
			data-testid="direct-tap"
			onClick={() => {
				taps = taps + 1;
			}}
		>
			Tap
		</button>
	</section>
}
