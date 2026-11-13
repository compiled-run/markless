import { state } from '@markless/core';
import { save } from '../../lib/save.ts';

export default function Saver() @{
	let note = state('');
	<form
		onSubmit={async (event) => {
			event.preventDefault();
			note = 'sending';
			await save();
			note = 'saved';
		}}
	>
		<p class="note">{note}</p>
		<button type="submit" data-submit>Save</button>
		<button
			type="button"
			data-click
			onClick={async () => {
				note = 'sending';
				await save();
				note = 'saved';
			}}
		>
			Save by click
		</button>
	</form>
}
