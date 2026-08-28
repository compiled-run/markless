import * as pad from '../index.ts';

const FIELD = 'display: block; width: 200px; height: 200px';
const START = [{ id: 'offset', x: 0.25, y: 0.75 }];

// The starter a consumer copies: a named field, one handle, the readout and the
// element a form submits. The consumer owes the area a size and nothing else.
export default function Basic() @{
	<main>
		<pad.root data-testid="root" defaultValue={START}>
			<pad.label data-testid="label">Shadow offset</pad.label>
			<pad.description data-testid="description">Drag the handle, or move it with the arrow keys.</pad.description>
			<pad.area data-testid="area" style={FIELD}>
				<pad.indicator data-testid="indicator" />
				<pad.thumb data-testid="thumb" />
			</pad.area>
			<pad.valuelabel data-testid="valuelabel" />
			<pad.field data-testid="field" name="offset" />
		</pad.root>
	</main>
}
