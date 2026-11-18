import { computed, state } from '@markless/core';
import { loadThing, save } from './api.ts';

export function AroundPage() @{
	let note = state('');
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<div>
				<p data-loads>loads {thing.loads}</p>
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
			</div>
		} @pending {
			<p>Loading</p>
		} @catch (error, reset) {
			<>
				<p data-caught>caught: {error.message}</p>
				<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
			</>
		}
	</main>
}
