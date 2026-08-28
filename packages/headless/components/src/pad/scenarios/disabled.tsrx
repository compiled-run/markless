import { pad } from '../../index.ts';


const FIELD = 'display: block; width: 200px; height: 200px';
const START = [{ id: 'offset', x: 0.25, y: 0.75 }];

export default function Disabled() @{
	<main>
		<pad.root data-testid="root" defaultValue={START} disabled>
			<pad.label data-testid="label">Shadow offset</pad.label>
			<pad.area data-testid="area" style={FIELD}>
				<pad.thumb data-testid="thumb" />
			</pad.area>
			<pad.valuelabel data-testid="valuelabel" />
			<pad.field data-testid="field" name="offset" />
		</pad.root>
	</main>
}
