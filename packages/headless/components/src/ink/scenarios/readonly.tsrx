import { ink } from '../../index.ts';


const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';
const KEPT = ['M 10 10 h 40 v 6 h -40 z'];

// A drawing already made: shown, submitted, and not editable.
export default function Readonly() @{
	<main>
		<ink.root data-testid="root" name="drawing" defaultPaths={KEPT} readonly>
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.field data-testid="field" />
		</ink.root>
	</main>
}
