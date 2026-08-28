import { ink } from '../../index.ts';


const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';

// The starter a consumer copies: a named surface, a hint, and the field that
// submits. Undo and redo are on the surface's own keys; a button over them is the
// controlled scenario, for the reason its comment gives.
export default function Basic() @{
	<main>
		<ink.root data-testid="root" name="drawing">
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.description data-testid="description">Draw with a mouse, pen or finger.</ink.description>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.field data-testid="field" />
		</ink.root>
	</main>
}
