import { ink } from '../../index.ts';


// Quarantined: `drawing.undo()` and `drawing.clear()` are shared() methods called
// from another module, which the compiler refuses loudly. This file must never be
// imported statically by the suite — the pinned row imports it dynamically and
// asserts the refusal. It becomes the shape the docs recommend again when the
// compiler ships the capability; until then a button drives a controlled drawing's
// own array, which is what `scenarios/controlled.tsrx` shows.
export default function Method() @{
	const drawing = ink.state();

	<button
		type="button"
		data-testid="method"
		onClick={() => {
			drawing.undo();
		}}
	>Undo</button>
}
