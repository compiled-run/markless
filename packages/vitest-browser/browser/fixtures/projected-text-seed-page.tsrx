import { state } from '@markless/core';
import { MeterCaption, MeterReadout, MeterRoot } from './projected-text-seed.tsrx';

export default function ProjectedTextSeed() @{
	let level = state(2);

	<section>
		<button type="button" data-raise onClick={() => level++}>raise</button>
		<MeterRoot>
			<MeterCaption>{level} high</MeterCaption>
			<MeterReadout>steady</MeterReadout>
		</MeterRoot>
	</section>
}
