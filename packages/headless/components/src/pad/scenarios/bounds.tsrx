import * as pad from '../index.ts';

const FIELD = 'display: block; width: 200px; height: 200px';
const START = [{ id: 'aim', x: 90, y: 0 }];

// Units are the value range, not pixels: a pan/tilt head holds degrees, and the
// two axes need not share a range, a sign or a step.
export default function Bounds() @{
	<main>
		<pad.root
			data-testid="root"
			defaultValue={START}
			minX={0}
			maxX={180}
			minY={-30}
			maxY={30}
			step={1}
		>
			<pad.label data-testid="label">Camera aim</pad.label>
			<pad.area data-testid="area" style={FIELD}>
				<pad.thumb data-testid="thumb" />
			</pad.area>
			<pad.valuelabel data-testid="valuelabel" />
		</pad.root>
	</main>
}
