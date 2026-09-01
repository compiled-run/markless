import { pad } from '../../index.ts';

const FIELD = 'display: block; width: 200px; height: 200px';
const START = [{ id: 'offset', x: 0.25, y: 0.75 }];

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. The handle starts away from the middle of the field, which
// is where the battery's click lands and jumps it to.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<pad.root data-testid="root" defaultValue={START}>
			<pad.label data-testid="label">Shadow offset</pad.label>
			<pad.area data-testid="area" style={FIELD}>
				<pad.thumb data-testid="thumb" />
			</pad.area>
			<pad.valuelabel data-testid="valuelabel" />
		</pad.root>
	</section>
}
