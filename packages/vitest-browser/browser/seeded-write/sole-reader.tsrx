import { state } from '@markless/core';
import { GaugeCaption, GaugeNote, GaugeRoot } from './family/gauge.tsrx';

// The caption's seed is the ONLY consumer of `caption` on this page: nothing else
// reads the value the click writes.
export default function SeededWriteSoleReaderPage() @{
	let caption = state('30 of 100 rows');

	<section data-sole-reader-page>
		<GaugeRoot value={30}>
			<GaugeCaption children={caption} />
			<GaugeNote children={caption} />
		</GaugeRoot>
		<button
			type="button"
			data-advance
			onClick={() => {
				caption = '60 of 100 rows';
			}}
		>
			Recount
		</button>
	</section>
}
