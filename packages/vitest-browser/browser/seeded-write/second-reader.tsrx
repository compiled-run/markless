import { state } from '@markless/core';
import { GaugeCaption, GaugeNote, GaugeRoot } from './family/gauge.tsrx';

// The control for `sole-reader.tsrx`: the same write, plus an unrelated reader of
// the value on the page.
export default function SeededWriteSecondReaderPage() @{
	let caption = state('30 of 100 rows');

	<section data-second-reader-page>
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
		<output data-amount>{caption}</output>
	</section>
}
