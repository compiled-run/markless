import { state } from '@markless/core';

export default function GuardedPreventDefaultPage() @{
	let submits = state(0);
	let saves = state(0);
	<section>
		<input
			data-submit-field
			onKeyDown={(event) => {
				if (event.key !== 'Enter') return;
				event.preventDefault();
				submits = submits + 1;
			}}
		/>
		<input
			data-save-field
			onKeyDown={(event) => {
				if (event.metaKey || event.ctrlKey) return;
				if (event.key === 's') {
					event.preventDefault();
					saves = saves + 1;
				}
			}}
		/>
		<output data-submits>{submits}</output>
		<output data-saves>{saves}</output>
	</section>
}
