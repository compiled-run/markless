import * as ink from '../index.ts';

const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';

// One width the whole way: no thinning, and no pressure simulated from speed.
export default function PressureOff() @{
	<main>
		<ink.root data-testid="root" name="drawing" pressure={false} size={6}>
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.field data-testid="field" />
		</ink.root>
	</main>
}
