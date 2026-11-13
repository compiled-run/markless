import { computed, state } from '@markless/core';
import { loadThing, save } from '../../lib/save.ts';

function LocalSaver() @{
	let note = state('');
	@try {
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
	} @catch (error) {
		<p class="caught">caught: {error.message}</p>
	}
}

export default function Page() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p class="loads">loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<LocalSaver />
	</main>
}
