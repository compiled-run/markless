import * as ink from '../index.ts';

const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';

export default function Disabled() @{
	<main>
		<ink.root data-testid="root" name="drawing" disabled>
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.field data-testid="field" />
		</ink.root>
	</main>
}
