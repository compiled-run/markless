import { computed, state } from '@markless/core';
import { loadThing, save } from './api.ts';

function LocalSaver() @{
	let note = state('');
	<form
		onSubmit={async (event) => {
			event.preventDefault();
			note = 'sending';
			await save();
			note = 'saved';
		}}
	>
		<p data-note>{note}</p>
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

export function NoneSame() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p data-loads>loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<LocalSaver />
	</main>
}
