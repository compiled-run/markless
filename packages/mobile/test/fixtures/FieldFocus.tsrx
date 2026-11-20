import { state } from '@markless/core';

export default function FieldFocus() @{
	let note = state('idle');
	let visits = state(0);
	<main>
		<input
			aria-label="Name"
			onFocus={() => {
				note = 'typing a name';
				visits = visits + 1;
			}}
			onBlur={() => (note = 'name left')}
		/>
		<textarea aria-label="Notes" onFocusin={() => (note = 'typing notes')} onFocusout={() => (note = 'notes left')} />
		<p>{`${note}, ${visits} visits`}</p>
	</main>
}
