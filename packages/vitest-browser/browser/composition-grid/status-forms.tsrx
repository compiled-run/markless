import { state } from '@markless/core';
import { failSave, saveRow } from './grid-server.ts';

export default function StatusForms() @{
	let note = state('idle');

	<div>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				note = 'sending';
				await saveRow('a');
				note = 'saved';
			}}
		>
			<button type="submit" data-grid-save>Save</button>
		</form>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				note = 'sending';
				await failSave('a');
				note = 'saved';
			}}
		>
			<button type="submit" data-grid-fail>Fail</button>
		</form>
		<p data-note>{note}</p>
	</div>
}
