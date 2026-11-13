import { computed, state } from '@markless/core';
import { loadThing, save } from './api.ts';

function LocalCaughtSaver() @{
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
	} @catch (error, reset) {
		<>
			<p data-caught>caught: {error.message}</p>
			<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
		</>
	}
}

export function InsideSame() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p data-loads>loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<LocalCaughtSaver />
	</main>
}
