import { state } from '@markless/core';

// T015 same-module shape: one capture slot carries BOTH a callback route (the
// "watched" edge) and a compiler-known undefined (the "silent" edge).
function LocalStepper({ name, onChange }) @{
	<button type="button" data-local-stepper={name} onClick={() => onChange?.(name)}>{name}</button>
}

export default function OptionalCallbackLocalPage() @{
	let observed = state('none');

	<section data-optional-callback-local>
		<LocalStepper name="watched" onChange={(value) => observed = 'heard:' + value} />
		<LocalStepper name="silent" />
		<output data-local-observed>{observed}</output>
	</section>
}
