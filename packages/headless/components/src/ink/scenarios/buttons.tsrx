import { ink } from '../../index.ts';


const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';

// Undo and clear as a consumer writes them today. `drawing.strokes = ...` is a
// plain cell write, which is the shape that compiles across module boundaries;
// `drawing.undo()` is the same intent as a shared() method call and does not,
// which `scenarios/method.tsrx` pins. The family's own keys on the area call the
// methods directly, because that handler is inside the family.
export default function Buttons() @{
	<main>
		<ink.root data-testid="root" name="drawing">
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.field data-testid="field" />
			<Toolbar />
		</ink.root>
	</main>
}

// The instance is widget-scoped, so the buttons sit inside the root: a `state()`
// call outside it reaches a different drawing.
function Toolbar() @{
	const drawing = ink.state();

	<div role="presentation" data-testid="toolbar">
		<button
			type="button"
			data-testid="undo"
			onClick={() => {
				drawing.strokes = ink.withoutLast(drawing.paths);
			}}
		>Undo</button>
		<button
			type="button"
			data-testid="clear"
			onClick={() => {
				drawing.strokes = [];
			}}
		>Clear</button>
	</div>
}
