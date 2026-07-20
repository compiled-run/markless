export function ImportedSequence({ label, onStep, onAfter }) @{
	<button type="button" data-imported-sequence onClick={() => {
		onStep(label);
		onAfter('child-finished');
	}}>{label}</button>
}
